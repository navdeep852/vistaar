-- ============================================================================
-- MIGRATION 037: RECONCILE AND FIX QUOTATION CONVERSION ACCOUNTING SYNCHRONIZATION
-- ============================================================================
-- Author: VISTAAR Business OS Engineering
-- Purpose:
-- 1. Ensure public.cashbook_entries exists with full workspace isolation and RLS.
-- 2. Ensure invoices.quotation_id and performance indexes exist.
-- 3. Idempotently reconcile any historical converted quotations that were missing
--    Daybook, Cashbook, or Udhari accounting entries.
-- ============================================================================

-- 1. Ensure foreign key / tracking column exists on invoices
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'invoices' 
          AND column_name = 'quotation_id'
    ) THEN
        ALTER TABLE public.invoices ADD COLUMN quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_quotation_id ON public.invoices(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotations_converted_invoice ON public.quotations(converted_invoice_id);

-- 2. Ensure public.cashbook_entries table exists
CREATE TABLE IF NOT EXISTS public.cashbook_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_number VARCHAR(100) NOT NULL,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('IN', 'OUT', 'NON_CASH')),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    account_name VARCHAR(100) NOT NULL DEFAULT 'Cash Account',
    source_type VARCHAR(50) NOT NULL,
    source_id VARCHAR(100),
    reference_number VARCHAR(100),
    party_name VARCHAR(255),
    description TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cashbook_entry_idempotent UNIQUE (workspace_id, source_type, source_id, direction)
);

CREATE INDEX IF NOT EXISTS idx_cashbook_entries_ws_date ON public.cashbook_entries(workspace_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_source ON public.cashbook_entries(source_type, source_id);

-- Enable RLS on cashbook_entries
ALTER TABLE public.cashbook_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'cashbook_entries' 
          AND policyname = 'Users can view cashbook entries for their workspace'
    ) THEN
        CREATE POLICY "Users can view cashbook entries for their workspace"
            ON public.cashbook_entries
            FOR SELECT
            USING (
                workspace_id IN (
                    SELECT workspace_id FROM public.workspace_members 
                    WHERE user_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'cashbook_entries' 
          AND policyname = 'Users can insert cashbook entries for their workspace'
    ) THEN
        CREATE POLICY "Users can insert cashbook entries for their workspace"
            ON public.cashbook_entries
            FOR INSERT
            WITH CHECK (
                workspace_id IN (
                    SELECT workspace_id FROM public.workspace_members 
                    WHERE user_id = auth.uid()
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'cashbook_entries' 
          AND policyname = 'Users can update cashbook entries for their workspace'
    ) THEN
        CREATE POLICY "Users can update cashbook entries for their workspace"
            ON public.cashbook_entries
            FOR UPDATE
            USING (
                workspace_id IN (
                    SELECT workspace_id FROM public.workspace_members 
                    WHERE user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- 3. Idempotent Reconciliation Function
CREATE OR REPLACE FUNCTION public.reconcile_quotation_conversion_accounting(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rec RECORD;
    v_reconciled_count INT := 0;
    v_daybook_count INT := 0;
    v_cashbook_count INT := 0;
    v_udhari_count INT := 0;
    v_inv RECORD;
BEGIN
    -- Loop over all quotations marked converted with a linked invoice in this workspace
    FOR v_rec IN
        SELECT q.id AS quotation_id, q.quotation_number, q.converted_invoice_id, q.workspace_id
        FROM public.quotations q
        WHERE q.workspace_id = p_workspace_id
          AND (q.status = 'Converted' OR q.converted_invoice_id IS NOT NULL)
    LOOP
        SELECT * INTO v_inv
        FROM public.invoices
        WHERE (id = v_rec.converted_invoice_id OR quotation_id = v_rec.quotation_id)
          AND workspace_id = p_workspace_id;

        IF v_inv.id IS NOT NULL THEN
            -- Link quotation_id on invoice if missing
            IF v_inv.quotation_id IS NULL THEN
                UPDATE public.invoices
                SET quotation_id = v_rec.quotation_id
                WHERE id = v_inv.id;
            END IF;

            -- Link converted_invoice_id on quotation if missing
            IF v_rec.converted_invoice_id IS NULL THEN
                UPDATE public.quotations
                SET converted_invoice_id = v_inv.id
                WHERE id = v_rec.quotation_id;
            END IF;

            -- Check Daybook entry
            IF NOT EXISTS (
                SELECT 1 FROM public.daybook_transactions
                WHERE workspace_id = p_workspace_id
                  AND reference_type = 'INVOICE'
                  AND reference_id = v_inv.id
            ) THEN
                INSERT INTO public.daybook_transactions (
                    workspace_id,
                    transaction_code,
                    transaction_date,
                    transaction_type,
                    direction,
                    amount,
                    total_amount,
                    remaining_amount,
                    payment_status,
                    payment_mode,
                    party_type,
                    party_id,
                    party_name,
                    reference_type,
                    reference_id,
                    reference_number,
                    description,
                    status
                ) VALUES (
                    p_workspace_id,
                    'ACC-' || COALESCE(v_inv.invoice_number, v_inv.id::text),
                    COALESCE(v_inv.date, CURRENT_DATE),
                    'SALE',
                    'IN',
                    COALESCE(v_inv.paid_amount, 0),
                    COALESCE(v_inv.grand_total, 0),
                    COALESCE(v_inv.balance_amount, 0),
                    CASE 
                        WHEN COALESCE(v_inv.balance_amount, 0) <= 0.01 THEN 'PAID'
                        WHEN COALESCE(v_inv.paid_amount, 0) > 0 THEN 'PARTIALLY PAID'
                        ELSE 'UNPAID'
                    END,
                    'Cash',
                    'customer',
                    v_inv.customer_id,
                    COALESCE(v_inv.customer_name, 'Customer'),
                    'INVOICE',
                    v_inv.id,
                    v_inv.invoice_number,
                    'Invoice #' || COALESCE(v_inv.invoice_number, v_inv.id::text) || ' (Converted from Quotation #' || v_rec.quotation_number || ')',
                    'COMPLETED'
                );
                v_daybook_count := v_daybook_count + 1;
            END IF;

            -- Check Cashbook entry if paid amount > 0
            IF COALESCE(v_inv.paid_amount, 0) > 0 THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.cashbook_entries
                    WHERE workspace_id = p_workspace_id
                      AND source_type = 'INVOICE_PAYMENT'
                      AND (reference_number = v_inv.invoice_number OR source_id = v_inv.id::text)
                ) THEN
                    INSERT INTO public.cashbook_entries (
                        workspace_id,
                        entry_date,
                        entry_number,
                        direction,
                        amount,
                        payment_method,
                        account_name,
                        source_type,
                        source_id,
                        reference_number,
                        party_name,
                        description
                    ) VALUES (
                        p_workspace_id,
                        COALESCE(v_inv.date, CURRENT_DATE),
                        'CB-' || COALESCE(v_inv.invoice_number, v_inv.id::text),
                        'IN',
                        v_inv.paid_amount,
                        'Cash',
                        'Cash Account',
                        'INVOICE_PAYMENT',
                        v_inv.id::text,
                        v_inv.invoice_number,
                        v_inv.customer_name,
                        'Payment for Invoice #' || COALESCE(v_inv.invoice_number, '')
                    ) ON CONFLICT DO NOTHING;
                    v_cashbook_count := v_cashbook_count + 1;
                END IF;
            END IF;

            -- Check Udhari if balance amount > 0.01
            IF COALESCE(v_inv.balance_amount, 0) > 0.01 THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.udhari_records
                    WHERE workspace_id = p_workspace_id
                      AND (invoice_id = v_inv.id OR udhari_code = 'UD-' || v_inv.invoice_number)
                ) THEN
                    INSERT INTO public.udhari_records (
                        workspace_id,
                        udhari_code,
                        customer_id,
                        customer_name_snapshot,
                        phone_snapshot,
                        invoice_id,
                        original_amount,
                        total_received,
                        outstanding_amount,
                        due_date,
                        status
                    ) VALUES (
                        p_workspace_id,
                        'UD-' || COALESCE(v_inv.invoice_number, v_inv.id::text),
                        v_inv.customer_id,
                        COALESCE(v_inv.customer_name, 'Customer'),
                        COALESCE(v_inv.customer_phone, '9999999999'),
                        v_inv.id,
                        v_inv.grand_total,
                        COALESCE(v_inv.paid_amount, 0),
                        v_inv.balance_amount,
                        COALESCE(v_inv.due_date, CURRENT_DATE + INTERVAL '15 days'),
                        CASE WHEN COALESCE(v_inv.paid_amount, 0) > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END
                    );
                    v_udhari_count := v_udhari_count + 1;
                END IF;
            END IF;

            v_reconciled_count := v_reconciled_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'reconciled_quotations', v_reconciled_count,
        'daybook_entries_created', v_daybook_count,
        'cashbook_entries_created', v_cashbook_count,
        'udhari_entries_created', v_udhari_count
    );
END;
$$;

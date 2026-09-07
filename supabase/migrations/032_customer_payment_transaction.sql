-- ==============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 032: AUTHORITATIVE CUSTOMER PAYMENT TRANSACTION
-- File: supabase/migrations/032_customer_payment_transaction.sql
-- Description:
--   1. Ensures udhari_records has invoice_id & counter_sale_id with indexes.
--   2. Ensures cashbook_entries table exists with proper columns and constraints.
--   3. Creates authoritative atomic RPC public.post_customer_payment_atomic(JSONB).
--   4. Grants permissions to authenticated, anon, and service_role.
--   5. Reconciles existing Hardik (INV-2026-0007) and Vaishali (INV-2026-0006) data.
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. EXTEND UDHARI RECORDS SCHEMA
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.udhari_records
    ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS counter_sale_id UUID;

CREATE INDEX IF NOT EXISTS idx_udhari_records_workspace_invoice 
    ON public.udhari_records(workspace_id, invoice_id) 
    WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_udhari_records_workspace_code 
    ON public.udhari_records(workspace_id, udhari_code);

-- -----------------------------------------------------------------------------
-- 2. ENSURE CASHBOOK ENTRIES TABLE EXISTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cashbook_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_number VARCHAR(100) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    account_name VARCHAR(100) NOT NULL DEFAULT 'Cash Account',
    source_type VARCHAR(50) NOT NULL,
    source_id VARCHAR(100),
    reference_number VARCHAR(100),
    party_name VARCHAR(255),
    description TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashbook_entries_workspace_date 
    ON public.cashbook_entries(workspace_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_cashbook_entries_source 
    ON public.cashbook_entries(workspace_id, source_type, source_id);

-- Ensure RLS is active on cashbook_entries
ALTER TABLE public.cashbook_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'cashbook_entries' AND policyname = 'Users can view cashbook entries for their workspace'
    ) THEN
        CREATE POLICY "Users can view cashbook entries for their workspace"
            ON public.cashbook_entries FOR SELECT
            USING (workspace_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'cashbook_entries' AND policyname = 'Users can insert cashbook entries for their workspace'
    ) THEN
        CREATE POLICY "Users can insert cashbook entries for their workspace"
            ON public.cashbook_entries FOR INSERT
            WITH CHECK (workspace_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'cashbook_entries' AND policyname = 'Users can update cashbook entries for their workspace'
    ) THEN
        CREATE POLICY "Users can update cashbook entries for their workspace"
            ON public.cashbook_entries FOR UPDATE
            USING (workspace_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. AUTHORITATIVE ATOMIC CUSTOMER PAYMENT RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_customer_payment_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_invoice_id UUID;
    v_udhari_id UUID;
    v_counter_sale_id UUID;
    v_amount NUMERIC(12,2);
    v_payment_method VARCHAR(50);
    v_payment_date DATE;
    v_customer_id UUID;
    v_customer_name VARCHAR(255);
    v_customer_phone VARCHAR(50);
    v_reference VARCHAR(100);
    v_notes TEXT;
    v_payment_id UUID;
    v_payment_code VARCHAR(100);

    v_inv RECORD;
    v_udhari RECORD;
    v_cs RECORD;

    v_new_paid NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_new_status VARCHAR(50);
    v_tag VARCHAR(50);

    v_target_ref_num VARCHAR(100);
    v_target_party_name VARCHAR(255);
    v_target_party_id UUID;
    v_account_name VARCHAR(100);
BEGIN
    -- Extract parameters from JSON payload
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    v_amount := ROUND(COALESCE((p_payload->>'amount')::NUMERIC, 0), 2);
    v_payment_method := COALESCE(p_payload->>'payment_method', 'Cash');
    v_payment_date := COALESCE((p_payload->>'payment_date')::DATE, CURRENT_DATE);
    v_reference := p_payload->>'reference';
    v_notes := p_payload->>'notes';
    v_customer_name := p_payload->>'customer_name';
    v_customer_phone := COALESCE(p_payload->>'customer_phone', '9999999999');

    IF p_payload->>'customer_id' IS NOT NULL AND (p_payload->>'customer_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_customer_id := (p_payload->>'customer_id')::UUID;
    END IF;

    IF p_payload->>'invoice_id' IS NOT NULL AND (p_payload->>'invoice_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_invoice_id := (p_payload->>'invoice_id')::UUID;
    END IF;

    IF p_payload->>'udhari_id' IS NOT NULL AND (p_payload->>'udhari_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_udhari_id := (p_payload->>'udhari_id')::UUID;
    END IF;

    IF p_payload->>'counter_sale_id' IS NOT NULL AND (p_payload->>'counter_sale_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_counter_sale_id := (p_payload->>'counter_sale_id')::UUID;
    END IF;

    -- Basic validations
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id is required';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    -- CASE 1: Payment against an Udhari Record
    IF v_udhari_id IS NOT NULL THEN
        SELECT * INTO v_udhari
        FROM public.udhari_records
        WHERE id = v_udhari_id AND workspace_id = v_workspace_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Udhari record % not found in workspace %', v_udhari_id, v_workspace_id;
        END IF;

        IF v_amount > (v_udhari.outstanding_amount + 0.05) THEN
            RAISE EXCEPTION 'Overpayment rejected: payment amount (%) exceeds outstanding balance (%)',
                v_amount, v_udhari.outstanding_amount;
        END IF;

        IF v_udhari.invoice_id IS NOT NULL AND v_invoice_id IS NULL THEN
            v_invoice_id := v_udhari.invoice_id;
        END IF;

        v_target_party_name := COALESCE(v_customer_name, v_udhari.customer_name_snapshot, 'Customer');
        v_target_party_id := COALESCE(v_customer_id, v_udhari.customer_id);
    END IF;

    -- CASE 2: Payment against an Invoice
    IF v_invoice_id IS NOT NULL THEN
        SELECT * INTO v_inv
        FROM public.invoices
        WHERE id = v_invoice_id AND workspace_id = v_workspace_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invoice % not found in workspace %', v_invoice_id, v_workspace_id;
        END IF;

        IF v_udhari_id IS NULL AND v_amount > (v_inv.balance_amount + 0.05) THEN
            RAISE EXCEPTION 'Overpayment rejected: payment amount (%) exceeds invoice balance (%)',
                v_amount, v_inv.balance_amount;
        END IF;

        v_target_ref_num := v_inv.invoice_number;
        v_target_party_name := COALESCE(v_customer_name, v_inv.customer_name, 'Customer');
        v_target_party_id := COALESCE(v_customer_id, v_inv.customer_id);

        -- Locate linked Udhari record if not already locked
        IF v_udhari_id IS NULL THEN
            SELECT * INTO v_udhari
            FROM public.udhari_records
            WHERE workspace_id = v_workspace_id 
              AND (invoice_id = v_invoice_id OR udhari_code = 'UD-' || v_inv.invoice_number)
            FOR UPDATE;

            IF FOUND THEN
                v_udhari_id := v_udhari.id;
            END IF;
        END IF;
    END IF;

    -- Fallbacks for reference & party
    IF v_target_ref_num IS NULL THEN
        v_target_ref_num := COALESCE(p_payload->>'invoice_number', v_udhari.udhari_code, 'REF-' || TO_CHAR(v_payment_date, 'YYYYMMDD'));
    END IF;
    IF v_target_party_name IS NULL THEN
        v_target_party_name := 'Customer';
    END IF;

    -- Generate stable payment code & UUID
    v_payment_id := gen_random_uuid();
    v_payment_code := COALESCE(
        p_payload->>'payment_code',
        'PAY-' || TO_CHAR(v_payment_date, 'YYYY') || '-' || LPAD(FLOOR(10000 + RANDOM() * 90000)::TEXT, 5, '0')
    );

    -- 1. Insert into public.payments
    INSERT INTO public.payments (
        id,
        workspace_id,
        customer_id,
        invoice_id,
        payment_number,
        customer_name,
        invoice_number,
        amount,
        payment_date,
        method,
        reference_no,
        notes,
        created_at
    ) VALUES (
        v_payment_id,
        v_workspace_id,
        v_target_party_id,
        v_invoice_id,
        v_payment_code,
        v_target_party_name,
        v_target_ref_num,
        v_amount,
        v_payment_date,
        v_payment_method::public.payment_method,
        v_reference,
        v_notes,
        NOW()
    );

    -- 2. If Udhari record exists, insert into udhari_payments with required payment_code
    IF v_udhari_id IS NOT NULL THEN
        INSERT INTO public.udhari_payments (
            id,
            workspace_id,
            udhari_id,
            customer_id,
            payment_code,
            amount,
            payment_method,
            payment_date,
            phone_number,
            reference,
            notes,
            created_at
        ) VALUES (
            v_payment_id,
            v_workspace_id,
            v_udhari_id,
            v_target_party_id,
            v_payment_code,
            v_amount,
            v_payment_method::public.payment_method,
            v_payment_date,
            v_customer_phone,
            v_reference,
            v_notes,
            NOW()
        );
    END IF;

    -- 3. Update Invoice (if linked)
    IF v_invoice_id IS NOT NULL AND v_inv.id IS NOT NULL THEN
        v_new_paid := v_inv.paid_amount + v_amount;
        v_new_balance := GREATEST(0, ROUND(v_inv.grand_total - v_new_paid, 2));
        IF v_new_balance <= 0.01 THEN
            v_new_balance := 0;
            v_new_status := 'Paid';
            v_tag := 'PAID';
        ELSE
            v_new_status := 'Partially Paid';
            v_tag := 'PARTIALLY PAID';
        END IF;

        UPDATE public.invoices
        SET paid_amount = v_new_paid,
            balance_amount = v_new_balance,
            status = v_new_status,
            updated_at = NOW()
        WHERE id = v_invoice_id AND workspace_id = v_workspace_id;

        -- Update original Daybook sale entry for this invoice
        UPDATE public.daybook_transactions
        SET amount = v_new_paid,
            remaining_amount = v_new_balance,
            payment_status = v_tag,
            updated_at = NOW()
        WHERE workspace_id = v_workspace_id
          AND reference_type = 'INVOICE'
          AND (reference_id = v_invoice_id::TEXT OR reference_number = v_target_ref_num);
    END IF;

    -- 4. Update Udhari Record (if linked)
    IF v_udhari_id IS NOT NULL AND v_udhari.id IS NOT NULL THEN
        v_new_paid := v_udhari.total_received + v_amount;
        v_new_balance := GREATEST(0, ROUND(v_udhari.original_amount - v_new_paid, 2));
        IF v_new_balance <= 0.01 THEN
            v_new_balance := 0;
            v_new_status := 'PAID';
        ELSE
            v_new_status := 'PARTIALLY PAID';
        END IF;

        UPDATE public.udhari_records
        SET total_received = v_new_paid,
            outstanding_amount = v_new_balance,
            status = v_new_status::public.udhari_status,
            updated_at = NOW()
        WHERE id = v_udhari_id AND workspace_id = v_workspace_id;
    END IF;

    -- 5. Record Daybook Payment Inflow Event
    INSERT INTO public.daybook_transactions (
        id,
        workspace_id,
        transaction_code,
        transaction_date,
        transaction_type,
        direction,
        amount,
        payment_mode,
        party_type,
        party_id,
        party_name,
        reference_type,
        reference_id,
        reference_number,
        description,
        notes,
        status,
        payment_status,
        created_at,
        updated_at
    ) VALUES (
        v_payment_id,
        v_workspace_id,
        'DB-' || v_payment_code,
        v_payment_date,
        'CUSTOMER_PAYMENT',
        'IN',
        v_amount,
        v_payment_method::public.payment_mode,
        'customer',
        v_target_party_id,
        v_target_party_name,
        'PAYMENT',
        v_payment_id::TEXT,
        COALESCE(v_reference, v_target_ref_num),
        'Payment Received #' || v_payment_code || ' for ' || v_target_ref_num,
        v_notes,
        'COMPLETED',
        'PAID',
        NOW(),
        NOW()
    )
    ON CONFLICT (workspace_id, reference_type, reference_id) DO UPDATE
    SET amount = EXCLUDED.amount,
        payment_mode = EXCLUDED.payment_mode,
        transaction_date = EXCLUDED.transaction_date,
        updated_at = NOW();

    -- 6. Record Cashbook Entry (Liquidity movement)
    IF LOWER(v_payment_method) LIKE '%upi%' THEN
        v_account_name := 'UPI Clearing';
    ELSIF LOWER(v_payment_method) LIKE '%bank%' OR LOWER(v_payment_method) LIKE '%neft%' OR LOWER(v_payment_method) LIKE '%rtgs%' THEN
        v_account_name := 'Bank Account';
    ELSIF LOWER(v_payment_method) LIKE '%card%' THEN
        v_account_name := 'Card Settlement';
    ELSIF LOWER(v_payment_method) LIKE '%cheque%' THEN
        v_account_name := 'Cheques in Hand';
    ELSE
        v_account_name := 'Cash Account';
    END IF;

    INSERT INTO public.cashbook_entries (
        id,
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
        description,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_payment_id,
        v_workspace_id,
        v_payment_date,
        'CB-' || v_payment_code,
        'IN',
        v_amount,
        v_payment_method,
        v_account_name,
        'INVOICE_PAYMENT',
        v_payment_id::TEXT,
        COALESCE(v_reference, v_target_ref_num),
        v_target_party_name,
        'Payment received for ' || v_target_ref_num,
        v_notes,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET amount = EXCLUDED.amount,
        payment_method = EXCLUDED.payment_method,
        entry_date = EXCLUDED.entry_date,
        updated_at = NOW();

    -- 7. Update Follow-ups
    IF v_new_balance IS NOT NULL AND v_new_balance <= 0.01 THEN
        UPDATE public.follow_ups
        SET status = 'Completed',
            completed_at = NOW(),
            notes = COALESCE(notes, '') || ' [Settled in full on ' || v_payment_date::TEXT || ']'
        WHERE workspace_id = v_workspace_id
          AND (
              (v_invoice_id IS NOT NULL AND invoice_id = v_invoice_id)
              OR (v_udhari_id IS NOT NULL AND udhari_id = v_udhari_id)
              OR invoice_number = v_target_ref_num
          )
          AND status != 'Completed';
    ELSIF v_new_balance IS NOT NULL THEN
        UPDATE public.follow_ups
        SET notes = COALESCE(notes, '') || ' [Partial payment ₹' || v_amount::TEXT || ' recorded on ' || v_payment_date::TEXT || '. Remaining: ₹' || v_new_balance::TEXT || ']'
        WHERE workspace_id = v_workspace_id
          AND (
              (v_invoice_id IS NOT NULL AND invoice_id = v_invoice_id)
              OR (v_udhari_id IS NOT NULL AND udhari_id = v_udhari_id)
              OR invoice_number = v_target_ref_num
          )
          AND status != 'Completed';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'payment_code', v_payment_code,
        'invoice_id', v_invoice_id,
        'udhari_id', v_udhari_id,
        'amount', v_amount,
        'paid_amount', v_new_paid,
        'balance_amount', v_new_balance,
        'status', v_new_status
    );
END;
$$;

-- Explicitly grant execute permission
GRANT EXECUTE ON FUNCTION public.post_customer_payment_atomic(JSONB) TO authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- 4. HISTORICAL RECONCILIATION FOR HARDIK & VAISHALI
-- -----------------------------------------------------------------------------
-- Hardik (INV-2026-0007): Grand Total ₹5,900, Paid ₹1,900, Outstanding ₹4,000
UPDATE public.invoices
SET paid_amount = 1900,
    balance_amount = 4000,
    status = 'Partially Paid',
    updated_at = NOW()
WHERE invoice_number = 'INV-2026-0007'
  AND (paid_amount != 1900 OR balance_amount != 4000);

UPDATE public.udhari_records
SET total_received = 1900,
    outstanding_amount = 4000,
    original_amount = 5900,
    status = 'PARTIALLY PAID',
    updated_at = NOW()
WHERE (udhari_code = 'UD-INV-2026-0007' OR customer_name_snapshot ILIKE '%Hardik%')
  AND (total_received != 1900 OR outstanding_amount != 4000);

-- Vaishali (INV-2026-0006): Grand Total ₹2,950, Paid ₹1,400, Outstanding ₹1,550
UPDATE public.invoices
SET paid_amount = 1400,
    balance_amount = 1550,
    status = 'Partially Paid',
    updated_at = NOW()
WHERE invoice_number = 'INV-2026-0006'
  AND (paid_amount != 1400 OR balance_amount != 1550);

UPDATE public.udhari_records
SET total_received = 1400,
    outstanding_amount = 1550,
    original_amount = 2950,
    status = 'PARTIALLY PAID',
    updated_at = NOW()
WHERE (udhari_code = 'UD-INV-2026-0006' OR customer_name_snapshot ILIKE '%Vaishali%')
  AND (total_received != 1400 OR outstanding_amount != 1550);

COMMIT;

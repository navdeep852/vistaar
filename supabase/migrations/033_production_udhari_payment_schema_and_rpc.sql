-- =============================================================================
-- Migration 033: Production Udhari Payment Schema, Tables & RPC
-- Resolves PGRST202 by exposing public.post_customer_payment_atomic(JSONB)
-- Creates missing cashbook_entries table and adds missing columns safely
-- =============================================================================

-- 1. Ensure cashbook_entries table exists
CREATE TABLE IF NOT EXISTS public.cashbook_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    entry_number VARCHAR(100) NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('IN', 'OUT', 'NON_CASH')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    account_name VARCHAR(100) NOT NULL DEFAULT 'Cash Account',
    source_type VARCHAR(50) NOT NULL DEFAULT 'INVOICE_PAYMENT',
    source_id UUID,
    reference_number VARCHAR(100),
    party_name VARCHAR(255),
    description TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on cashbook_entries
ALTER TABLE public.cashbook_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'cashbook_entries' AND policyname = 'Users can view their own workspace cashbook entries'
    ) THEN
        CREATE POLICY "Users can view their own workspace cashbook entries"
            ON public.cashbook_entries FOR SELECT
            USING (workspace_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'cashbook_entries' AND policyname = 'Users can insert cashbook entries for their workspace'
    ) THEN
        CREATE POLICY "Users can insert cashbook entries for their workspace"
            ON public.cashbook_entries FOR INSERT
            WITH CHECK (workspace_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
    END IF;
END $$;

-- 2. Safely add missing columns to live tables if they do not exist
DO $$
BEGIN
    -- Add invoice_id to udhari_records if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'udhari_records' AND column_name = 'invoice_id'
    ) THEN
        ALTER TABLE public.udhari_records ADD COLUMN invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
    END IF;

    -- Add counter_sale_id to udhari_records if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'udhari_records' AND column_name = 'counter_sale_id'
    ) THEN
        ALTER TABLE public.udhari_records ADD COLUMN counter_sale_id UUID;
    END IF;

    -- Add total_amount, remaining_amount, payment_status to daybook_transactions if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'daybook_transactions' AND column_name = 'total_amount'
    ) THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN total_amount NUMERIC(12,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'daybook_transactions' AND column_name = 'remaining_amount'
    ) THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN remaining_amount NUMERIC(12,2);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'daybook_transactions' AND column_name = 'payment_status'
    ) THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN payment_status VARCHAR(50);
    END IF;

    -- Add udhari_id to follow_ups if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'follow_ups' AND column_name = 'udhari_id'
    ) THEN
        ALTER TABLE public.follow_ups ADD COLUMN udhari_id UUID;
    END IF;
END $$;

-- 3. Authoritative Atomic Customer Payment RPC
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

    v_new_paid NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_new_status VARCHAR(50);
    v_tag VARCHAR(50);

    v_target_ref_num VARCHAR(100);
    v_account_name VARCHAR(100);
BEGIN
    -- Extract parameters from JSON payload
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    v_amount := ROUND(COALESCE((p_payload->>'amount')::NUMERIC, 0), 2);
    v_payment_method := COALESCE(p_payload->>'payment_method', 'UPI');
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

    -- Basic validations
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id is required';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    -- Generate identifiers
    v_payment_id := gen_random_uuid();
    v_payment_code := COALESCE(
        p_payload->>'payment_code',
        'PAY-' || TO_CHAR(v_payment_date, 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0')
    );

    -- 1. Locate Invoice if invoice_id or invoice_number is provided
    IF v_invoice_id IS NOT NULL THEN
        SELECT * INTO v_inv FROM public.invoices WHERE id = v_invoice_id AND workspace_id = v_workspace_id FOR UPDATE;
    ELSIF p_payload->>'invoice_number' IS NOT NULL THEN
        SELECT * INTO v_inv FROM public.invoices WHERE invoice_number = (p_payload->>'invoice_number') AND workspace_id = v_workspace_id FOR UPDATE;
        IF FOUND THEN
            v_invoice_id := v_inv.id;
        END IF;
    END IF;

    -- 2. Locate Udhari Record
    IF v_udhari_id IS NOT NULL THEN
        SELECT * INTO v_udhari FROM public.udhari_records WHERE id = v_udhari_id AND workspace_id = v_workspace_id FOR UPDATE;
    ELSIF v_invoice_id IS NOT NULL THEN
        -- Try by udhari_code = 'UD-' || invoice_number
        SELECT * INTO v_udhari FROM public.udhari_records WHERE udhari_code = 'UD-' || v_inv.invoice_number AND workspace_id = v_workspace_id FOR UPDATE;
        IF FOUND THEN
            v_udhari_id := v_udhari.id;
        END IF;
    ELSIF p_payload->>'udhari_code' IS NOT NULL THEN
        SELECT * INTO v_udhari FROM public.udhari_records WHERE udhari_code = (p_payload->>'udhari_code') AND workspace_id = v_workspace_id FOR UPDATE;
        IF FOUND THEN
            v_udhari_id := v_udhari.id;
        END IF;
    END IF;

    -- Overpayment validation
    IF v_udhari.id IS NOT NULL THEN
        IF v_amount > (v_udhari.outstanding_amount + 0.05) THEN
            RAISE EXCEPTION 'Overpayment rejected: amount % exceeds outstanding balance %', v_amount, v_udhari.outstanding_amount;
        END IF;
    ELSIF v_inv.id IS NOT NULL THEN
        IF v_amount > (v_inv.balance_amount + 0.05) THEN
            RAISE EXCEPTION 'Overpayment rejected: amount % exceeds invoice balance %', v_amount, v_inv.balance_amount;
        END IF;
    END IF;

    -- Fallback customer names
    v_customer_name := COALESCE(v_customer_name, v_inv.customer_name, v_udhari.customer_name_snapshot, 'Customer');
    v_target_ref_num := COALESCE(v_inv.invoice_number, v_udhari.udhari_code, v_payment_code);

    -- 3. Insert authoritative payment record into public.payments
    INSERT INTO public.payments (
        id,
        workspace_id,
        payment_number,
        customer_id,
        customer_name,
        invoice_id,
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
        v_payment_code,
        COALESCE(v_customer_id, v_inv.customer_id, v_udhari.customer_id),
        v_customer_name,
        v_invoice_id,
        v_inv.invoice_number,
        v_amount,
        v_payment_date,
        v_payment_method,
        v_reference,
        v_notes,
        NOW()
    );

    -- 4. Insert into public.udhari_payments if linked to an Udhari record
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
            COALESCE(v_customer_id, v_udhari.customer_id),
            v_payment_code,
            v_amount,
            v_payment_method::public.payment_method,
            v_payment_date,
            v_customer_phone,
            v_reference,
            v_notes,
            NOW()
        );

        -- Update public.udhari_records
        v_new_paid := COALESCE(v_udhari.total_received, 0) + v_amount;
        v_new_balance := GREATEST(0, ROUND(v_udhari.original_amount - v_new_paid, 2));
        v_new_status := CASE WHEN v_new_balance <= 0.01 THEN 'PAID' ELSE 'PARTIALLY PAID' END;

        UPDATE public.udhari_records
        SET total_received = v_new_paid,
            outstanding_amount = v_new_balance,
            status = v_new_status,
            updated_at = NOW()
        WHERE id = v_udhari_id;
    END IF;

    -- 5. Update public.invoices if linked
    IF v_invoice_id IS NOT NULL THEN
        v_new_paid := COALESCE(v_inv.paid_amount, 0) + v_amount;
        v_new_balance := GREATEST(0, ROUND(v_inv.grand_total - v_new_paid, 2));
        v_new_status := CASE WHEN v_new_balance <= 0.01 THEN 'Paid' ELSE 'Partially Paid' END;

        UPDATE public.invoices
        SET paid_amount = v_new_paid,
            balance_amount = v_new_balance,
            status = v_new_status,
            updated_at = NOW()
        WHERE id = v_invoice_id;
    END IF;

    -- 6. Insert Daybook payment receipt event (Actual cash inflow on payment date)
    INSERT INTO public.daybook_transactions (
        id,
        workspace_id,
        transaction_code,
        transaction_date,
        transaction_type,
        direction,
        amount,
        payment_mode,
        reference_type,
        reference_id,
        reference_number,
        party_type,
        party_id,
        party_name,
        description,
        notes,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_workspace_id,
        'ACC-' || v_payment_code,
        v_payment_date,
        'CUSTOMER_PAYMENT',
        'IN',
        v_amount,
        v_payment_method,
        'PAYMENT',
        v_payment_id::TEXT,
        v_target_ref_num,
        'customer',
        COALESCE(v_customer_id, v_inv.customer_id, v_udhari.customer_id),
        v_customer_name,
        'Payment Received #' || v_payment_code || ' for ' || v_target_ref_num,
        v_reference,
        NOW(),
        NOW()
    );

    -- 7. Insert Cashbook entry
    v_account_name := CASE
        WHEN v_payment_method ILIKE '%upi%' THEN 'UPI Clearing'
        WHEN v_payment_method ILIKE '%bank%' OR v_payment_method ILIKE '%neft%' OR v_payment_method ILIKE '%rtgs%' THEN 'Bank Account'
        WHEN v_payment_method ILIKE '%card%' THEN 'Card Settlement'
        WHEN v_payment_method ILIKE '%cheque%' THEN 'Cheques in Hand'
        ELSE 'Cash Account'
    END;

    INSERT INTO public.cashbook_entries (
        id,
        workspace_id,
        entry_number,
        entry_date,
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
        gen_random_uuid(),
        v_workspace_id,
        'CB-' || v_payment_code,
        v_payment_date,
        'IN',
        v_amount,
        v_payment_method,
        v_account_name,
        'INVOICE_PAYMENT',
        v_payment_id,
        v_target_ref_num,
        v_customer_name,
        'Payment received for ' || v_target_ref_num,
        v_reference,
        NOW(),
        NOW()
    );

    -- 8. Follow-up synchronization
    IF v_new_balance <= 0.01 THEN
        UPDATE public.follow_ups
        SET status = 'Completed',
            completed_at = NOW(),
            updated_at = NOW()
        WHERE workspace_id = v_workspace_id
          AND (
            (v_invoice_id IS NOT NULL AND invoice_id = v_invoice_id)
            OR (v_inv.invoice_number IS NOT NULL AND invoice_number = v_inv.invoice_number)
          )
          AND status != 'Completed';
    ELSE
        UPDATE public.follow_ups
        SET notes = 'Outstanding receivable: ₹' || v_new_balance::TEXT,
            updated_at = NOW()
        WHERE workspace_id = v_workspace_id
          AND (
            (v_invoice_id IS NOT NULL AND invoice_id = v_invoice_id)
            OR (v_inv.invoice_number IS NOT NULL AND invoice_number = v_inv.invoice_number)
          )
          AND status != 'Completed';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
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

-- Permissions
GRANT EXECUTE ON FUNCTION public.post_customer_payment_atomic(JSONB) TO authenticated, anon, service_role;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

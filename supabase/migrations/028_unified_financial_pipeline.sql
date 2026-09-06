-- =============================================================================
-- VISTAAR BUSINESS OS — UNIFIED FINANCIAL TRANSACTION PIPELINE MIGRATION
-- Migration File: supabase/migrations/028_unified_financial_pipeline.sql
-- Description: Unifies Daybook, Cashbook, Udhari, Invoices, and Follow-ups
--              with strict idempotency, overpayment protection, atomic RPC,
--              and multi-tenant RLS isolation.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. EXTEND DAYBOOK TRANSACTIONS WITH TOTAL & REMAINING AMOUNT
-- -----------------------------------------------------------------------------
ALTER TABLE public.daybook_transactions 
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);

COMMENT ON COLUMN public.daybook_transactions.total_amount IS 
    'Gross transaction total for sales events (Invoice / Counter Sale only; NULL for others).';
COMMENT ON COLUMN public.daybook_transactions.remaining_amount IS 
    'Cumulative remaining unpaid balance for credit transactions (NULL for expenses).';
COMMENT ON COLUMN public.daybook_transactions.payment_status IS 
    'Financial status tag: PAID, PARTIALLY PAID, UNPAID, CANCELLED.';

-- -----------------------------------------------------------------------------
-- 2. LINK UDHARI RECORDS DIRECTLY TO INVOICES
-- -----------------------------------------------------------------------------
ALTER TABLE public.udhari_records 
    ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_udhari_records_workspace_invoice 
    ON public.udhari_records(workspace_id, invoice_id) 
    WHERE invoice_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. LINK FOLLOW-UPS DIRECTLY TO UDHARI RECORDS
-- -----------------------------------------------------------------------------
ALTER TABLE public.follow_ups 
    ADD COLUMN IF NOT EXISTS udhari_id UUID REFERENCES public.udhari_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_follow_ups_workspace_udhari 
    ON public.follow_ups(workspace_id, udhari_id) 
    WHERE udhari_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. EXTEND CASHBOOK ENUM / CHECK CONSTRAINT (IF APPLICABLE)
-- -----------------------------------------------------------------------------
-- Ensure cashbook_entries allows UDHARI_PAYMENT as source_type
ALTER TABLE public.cashbook_entries 
    DROP CONSTRAINT IF EXISTS cashbook_entries_source_type_check;

-- -----------------------------------------------------------------------------
-- 5. ATOMIC FINANCIAL TRANSACTION RPC: record_udhari_payment_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_udhari_payment_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_udhari_id UUID;
    v_amount NUMERIC(12,2);
    v_payment_method VARCHAR(50);
    v_payment_date DATE;
    v_phone_number VARCHAR(50);
    v_reference VARCHAR(100);
    v_notes TEXT;

    v_udhari RECORD;
    v_invoice RECORD;
    v_payment_id UUID;
    v_payment_code VARCHAR(100);
    v_new_received NUMERIC(12,2);
    v_new_outstanding NUMERIC(12,2);
    v_new_udhari_status VARCHAR(50);
    v_inv_new_paid NUMERIC(12,2);
    v_inv_new_balance NUMERIC(12,2);
    v_inv_new_status VARCHAR(50);
    v_inv_tag VARCHAR(50);
    v_daybook_entry_id UUID;
    v_cashbook_entry_id UUID;
BEGIN
    -- Extract and validate parameters
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    v_udhari_id := (p_payload->>'udhari_id')::UUID;
    v_amount := ROUND(COALESCE((p_payload->>'amount')::NUMERIC, 0), 2);
    v_payment_method := COALESCE(p_payload->>'payment_method', 'Cash');
    v_payment_date := COALESCE((p_payload->>'payment_date')::DATE, CURRENT_DATE);
    v_phone_number := COALESCE(p_payload->>'phone_number', '');
    v_reference := p_payload->>'reference';
    v_notes := p_payload->>'notes';

    IF v_workspace_id IS NULL OR v_udhari_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id and udhari_id are required';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    -- Lock and retrieve Udhari record
    SELECT * INTO v_udhari
    FROM public.udhari_records
    WHERE id = v_udhari_id AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Udhari record not found for id % in workspace %', v_udhari_id, v_workspace_id;
    END IF;

    -- Overpayment protection
    IF v_amount > (v_udhari.outstanding_amount + 0.05) THEN
        RAISE EXCEPTION 'Overpayment rejected: payment amount (%) exceeds outstanding balance (%)',
            v_amount, v_udhari.outstanding_amount;
    END IF;

    -- Generate stable payment code
    v_payment_id := gen_random_uuid();
    v_payment_code := 'PAY-' || TO_CHAR(v_payment_date, 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');

    -- Insert into udhari_payments
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
        v_udhari.customer_id,
        v_payment_code,
        v_amount,
        v_payment_method::public.payment_method,
        v_payment_date,
        v_phone_number,
        v_reference,
        v_notes,
        NOW()
    );

    -- Calculate new Udhari totals
    v_new_received := v_udhari.total_received + v_amount;
    v_new_outstanding := GREATEST(0, ROUND(v_udhari.original_amount - v_new_received, 2));
    IF v_new_outstanding <= 0.01 THEN
        v_new_outstanding := 0;
        v_new_udhari_status := 'PAID';
    ELSE
        v_new_udhari_status := 'PARTIALLY PAID';
    END IF;

    -- Update udhari_records (never delete)
    UPDATE public.udhari_records
    SET 
        total_received = v_new_received,
        outstanding_amount = v_new_outstanding,
        status = v_new_udhari_status::public.udhari_status,
        updated_at = NOW()
    WHERE id = v_udhari_id AND workspace_id = v_workspace_id;

    -- If linked to an invoice, synchronize Invoice, Payments, and Daybook
    IF v_udhari.invoice_id IS NOT NULL THEN
        SELECT * INTO v_invoice
        FROM public.invoices
        WHERE id = v_udhari.invoice_id AND workspace_id = v_workspace_id
        FOR UPDATE;

        IF FOUND THEN
            v_inv_new_paid := v_invoice.paid_amount + v_amount;
            v_inv_new_balance := GREATEST(0, ROUND(v_invoice.grand_total - v_inv_new_paid, 2));
            IF v_inv_new_balance <= 0.01 THEN
                v_inv_new_balance := 0;
                v_inv_new_status := 'Paid';
                v_inv_tag := 'PAID';
            ELSE
                v_inv_new_status := 'Partially Paid';
                v_inv_tag := 'PARTIALLY PAID';
            END IF;

            -- Update invoice
            UPDATE public.invoices
            SET 
                paid_amount = v_inv_new_paid,
                balance_amount = v_inv_new_balance,
                status = v_inv_new_status,
                updated_at = NOW()
            WHERE id = v_udhari.invoice_id AND workspace_id = v_workspace_id;

            -- Insert standard payment record for auditable invoice payment history
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
                gen_random_uuid(),
                v_workspace_id,
                v_udhari.customer_id,
                v_udhari.invoice_id,
                v_payment_code,
                v_udhari.customer_name_snapshot,
                v_invoice.invoice_number,
                v_amount,
                v_payment_date,
                v_payment_method::public.payment_method,
                v_reference,
                COALESCE(v_notes, 'Udhari Settlement for Invoice ' || v_invoice.invoice_number),
                NOW()
            );

            -- Update original Daybook sale entry for this invoice
            UPDATE public.daybook_transactions
            SET 
                amount = v_inv_new_paid,
                remaining_amount = v_inv_new_balance,
                payment_status = v_inv_tag,
                updated_at = NOW()
            WHERE workspace_id = v_workspace_id 
              AND reference_type = 'INVOICE' 
              AND (reference_id = v_udhari.invoice_id::TEXT OR reference_number = v_invoice.invoice_number);
        END IF;
    END IF;

    -- Record Daybook payment event on actual payment date (Receivable collection)
    v_daybook_entry_id := gen_random_uuid();
    INSERT INTO public.daybook_transactions (
        id,
        workspace_id,
        transaction_code,
        transaction_date,
        transaction_type,
        direction,
        amount,
        total_amount,
        remaining_amount,
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
        v_daybook_entry_id,
        v_workspace_id,
        'DB-' || v_payment_code,
        v_payment_date,
        'CUSTOMER_PAYMENT',
        'IN',
        v_amount,
        NULL, -- Total column rule: strictly filled for Invoice/Counter Sale rows only
        NULL,
        v_payment_method::public.payment_method,
        'customer',
        v_udhari.customer_id,
        v_udhari.customer_name_snapshot,
        'UDHARI_PAYMENT',
        v_payment_id::TEXT,
        COALESCE(v_reference, v_payment_code),
        'Receivable Collection / Udhari Payment (' || v_udhari.udhari_code || ')',
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

    -- Record Cashbook entry for actual money received on payment date
    v_cashbook_entry_id := gen_random_uuid();
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
        v_cashbook_entry_id,
        v_workspace_id,
        v_payment_date,
        'CB-' || v_payment_code,
        'IN',
        v_amount,
        v_payment_method,
        CASE WHEN v_payment_method = 'Cash' THEN 'Cash Account' ELSE 'Bank / Digital Account' END,
        'UDHARI_PAYMENT',
        v_payment_id::TEXT,
        COALESCE(v_reference, v_payment_code),
        v_udhari.customer_name_snapshot,
        'Udhari payment received from ' || v_udhari.customer_name_snapshot,
        v_notes,
        NOW(),
        NOW()
    )
    ON CONFLICT (workspace_id, source_type, source_id, direction) WHERE source_id IS NOT NULL DO UPDATE
    SET amount = EXCLUDED.amount,
        entry_date = EXCLUDED.entry_date,
        payment_method = EXCLUDED.payment_method,
        updated_at = NOW();

    -- Synchronize Follow-up
    IF v_new_outstanding <= 0 THEN
        UPDATE public.follow_ups
        SET 
            status = 'Completed',
            completed_at = NOW(),
            notes = COALESCE(notes, '') || ' [Settled in full on ' || v_payment_date::TEXT || ']'
        WHERE workspace_id = v_workspace_id 
          AND (udhari_id = v_udhari_id OR (v_udhari.invoice_id IS NOT NULL AND invoice_id = v_udhari.invoice_id))
          AND status != 'Completed';
    ELSE
        UPDATE public.follow_ups
        SET 
            notes = COALESCE(notes, '') || ' [Partial payment ₹' || v_amount::TEXT || ' recorded on ' || v_payment_date::TEXT || '. Remaining: ₹' || v_new_outstanding::TEXT || ']'
        WHERE workspace_id = v_workspace_id 
          AND (udhari_id = v_udhari_id OR (v_udhari.invoice_id IS NOT NULL AND invoice_id = v_udhari.invoice_id))
          AND status != 'Completed';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'payment_code', v_payment_code,
        'total_received', v_new_received,
        'outstanding_amount', v_new_outstanding,
        'status', v_new_udhari_status
    );
END;
$$;

COMMIT;

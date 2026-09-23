-- =============================================================================
-- Migration 041: Daybook Payment Total and Inflow Financial Fix
-- Solves Root Cause: Total = Document Grand Total, Inflow = Payment Transaction Amount, Remaining = Outstanding Balance
-- Guarantees:
-- 1. Updates post_customer_payment_atomic to insert an authoritative Daybook payment transaction on payment_date:
--    - total_amount = invoice.grand_total (e.g. ₹17,700)
--    - amount = payment.amount (inflow: e.g. ₹10,700)
--    - remaining_amount = invoice.grand_total - cumulative_paid (e.g. ₹7,000)
-- 2. Maintains Cashbook inflow as strictly payment.amount (e.g. ₹10,700)
-- 3. Synchronizes Udhari ledger (original = ₹17,700, received = ₹10,700, outstanding = ₹7,000)
-- 4. Reconciles existing historical daybook transactions and invoices idempotently
-- =============================================================================

-- 1. Ensure Columns Exist on daybook_transactions
ALTER TABLE public.daybook_transactions
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);

-- Ensure Unique Index for Idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_daybook_unique_tenant_ref
    ON public.daybook_transactions (workspace_id, reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

-- 2. Authoritative Atomic RPC Function for Customer Payments
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

    v_new_inv_paid NUMERIC(12,2);
    v_new_inv_bal NUMERIC(12,2);
    v_new_inv_status VARCHAR(50);
    v_inv_total NUMERIC(12,2);

    v_target_ref_num VARCHAR(100);
    v_account_name VARCHAR(100);
    v_daybook_payment_id UUID;
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
        SELECT * INTO v_udhari FROM public.udhari_records WHERE invoice_id = v_invoice_id AND workspace_id = v_workspace_id FOR UPDATE;
        IF FOUND THEN
            v_udhari_id := v_udhari.id;
        ELSE
            SELECT * INTO v_udhari FROM public.udhari_records WHERE udhari_code = 'UD-' || v_inv.invoice_number AND workspace_id = v_workspace_id FOR UPDATE;
            IF FOUND THEN
                v_udhari_id := v_udhari.id;
            END IF;
        END IF;
    ELSIF p_payload->>'udhari_code' IS NOT NULL THEN
        SELECT * INTO v_udhari FROM public.udhari_records WHERE udhari_code = (p_payload->>'udhari_code') AND workspace_id = v_workspace_id FOR UPDATE;
        IF FOUND THEN
            v_udhari_id := v_udhari.id;
        END IF;
    END IF;

    -- Auto-create Udhari record if missing for this invoice
    IF v_udhari.id IS NULL AND v_inv.id IS NOT NULL THEN
        INSERT INTO public.udhari_records (
            id,
            workspace_id,
            customer_id,
            invoice_id,
            udhari_code,
            customer_name_snapshot,
            phone_snapshot,
            original_amount,
            total_received,
            outstanding_amount,
            due_date,
            status,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_workspace_id,
            COALESCE(v_customer_id, v_inv.customer_id),
            v_inv.id,
            'UD-' || v_inv.invoice_number,
            COALESCE(v_customer_name, v_inv.customer_name, 'Customer'),
            v_customer_phone,
            v_inv.grand_total,
            COALESCE(v_inv.paid_amount, 0),
            COALESCE(v_inv.balance_amount, v_inv.grand_total),
            COALESCE(v_inv.due_date, CURRENT_DATE + INTERVAL '15 days'),
            CASE WHEN COALESCE(v_inv.paid_amount, 0) > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
            NOW(),
            NOW()
        ) RETURNING * INTO v_udhari;
        v_udhari_id := v_udhari.id;
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

    -- Authoritative Document Total
    v_inv_total := COALESCE(v_inv.grand_total, v_udhari.original_amount, v_amount);
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
        SET original_amount = v_udhari.original_amount,
            total_received = v_new_paid,
            outstanding_amount = v_new_balance,
            status = v_new_status,
            updated_at = NOW()
        WHERE id = v_udhari_id;
    END IF;

    -- 5. Update public.invoices if linked
    IF v_invoice_id IS NOT NULL THEN
        v_new_inv_paid := COALESCE(v_inv.paid_amount, 0) + v_amount;
        v_new_inv_bal := GREATEST(0, ROUND(v_inv.grand_total - v_new_inv_paid, 2));
        v_new_inv_status := CASE WHEN v_new_inv_bal <= 0.01 THEN 'Paid' ELSE 'Partially Paid' END;

        UPDATE public.invoices
        SET grand_total = v_inv.grand_total,
            paid_amount = v_new_inv_paid,
            balance_amount = v_new_inv_bal,
            status = v_new_inv_status,
            updated_at = NOW()
        WHERE id = v_invoice_id;

        -- Also keep SALE entry remaining balance in sync
        UPDATE public.daybook_transactions
        SET total_amount = v_inv.grand_total,
            remaining_amount = v_new_inv_bal,
            payment_status = CASE WHEN v_new_inv_bal <= 0.01 THEN 'PAID' ELSE 'PARTIALLY PAID' END,
            updated_at = NOW()
        WHERE workspace_id = v_workspace_id
          AND reference_type = 'INVOICE'
          AND (reference_id = v_invoice_id::TEXT OR reference_number = v_inv.invoice_number);
    END IF;

    -- 6. Insert Authoritative Daybook Payment Transaction on payment_date
    -- TOTAL = v_inv_total (e.g. ₹17,700)
    -- INFLOW = v_amount (e.g. ₹10,700)
    -- REMAINING = v_new_inv_bal or v_new_balance (e.g. ₹7,000)
    v_daybook_payment_id := gen_random_uuid();
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
        payment_status,
        payment_mode,
        reference_type,
        reference_id,
        reference_number,
        party_type,
        party_id,
        party_name,
        description,
        notes,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_daybook_payment_id,
        v_workspace_id,
        v_payment_code,
        v_payment_date,
        'CUSTOMER_PAYMENT',
        'IN',
        v_amount,
        v_inv_total,
        COALESCE(v_new_inv_bal, v_new_balance, 0),
        CASE WHEN COALESCE(v_new_inv_bal, v_new_balance, 0) <= 0.01 THEN 'PAID' ELSE 'PARTIALLY PAID' END,
        v_payment_method,
        'PAYMENT',
        v_payment_id::TEXT,
        COALESCE(v_inv.invoice_number, v_udhari.udhari_code, v_payment_code),
        'customer',
        COALESCE(v_customer_id, v_inv.customer_id, v_udhari.customer_id),
        v_customer_name,
        'Invoice #' || COALESCE(v_inv.invoice_number, v_udhari.udhari_code, v_payment_code),
        v_reference,
        'COMPLETED',
        NOW(),
        NOW()
    )
    ON CONFLICT (workspace_id, reference_type, reference_id) DO UPDATE
    SET amount = EXCLUDED.amount,
        total_amount = EXCLUDED.total_amount,
        remaining_amount = EXCLUDED.remaining_amount,
        payment_status = EXCLUDED.payment_status,
        updated_at = NOW();

    -- 7. Insert Cashbook entry (Strictly payment amount inflow)
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

    -- 8. Synchronize Follow-ups
    IF v_new_balance <= 0.01 OR v_new_inv_bal <= 0.01 THEN
        UPDATE public.follow_ups
        SET status = 'Completed',
            completed_at = NOW(),
            updated_at = NOW()
        WHERE workspace_id = v_workspace_id
          AND (invoice_id = v_invoice_id OR invoice_number = v_inv.invoice_number OR udhari_id = v_udhari_id)
          AND status != 'Completed';
    ELSE
        UPDATE public.follow_ups
        SET notes = 'Payment received: ₹' || v_amount || '. Outstanding receivable: ₹' || COALESCE(v_new_balance, v_new_inv_bal),
            updated_at = NOW()
        WHERE workspace_id = v_workspace_id
          AND (invoice_id = v_invoice_id OR invoice_number = v_inv.invoice_number OR udhari_id = v_udhari_id)
          AND status != 'Completed';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'payment_code', v_payment_code,
        'invoice_id', v_invoice_id,
        'udhari_id', v_udhari_id,
        'daybook_transaction_id', v_daybook_payment_id,
        'amount_paid', v_amount,
        'invoice_total', v_inv_total,
        'invoice_paid', v_new_inv_paid,
        'invoice_balance', v_new_inv_bal,
        'udhari_received', v_new_paid,
        'udhari_outstanding', v_new_balance
    );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.post_customer_payment_atomic(JSONB) TO authenticated, anon, service_role;

-- 3. Idempotent Historical Reconciliation Migration
-- Backfill total_amount and remaining_amount on existing invoice daybook transactions
UPDATE public.daybook_transactions dt
SET total_amount = COALESCE(dt.total_amount, inv.grand_total, dt.amount),
    remaining_amount = COALESCE(dt.remaining_amount, inv.balance_amount, 0)
FROM public.invoices inv
WHERE dt.workspace_id = inv.workspace_id
  AND dt.reference_type = 'INVOICE'
  AND (dt.reference_id = inv.id::TEXT OR dt.reference_number = inv.invoice_number)
  AND (dt.total_amount IS NULL OR dt.total_amount = 0 OR dt.remaining_amount IS NULL);

-- Backfill total_amount and remaining_amount on existing payment daybook transactions
UPDATE public.daybook_transactions dt
SET total_amount = COALESCE(dt.total_amount, inv.grand_total),
    remaining_amount = COALESCE(dt.remaining_amount, inv.balance_amount, 0)
FROM public.payments p
JOIN public.invoices inv ON (p.invoice_id = inv.id OR p.invoice_number = inv.invoice_number)
WHERE dt.workspace_id = p.workspace_id
  AND dt.reference_type = 'PAYMENT'
  AND dt.reference_id = p.id::TEXT
  AND (dt.total_amount IS NULL OR dt.total_amount = 0 OR dt.remaining_amount IS NULL);

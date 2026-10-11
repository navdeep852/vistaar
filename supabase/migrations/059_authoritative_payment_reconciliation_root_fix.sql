-- =============================================================================
-- Migration 059: Authoritative Payment Reconciliation & Overpayment Fix
--
-- Root Cause Addressed:
-- 1. Dual conflicting sources of truth between UI and DB snapshot columns.
-- 2. Stale or desynchronized udhari_records.outstanding_amount vs invoices.balance_amount.
-- 3. post_customer_payment_atomic failed to resolve formatted udhari codes (e.g. 'UD-INV-2026-0006').
-- 4. Overpayment error exposes internal DB implementation details instead of standard format.
--
-- This migration establishes ONE single authoritative formula:
--   Outstanding = Invoice Total - Sum(Confirmed Posted Payments)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.post_customer_payment_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_branch_id UUID;
    v_invoice_id UUID;
    v_invoice_number VARCHAR(100);
    v_udhari_id UUID;
    v_udhari_code VARCHAR(100);
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
    v_is_upfront BOOLEAN;

    v_inv RECORD;
    v_udhari RECORD;

    v_authoritative_paid NUMERIC(12,2) := 0;
    v_authoritative_total NUMERIC(12,2) := 0;
    v_authoritative_outstanding NUMERIC(12,2) := 0;

    v_new_inv_paid NUMERIC(12,2);
    v_new_inv_bal NUMERIC(12,2);
    v_new_inv_status VARCHAR(50);
    v_new_status VARCHAR(50);

    v_target_ref_num VARCHAR(100);
    v_account_name VARCHAR(100);
BEGIN
    -- 1. Resolve workspace_id
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Workspace could not be resolved.';
    END IF;

    -- 2. Extract payload fields
    v_amount := ROUND(COALESCE((p_payload->>'amount')::NUMERIC, 0), 2);
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Payment amount must be greater than zero.';
    END IF;

    v_payment_method := COALESCE(p_payload->>'payment_method', 'Cash');
    v_payment_date := COALESCE((p_payload->>'payment_date')::DATE, CURRENT_DATE);
    v_reference := p_payload->>'reference';
    v_notes := p_payload->>'notes';
    v_customer_name := COALESCE(p_payload->>'customer_name', 'Customer');
    v_customer_phone := COALESCE(p_payload->>'customer_phone', '');
    v_is_upfront := COALESCE((p_payload->>'is_upfront_payment')::BOOLEAN, false);

    IF p_payload->>'customer_id' IS NOT NULL AND (p_payload->>'customer_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_customer_id := (p_payload->>'customer_id')::UUID;
    END IF;

    IF p_payload->>'branch_id' IS NOT NULL AND (p_payload->>'branch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_branch_id := (p_payload->>'branch_id')::UUID;
    END IF;

    IF p_payload->>'counter_sale_id' IS NOT NULL AND (p_payload->>'counter_sale_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_counter_sale_id := (p_payload->>'counter_sale_id')::UUID;
    END IF;

    -- Extract Invoice identifiers
    IF p_payload->>'invoice_id' IS NOT NULL AND (p_payload->>'invoice_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_invoice_id := (p_payload->>'invoice_id')::UUID;
    END IF;
    v_invoice_number := NULLIF(p_payload->>'invoice_number', '');

    -- Extract Udhari identifiers
    IF p_payload->>'udhari_id' IS NOT NULL AND (p_payload->>'udhari_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_udhari_id := (p_payload->>'udhari_id')::UUID;
    END IF;
    v_udhari_code := NULLIF(p_payload->>'udhari_code', '');
    IF v_udhari_code IS NULL AND (p_payload->>'udhari_id') IS NOT NULL AND NOT ((p_payload->>'udhari_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
        v_udhari_code := p_payload->>'udhari_id';
    END IF;

    -- 3. Resolve target Udhari row
    IF v_udhari_id IS NOT NULL THEN
        SELECT * INTO v_udhari FROM public.udhari_records WHERE id = v_udhari_id AND workspace_id = v_workspace_id FOR UPDATE;
    ELSIF v_udhari_code IS NOT NULL THEN
        SELECT * INTO v_udhari FROM public.udhari_records WHERE (udhari_code = v_udhari_code OR udhari_code = 'UD-' || v_udhari_code) AND workspace_id = v_workspace_id FOR UPDATE;
        IF v_udhari.id IS NOT NULL THEN
            v_udhari_id := v_udhari.id;
        END IF;
    END IF;

    -- 4. Resolve target Invoice row
    IF v_invoice_id IS NOT NULL THEN
        SELECT * INTO v_inv FROM public.invoices WHERE id = v_invoice_id AND workspace_id = v_workspace_id FOR UPDATE;
    ELSIF v_invoice_number IS NOT NULL THEN
        SELECT * INTO v_inv FROM public.invoices WHERE invoice_number = v_invoice_number AND workspace_id = v_workspace_id FOR UPDATE;
        IF v_inv.id IS NOT NULL THEN
            v_invoice_id := v_inv.id;
        END IF;
    ELSIF v_udhari.invoice_id IS NOT NULL THEN
        SELECT * INTO v_inv FROM public.invoices WHERE id = v_udhari.invoice_id AND workspace_id = v_workspace_id FOR UPDATE;
        IF v_inv.id IS NOT NULL THEN
            v_invoice_id := v_inv.id;
        END IF;
    END IF;

    -- If udhari was not found by code, try by invoice id
    IF v_udhari.id IS NULL AND v_invoice_id IS NOT NULL THEN
        SELECT * INTO v_udhari FROM public.udhari_records WHERE invoice_id = v_invoice_id AND workspace_id = v_workspace_id FOR UPDATE;
        IF v_udhari.id IS NOT NULL THEN
            v_udhari_id := v_udhari.id;
        END IF;
    END IF;

    -- Propagate branch_id
    IF v_branch_id IS NULL THEN
        v_branch_id := COALESCE(v_inv.branch_id, v_udhari.branch_id);
    END IF;

    -- 5. Authoritative Outstanding Calculation
    -- Query valid confirmed posted payments from payments table
    SELECT COALESCE(SUM(amount), 0) INTO v_authoritative_paid
    FROM public.payments
    WHERE workspace_id = v_workspace_id
      AND (
          (v_invoice_id IS NOT NULL AND invoice_id = v_invoice_id)
          OR (v_inv.invoice_number IS NOT NULL AND invoice_number = v_inv.invoice_number)
          OR (v_udhari_id IS NOT NULL AND invoice_id = v_udhari.invoice_id)
      );

    -- If no records in payments table, check udhari_payments
    IF v_authoritative_paid = 0 AND v_udhari_id IS NOT NULL THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_authoritative_paid
        FROM public.udhari_payments
        WHERE workspace_id = v_workspace_id AND udhari_id = v_udhari_id;
    END IF;

    -- If still 0, fall back to existing stored paid_amount
    IF v_authoritative_paid = 0 THEN
        v_authoritative_paid := COALESCE(v_inv.paid_amount, v_udhari.total_received, 0);
    END IF;

    v_authoritative_total := COALESCE(v_inv.grand_total, v_udhari.original_amount, 0);
    v_authoritative_outstanding := GREATEST(0, v_authoritative_total - v_authoritative_paid);

    -- 6. Strict Payment Validation (Requirement 7 & Requirement 18)
    IF NOT v_is_upfront THEN
        IF v_authoritative_outstanding > 0 AND v_amount > (v_authoritative_outstanding + 0.05) THEN
            RAISE EXCEPTION 'Payment exceeds this invoice''s outstanding balance. Invoice Outstanding: ₹% Amount Entered: ₹% Excess: ₹%',
                TO_CHAR(ROUND(v_authoritative_outstanding, 2), 'FM999,999,990.00'),
                TO_CHAR(ROUND(v_amount, 2), 'FM999,999,990.00'),
                TO_CHAR(ROUND(v_amount - v_authoritative_outstanding, 2), 'FM999,999,990.00');
        END IF;
    ELSIF v_authoritative_total > 0 AND v_amount > (v_authoritative_total + 0.05) THEN
        RAISE EXCEPTION 'Upfront payment exceeds invoice total. Invoice Total: ₹% Amount Entered: ₹%',
            TO_CHAR(ROUND(v_authoritative_total, 2), 'FM999,999,990.00'),
            TO_CHAR(ROUND(v_amount, 2), 'FM999,999,990.00');
    END IF;

    -- 7. Calculate New Financial State
    v_new_inv_paid := v_authoritative_paid + v_amount;
    v_new_inv_bal := GREATEST(0, v_authoritative_total - v_new_inv_paid);
    v_new_inv_status := CASE WHEN v_new_inv_bal <= 0.01 THEN 'Paid' ELSE 'Partially Paid' END;
    v_new_status := CASE WHEN v_new_inv_bal <= 0.01 THEN 'PAID' ELSE 'PARTIALLY PAID' END;

    -- 8. Synchronize Invoices table
    IF v_inv.id IS NOT NULL THEN
        UPDATE public.invoices
        SET paid_amount = v_new_inv_paid,
            balance_amount = v_new_inv_bal,
            status = v_new_inv_status,
            updated_at = NOW()
        WHERE id = v_inv.id;
        v_target_ref_num := v_inv.invoice_number;
        v_customer_id := COALESCE(v_customer_id, v_inv.customer_id);
        v_customer_name := COALESCE(v_inv.customer_name, v_customer_name);
    END IF;

    -- 9. Synchronize Udhari Records table
    IF v_udhari.id IS NOT NULL THEN
        UPDATE public.udhari_records
        SET original_amount = v_authoritative_total,
            total_received = v_new_inv_paid,
            outstanding_amount = v_new_inv_bal,
            status = v_new_status::public.udhari_status,
            updated_at = NOW()
        WHERE id = v_udhari.id;
        v_target_ref_num := COALESCE(v_target_ref_num, v_udhari.udhari_code);
        v_customer_id := COALESCE(v_customer_id, v_udhari.customer_id);
        v_customer_name := COALESCE(v_udhari.customer_name_snapshot, v_customer_name);
    END IF;

    -- 10. Generate Authoritative Payment Record
    v_payment_id := gen_random_uuid();
    v_payment_code := COALESCE(p_payload->>'payment_code', 'PAY-' || TO_CHAR(v_payment_date, 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0'));

    INSERT INTO public.payments (
        id,
        workspace_id,
        branch_id,
        customer_id,
        customer_name,
        invoice_id,
        invoice_number,
        payment_number,
        amount,
        payment_date,
        method,
        reference_no,
        notes,
        created_at
    ) VALUES (
        v_payment_id,
        v_workspace_id,
        v_branch_id,
        v_customer_id,
        v_customer_name,
        v_invoice_id,
        v_target_ref_num,
        v_payment_code,
        v_amount,
        v_payment_date,
        v_payment_method,
        v_reference,
        v_notes,
        NOW()
    );

    -- 11. Insert Udhari Payment entry if linked to udhari
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
            v_customer_id,
            v_payment_code,
            v_amount,
            v_payment_method,
            v_payment_date,
            v_customer_phone,
            v_reference,
            v_notes,
            NOW()
        )
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- 12. Insert Daybook Transaction (Inflow = v_amount, Remaining = v_new_inv_bal)
    INSERT INTO public.daybook_transactions (
        workspace_id,
        branch_id,
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
        notes,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_workspace_id,
        v_branch_id,
        v_payment_code,
        v_payment_date,
        'CUSTOMER_PAYMENT',
        'IN',
        v_amount,
        v_authoritative_total,
        v_new_inv_bal,
        v_new_status,
        v_payment_method,
        'customer',
        v_customer_id,
        v_customer_name,
        'PAYMENT',
        v_payment_id,
        v_target_ref_num,
        'Payment for Invoice #' || COALESCE(v_target_ref_num, 'Direct'),
        v_notes,
        'COMPLETED',
        NOW(),
        NOW()
    );

    -- 13. Synchronize Cashbook Entry
    v_account_name := CASE
        WHEN v_payment_method ILIKE '%Bank%' OR v_payment_method ILIKE '%NEFT%' OR v_payment_method ILIKE '%IMPS%' THEN 'Bank Account'
        WHEN v_payment_method ILIKE '%UPI%' OR v_payment_method ILIKE '%PhonePe%' OR v_payment_method ILIKE '%GPay%' THEN 'UPI / Online'
        ELSE 'Main Cash Register'
    END;

    INSERT INTO public.cashbook_entries (
        workspace_id,
        branch_id,
        entry_date,
        entry_type,
        category,
        account_name,
        amount,
        party_type,
        party_id,
        party_name,
        reference_number,
        description,
        source_module,
        source_id,
        created_at,
        updated_at
    ) VALUES (
        v_workspace_id,
        v_branch_id,
        v_payment_date,
        'CASH_IN',
        'Customer Payment',
        v_account_name,
        v_amount,
        'customer',
        v_customer_id,
        v_customer_name,
        v_payment_code,
        'Payment received for #' || COALESCE(v_target_ref_num, 'Direct'),
        'PAYMENT',
        v_payment_id,
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Payment recorded and reconciled successfully.',
        'payment_id', v_payment_id,
        'payment_code', v_payment_code,
        'authoritative_total', v_authoritative_total,
        'authoritative_paid', v_new_inv_paid,
        'outstanding_amount', v_new_inv_bal,
        'status', v_new_inv_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_customer_payment_atomic(JSONB) TO authenticated, anon, service_role;

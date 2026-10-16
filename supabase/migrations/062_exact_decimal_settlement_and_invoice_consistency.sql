-- =============================================================================
-- Migration 062: Exact Decimal Settlement & Udhari-Invoice Consistency
--
-- Core Invariants:
-- 1. Exact Settlement Policy:
--    - Outstanding = ₹0.00: Fully settled (PAID / Paid).
--    - Residual calculation overpayment (<= ₹0.00): Normalized to ₹0.00.
--    - Outstanding between ₹0.01 and ₹0.99: Strictly outstanding & actively payable (PARTIALLY PAID).
--    - Outstanding >= ₹1.00: Strictly outstanding & actively payable.
-- 2. Never allow negative outstanding balances to be stored or displayed.
-- 3. Retain exact historical payment records with full decimal accuracy.
-- 4. Repair inconsistent existing records:
--    - Records showing PAID with positive outstanding balance -> PARTIALLY PAID.
--    - Udhari records missing invoice_id linked to matching invoices by udhari_code.
-- =============================================================================

-- 1. Update post_customer_payment_atomic RPC with exact settlement (0.00 tolerance)
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
    v_raw_outstanding NUMERIC(12,2) := 0;
    v_authoritative_outstanding NUMERIC(12,2) := 0;

    v_new_inv_paid NUMERIC(12,2);
    v_raw_new_bal NUMERIC(12,2);
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
    SELECT COALESCE(SUM(amount), 0) INTO v_authoritative_paid
    FROM public.payments
    WHERE workspace_id = v_workspace_id
      AND (
          (v_invoice_id IS NOT NULL AND invoice_id = v_invoice_id)
          OR (v_inv.invoice_number IS NOT NULL AND invoice_number = v_inv.invoice_number)
          OR (v_udhari_id IS NOT NULL AND invoice_id = v_udhari.invoice_id)
      );

    IF v_authoritative_paid = 0 AND v_udhari_id IS NOT NULL THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_authoritative_paid
        FROM public.udhari_payments
        WHERE workspace_id = v_workspace_id AND udhari_id = v_udhari_id;
    END IF;

    IF v_authoritative_paid = 0 THEN
        v_authoritative_paid := COALESCE(v_inv.paid_amount, v_udhari.total_received, 0);
    END IF;

    v_authoritative_total := COALESCE(v_inv.grand_total, v_udhari.original_amount, 0);
    v_raw_outstanding := ROUND(v_authoritative_total - v_authoritative_paid, 2);

    -- Apply Exact Settlement Policy
    IF v_raw_outstanding <= 0.00 THEN
        v_authoritative_outstanding := 0.00;
    ELSE
        v_authoritative_outstanding := v_raw_outstanding;
    END IF;

    -- 6. Strict Payment Validation & Rapid Duplicate Prevention
    IF NOT v_is_upfront THEN
        IF v_authoritative_outstanding <= 0.00 THEN
            RAISE EXCEPTION 'Invoice is already fully paid. No outstanding balance remains.';
        ELSIF v_amount > (v_authoritative_outstanding + 0.001) THEN
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

    -- 7. Calculate New Financial State with Exact Settlement
    v_new_inv_paid := v_authoritative_paid + v_amount;
    v_raw_new_bal := ROUND(v_authoritative_total - v_new_inv_paid, 2);

    IF v_raw_new_bal <= 0.00 THEN
        v_new_inv_bal := 0.00;
    ELSE
        v_new_inv_bal := v_raw_new_bal;
    END IF;

    v_new_inv_status := CASE WHEN v_new_inv_bal = 0.00 THEN 'Paid' ELSE 'Partially Paid' END;
    v_new_status := CASE WHEN v_new_inv_bal = 0.00 THEN 'PAID' ELSE 'PARTIALLY PAID' END;

    -- 8. Synchronize Invoices table
    IF v_inv.id IS NOT NULL THEN
        UPDATE public.invoices
        SET paid_amount = v_new_inv_paid,
            balance_amount = v_new_inv_bal,
            status = v_new_inv_status,
            updated_at = NOW()
        WHERE id = v_inv.id;
        v_target_ref_num := v_inv.invoice_number;
    ELSIF v_invoice_number IS NOT NULL THEN
        v_target_ref_num := v_invoice_number;
    ELSE
        v_target_ref_num := COALESCE(v_udhari.udhari_code, 'UD-' || v_udhari_id);
    END IF;

    -- 9. Auto-create or synchronize Udhari record
    IF v_udhari.id IS NOT NULL THEN
        UPDATE public.udhari_records
        SET total_received = v_new_inv_paid,
            outstanding_amount = v_new_inv_bal,
            status = v_new_status,
            invoice_id = COALESCE(v_invoice_id, v_udhari.invoice_id),
            updated_at = NOW()
        WHERE id = v_udhari.id;
    ELSIF v_inv.id IS NOT NULL THEN
        INSERT INTO public.udhari_records (
            workspace_id,
            branch_id,
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
            v_workspace_id,
            v_branch_id,
            COALESCE(v_customer_id, v_inv.customer_id),
            v_inv.id,
            'UD-' || v_inv.invoice_number,
            v_customer_name,
            COALESCE(NULLIF(v_customer_phone, ''), v_inv.customer_phone, '9999999999'),
            v_authoritative_total,
            v_new_inv_paid,
            v_new_inv_bal,
            COALESCE(v_inv.due_date, CURRENT_DATE + INTERVAL '15 days'),
            v_new_status,
            NOW(),
            NOW()
        ) RETURNING id INTO v_udhari_id;
    END IF;

    -- 10. Generate authoritative payment number and insert payment
    v_payment_id := gen_random_uuid();
    v_payment_code := COALESCE(p_payload->>'payment_code', 'PAY-' || TO_CHAR(v_payment_date, 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0'));

    INSERT INTO public.payments (
        id,
        workspace_id,
        branch_id,
        invoice_id,
        invoice_number,
        counter_sale_id,
        customer_id,
        customer_name,
        payment_number,
        amount,
        payment_method,
        payment_date,
        reference_number,
        notes,
        created_at
    ) VALUES (
        v_payment_id,
        v_workspace_id,
        v_branch_id,
        v_invoice_id,
        v_target_ref_num,
        v_counter_sale_id,
        COALESCE(v_customer_id, v_inv.customer_id, v_udhari.customer_id),
        v_customer_name,
        v_payment_code,
        v_amount,
        v_payment_method::public.payment_method_enum,
        v_payment_date,
        v_reference,
        v_notes,
        NOW()
    );

    -- 11. Record in udhari_payments
    IF v_udhari_id IS NOT NULL OR v_udhari.id IS NOT NULL THEN
        INSERT INTO public.udhari_payments (
            id,
            workspace_id,
            udhari_id,
            amount,
            payment_date,
            payment_method,
            phone_number,
            reference,
            notes,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_workspace_id,
            COALESCE(v_udhari_id, v_udhari.id),
            v_amount,
            v_payment_date,
            v_payment_method::public.payment_method_enum,
            COALESCE(NULLIF(v_customer_phone, ''), '9999999999'),
            v_reference,
            v_notes,
            NOW()
        );
    END IF;

    -- 12. Synchronize Daybook
    INSERT INTO public.daybook_transactions (
        id,
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
        gen_random_uuid(),
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
        COALESCE(v_customer_id, v_inv.customer_id, v_udhari.customer_id),
        v_customer_name,
        'PAYMENT',
        v_payment_id,
        v_target_ref_num,
        'Invoice #' || v_target_ref_num,
        v_notes,
        'COMPLETED',
        NOW(),
        NOW()
    );

    -- Update Daybook SALE transaction remaining balance
    IF v_inv.id IS NOT NULL THEN
        UPDATE public.daybook_transactions
        SET remaining_amount = v_new_inv_bal,
            payment_status = v_new_status,
            amount = v_new_inv_paid,
            updated_at = NOW()
        WHERE workspace_id = v_workspace_id
          AND reference_type = 'INVOICE'
          AND (reference_id = v_inv.id OR reference_number = v_inv.invoice_number);
    END IF;

    -- 13. Synchronize Cashbook
    IF v_amount > 0 AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
        v_account_name := CASE
            WHEN v_payment_method = 'Cash' THEN 'Cash Drawer'
            WHEN v_payment_method = 'UPI' THEN 'UPI Settlement'
            ELSE 'Bank Account'
        END;

        INSERT INTO public.cashbook_entries (
            id,
            workspace_id,
            branch_id,
            entry_number,
            entry_date,
            source_type,
            source_id,
            reference_number,
            account_name,
            direction,
            amount,
            payment_method,
            party_name,
            description,
            status,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_workspace_id,
            v_branch_id,
            'CB-' || v_payment_code,
            v_payment_date,
            'INVOICE_PAYMENT',
            v_payment_id,
            v_target_ref_num,
            v_account_name,
            'IN',
            v_amount,
            v_payment_method,
            v_customer_name,
            'Payment received for ' || v_target_ref_num,
            'COMPLETED',
            NOW()
        );
    END IF;

    -- 14. Synchronize Follow-up
    IF v_new_inv_bal <= 0.00 THEN
        UPDATE public.follow_ups
        SET status = 'Completed',
            completed_at = NOW(),
            notes = COALESCE(notes, '') || ' [Settled in full on ' || v_payment_date::TEXT || ']'
        WHERE workspace_id = v_workspace_id
          AND (
              (v_invoice_id IS NOT NULL AND invoice_id = v_invoice_id)
              OR (v_target_ref_num IS NOT NULL AND invoice_number = v_target_ref_num)
              OR (v_udhari_id IS NOT NULL AND udhari_id = v_udhari_id)
          )
          AND status != 'Completed';
    ELSE
        UPDATE public.follow_ups
        SET notes = 'Outstanding receivable: ₹' || TO_CHAR(v_new_inv_bal, 'FM999,999,990.00')
        WHERE workspace_id = v_workspace_id
          AND (
              (v_invoice_id IS NOT NULL AND invoice_id = v_invoice_id)
              OR (v_target_ref_num IS NOT NULL AND invoice_number = v_target_ref_num)
              OR (v_udhari_id IS NOT NULL AND udhari_id = v_udhari_id)
          )
          AND status != 'Completed';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'payment_code', v_payment_code,
        'invoice_id', v_invoice_id,
        'udhari_id', COALESCE(v_udhari_id, v_udhari.id),
        'amount', v_amount,
        'paid_amount', v_new_inv_paid,
        'balance_amount', v_new_inv_bal,
        'status', v_new_status
    );
END;
$$;

-- 2. Audit and repair any historical records with false PAID status despite positive balance
UPDATE public.invoices
SET status = 'Partially Paid'
WHERE status = 'Paid' AND balance_amount > 0.00;

UPDATE public.udhari_records
SET status = 'PARTIALLY PAID'
WHERE status = 'PAID' AND outstanding_amount > 0.00;

-- 3. Link Udhari records to invoices where relationship was unlinked
UPDATE public.udhari_records u
SET invoice_id = i.id
FROM public.invoices i
WHERE u.invoice_id IS NULL
  AND u.workspace_id = i.workspace_id
  AND (u.udhari_code = 'UD-' || i.invoice_number OR u.notes LIKE '%' || i.invoice_number || '%');

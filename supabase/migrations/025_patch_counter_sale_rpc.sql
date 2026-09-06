-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 025 (RPC REFINEMENT)
-- File: 025_patch_counter_sale_rpc.sql
-- Updates finalize_counter_sale & cancel_counter_sale_atomic with jsonb_array_elements
-- =============================================================================

CREATE OR REPLACE FUNCTION public.finalize_counter_sale(p_sale JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_id UUID;
    v_user_id UUID;
    v_existing_sale RECORD;
    v_counter_sale_id UUID;
    
    v_customer_id UUID;
    v_sale_number TEXT;
    v_invoice_number TEXT;
    v_customer_name TEXT;
    v_phone_number TEXT;
    v_sale_date DATE;
    v_estimate_ref TEXT;
    v_subtotal NUMERIC;
    v_discount_type TEXT;
    v_discount_val NUMERIC;
    v_discount_amt NUMERIC;
    v_final_total NUMERIC;
    v_notes TEXT;
    v_payment_method TEXT;
    v_db_payment_method public.payment_method;
    v_amount_received NUMERIC;
    v_balance_amount NUMERIC;
    v_payment_ref TEXT;
    v_payment_notes TEXT;
    v_items_json JSONB;
    
    v_item_json JSONB;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_part_num TEXT;
    v_item_qty NUMERIC;
    v_item_rate NUMERIC;
    v_item_amt NUMERIC;
    v_item_buy_price NUMERIC;
    v_avail_stock NUMERIC;
    v_remaining_deduct NUMERIC;
    v_receipt RECORD;
    v_rec_deduct NUMERIC;
    v_cur_stock NUMERIC;
    
    v_fin_acc_id UUID;
    v_result_sale JSONB;
BEGIN
    -- 1. Tenant Workspace
    v_workspace_id := public.current_user_workspace_id();
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User is not associated with an active workspace.';
    END IF;
    v_user_id := auth.uid();

    -- 2. Extract Fields
    v_customer_id   := NULLIF(p_sale->>'customer_id', '')::UUID;
    v_sale_number   := TRIM(COALESCE(p_sale->>'sale_number', p_sale->>'saleNumber', ''));
    v_invoice_number:= TRIM(COALESCE(p_sale->>'invoice_number', p_sale->>'invoiceNumber', ''));
    v_customer_name := TRIM(COALESCE(p_sale->>'customer_name', p_sale->>'customerName', 'Walk-in Customer'));
    v_phone_number  := TRIM(COALESCE(p_sale->>'phone_number', p_sale->>'phoneNumber', ''));
    v_sale_date     := COALESCE((p_sale->>'sale_date')::DATE, (p_sale->>'saleDate')::DATE, CURRENT_DATE);
    v_estimate_ref  := NULLIF(COALESCE(p_sale->>'estimate_reference', p_sale->>'estimateReference', ''), '');
    v_subtotal      := COALESCE((p_sale->>'subtotal')::NUMERIC, 0.00);
    v_discount_type := COALESCE(p_sale->>'discount_type', p_sale->>'discountType', 'fixed');
    v_discount_val  := COALESCE((p_sale->>'discount_value')::NUMERIC, (p_sale->>'discountValue')::NUMERIC, 0.00);
    v_discount_amt  := COALESCE((p_sale->>'discount_amount')::NUMERIC, (p_sale->>'discountAmount')::NUMERIC, 0.00);
    v_final_total   := COALESCE((p_sale->>'final_total')::NUMERIC, (p_sale->>'finalTotal')::NUMERIC, 0.00);
    v_notes         := NULLIF(COALESCE(p_sale->>'notes', ''), '');
    v_payment_method:= COALESCE(p_sale->>'payment_method', p_sale->>'paymentMethod', 'Cash');
    v_amount_received:= COALESCE((p_sale->>'amount_received')::NUMERIC, (p_sale->>'amountReceived')::NUMERIC, 0.00);
    v_balance_amount:= COALESCE((p_sale->>'balance_amount')::NUMERIC, (p_sale->>'balanceAmount')::NUMERIC, 0.00);
    v_payment_ref   := NULLIF(COALESCE(p_sale->>'payment_reference', p_sale->>'paymentReference', ''), '');
    v_payment_notes := NULLIF(COALESCE(p_sale->>'payment_notes', p_sale->>'paymentNotes', ''), '');
    v_items_json    := COALESCE(p_sale->'items', '[]'::JSONB);

    BEGIN
        v_db_payment_method := v_payment_method::public.payment_method;
    EXCEPTION WHEN OTHERS THEN
        v_db_payment_method := 'Other'::public.payment_method;
    END;

    -- 3. Validation
    IF v_sale_number = '' THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Sale number is required.';
    END IF;
    IF v_invoice_number = '' THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Invoice number is required.';
    END IF;
    IF jsonb_array_length(v_items_json) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Counter sale must contain at least one item.';
    END IF;
    IF v_final_total < 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Final total cannot be negative.';
    END IF;
    IF v_amount_received < 0 OR v_balance_amount < 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Settlement amounts cannot be negative.';
    END IF;
    IF ABS((v_amount_received + v_balance_amount) - v_final_total) > 0.01 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Amount received (%) + balance (%) must equal final total (%).',
            v_amount_received, v_balance_amount, v_final_total;
    END IF;

    -- 4. Idempotency Check
    SELECT id, sale_number, invoice_number INTO v_existing_sale
    FROM public.counter_sales
    WHERE workspace_id = v_workspace_id 
      AND (sale_number = v_sale_number OR invoice_number = v_invoice_number)
      AND status = 'COMPLETED';

    IF v_existing_sale.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'id', cs.id,
            'saleNumber', cs.sale_number,
            'invoiceNumber', cs.invoice_number,
            'customerId', cs.customer_id,
            'customerName', cs.customer_name,
            'phoneNumber', cs.phone_number,
            'saleDate', cs.sale_date,
            'estimateReference', cs.estimate_reference,
            'subtotal', cs.subtotal,
            'discountType', cs.discount_type,
            'discountValue', cs.discount_value,
            'discountAmount', cs.discount_amount,
            'finalTotal', cs.final_total,
            'status', cs.status,
            'paymentMethod', cs.payment_method,
            'amountReceived', cs.amount_received,
            'balanceAmount', cs.balance_amount,
            'paymentReference', cs.payment_reference,
            'paymentNotes', cs.payment_notes,
            'notes', cs.notes,
            'createdAt', cs.created_at,
            'updatedAt', cs.updated_at,
            'items', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'id', csi.id,
                    'counterSaleId', csi.counter_sale_id,
                    'productId', csi.product_id,
                    'productNameSnapshot', csi.product_name_snapshot,
                    'partNumberSnapshot', csi.part_number_snapshot,
                    'quantity', csi.quantity,
                    'rate', csi.rate,
                    'amount', csi.amount,
                    'buyPriceSnapshot', csi.buy_price_snapshot,
                    'createdAt', csi.created_at
                ))
                FROM public.counter_sale_items csi
                WHERE csi.counter_sale_id = cs.id
            ), '[]'::JSONB)
        ) INTO v_result_sale
        FROM public.counter_sales cs
        WHERE cs.id = v_existing_sale.id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Transaction previously completed (idempotent)',
            'data', v_result_sale
        );
    END IF;

    -- 5. Product Stock Validation & Row Locking (FOR UPDATE)
    FOR v_item_json IN SELECT * FROM jsonb_array_elements(v_items_json)
    LOOP
        v_prod_id := NULLIF(COALESCE(v_item_json->>'productId', v_item_json->>'product_id', ''), '')::UUID;
        v_item_qty := ABS(COALESCE((v_item_json->>'quantity')::NUMERIC, 0));

        IF v_prod_id IS NOT NULL AND v_item_qty > 0 THEN
            SELECT name, current_stock INTO v_prod_name, v_cur_stock
            FROM public.products
            WHERE id = v_prod_id AND workspace_id = v_workspace_id
            FOR UPDATE;

            IF v_prod_name IS NULL THEN
                RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist in this workspace.', v_prod_id;
            END IF;

            v_avail_stock := public.get_authoritative_product_stock(v_prod_id, v_workspace_id);

            IF v_avail_stock < v_item_qty THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%". Available: %, Requested: %',
                    v_prod_name, v_avail_stock, v_item_qty;
            END IF;
        END IF;
    END LOOP;

    -- 6. Insert Counter Sale Parent Record
    INSERT INTO public.counter_sales (
        workspace_id, customer_id, sale_number, invoice_number, customer_name,
        phone_number, sale_date, estimate_reference, subtotal, discount_type,
        discount_value, discount_amount, final_total, status, notes, payment_method,
        amount_received, balance_amount, payment_reference, payment_notes, created_by
    ) VALUES (
        v_workspace_id, v_customer_id, v_sale_number, v_invoice_number, v_customer_name,
        v_phone_number, v_sale_date, v_estimate_ref, v_subtotal, v_discount_type,
        v_discount_val, v_discount_amt, v_final_total, 'COMPLETED', v_notes, v_db_payment_method,
        v_amount_received, v_balance_amount, v_payment_ref, v_payment_notes, v_user_id
    ) RETURNING id INTO v_counter_sale_id;

    -- 7. Insert Line Items & Deduct Inventory (FIFO)
    FOR v_item_json IN SELECT * FROM jsonb_array_elements(v_items_json)
    LOOP
        v_prod_id := NULLIF(COALESCE(v_item_json->>'productId', v_item_json->>'product_id', ''), '')::UUID;
        v_prod_name := COALESCE(v_item_json->>'productNameSnapshot', v_item_json->>'product_name_snapshot', v_item_json->>'productName', v_item_json->>'product_name', 'Product');
        v_part_num := COALESCE(v_item_json->>'partNumberSnapshot', v_item_json->>'part_number_snapshot', v_item_json->>'partNumber', v_item_json->>'part_number', '');
        v_item_qty := ABS(COALESCE((v_item_json->>'quantity')::NUMERIC, 0));
        v_item_rate := COALESCE((v_item_json->>'rate')::NUMERIC, 0);
        v_item_amt := COALESCE((v_item_json->>'amount')::NUMERIC, v_item_qty * v_item_rate);
        v_item_buy_price := COALESCE((v_item_json->>'buyPriceSnapshot')::NUMERIC, (v_item_json->>'buy_price_snapshot')::NUMERIC, 0);

        INSERT INTO public.counter_sale_items (
            workspace_id, counter_sale_id, product_id, product_name_snapshot,
            part_number_snapshot, quantity, rate, amount, buy_price_snapshot
        ) VALUES (
            v_workspace_id, v_counter_sale_id, v_prod_id, v_prod_name,
            v_part_num, v_item_qty, v_item_rate, v_item_amt, v_item_buy_price
        );

        IF v_prod_id IS NOT NULL AND v_item_qty > 0 THEN
            v_remaining_deduct := v_item_qty;

            FOR v_receipt IN
                SELECT id, quantity_remaining
                FROM public.stock_receipts
                WHERE product_id = v_prod_id 
                  AND workspace_id = v_workspace_id 
                  AND quantity_remaining > 0
                ORDER BY received_date ASC, created_at ASC
                FOR UPDATE
            LOOP
                IF v_remaining_deduct <= 0 THEN
                    EXIT;
                END IF;

                v_rec_deduct := LEAST(v_receipt.quantity_remaining, v_remaining_deduct);
                UPDATE public.stock_receipts
                SET quantity_remaining = GREATEST(0, quantity_remaining - v_rec_deduct),
                    updated_at = NOW()
                WHERE id = v_receipt.id;

                v_remaining_deduct := v_remaining_deduct - v_rec_deduct;
            END LOOP;

            UPDATE public.products
            SET current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_item_qty),
                updated_at = NOW()
            WHERE id = v_prod_id AND workspace_id = v_workspace_id;

            INSERT INTO public.stock_movements (
                workspace_id, product_id, type, quantity, movement_date,
                reference_id, reference_type, notes, created_by
            ) VALUES (
                v_workspace_id, v_prod_id, 'SALE', -v_item_qty, v_sale_date,
                v_invoice_number, 'COUNTER_SALE', 'Counter Sale #' || v_invoice_number, v_user_id
            );
        END IF;
    END LOOP;

    -- 8. Financial Account Resolution
    SELECT id INTO v_fin_acc_id
    FROM public.financial_accounts
    WHERE workspace_id = v_workspace_id 
      AND (
          (v_payment_method ILIKE '%upi%' AND account_type = 'UPI') OR
          (v_payment_method ILIKE '%bank%' AND account_type = 'BANK') OR
          (v_payment_method ILIKE '%card%' AND account_type = 'CARD') OR
          (account_type = 'CASH' AND is_default = TRUE)
      )
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1;

    IF v_fin_acc_id IS NULL THEN
        SELECT id INTO v_fin_acc_id
        FROM public.financial_accounts
        WHERE workspace_id = v_workspace_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    -- 9. Daybook Transaction
    INSERT INTO public.daybook_transactions (
        workspace_id, transaction_code, transaction_date, transaction_type, direction,
        amount, payment_mode, financial_account_id, party_type, party_id, party_name,
        reference_type, reference_id, reference_number, description, notes, status, created_by
    ) VALUES (
        v_workspace_id, 'TX-CS-' || v_invoice_number, v_sale_date, 'SALE',
        CASE 
            WHEN v_amount_received >= v_final_total AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN 'IN'::public.daybook_direction
            WHEN v_amount_received > 0 AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN 'IN'::public.daybook_direction
            ELSE 'NON_CASH'::public.daybook_direction
        END,
        v_final_total, v_db_payment_method, v_fin_acc_id, 'customer', v_customer_id, v_customer_name,
        'COUNTER_SALE', v_counter_sale_id::TEXT, v_invoice_number,
        'Counter Sale #' || v_invoice_number || ' - ' || v_customer_name, v_payment_notes, 'COMPLETED', v_user_id
    ) ON CONFLICT (workspace_id, reference_type, reference_id) DO NOTHING;

    -- 10. Cashbook Receipt for Partial Payment
    IF v_amount_received > 0 
       AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') 
       AND v_amount_received < v_final_total THEN
        INSERT INTO public.daybook_transactions (
            workspace_id, transaction_code, transaction_date, transaction_type, direction,
            amount, payment_mode, financial_account_id, party_type, party_id, party_name,
            reference_type, reference_id, reference_number, description, notes, status, created_by
        ) VALUES (
            v_workspace_id, 'TX-CS-PAY-' || v_invoice_number, v_sale_date, 'CUSTOMER_PAYMENT',
            'IN'::public.daybook_direction, v_amount_received, v_db_payment_method, v_fin_acc_id,
            'customer', v_customer_id, v_customer_name, 'COUNTER_SALE_PAYMENT',
            v_counter_sale_id::TEXT || '_PAY', v_invoice_number,
            'Partial Payment for Counter Sale #' || v_invoice_number, v_payment_notes, 'COMPLETED', v_user_id
        ) ON CONFLICT (workspace_id, reference_type, reference_id) DO NOTHING;
    END IF;

    -- 11. Udhari Record
    IF v_balance_amount > 0 AND v_payment_method IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
        INSERT INTO public.udhari_records (
            workspace_id, customer_id, udhari_code, customer_name_snapshot, phone_snapshot,
            original_amount, total_received, outstanding_amount, due_date, status, notes
        ) VALUES (
            v_workspace_id, v_customer_id, 'UD-' || v_invoice_number, v_customer_name,
            COALESCE(v_phone_number, '9999999999'), v_balance_amount, 0.00, v_balance_amount,
            v_sale_date + INTERVAL '30 days', 'UNPAID', 'Counter Sale credit #' || v_invoice_number
        ) ON CONFLICT (workspace_id, udhari_code) DO NOTHING;
    END IF;

    -- 12. Complete Return Object
    SELECT jsonb_build_object(
        'id', cs.id,
        'saleNumber', cs.sale_number,
        'invoiceNumber', cs.invoice_number,
        'customerId', cs.customer_id,
        'customerName', cs.customer_name,
        'phoneNumber', cs.phone_number,
        'saleDate', cs.sale_date,
        'estimateReference', cs.estimate_reference,
        'subtotal', cs.subtotal,
        'discountType', cs.discount_type,
        'discountValue', cs.discount_value,
        'discountAmount', cs.discount_amount,
        'finalTotal', cs.final_total,
        'status', cs.status,
        'paymentMethod', cs.payment_method,
        'amountReceived', cs.amount_received,
        'balanceAmount', cs.balance_amount,
        'paymentReference', cs.payment_reference,
        'paymentNotes', cs.payment_notes,
        'notes', cs.notes,
        'createdAt', cs.created_at,
        'updatedAt', cs.updated_at,
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', csi.id,
                'counterSaleId', csi.counter_sale_id,
                'productId', csi.product_id,
                'productNameSnapshot', csi.product_name_snapshot,
                'partNumberSnapshot', csi.part_number_snapshot,
                'quantity', csi.quantity,
                'rate', csi.rate,
                'amount', csi.amount,
                'buyPriceSnapshot', csi.buy_price_snapshot,
                'createdAt', csi.created_at
            ))
            FROM public.counter_sale_items csi
            WHERE csi.counter_sale_id = cs.id
        ), '[]'::JSONB)
    ) INTO v_result_sale
    FROM public.counter_sales cs
    WHERE cs.id = v_counter_sale_id;

    RETURN jsonb_build_object(
        'success', true,
        'data', v_result_sale
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_counter_sale_atomic(p_sale_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_id UUID;
    v_sale RECORD;
    v_item RECORD;
    v_receipt RECORD;
    v_user_id UUID;
BEGIN
    v_workspace_id := public.current_user_workspace_id();
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User is not associated with an active workspace.';
    END IF;
    v_user_id := auth.uid();

    SELECT * INTO v_sale
    FROM public.counter_sales
    WHERE id = p_sale_id AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF v_sale.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Counter Sale % does not exist.', p_sale_id;
    END IF;

    IF v_sale.status = 'CANCELLED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Sale is already cancelled.');
    END IF;

    FOR v_item IN
        SELECT product_id, quantity, product_name_snapshot
        FROM public.counter_sale_items
        WHERE counter_sale_id = p_sale_id AND workspace_id = v_workspace_id
    LOOP
        IF v_item.product_id IS NOT NULL THEN
            UPDATE public.products
            SET current_stock = COALESCE(current_stock, 0) + v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;

            SELECT id INTO v_receipt
            FROM public.stock_receipts
            WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id
            ORDER BY received_date DESC, created_at DESC
            LIMIT 1;

            IF v_receipt.id IS NOT NULL THEN
                UPDATE public.stock_receipts
                SET quantity_remaining = quantity_remaining + v_item.quantity,
                    updated_at = NOW()
                WHERE id = v_receipt.id;
            END IF;

            INSERT INTO public.stock_movements (
                workspace_id, product_id, type, quantity, movement_date,
                reference_id, reference_type, notes, created_by
            ) VALUES (
                v_workspace_id, v_item.product_id, 'RETURN', v_item.quantity, CURRENT_DATE,
                v_sale.invoice_number, 'COUNTER_SALE_CANCEL', 'Reversal of Counter Sale #' || v_sale.invoice_number, v_user_id
            );
        END IF;
    END LOOP;

    UPDATE public.counter_sales
    SET status = 'CANCELLED', updated_at = NOW()
    WHERE id = p_sale_id;

    UPDATE public.daybook_transactions
    SET status = 'REVERSED', updated_at = NOW()
    WHERE workspace_id = v_workspace_id 
      AND (
          (reference_type = 'COUNTER_SALE' AND reference_id = p_sale_id::TEXT) OR
          (reference_type = 'COUNTER_SALE_PAYMENT' AND reference_id = p_sale_id::TEXT || '_PAY')
      );

    UPDATE public.udhari_records
    SET status = 'PAID'::public.udhari_status,
        outstanding_amount = 0,
        notes = COALESCE(notes, '') || ' [Cancelled Sale]',
        updated_at = NOW()
    WHERE workspace_id = v_workspace_id AND udhari_code = 'UD-' || v_sale.invoice_number;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Counter sale cancelled and inventory restored.'
    );
END;
$$;

NOTIFY pgrst, 'reload schema';

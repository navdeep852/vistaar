-- ============================================================================
-- VISTAAR MIGRATION 072: Fix False "Insufficient Stock" in Counter Sale & Authoritative Branch Stock Engine
-- Author: Senior Full-Stack & Database Architect
-- Purpose:
--   1. Fix false INSUFFICIENT_STOCK error during Counter Sale confirmation.
--   2. Reconcile discrepancy: Master stock (101), Branch stock (51), Stale Receipt Batch (1.00).
--   3. Eliminate buggy short-circuit (IF v_receipt_stock > 0 THEN RETURN v_receipt_stock)
--      in get_authoritative_branch_product_stock.
--   4. Establish one authoritative stock calculation across Products, Counter Sale, and Invoice:
--      Authoritative Branch Stock = GREATEST(COALESCE(branch_inventory.current_stock, 0), COALESCE(stock_receipts.quantity_remaining, 0))
--      Fallback: If main branch and 0, fall back to products.current_stock.
--   5. Provide both 3-arg and 2-arg function signatures for seamless RPC compatibility.
--   6. Hardens finalize_counter_sale RPC:
--      - Line item aggregation by product_id to prevent multi-line overselling.
--      - Atomic row locking (SELECT ... FOR UPDATE).
--      - Single-decrement of branch_inventory, products, and FIFO stock_receipts.
--      - Exactly one SALE stock_movement per product.
--      - Financial journal (daybook), payment, and udhari consistency.
--      - Complete rollback on error.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. AUTHORITATIVE BRANCH STOCK CALCULATION (3-ARGUMENT SIGNATURE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_authoritative_branch_product_stock(
    p_product_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_workspace_id UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ws_id UUID := p_workspace_id;
    v_receipt_stock NUMERIC := 0;
    v_branch_stock NUMERIC := 0;
    v_global_stock NUMERIC := 0;
    v_is_main_branch BOOLEAN := FALSE;
    v_authoritative NUMERIC := 0;
BEGIN
    IF p_product_id IS NULL THEN
        RETURN 0;
    END IF;

    -- Resolve workspace_id if not supplied
    IF v_ws_id IS NULL THEN
        SELECT workspace_id INTO v_ws_id
        FROM public.products
        WHERE id = p_product_id;
    END IF;

    IF v_ws_id IS NULL THEN
        RETURN 0;
    END IF;

    -- CASE 1: Specific Branch Requested
    IF p_branch_id IS NOT NULL THEN
        -- Check if branch is designated as main branch
        SELECT COALESCE(is_main_branch, false) INTO v_is_main_branch
        FROM public.branches
        WHERE id = p_branch_id AND workspace_id = v_ws_id;

        -- 1a. Branch Inventory Current Stock
        SELECT COALESCE(current_stock, 0)
        INTO v_branch_stock
        FROM public.branch_inventory
        WHERE product_id = p_product_id
          AND branch_id = p_branch_id
          AND workspace_id = v_ws_id;

        -- 1b. Active Stock Receipts remaining for this product at this branch
        SELECT COALESCE(SUM(quantity_remaining), 0)
        INTO v_receipt_stock
        FROM public.stock_receipts
        WHERE product_id = p_product_id
          AND branch_id = p_branch_id
          AND workspace_id = v_ws_id
          AND quantity_remaining > 0;

        -- Authoritative branch quantity is the maximum between branch_inventory and active receipts
        v_authoritative := GREATEST(COALESCE(v_branch_stock, 0), COALESCE(v_receipt_stock, 0));

        -- 1c. If 0 and this is the Main Branch, fall back to master products.current_stock
        IF (v_authoritative = 0 OR v_authoritative IS NULL) AND (v_is_main_branch IS TRUE OR v_is_main_branch IS NULL) THEN
            SELECT COALESCE(current_stock, 0) INTO v_global_stock
            FROM public.products
            WHERE id = p_product_id AND workspace_id = v_ws_id;

            IF v_global_stock > 0 THEN
                RETURN v_global_stock;
            END IF;
        END IF;

        RETURN COALESCE(v_authoritative, 0);
    END IF;

    -- CASE 2: No specific branch (consolidated workspace stock)
    SELECT COALESCE(SUM(quantity_remaining), 0)
    INTO v_receipt_stock
    FROM public.stock_receipts
    WHERE product_id = p_product_id
      AND workspace_id = v_ws_id
      AND quantity_remaining > 0;

    SELECT COALESCE(current_stock, 0)
    INTO v_global_stock
    FROM public.products
    WHERE id = p_product_id AND workspace_id = v_ws_id;

    RETURN GREATEST(COALESCE(v_global_stock, 0), COALESCE(v_receipt_stock, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_authoritative_branch_product_stock(UUID, UUID, UUID) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. AUTHORITATIVE BRANCH STOCK CALCULATION (2-ARGUMENT OVERLOAD)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_authoritative_branch_product_stock(
    p_branch_id UUID,
    p_product_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ws_id UUID;
BEGIN
    SELECT workspace_id INTO v_ws_id FROM public.products WHERE id = p_product_id;
    RETURN public.get_authoritative_branch_product_stock(p_product_id, p_branch_id, v_ws_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_authoritative_branch_product_stock(UUID, UUID) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. AUTHORITATIVE ATOMIC finalize_counter_sale RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_counter_sale(p_sale JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_user_id UUID;
    v_branch_id UUID;
    v_customer_id UUID;
    v_counter_sale_id UUID;
    v_existing_sale RECORD;

    v_sale_number TEXT;
    v_invoice_number TEXT;
    v_customer_name TEXT;
    v_phone_number TEXT;
    v_sale_date DATE;
    v_estimate_ref TEXT;
    v_subtotal NUMERIC(15,2);
    v_discount_type TEXT;
    v_discount_val NUMERIC(15,2);
    v_discount_amt NUMERIC(15,2);
    v_final_total NUMERIC(15,2);
    v_notes TEXT;
    v_payment_method TEXT;
    v_amount_received NUMERIC(15,2);
    v_balance_amount NUMERIC(15,2);
    v_payment_ref TEXT;
    v_payment_notes TEXT;
    v_items_json JSONB;

    v_item RECORD;
    v_item_json JSONB;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_part_num TEXT;
    v_item_qty NUMERIC(15,2);
    v_item_rate NUMERIC(15,2);
    v_item_amt NUMERIC(15,2);
    v_item_buy_price NUMERIC(15,2);
    v_cur_stock NUMERIC(15,2);
    v_avail_stock NUMERIC(15,2);

    v_receipt RECORD;
    v_remaining_deduct NUMERIC(15,2);
    v_rec_deduct NUMERIC(15,2);

    v_payment_code TEXT;
    v_db_payment_method VARCHAR(50);
    v_result_sale JSONB;
BEGIN
    -- 1. Resolve Workspace ID & User ID
    v_workspace_id := NULLIF(COALESCE(p_sale->>'workspace_id', p_sale->>'workspaceId', ''), '')::UUID;
    v_user_id := auth.uid();

    IF v_workspace_id IS NULL AND v_user_id IS NOT NULL THEN
        SELECT workspace_id INTO v_workspace_id FROM public.users WHERE id = v_user_id LIMIT 1;
    END IF;

    IF v_workspace_id IS NULL THEN
        -- Try first item's product workspace
        v_items_json := COALESCE(p_sale->'items', '[]'::JSONB);
        IF jsonb_array_length(v_items_json) > 0 THEN
            v_prod_id := NULLIF(COALESCE((v_items_json->0)->>'productId', (v_items_json->0)->>'product_id', ''), '')::UUID;
            IF v_prod_id IS NOT NULL THEN
                SELECT workspace_id INTO v_workspace_id FROM public.products WHERE id = v_prod_id LIMIT 1;
            END IF;
        END IF;
    END IF;

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Workspace ID could not be resolved for counter sale.';
    END IF;

    -- 2. Extract & Normalize Header Fields
    v_branch_id      := NULLIF(COALESCE(p_sale->>'branch_id', p_sale->>'branchId', ''), '')::UUID;
    v_customer_id    := NULLIF(COALESCE(p_sale->>'customer_id', p_sale->>'customerId', ''), '')::UUID;
    v_sale_number    := TRIM(COALESCE(p_sale->>'sale_number', p_sale->>'saleNumber', ''));
    v_invoice_number := TRIM(COALESCE(p_sale->>'invoice_number', p_sale->>'invoiceNumber', ''));
    IF v_invoice_number = '' THEN v_invoice_number := v_sale_number; END IF;
    IF v_sale_number = '' THEN v_sale_number := v_invoice_number; END IF;

    v_customer_name  := TRIM(COALESCE(p_sale->>'customer_name', p_sale->>'customerName', 'Walk-in Customer'));
    v_phone_number   := TRIM(COALESCE(p_sale->>'phone_number', p_sale->>'phoneNumber', ''));
    v_sale_date      := COALESCE((p_sale->>'sale_date')::DATE, (p_sale->>'saleDate')::DATE, CURRENT_DATE);
    v_estimate_ref   := NULLIF(COALESCE(p_sale->>'estimate_reference', p_sale->>'estimateReference', ''), '');
    v_subtotal       := COALESCE((p_sale->>'subtotal')::NUMERIC, 0.00);
    v_discount_type  := COALESCE(p_sale->>'discount_type', p_sale->>'discountType', 'fixed');
    v_discount_val   := COALESCE((p_sale->>'discount_value')::NUMERIC, (p_sale->>'discountValue')::NUMERIC, 0.00);
    v_discount_amt   := COALESCE((p_sale->>'discount_amount')::NUMERIC, (p_sale->>'discountAmount')::NUMERIC, 0.00);
    v_final_total    := COALESCE((p_sale->>'final_total')::NUMERIC, (p_sale->>'finalTotal')::NUMERIC, 0.00);
    v_notes          := NULLIF(COALESCE(p_sale->>'notes', ''), '');
    v_payment_method := COALESCE(p_sale->>'payment_method', p_sale->>'paymentMethod', 'Cash');
    v_amount_received:= COALESCE((p_sale->>'amount_received')::NUMERIC, (p_sale->>'amountReceived')::NUMERIC, 0.00);
    v_balance_amount := COALESCE((p_sale->>'balance_amount')::NUMERIC, (p_sale->>'balanceAmount')::NUMERIC, 0.00);
    v_payment_ref    := NULLIF(COALESCE(p_sale->>'payment_reference', p_sale->>'paymentReference', ''), '');
    v_payment_notes  := NULLIF(COALESCE(p_sale->>'payment_notes', p_sale->>'paymentNotes', ''), '');
    v_items_json     := COALESCE(p_sale->'items', '[]'::JSONB);

    -- Standardize payment method
    IF v_payment_method ILIKE '%cash%' THEN v_db_payment_method := 'Cash';
    ELSIF v_payment_method ILIKE '%upi%' THEN v_db_payment_method := 'UPI';
    ELSIF v_payment_method ILIKE '%bank%' THEN v_db_payment_method := 'Bank Transfer';
    ELSIF v_payment_method ILIKE '%card%' THEN v_db_payment_method := 'Card';
    ELSIF v_payment_method ILIKE '%cheque%' THEN v_db_payment_method := 'Cheque';
    ELSIF v_payment_method ILIKE '%credit%' OR v_payment_method ILIKE '%udhari%' THEN v_db_payment_method := 'Credit / Udhari';
    ELSE v_db_payment_method := 'Other';
    END IF;

    -- Validate items presence
    IF jsonb_array_length(v_items_json) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Counter sale must contain at least one line item.';
    END IF;

    -- 3. Idempotency Check: Return existing record if already finalized
    SELECT * INTO v_existing_sale
    FROM public.counter_sales
    WHERE workspace_id = v_workspace_id
      AND (invoice_number = v_invoice_number OR sale_number = v_sale_number)
    LIMIT 1;

    IF v_existing_sale.id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'id', cs.id,
            'workspaceId', cs.workspace_id,
            'branchId', cs.branch_id,
            'customerId', cs.customer_id,
            'saleNumber', cs.sale_number,
            'invoiceNumber', cs.invoice_number,
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
                    'branchId', csi.branch_id,
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
            'data', v_result_sale,
            'idempotent', true
        );
    END IF;

    -- 4. Authoritative Stock Validation (Aggregated by product_id to prevent multi-line overselling)
    FOR v_item IN
        SELECT
            NULLIF(COALESCE(elem->>'productId', elem->>'product_id', ''), '')::UUID AS product_id,
            COALESCE(elem->>'productNameSnapshot', elem->>'product_name_snapshot', elem->>'productName', elem->>'product_name', 'Product') AS product_name,
            SUM(ABS(COALESCE((elem->>'quantity')::NUMERIC, 0.00))) AS total_qty
        FROM jsonb_array_elements(v_items_json) AS elem
        WHERE NULLIF(COALESCE(elem->>'productId', elem->>'product_id', ''), '') IS NOT NULL
        GROUP BY 1, 2
    LOOP
        IF v_item.product_id IS NOT NULL AND v_item.total_qty > 0 THEN
            -- Row lock the master product to ensure concurrency safety
            SELECT name, current_stock INTO v_prod_name, v_cur_stock
            FROM public.products
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id
            FOR UPDATE;

            IF v_prod_name IS NULL THEN
                RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist in workspace.', v_item.product_id;
            END IF;

            -- Calculate authoritative branch stock using unified calculation
            v_avail_stock := public.get_authoritative_branch_product_stock(v_item.product_id, v_branch_id, v_workspace_id);

            IF v_avail_stock < v_item.total_qty THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%". Available: %, Requested: %',
                    v_prod_name, v_avail_stock, v_item.total_qty;
            END IF;
        END IF;
    END LOOP;

    -- 5. Insert Counter Sale Parent Record
    INSERT INTO public.counter_sales (
        workspace_id, branch_id, customer_id, sale_number, invoice_number, customer_name,
        phone_number, sale_date, estimate_reference, subtotal, discount_type,
        discount_value, discount_amount, final_total, status, notes, payment_method,
        amount_received, balance_amount, payment_reference, payment_notes, created_by
    ) VALUES (
        v_workspace_id, v_branch_id, v_customer_id, v_sale_number, v_invoice_number, v_customer_name,
        v_phone_number, v_sale_date, v_estimate_ref, v_subtotal, v_discount_type,
        v_discount_val, v_discount_amt, v_final_total, 'COMPLETED', v_notes, v_db_payment_method,
        v_amount_received, v_balance_amount, v_payment_ref, v_payment_notes, v_user_id
    ) RETURNING id INTO v_counter_sale_id;

    -- 6. Insert Line Items
    FOR v_item_json IN SELECT * FROM jsonb_array_elements(v_items_json)
    LOOP
        v_prod_id := NULLIF(COALESCE(v_item_json->>'productId', v_item_json->>'product_id', ''), '')::UUID;
        v_prod_name := COALESCE(v_item_json->>'productNameSnapshot', v_item_json->>'product_name_snapshot', v_item_json->>'productName', v_item_json->>'product_name', 'Product');
        v_part_num := COALESCE(v_item_json->>'partNumberSnapshot', v_item_json->>'part_number_snapshot', v_item_json->>'partNumber', v_item_json->>'part_number', '');
        v_item_qty := ABS(COALESCE((v_item_json->>'quantity')::NUMERIC, 0.00));
        v_item_rate := COALESCE((v_item_json->>'rate')::NUMERIC, 0.00);
        v_item_amt := COALESCE((v_item_json->>'amount')::NUMERIC, v_item_qty * v_item_rate);
        v_item_buy_price := COALESCE((v_item_json->>'buyPriceSnapshot')::NUMERIC, (v_item_json->>'buy_price_snapshot')::NUMERIC, 0.00);

        INSERT INTO public.counter_sale_items (
            workspace_id, branch_id, counter_sale_id, product_id, product_name_snapshot,
            part_number_snapshot, quantity, rate, amount, buy_price_snapshot
        ) VALUES (
            v_workspace_id, v_branch_id, v_counter_sale_id, v_prod_id, v_prod_name,
            v_part_num, v_item_qty, v_item_rate, v_item_amt, v_item_buy_price
        );
    END LOOP;

    -- 7. Deduct Inventory (Aggregated by product_id: FIFO Receipts, Branch Inventory, Global Products)
    FOR v_item IN
        SELECT
            NULLIF(COALESCE(elem->>'productId', elem->>'product_id', ''), '')::UUID AS product_id,
            MAX(COALESCE(elem->>'productNameSnapshot', elem->>'product_name_snapshot', elem->>'productName', elem->>'product_name', 'Product')) AS product_name,
            SUM(ABS(COALESCE((elem->>'quantity')::NUMERIC, 0.00))) AS total_qty
        FROM jsonb_array_elements(v_items_json) AS elem
        WHERE NULLIF(COALESCE(elem->>'productId', elem->>'product_id', ''), '') IS NOT NULL
        GROUP BY 1
    LOOP
        v_prod_id := v_item.product_id;
        v_item_qty := v_item.total_qty;

        -- 7a. Deduct FIFO stock_receipts (up to quantity remaining)
        v_remaining_deduct := v_item_qty;
        FOR v_receipt IN
            SELECT id, quantity_remaining
            FROM public.stock_receipts
            WHERE product_id = v_prod_id
              AND workspace_id = v_workspace_id
              AND (v_branch_id IS NULL OR branch_id IS NULL OR branch_id = v_branch_id)
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

        -- 7b. Deduct from branch_inventory
        IF v_branch_id IS NOT NULL THEN
            UPDATE public.branch_inventory
            SET current_stock = GREATEST(0, current_stock - v_item_qty),
                updated_at = NOW()
            WHERE workspace_id = v_workspace_id
              AND branch_id = v_branch_id
              AND product_id = v_prod_id;

            IF NOT FOUND THEN
                INSERT INTO public.branch_inventory (
                    workspace_id, branch_id, product_id, current_stock, opening_stock, status, updated_at
                ) VALUES (
                    v_workspace_id, v_branch_id, v_prod_id,
                    GREATEST(0, COALESCE((SELECT current_stock FROM public.products WHERE id = v_prod_id), 0) - v_item_qty),
                    COALESCE((SELECT current_stock FROM public.products WHERE id = v_prod_id), 0),
                    'Active',
                    NOW()
                )
                ON CONFLICT (workspace_id, branch_id, product_id)
                DO UPDATE SET
                    current_stock = GREATEST(0, public.branch_inventory.current_stock - v_item_qty),
                    updated_at = NOW();
            END IF;
        END IF;

        -- 7c. Deduct from global products table
        UPDATE public.products
        SET current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_item_qty),
            updated_at = NOW()
        WHERE id = v_prod_id AND workspace_id = v_workspace_id;

        -- 7d. Insert exactly one SALE Stock Movement
        INSERT INTO public.stock_movements (
            workspace_id, branch_id, product_id, type, quantity, movement_date,
            reference_id, reference_type, notes, created_by
        ) VALUES (
            v_workspace_id, v_branch_id, v_prod_id, 'SALE', -v_item_qty, v_sale_date,
            v_counter_sale_id::TEXT, 'COUNTER_SALE', 'Counter Sale #' || v_invoice_number, v_user_id
        );
    END LOOP;

    -- 8. Payment Recording (When payment is collected upfront)
    v_payment_code := 'PAY-CS-' || v_invoice_number;
    IF v_amount_received > 0 AND v_db_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
        INSERT INTO public.payments (
            workspace_id, branch_id, customer_id, customer_name, counter_sale_id,
            invoice_number, payment_number, amount, payment_date, method,
            reference_no, notes
        ) VALUES (
            v_workspace_id, v_branch_id, v_customer_id, v_customer_name, v_counter_sale_id,
            v_invoice_number, v_payment_code, v_amount_received, v_sale_date, v_db_payment_method,
            v_payment_ref, 'Payment for Counter Sale #' || v_invoice_number
        ) ON CONFLICT (workspace_id, payment_number) DO UPDATE SET
            amount = EXCLUDED.amount,
            method = EXCLUDED.method,
            counter_sale_id = EXCLUDED.counter_sale_id;
    END IF;

    -- 9. Customer Ledger / Udhari Recording (When credit or remaining balance)
    IF v_balance_amount > 0 AND v_customer_id IS NOT NULL THEN
        INSERT INTO public.customer_payments (
            workspace_id, branch_id, customer_id, payment_date, amount, payment_type,
            notes, reference_number, created_by
        ) VALUES (
            v_workspace_id, v_branch_id, v_customer_id, v_sale_date, v_balance_amount, 'CREDIT_GIVEN',
            'Counter Sale #' || v_invoice_number || ' unpaid balance', v_invoice_number, v_user_id
        );
    END IF;

    -- 10. Record Daybook Financial Journal
    INSERT INTO public.daybook_transactions (
        workspace_id, branch_id, transaction_date, transaction_type, reference_id,
        reference_number, entity_name, description, amount, payment_mode,
        is_inflow, created_by
    ) VALUES (
        v_workspace_id, v_branch_id, v_sale_date, 'COUNTER_SALE', v_counter_sale_id::TEXT,
        v_invoice_number, v_customer_name,
        'Counter Sale #' || v_invoice_number || ' (' || v_db_payment_method || ')',
        v_final_total, v_db_payment_method,
        TRUE, v_user_id
    );

    -- 11. Format & Return Complete Result
    SELECT jsonb_build_object(
        'id', cs.id,
        'workspaceId', cs.workspace_id,
        'branchId', cs.branch_id,
        'customerId', cs.customer_id,
        'saleNumber', cs.sale_number,
        'invoiceNumber', cs.invoice_number,
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
                'branchId', csi.branch_id,
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
        'message', 'Counter Sale finalized successfully',
        'data', v_result_sale
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_counter_sale(JSONB) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RELOAD POSTGREST SCHEMA CACHE
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

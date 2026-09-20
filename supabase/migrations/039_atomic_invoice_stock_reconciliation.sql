-- ============================================================================
-- MIGRATION 039: ATOMIC INVOICE STOCK RECONCILIATION & DEDUCTION HARDENING
-- Author: VISTAAR Business OS Engineering
-- Purpose:
-- 1. Hardens authoritative stock calculation across stock_receipts and products.
-- 2. Hardens finalize_invoice_stock RPC:
--    - Aggregates line items by product_id before validation and deduction.
--    - Prevents false zero-stock and overbooking errors across multiple line items.
--    - Performs strict FIFO deduction across stock receipts.
--    - Reconciles products.current_stock without duplicate deduction.
--    - Logs exactly one SALE movement in stock_movements per line product.
--    - Enforces workspace multi-tenant isolation.
-- ============================================================================

-- 1. AUTHORITATIVE PRODUCT STOCK HELPER FUNCTION
CREATE OR REPLACE FUNCTION public.get_authoritative_product_stock(p_product_id UUID, p_workspace_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_receipt_stock NUMERIC;
    v_product_stock NUMERIC;
BEGIN
    -- Sum active stock receipts for this product within the workspace
    SELECT COALESCE(SUM(quantity_remaining), 0)
    INTO v_receipt_stock
    FROM public.stock_receipts
    WHERE product_id = p_product_id AND workspace_id = p_workspace_id AND quantity_remaining > 0;

    -- Fetch current_stock directly from products table for this workspace
    SELECT COALESCE(current_stock, 0)
    INTO v_product_stock
    FROM public.products
    WHERE id = p_product_id AND workspace_id = p_workspace_id;

    -- Return maximum between products table current_stock and active stock_receipts sum
    RETURN GREATEST(COALESCE(v_product_stock, 0), COALESCE(v_receipt_stock, 0));
END;
$$;

-- 2. HARDENED ATOMIC INVOICE STOCK FINALIZATION RPC FUNCTION
CREATE OR REPLACE FUNCTION public.finalize_invoice_stock(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_id UUID;
    v_invoice_number TEXT;
    v_status TEXT;
    v_item RECORD;
    v_product_name TEXT;
    v_product_stock NUMERIC;
    v_avail_stock NUMERIC;
    v_total_active_receipts NUMERIC;
    v_new_receipt_sum NUMERIC;
    v_remaining_deduct NUMERIC;
    v_receipt_deducted NUMERIC;
    v_uncovered_deduct NUMERIC;
    v_receipt RECORD;
    v_rec_deduct NUMERIC;
BEGIN
    -- 1. Resolve Authenticated Tenant Workspace
    v_workspace_id := public.current_user_workspace_id();
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User is not associated with an active workspace.';
    END IF;

    -- 2. Fetch and Lock Target Invoice
    SELECT invoice_number, status INTO v_invoice_number, v_status
    FROM public.invoices
    WHERE id = p_invoice_id AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF v_invoice_number IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Invoice with ID % not found for this workspace.', p_invoice_id;
    END IF;

    -- Prevent Double Finalization / Double Stock Deduction
    IF v_status IN ('Paid', 'Finalized', 'Issued', 'Partially Paid') THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Invoice is already finalized. Stock deduction was previously executed.',
            'invoice_number', v_invoice_number
        );
    END IF;

    -- 3. Validate Authoritative Stock Levels (Aggregated per product_id)
    FOR v_item IN
        SELECT product_id,
               MAX(product_name) AS product_name,
               SUM(quantity) AS quantity
        FROM public.invoice_items
        WHERE invoice_id = p_invoice_id AND workspace_id = v_workspace_id
          AND product_id IS NOT NULL
        GROUP BY product_id
    LOOP
        -- Lock Product Row
        SELECT name, current_stock INTO v_product_name, v_product_stock
        FROM public.products
        WHERE id = v_item.product_id AND workspace_id = v_workspace_id
        FOR UPDATE;

        IF v_product_name IS NULL AND v_product_stock IS NULL THEN
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product "%" (ID: %) does not exist in workspace.',
                COALESCE(v_item.product_name, 'Unknown'), v_item.product_id;
        END IF;

        -- Calculate Authoritative Available Stock
        v_avail_stock := public.get_authoritative_product_stock(v_item.product_id, v_workspace_id);

        IF (v_avail_stock < v_item.quantity) THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%". Requested %, but only % units are available.',
                COALESCE(v_product_name, v_item.product_name), v_item.quantity, v_avail_stock;
        END IF;
    END LOOP;

    -- 4. Deduct Stock & Record Movements (Aggregated per product_id to ensure FIFO consistency)
    FOR v_item IN
        SELECT product_id,
               MAX(product_name) AS product_name,
               SUM(quantity) AS quantity
        FROM public.invoice_items
        WHERE invoice_id = p_invoice_id AND workspace_id = v_workspace_id
          AND product_id IS NOT NULL
        GROUP BY product_id
    LOOP
        -- Check total active receipt stock before deduction
        SELECT COALESCE(SUM(quantity_remaining), 0)
        INTO v_total_active_receipts
        FROM public.stock_receipts
        WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

        v_remaining_deduct := v_item.quantity;
        v_receipt_deducted := 0;

        -- FIFO deduction from active receipts
        IF v_total_active_receipts > 0 THEN
            FOR v_receipt IN
                SELECT id, quantity_remaining
                FROM public.stock_receipts
                WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id AND quantity_remaining > 0
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
                v_receipt_deducted := v_receipt_deducted + v_rec_deduct;
            END LOOP;
        END IF;

        v_uncovered_deduct := v_remaining_deduct;

        -- Authoritatively update products.current_stock
        SELECT COALESCE(SUM(quantity_remaining), 0)
        INTO v_new_receipt_sum
        FROM public.stock_receipts
        WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

        IF v_total_active_receipts > 0 AND v_new_receipt_sum > 0 THEN
            -- Receipts remain active: set current_stock to new receipt sum
            UPDATE public.products
            SET current_stock = v_new_receipt_sum,
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;
        ELSE
            -- No receipts remain or none ever existed: decrement current_stock directly by uncovered deduction
            UPDATE public.products
            SET current_stock = GREATEST(0, current_stock - (CASE WHEN v_total_active_receipts > 0 THEN v_uncovered_deduct ELSE v_item.quantity END)),
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;
        END IF;

        -- Insert exactly ONE Stock Movement Audit Log for this product deduction
        INSERT INTO public.stock_movements (
            workspace_id,
            product_id,
            type,
            quantity,
            movement_date,
            reference_id,
            reference_type,
            notes
        ) VALUES (
            v_workspace_id,
            v_item.product_id,
            'SALE',
            -v_item.quantity,
            CURRENT_DATE,
            v_invoice_number,
            'INVOICE_SALE',
            'Invoice Finalization #' || v_invoice_number
        );
    END LOOP;

    -- 5. Update Invoice Status to Issued
    UPDATE public.invoices
    SET status = 'Issued',
        updated_at = NOW()
    WHERE id = p_invoice_id AND workspace_id = v_workspace_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Invoice stock deducted and status updated to Issued.',
        'invoice_number', v_invoice_number
    );
END;
$$;

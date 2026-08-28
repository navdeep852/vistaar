-- ============================================================================
-- MIGRATION 008: ATOMIC INVOICE STOCK FINALIZATION RPC FUNCTION
-- ============================================================================

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
    v_product_stock NUMERIC;
    v_product_name TEXT;
    v_remaining_deduct NUMERIC;
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
    IF v_status IN ('Paid', 'Finalized', 'Issued') THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Invoice is already finalized. Stock deduction was previously executed.',
            'invoice_number', v_invoice_number
        );
    END IF;

    -- 3. Iterate Over Line Items & Validate Stock Levels
    FOR v_item IN
        SELECT product_id, product_name, quantity
        FROM public.invoice_items
        WHERE invoice_id = p_invoice_id AND workspace_id = v_workspace_id
    LOOP
        IF v_item.product_id IS NOT NULL THEN
            -- Lock Product Row
            SELECT current_stock, name INTO v_product_stock, v_product_name
            FROM public.products
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id
            FOR UPDATE;

            IF v_product_stock IS NULL THEN
                RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist.', v_item.product_name;
            END IF;

            IF (v_product_stock < v_item.quantity) THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Product "%" has insufficient stock. Available: %, Requested: %',
                    COALESCE(v_product_name, v_item.product_name), v_product_stock, v_item.quantity;
            END IF;
        END IF;
    END LOOP;

    -- 4. Deduct Stock & Record Movements
    FOR v_item IN
        SELECT product_id, product_name, quantity
        FROM public.invoice_items
        WHERE invoice_id = p_invoice_id AND workspace_id = v_workspace_id
    LOOP
        IF v_item.product_id IS NOT NULL THEN
            -- Deduct products.current_stock
            UPDATE public.products
            SET current_stock = GREATEST(0, current_stock - v_item.quantity),
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;

            -- Deduct stock_receipts FIFO
            v_remaining_deduct := v_item.quantity;
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
            END LOOP;

            -- Insert Stock Movement Audit Log
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
        END IF;
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

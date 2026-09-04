-- ============================================================================
-- MIGRATION 021: ATOMIC COUNTER SALE STOCK FINALIZATION & CANCELLATION RPC
-- ============================================================================

-- 1. RPC FUNCTION FOR ATOMIC COUNTER SALE STOCK FINALIZATION
CREATE OR REPLACE FUNCTION public.finalize_counter_sale_stock(p_sale_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_id UUID;
    v_sale_number TEXT;
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

    -- 2. Fetch and Lock Target Counter Sale
    SELECT sale_number, invoice_number, status INTO v_sale_number, v_invoice_number, v_status
    FROM public.counter_sales
    WHERE id = p_sale_id AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF v_sale_number IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Counter Sale with ID % not found for this workspace.', p_sale_id;
    END IF;

    -- Prevent Double Finalization / Double Stock Deduction (Idempotency)
    IF v_status = 'COMPLETED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Counter Sale is already finalized. Stock deduction was previously executed.',
            'sale_number', v_sale_number,
            'invoice_number', v_invoice_number
        );
    END IF;

    -- 3. Iterate Over Line Items & Validate Stock Availability
    FOR v_item IN
        SELECT product_id, product_name_snapshot, quantity
        FROM public.counter_sale_items
        WHERE counter_sale_id = p_sale_id AND workspace_id = v_workspace_id
    LOOP
        IF v_item.product_id IS NOT NULL THEN
            -- Lock Product Row
            SELECT name INTO v_product_name
            FROM public.products
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id
            FOR UPDATE;

            -- Calculate Authoritative Available Stock
            v_product_stock := public.get_authoritative_product_stock(v_item.product_id, v_workspace_id);

            IF v_product_name IS NULL AND v_product_stock IS NULL THEN
                RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist.', v_item.product_name_snapshot;
            END IF;

            IF (v_product_stock < v_item.quantity) THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Product "%" has insufficient stock. Available: %, Requested: %',
                    COALESCE(v_product_name, v_item.product_name_snapshot), v_product_stock, v_item.quantity;
            END IF;
        END IF;
    END LOOP;

    -- 4. Deduct Stock & Log Movements
    FOR v_item IN
        SELECT product_id, product_name_snapshot, quantity
        FROM public.counter_sale_items
        WHERE counter_sale_id = p_sale_id AND workspace_id = v_workspace_id
    LOOP
        IF v_item.product_id IS NOT NULL THEN
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

            -- Sync products.current_stock to new authoritative stock level
            UPDATE public.products
            SET current_stock = public.get_authoritative_product_stock(v_item.product_id, v_workspace_id),
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;

            -- Insert Stock Movement Log
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
                COALESCE(v_invoice_number, v_sale_number),
                'COUNTER_SALE',
                'Counter Sale Finalization #' || COALESCE(v_invoice_number, v_sale_number)
            );
        END IF;
    END LOOP;

    -- 5. Mark Counter Sale Status as COMPLETED
    UPDATE public.counter_sales
    SET status = 'COMPLETED',
        updated_at = NOW()
    WHERE id = p_sale_id AND workspace_id = v_workspace_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Counter Sale stock deducted successfully.',
        'sale_number', v_sale_number,
        'invoice_number', v_invoice_number
    );
END;
$$;


-- 2. RPC FUNCTION FOR ATOMIC COUNTER SALE CANCELLATION & STOCK RESTORATION
CREATE OR REPLACE FUNCTION public.cancel_counter_sale_stock(p_sale_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_id UUID;
    v_sale_number TEXT;
    v_invoice_number TEXT;
    v_status TEXT;
    v_item RECORD;
    v_receipt RECORD;
BEGIN
    -- 1. Resolve Authenticated Tenant Workspace
    v_workspace_id := public.current_user_workspace_id();
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User is not associated with an active workspace.';
    END IF;

    -- 2. Lock Target Sale
    SELECT sale_number, invoice_number, status INTO v_sale_number, v_invoice_number, v_status
    FROM public.counter_sales
    WHERE id = p_sale_id AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF v_sale_number IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Counter Sale with ID % not found.', p_sale_id;
    END IF;

    -- Prevent Duplicate Cancellation / Restoration
    IF v_status = 'CANCELLED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Counter sale was already cancelled previously.',
            'sale_number', v_sale_number
        );
    END IF;

    -- 3. Restore Stock for Each Item
    FOR v_item IN
        SELECT product_id, quantity
        FROM public.counter_sale_items
        WHERE counter_sale_id = p_sale_id AND workspace_id = v_workspace_id
    LOOP
        IF v_item.product_id IS NOT NULL THEN
            -- Restore stock receipt quantity
            SELECT id, quantity_remaining INTO v_receipt
            FROM public.stock_receipts
            WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id
            ORDER BY received_date DESC, created_at DESC
            LIMIT 1
            FOR UPDATE;

            IF v_receipt.id IS NOT NULL THEN
                UPDATE public.stock_receipts
                SET quantity_remaining = quantity_remaining + v_item.quantity,
                    updated_at = NOW()
                WHERE id = v_receipt.id;
            END IF;

            -- Update products.current_stock
            UPDATE public.products
            SET current_stock = current_stock + v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;

            -- Record RETURN Stock Movement
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
                'RETURN',
                v_item.quantity,
                CURRENT_DATE,
                COALESCE(v_invoice_number, v_sale_number),
                'COUNTER_SALE_CANCEL',
                'Cancelled Counter Sale #' || COALESCE(v_invoice_number, v_sale_number)
            );
        END IF;
    END LOOP;

    -- 4. Set Status to CANCELLED
    UPDATE public.counter_sales
    SET status = 'CANCELLED',
        updated_at = NOW()
    WHERE id = p_sale_id AND workspace_id = v_workspace_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Counter sale cancelled and stock restored to inventory.',
        'sale_number', v_sale_number
    );
END;
$$;

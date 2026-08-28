-- ============================================================================
-- MIGRATION 009: AUTHORITATIVE INVENTORY STOCK CALCULATION & SYNC FIX
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
    -- Sum active stock receipts for this product
    SELECT COALESCE(SUM(quantity_remaining), 0)
    INTO v_receipt_stock
    FROM public.stock_receipts
    WHERE product_id = p_product_id AND workspace_id = p_workspace_id AND quantity_remaining > 0;

    IF v_receipt_stock > 0 THEN
        RETURN v_receipt_stock;
    END IF;

    -- Fallback to products table current_stock
    SELECT COALESCE(current_stock, 0)
    INTO v_product_stock
    FROM public.products
    WHERE id = p_product_id AND workspace_id = p_workspace_id;

    RETURN COALESCE(v_product_stock, 0);
END;
$$;

-- 2. TRIGGER FUNCTION TO KEEP PRODUCTS.CURRENT_STOCK IN SYNC WITH STOCK RECEIPTS
CREATE OR REPLACE FUNCTION public.sync_product_current_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_product_id UUID;
    v_target_workspace_id UUID;
    v_calculated_stock NUMERIC;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_target_product_id := OLD.product_id;
        v_target_workspace_id := OLD.workspace_id;
    ELSE
        v_target_product_id := NEW.product_id;
        v_target_workspace_id := NEW.workspace_id;
    END IF;

    IF v_target_product_id IS NOT NULL THEN
        -- Calculate total active receipt stock
        SELECT COALESCE(SUM(quantity_remaining), 0)
        INTO v_calculated_stock
        FROM public.stock_receipts
        WHERE product_id = v_target_product_id AND workspace_id = v_target_workspace_id AND quantity_remaining > 0;

        -- Update products table current_stock atomically
        UPDATE public.products
        SET current_stock = v_calculated_stock,
            updated_at = NOW()
        WHERE id = v_target_product_id AND workspace_id = v_target_workspace_id;
    END IF;

    RETURN NULL;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_sync_product_stock_on_receipt_change ON public.stock_receipts;
CREATE TRIGGER trg_sync_product_stock_on_receipt_change
AFTER INSERT OR UPDATE OR DELETE ON public.stock_receipts
FOR EACH ROW EXECUTE FUNCTION public.sync_product_current_stock();

-- 3. RE-DEFINE ATOMIC INVOICE STOCK FINALIZATION RPC FUNCTION
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
    IF v_status IN ('Paid', 'Finalized', 'Issued', 'Partially Paid') THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Invoice is already finalized. Stock deduction was previously executed.',
            'invoice_number', v_invoice_number
        );
    END IF;

    -- 3. Iterate Over Line Items & Validate Authoritative Stock Levels
    FOR v_item IN
        SELECT product_id, product_name, quantity
        FROM public.invoice_items
        WHERE invoice_id = p_invoice_id AND workspace_id = v_workspace_id
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

            -- Update products.current_stock to match new authoritative stock level
            UPDATE public.products
            SET current_stock = public.get_authoritative_product_stock(v_item.product_id, v_workspace_id),
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;

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

-- 4. ONE-TIME DATA RECONCILIATION FOR EXISTING OUT-OF-SYNC PRODUCTS
UPDATE public.products p
SET current_stock = (
    SELECT COALESCE(SUM(sr.quantity_remaining), p.current_stock)
    FROM public.stock_receipts sr
    WHERE sr.product_id = p.id AND sr.workspace_id = p.workspace_id AND sr.quantity_remaining > 0
)
WHERE EXISTS (
    SELECT 1 FROM public.stock_receipts sr
    WHERE sr.product_id = p.id AND sr.workspace_id = p.workspace_id
);

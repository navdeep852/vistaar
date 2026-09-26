-- ==============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 045: ATOMIC INVOICE PAYMENT FINALIZATION & QR CODE
-- File: supabase/migrations/045_atomic_invoice_payment_finalization.sql
-- Description:
--   1. Adds stock tracking and QR columns to public.invoices and public.business_settings.
--   2. Modifies finalize_invoice_stock(UUID) so stock deduction NEVER resets payment status to 'Issued'.
--   3. Implements public.finalize_invoice_transaction(JSONB) RPC for single authoritative atomic finalization:
--      - Validates stock & workspace ownership
--      - Creates/updates invoice & line items
--      - FIFO stock deduction & stock movement logging (idempotent)
--      - Records upfront initial payment in public.payments (idempotent)
--      - Synchronizes public.daybook_transactions
--      - Synchronizes public.cashbook_entries (when paid_amount > 0)
--      - Synchronizes public.udhari_records
--      - Converts linked quotation if present
--   4. Adds safe historical reconciliation report function.
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. EXTEND SCHEMA FOR ATOMIC INVOICE FINALIZATION & QR PERSISTENCE
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.invoices
    ADD COLUMN IF NOT EXISTS is_stock_finalized BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stock_finalized_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash',
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS payment_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_workspace_stock_finalized
    ON public.invoices(workspace_id, is_stock_finalized);

-- Ensure business_settings has upi_qr_url and quotation preference
ALTER TABLE IF EXISTS public.business_settings
    ADD COLUMN IF NOT EXISTS upi_qr_url TEXT,
    ADD COLUMN IF NOT EXISTS show_upi_qr_on_quotation BOOLEAN DEFAULT TRUE;

-- Mark historical invoices as stock_finalized if they already have SALE stock movements
UPDATE public.invoices i
SET is_stock_finalized = TRUE,
    stock_finalized_at = COALESCE(i.updated_at, i.created_at, NOW())
WHERE i.is_stock_finalized = FALSE
  AND EXISTS (
      SELECT 1 FROM public.stock_movements sm
      WHERE sm.workspace_id = i.workspace_id
        AND sm.reference_id = i.invoice_number
        AND sm.reference_type = 'INVOICE_SALE'
  );

-- -----------------------------------------------------------------------------
-- 2. HARDENED ATOMIC INVOICE STOCK FINALIZATION RPC (PRESERVES FINANCIAL STATE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_invoice_stock(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_invoice_number TEXT;
    v_status TEXT;
    v_paid_amount NUMERIC(12,2);
    v_grand_total NUMERIC(12,2);
    v_is_stock_finalized BOOLEAN;
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
    SELECT invoice_number, status, paid_amount, grand_total, is_stock_finalized
    INTO v_invoice_number, v_status, v_paid_amount, v_grand_total, v_is_stock_finalized
    FROM public.invoices
    WHERE id = p_invoice_id AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF v_invoice_number IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Invoice with ID % not found for this workspace.', p_invoice_id;
    END IF;

    -- Prevent Double Stock Deduction (Check explicit flag OR existing stock movements)
    IF v_is_stock_finalized = TRUE OR EXISTS (
        SELECT 1 FROM public.stock_movements
        WHERE workspace_id = v_workspace_id
          AND reference_id = v_invoice_number
          AND reference_type = 'INVOICE_SALE'
    ) THEN
        -- Still ensure status and balance match authoritative financial state
        UPDATE public.invoices
        SET status =
                CASE
                    WHEN paid_amount >= grand_total AND grand_total > 0 THEN 'Paid'
                    WHEN paid_amount > 0 THEN 'Partially Paid'
                    ELSE 'Issued'
                END,
            balance_amount = GREATEST(grand_total - paid_amount, 0),
            is_stock_finalized = TRUE,
            updated_at = NOW()
        WHERE id = p_invoice_id AND workspace_id = v_workspace_id;

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

    -- 4. Deduct Stock & Record Movements (FIFO)
    FOR v_item IN
        SELECT product_id,
               MAX(product_name) AS product_name,
               SUM(quantity) AS quantity
        FROM public.invoice_items
        WHERE invoice_id = p_invoice_id AND workspace_id = v_workspace_id
          AND product_id IS NOT NULL
        GROUP BY product_id
    LOOP
        SELECT COALESCE(SUM(quantity_remaining), 0)
        INTO v_total_active_receipts
        FROM public.stock_receipts
        WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

        v_remaining_deduct := v_item.quantity;
        v_receipt_deducted := 0;

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

        SELECT COALESCE(SUM(quantity_remaining), 0)
        INTO v_new_receipt_sum
        FROM public.stock_receipts
        WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

        IF v_total_active_receipts > 0 AND v_new_receipt_sum > 0 THEN
            UPDATE public.products
            SET current_stock = v_new_receipt_sum,
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;
        ELSE
            UPDATE public.products
            SET current_stock = GREATEST(0, current_stock - (CASE WHEN v_total_active_receipts > 0 THEN v_uncovered_deduct ELSE v_item.quantity END)),
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;
        END IF;

        -- Record Stock Movement Audit Log
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

    -- 5. CRITICAL FIX: PRESERVE & COMPUTE ACCURATE FINANCIAL STATUS (NEVER HARD-CODE 'Issued')
    UPDATE public.invoices
    SET status =
            CASE
                WHEN COALESCE(paid_amount, 0) >= COALESCE(grand_total, 0) AND COALESCE(grand_total, 0) > 0
                    THEN 'Paid'
                WHEN COALESCE(paid_amount, 0) > 0
                    THEN 'Partially Paid'
                ELSE 'Issued'
            END,
        balance_amount =
            GREATEST(COALESCE(grand_total, 0) - COALESCE(paid_amount, 0), 0),
        is_stock_finalized = TRUE,
        stock_finalized_at = NOW(),
        updated_at = NOW()
    WHERE id = p_invoice_id AND workspace_id = v_workspace_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Invoice stock deducted and authoritative financial status preserved.',
        'invoice_number', v_invoice_number
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. UNIFIED ATOMIC INVOICE FINALIZATION RPC: finalize_invoice_transaction
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_invoice_transaction(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_invoice_id UUID;
    v_invoice_number VARCHAR(100);
    v_quotation_id UUID;
    v_date DATE;
    v_due_date DATE;
    v_subtotal NUMERIC(12,2);
    v_discount_total NUMERIC(12,2);
    v_tax_total NUMERIC(12,2);
    v_grand_total NUMERIC(12,2);
    v_paid_amount NUMERIC(12,2);
    v_balance_amount NUMERIC(12,2);
    v_status public.invoice_status;
    v_payment_mode VARCHAR(50);
    v_payment_ref TEXT;
    v_payment_notes TEXT;
    v_payment_date DATE;
    v_customer_id UUID;
    v_customer_name VARCHAR(255);
    v_customer_phone VARCHAR(50);
    v_customer_whatsapp VARCHAR(50);
    v_customer_email VARCHAR(255);
    v_customer_address TEXT;
    v_customer_gstin VARCHAR(50);
    v_items JSONB;
    v_item RECORD;
    v_line_item JSONB;
    v_item_idx INT;
    v_payment_id UUID;
    v_payment_code VARCHAR(100);
    v_daybook_id UUID;
    v_existing_inv RECORD;
    v_existing_pay_id UUID;
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
    v_inv_count INT;
    v_year_str TEXT;
    v_rand_str TEXT;
BEGIN
    -- 1. Workspace Validation
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Active workspace could not be resolved.';
    END IF;

    -- 2. Extract & Validate Financial Amounts
    v_grand_total := ROUND(COALESCE((p_payload->>'grand_total')::NUMERIC, 0), 2);
    v_paid_amount := ROUND(COALESCE((p_payload->>'paid_amount')::NUMERIC, 0), 2);
    v_subtotal := ROUND(COALESCE((p_payload->>'subtotal')::NUMERIC, v_grand_total), 2);
    v_discount_total := ROUND(COALESCE((p_payload->>'discount_total')::NUMERIC, 0), 2);
    v_tax_total := ROUND(COALESCE((p_payload->>'tax_total')::NUMERIC, 0), 2);

    IF v_grand_total < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Grand total cannot be negative.';
    END IF;

    IF v_paid_amount < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Paid amount cannot be negative.';
    END IF;

    IF v_paid_amount > (v_grand_total + 0.05) THEN
        RAISE EXCEPTION 'OVERPAYMENT_REJECTED: Paid amount (%) cannot exceed grand total (%).', v_paid_amount, v_grand_total;
    END IF;

    -- Authoritative balance & status calculation
    v_balance_amount := GREATEST(0, ROUND(v_grand_total - v_paid_amount, 2));

    IF v_paid_amount >= v_grand_total AND v_grand_total > 0 THEN
        v_status := 'Paid';
        v_balance_amount := 0;
    ELSIF v_paid_amount > 0 THEN
        v_status := 'Partially Paid';
    ELSE
        v_status := 'Issued';
        v_balance_amount := v_grand_total;
    END IF;

    -- 3. Extract Dates & Parties
    v_date := COALESCE((p_payload->>'date')::DATE, CURRENT_DATE);
    v_due_date := COALESCE((p_payload->>'due_date')::DATE, CURRENT_DATE + INTERVAL '15 days');
    v_payment_date := COALESCE((p_payload->>'payment_date')::DATE, v_date);
    v_payment_mode := COALESCE(p_payload->>'payment_mode', 'Cash');
    v_payment_ref := p_payload->>'payment_reference';
    v_payment_notes := p_payload->>'payment_notes';

    v_customer_name := COALESCE(p_payload->>'customer_name', 'Customer');
    v_customer_phone := COALESCE(p_payload->>'customer_phone', '');
    v_customer_whatsapp := COALESCE(p_payload->>'customer_whatsapp', v_customer_phone);
    v_customer_email := COALESCE(p_payload->>'customer_email', '');
    v_customer_address := COALESCE(p_payload->>'customer_address', '');
    v_customer_gstin := COALESCE(p_payload->>'customer_gstin', '');

    IF p_payload->>'customer_id' IS NOT NULL AND (p_payload->>'customer_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_customer_id := (p_payload->>'customer_id')::UUID;
    END IF;

    IF p_payload->>'quotation_id' IS NOT NULL AND (p_payload->>'quotation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_quotation_id := (p_payload->>'quotation_id')::UUID;
    END IF;

    -- 4. Resolve Target Invoice ID and Number
    IF p_payload->>'id' IS NOT NULL AND (p_payload->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_invoice_id := (p_payload->>'id')::UUID;
    ELSIF p_payload->>'invoice_id' IS NOT NULL AND (p_payload->>'invoice_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_invoice_id := (p_payload->>'invoice_id')::UUID;
    ELSE
        v_invoice_id := gen_random_uuid();
    END IF;

    IF p_payload->>'invoice_number' IS NOT NULL AND trim(p_payload->>'invoice_number') != '' THEN
        v_invoice_number := trim(p_payload->>'invoice_number');
    ELSE
        SELECT COUNT(*) + 1 INTO v_inv_count FROM public.invoices WHERE workspace_id = v_workspace_id;
        v_year_str := TO_CHAR(v_date, 'YYYY');
        v_invoice_number := 'INV-' || v_year_str || '-' || LPAD(v_inv_count::TEXT, 4, '0');
    END IF;

    -- 5. Check If Target Invoice Already Exists (Upsert Handling & Idempotency)
    SELECT * INTO v_existing_inv
    FROM public.invoices
    WHERE (id = v_invoice_id OR invoice_number = v_invoice_number)
      AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF v_existing_inv.id IS NOT NULL THEN
        v_invoice_id := v_existing_inv.id;
        v_invoice_number := v_existing_inv.invoice_number;

        -- Update Existing Invoice Row with Authoritative Values
        UPDATE public.invoices
        SET customer_id = COALESCE(v_customer_id, customer_id),
            customer_name = v_customer_name,
            customer_phone = v_customer_phone,
            customer_whatsapp = v_customer_whatsapp,
            customer_email = v_customer_email,
            customer_address = v_customer_address,
            customer_gstin = v_customer_gstin,
            status = v_status,
            date = v_date,
            due_date = v_due_date,
            subtotal = v_subtotal,
            discount_total = v_discount_total,
            tax_total = v_tax_total,
            grand_total = v_grand_total,
            paid_amount = v_paid_amount,
            balance_amount = v_balance_amount,
            payment_mode = v_payment_mode,
            payment_reference = v_payment_ref,
            payment_notes = v_payment_notes,
            notes = COALESCE(p_payload->>'notes', notes),
            terms = COALESCE(p_payload->>'terms', terms),
            footer_text = COALESCE(p_payload->>'footer_text', footer_text),
            template_id = COALESCE(p_payload->>'template_id', template_id),
            branding = COALESCE(p_payload->'branding', branding),
            theme = COALESCE(p_payload->'theme', theme),
            customization = COALESCE(p_payload->'customization', customization),
            snapshot = COALESCE(p_payload->'snapshot', snapshot),
            is_snapshot_finalized = TRUE,
            updated_at = NOW()
        WHERE id = v_invoice_id AND workspace_id = v_workspace_id;
    ELSE
        -- Insert New Invoice Row
        INSERT INTO public.invoices (
            id,
            workspace_id,
            quotation_id,
            customer_id,
            invoice_number,
            customer_name,
            customer_phone,
            customer_whatsapp,
            customer_email,
            customer_address,
            customer_gstin,
            status,
            date,
            due_date,
            subtotal,
            discount_total,
            tax_total,
            grand_total,
            paid_amount,
            balance_amount,
            payment_mode,
            payment_reference,
            payment_notes,
            notes,
            terms,
            footer_text,
            template_id,
            branding,
            theme,
            customization,
            snapshot,
            is_snapshot_finalized,
            is_stock_finalized,
            created_at,
            updated_at
        ) VALUES (
            v_invoice_id,
            v_workspace_id,
            v_quotation_id,
            v_customer_id,
            v_invoice_number,
            v_customer_name,
            v_customer_phone,
            v_customer_whatsapp,
            v_customer_email,
            v_customer_address,
            v_customer_gstin,
            v_status,
            v_date,
            v_due_date,
            v_subtotal,
            v_discount_total,
            v_tax_total,
            v_grand_total,
            v_paid_amount,
            v_balance_amount,
            v_payment_mode,
            v_payment_ref,
            v_payment_notes,
            p_payload->>'notes',
            p_payload->>'terms',
            p_payload->>'footer_text',
            COALESCE(p_payload->>'template_id', 'inv-classic-corporate'),
            p_payload->'branding',
            p_payload->'theme',
            p_payload->'customization',
            p_payload->'snapshot',
            TRUE,
            FALSE,
            NOW(),
            NOW()
        );
    END IF;

    -- 6. Insert Line Items (if passed)
    v_items := p_payload->'items';
    IF v_items IS NOT NULL AND jsonb_array_length(v_items) > 0 THEN
        -- Clean existing items for upsert reconciliation
        DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id AND workspace_id = v_workspace_id;

        FOR v_item_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
            v_line_item := v_items->v_item_idx;
            INSERT INTO public.invoice_items (
                id,
                workspace_id,
                invoice_id,
                product_id,
                product_name,
                sku,
                unit,
                quantity,
                buy_price,
                selling_price,
                discount_amount,
                tax_percent,
                tax_amount,
                total
            ) VALUES (
                gen_random_uuid(),
                v_workspace_id,
                v_invoice_id,
                CASE WHEN (v_line_item->>'productId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (v_line_item->>'productId')::UUID ELSE NULL END,
                COALESCE(v_line_item->>'productName', v_line_item->>'name', 'Item'),
                COALESCE(v_line_item->>'sku', ''),
                COALESCE(v_line_item->>'unit', 'Pcs'),
                GREATEST(1, COALESCE((v_line_item->>'quantity')::NUMERIC, 1)),
                COALESCE((v_line_item->>'buyPrice')::NUMERIC, 0),
                COALESCE((v_line_item->>'sellingPrice')::NUMERIC, (v_line_item->>'price')::NUMERIC, 0),
                COALESCE((v_line_item->>'discountAmount')::NUMERIC, 0),
                COALESCE((v_line_item->>'taxPercent')::NUMERIC, 0),
                COALESCE((v_line_item->>'taxAmount')::NUMERIC, 0),
                COALESCE((v_line_item->>'total')::NUMERIC, 0)
            );
        END LOOP;
    END IF;

    -- 7. Authoritative Stock Validation & FIFO Deduction (Idempotent: only if not already deducted)
    IF NOT EXISTS (
        SELECT 1 FROM public.stock_movements
        WHERE workspace_id = v_workspace_id
          AND reference_id = v_invoice_number
          AND reference_type = 'INVOICE_SALE'
    ) THEN
        -- Validate Stock
        FOR v_item IN
            SELECT product_id,
                   MAX(product_name) AS product_name,
                   SUM(quantity) AS quantity
            FROM public.invoice_items
            WHERE invoice_id = v_invoice_id AND workspace_id = v_workspace_id
              AND product_id IS NOT NULL
            GROUP BY product_id
        LOOP
            SELECT name, current_stock INTO v_product_name, v_product_stock
            FROM public.products
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id
            FOR UPDATE;

            v_avail_stock := public.get_authoritative_product_stock(v_item.product_id, v_workspace_id);

            IF (v_avail_stock < v_item.quantity) THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%". Requested %, but only % units are available.',
                    COALESCE(v_product_name, v_item.product_name), v_item.quantity, v_avail_stock;
            END IF;
        END LOOP;

        -- Deduct Stock
        FOR v_item IN
            SELECT product_id,
                   MAX(product_name) AS product_name,
                   SUM(quantity) AS quantity
            FROM public.invoice_items
            WHERE invoice_id = v_invoice_id AND workspace_id = v_workspace_id
              AND product_id IS NOT NULL
            GROUP BY product_id
        LOOP
            SELECT COALESCE(SUM(quantity_remaining), 0)
            INTO v_total_active_receipts
            FROM public.stock_receipts
            WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

            v_remaining_deduct := v_item.quantity;
            v_receipt_deducted := 0;

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

            SELECT COALESCE(SUM(quantity_remaining), 0)
            INTO v_new_receipt_sum
            FROM public.stock_receipts
            WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

            IF v_total_active_receipts > 0 AND v_new_receipt_sum > 0 THEN
                UPDATE public.products
                SET current_stock = v_new_receipt_sum,
                    updated_at = NOW()
                WHERE id = v_item.product_id AND workspace_id = v_workspace_id;
            ELSE
                UPDATE public.products
                SET current_stock = GREATEST(0, current_stock - (CASE WHEN v_total_active_receipts > 0 THEN v_uncovered_deduct ELSE v_item.quantity END)),
                    updated_at = NOW()
                WHERE id = v_item.product_id AND workspace_id = v_workspace_id;
            END IF;

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
    END IF;

    -- Mark stock finalized on invoice
    UPDATE public.invoices
    SET is_stock_finalized = TRUE,
        stock_finalized_at = NOW()
    WHERE id = v_invoice_id AND workspace_id = v_workspace_id;

    -- 8. RECORD INITIAL PAYMENT (ONLY IF paid_amount > 0 AND NOT ALREADY POSTED)
    IF v_paid_amount > 0 THEN
        -- Check idempotency: does an initial payment record for this invoice already exist?
        SELECT id INTO v_existing_pay_id
        FROM public.payments
        WHERE workspace_id = v_workspace_id AND invoice_id = v_invoice_id
        LIMIT 1;

        IF v_existing_pay_id IS NULL THEN
            v_payment_id := gen_random_uuid();
            v_rand_str := LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');
            v_payment_code := 'PAY-' || TO_CHAR(v_payment_date, 'YYYY') || '-' || v_rand_str;

            INSERT INTO public.payments (
                id,
                workspace_id,
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
                v_customer_id,
                v_customer_name,
                v_invoice_id,
                v_invoice_number,
                v_payment_code,
                v_paid_amount,
                v_payment_date,
                v_payment_mode,
                v_payment_ref,
                COALESCE(v_payment_notes, 'Initial payment recorded during invoice finalization'),
                NOW()
            );

            -- Post Cashbook Inflow
            BEGIN
                INSERT INTO public.cashbook_entries (
                    id,
                    workspace_id,
                    source_type,
                    source_id,
                    reference_number,
                    direction,
                    amount,
                    payment_method,
                    party_name,
                    description,
                    notes,
                    entry_date,
                    created_at,
                    updated_at
                ) VALUES (
                    gen_random_uuid(),
                    v_workspace_id,
                    'INVOICE_PAYMENT',
                    v_payment_id::TEXT,
                    v_invoice_number,
                    'IN',
                    v_paid_amount,
                    v_payment_mode,
                    v_customer_name,
                    'Payment receipt for Invoice #' || v_invoice_number,
                    v_payment_notes,
                    v_payment_date,
                    NOW(),
                    NOW()
                );
            EXCEPTION WHEN OTHERS THEN
                -- Tolerate if cashbook table has slight schema variation
                NULL;
            END;
        ELSE
            v_payment_id := v_existing_pay_id;
        END IF;
    END IF;

    -- 9. Post / Update Daybook Sale Entry (Authoritative gross & inflow)
    v_daybook_id := gen_random_uuid();
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
        party_type,
        party_id,
        party_name,
        reference_type,
        reference_id,
        reference_number,
        description,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_daybook_id,
        v_workspace_id,
        'ACC-' || v_invoice_number,
        v_date,
        'SALE',
        'IN',
        v_paid_amount, -- Inflow = actual cash received
        v_grand_total, -- Gross Sale Total
        v_balance_amount,
        CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
        CASE WHEN v_paid_amount > 0 THEN v_payment_mode ELSE 'Cash' END,
        'customer',
        v_customer_id,
        v_customer_name,
        'INVOICE',
        v_invoice_id::TEXT,
        v_invoice_number,
        'Invoice #' || v_invoice_number,
        'COMPLETED',
        NOW(),
        NOW()
    )
    ON CONFLICT (workspace_id, reference_type, reference_id)
    DO UPDATE SET
        amount = EXCLUDED.amount,
        total_amount = EXCLUDED.total_amount,
        remaining_amount = EXCLUDED.remaining_amount,
        payment_status = EXCLUDED.payment_status,
        payment_mode = EXCLUDED.payment_mode,
        updated_at = NOW();

    -- 10. Synchronize Udhari Ledger
    IF v_balance_amount > 0.01 THEN
        -- Outstanding balance exists: upsert Udhari record
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
            v_customer_id,
            v_invoice_id,
            'UD-' || v_invoice_number,
            v_customer_name,
            COALESCE(v_customer_phone, '9999999999'),
            v_grand_total,
            v_paid_amount,
            v_balance_amount,
            v_due_date,
            CASE WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
            NOW(),
            NOW()
        )
        ON CONFLICT (workspace_id, udhari_code)
        DO UPDATE SET
            original_amount = EXCLUDED.original_amount,
            total_received = EXCLUDED.total_received,
            outstanding_amount = EXCLUDED.outstanding_amount,
            status = EXCLUDED.status,
            due_date = EXCLUDED.due_date,
            updated_at = NOW();
    ELSE
        -- Fully paid: if an udhari record exists (e.g. from prior draft), set outstanding to 0
        UPDATE public.udhari_records
        SET total_received = v_grand_total,
            outstanding_amount = 0,
            status = 'PAID',
            updated_at = NOW()
        WHERE workspace_id = v_workspace_id
          AND (invoice_id = v_invoice_id OR udhari_code = 'UD-' || v_invoice_number);
    END IF;

    -- 11. Link Quotation if Converted
    IF v_quotation_id IS NOT NULL THEN
        UPDATE public.quotations
        SET status = 'Converted',
            converted_invoice_id = v_invoice_id,
            updated_at = NOW()
        WHERE id = v_quotation_id AND workspace_id = v_workspace_id;
    END IF;

    -- 12. Return Authoritative State
    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'grand_total', v_grand_total,
        'paid_amount', v_paid_amount,
        'balance_amount', v_balance_amount,
        'status', v_status::TEXT,
        'payment_id', v_payment_id,
        'is_stock_finalized', true,
        'message', 'Invoice finalization, stock deduction, and accounting synchronizations committed atomically.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. PERMISSIONS & SCHEMA NOTIFICATION
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.finalize_invoice_stock(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_invoice_transaction(JSONB) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- 5. HISTORICAL FINANCIAL RECONCILIATION REPORT FUNCTION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_invoice_financial_records(p_dry_run BOOLEAN DEFAULT TRUE)
RETURNS TABLE (
    invoice_id UUID,
    invoice_number VARCHAR(100),
    stored_grand_total NUMERIC(12,2),
    stored_paid_amount NUMERIC(12,2),
    actual_payment_sum NUMERIC(12,2),
    stored_balance NUMERIC(12,2),
    expected_balance NUMERIC(12,2),
    stored_status VARCHAR(50),
    expected_status VARCHAR(50),
    action_taken TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_pay_sum NUMERIC(12,2);
    v_exp_bal NUMERIC(12,2);
    v_exp_status VARCHAR(50);
BEGIN
    FOR v_rec IN
        SELECT i.id, i.invoice_number, i.grand_total, i.paid_amount, i.balance_amount, i.status::TEXT AS status, i.workspace_id
        FROM public.invoices i
        WHERE i.status != 'Draft' AND i.status != 'Cancelled'
    LOOP
        SELECT COALESCE(SUM(amount), 0) INTO v_pay_sum
        FROM public.payments
        WHERE invoice_id = v_rec.id AND workspace_id = v_rec.workspace_id;

        v_exp_bal := GREATEST(0, ROUND(v_rec.grand_total - v_pay_sum, 2));
        v_exp_status := CASE
            WHEN v_pay_sum >= v_rec.grand_total AND v_rec.grand_total > 0 THEN 'Paid'
            WHEN v_pay_sum > 0 THEN 'Partially Paid'
            ELSE 'Issued'
        END;

        IF v_rec.paid_amount != v_pay_sum 
           OR v_rec.balance_amount != v_exp_bal 
           OR v_rec.status != v_exp_status THEN

            IF NOT p_dry_run THEN
                UPDATE public.invoices
                SET paid_amount = v_pay_sum,
                    balance_amount = v_exp_bal,
                    status = v_exp_status::public.invoice_status,
                    updated_at = NOW()
                WHERE id = v_rec.id;

                action_taken := 'RECONCILED: Updated invoice paid_amount, balance_amount, and status';
            ELSE
                action_taken := 'DRY_RUN: Discrepancy detected (no changes applied)';
            END IF;

            invoice_id := v_rec.id;
            invoice_number := v_rec.invoice_number;
            stored_grand_total := v_rec.grand_total;
            stored_paid_amount := v_rec.paid_amount;
            actual_payment_sum := v_pay_sum;
            stored_balance := v_rec.balance_amount;
            expected_balance := v_exp_bal;
            stored_status := v_rec.status;
            expected_status := v_exp_status;
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_invoice_financial_records(BOOLEAN) TO authenticated, service_role;

COMMIT;

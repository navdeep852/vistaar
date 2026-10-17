-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 066
-- File: 066_fix_counter_sale_invoice_persistence_kpis.sql
-- Description: Comprehensive Data-Integrity Fix for Sales Transactions, Invoices,
--              Inventory Movements, and Dashboard KPIs.
--              Guarantees:
--              1. Schema durability across counter_sales, invoices, payments,
--                 stock_movements, and daybook_transactions.
--              2. Atomic execution of finalize_counter_sale & finalize_invoice_transaction.
--              3. Strict atomicity: no inventory mutation without durable sale header.
--              4. Branch isolation and canonical branch persistence.
--              5. Optimal indexing for Dashboard Total Sales & Collections.
-- =============================================================================

BEGIN;

-- 1. Ensure all operational tables have branch_id and financial metadata columns
ALTER TABLE public.counter_sales 
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'Cash',
    ADD COLUMN IF NOT EXISTS amount_received NUMERIC(15,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS balance_amount NUMERIC(15,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payment_reference TEXT,
    ADD COLUMN IF NOT EXISTS payment_notes TEXT;

ALTER TABLE public.counter_sale_items 
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS part_number_snapshot TEXT,
    ADD COLUMN IF NOT EXISTS buy_price_snapshot NUMERIC(15,2) DEFAULT 0.00;

ALTER TABLE public.invoices 
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS is_stock_finalized BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash',
    ADD COLUMN IF NOT EXISTS payment_reference TEXT,
    ADD COLUMN IF NOT EXISTS payment_notes TEXT;

ALTER TABLE public.invoice_items 
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS part_number TEXT,
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'product';

ALTER TABLE public.payments 
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS counter_sale_id UUID,
    ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

ALTER TABLE public.stock_movements 
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS source_id UUID,
    ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);

ALTER TABLE public.daybook_transactions 
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);

-- 2. Performance Indexes for Branch Isolation and Dashboard Aggregation
CREATE INDEX IF NOT EXISTS idx_counter_sales_ws_branch_date 
    ON public.counter_sales(workspace_id, branch_id, sale_date);

CREATE INDEX IF NOT EXISTS idx_counter_sales_ws_date_status 
    ON public.counter_sales(workspace_id, sale_date, status);

CREATE INDEX IF NOT EXISTS idx_invoices_ws_branch_date 
    ON public.invoices(workspace_id, branch_id, date);

CREATE INDEX IF NOT EXISTS idx_invoices_ws_date_status 
    ON public.invoices(workspace_id, date, status);

CREATE INDEX IF NOT EXISTS idx_payments_ws_branch_date 
    ON public.payments(workspace_id, branch_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_payments_ws_cs 
    ON public.payments(workspace_id, counter_sale_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_ws_source 
    ON public.stock_movements(workspace_id, source_id, source_type);

-- 3. Authoritative PostgreSQL RPC: finalize_counter_sale
CREATE OR REPLACE FUNCTION public.finalize_counter_sale(p_sale JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_branch_id UUID;
    v_counter_sale_id UUID;
    v_existing_sale RECORD;
    
    v_sale_number TEXT;
    v_invoice_number TEXT;
    v_customer_id UUID;
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
    
    v_item JSONB;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_part_num TEXT;
    v_item_qty NUMERIC(15,2);
    v_item_rate NUMERIC(15,2);
    v_item_amt NUMERIC(15,2);
    v_item_buy_price NUMERIC(15,2);
    v_cur_stock NUMERIC(15,2);
    v_new_stock NUMERIC(15,2);
    
    v_result_sale JSONB;
BEGIN
    -- 1. Robust Workspace ID Resolution
    v_workspace_id := NULLIF(COALESCE(p_sale->>'workspace_id', p_sale->>'workspaceId', ''), '')::UUID;
    IF v_workspace_id IS NULL THEN
        BEGIN
            v_workspace_id := public.current_user_workspace_id();
        EXCEPTION WHEN OTHERS THEN
            v_workspace_id := NULL;
        END;
    END IF;
    IF v_workspace_id IS NULL AND auth.uid() IS NOT NULL THEN
        SELECT workspace_id INTO v_workspace_id FROM public.users WHERE id = auth.uid() LIMIT 1;
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User is not associated with an active workspace.';
    END IF;

    -- 2. Extract Header Fields
    v_branch_id     := NULLIF(COALESCE(p_sale->>'branch_id', p_sale->>'branchId', ''), '')::UUID;
    v_customer_id   := NULLIF(COALESCE(p_sale->>'customer_id', p_sale->>'customerId', ''), '')::UUID;
    v_sale_number   := TRIM(COALESCE(p_sale->>'sale_number', p_sale->>'saleNumber', ''));
    v_invoice_number:= TRIM(COALESCE(p_sale->>'invoice_number', p_sale->>'invoiceNumber', ''));
    IF v_invoice_number = '' THEN v_invoice_number := v_sale_number; END IF;
    IF v_sale_number = '' THEN v_sale_number := v_invoice_number; END IF;
    
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

    -- 3. Idempotency Check: return existing sale if already committed
    SELECT * INTO v_existing_sale 
    FROM public.counter_sales
    WHERE workspace_id = v_workspace_id
      AND (invoice_number = v_invoice_number OR sale_number = v_sale_number)
    LIMIT 1;

    IF v_existing_sale.id IS NOT NULL THEN
        SELECT row_to_json(cs) INTO v_result_sale
        FROM (
            SELECT s.*, 
                COALESCE((
                    SELECT json_agg(i.*) FROM public.counter_sale_items i WHERE i.counter_sale_id = s.id
                ), '[]'::JSON) AS items
            FROM public.counter_sales s
            WHERE s.id = v_existing_sale.id
        ) cs;
        RETURN jsonb_build_object('success', true, 'data', v_result_sale, 'idempotent', true);
    END IF;

    -- 4. Validate Items & Stock Availability
    IF jsonb_array_length(v_items_json) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Counter sale must contain at least one product.';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json)
    LOOP
        v_prod_id  := NULLIF(COALESCE(v_item->>'product_id', v_item->>'productId', ''), '')::UUID;
        v_prod_name:= COALESCE(v_item->>'product_name_snapshot', v_item->>'productNameSnapshot', v_item->>'product_name', v_item->>'name', 'Product');
        v_item_qty := ABS(COALESCE((v_item->>'quantity')::NUMERIC, 0.00));

        IF v_prod_id IS NOT NULL AND v_item_qty > 0 THEN
            SELECT current_stock INTO v_cur_stock
            FROM public.products
            WHERE id = v_prod_id AND workspace_id = v_workspace_id
            FOR UPDATE;

            IF v_cur_stock IS NULL OR v_cur_stock < v_item_qty THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Product "%" has % units available, requested %.',
                    v_prod_name, COALESCE(v_cur_stock, 0), v_item_qty;
            END IF;
        END IF;
    END LOOP;

    -- 5. Insert Counter Sale Header
    INSERT INTO public.counter_sales (
        workspace_id,
        branch_id,
        customer_id,
        sale_number,
        invoice_number,
        customer_name,
        phone_number,
        sale_date,
        estimate_reference,
        subtotal,
        discount_type,
        discount_value,
        discount_amount,
        final_total,
        status,
        notes,
        payment_method,
        amount_received,
        balance_amount,
        payment_reference,
        payment_notes
    ) VALUES (
        v_workspace_id,
        v_branch_id,
        v_customer_id,
        v_sale_number,
        v_invoice_number,
        v_customer_name,
        v_phone_number,
        v_sale_date,
        v_estimate_ref,
        v_subtotal,
        v_discount_type,
        v_discount_val,
        v_discount_amt,
        v_final_total,
        'COMPLETED',
        v_notes,
        v_payment_method,
        v_amount_received,
        v_balance_amount,
        v_payment_ref,
        v_payment_notes
    ) RETURNING id INTO v_counter_sale_id;

    -- 6. Insert Line Items and Mutate Stock Atomically
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json)
    LOOP
        v_prod_id        := NULLIF(COALESCE(v_item->>'product_id', v_item->>'productId', ''), '')::UUID;
        v_prod_name      := COALESCE(v_item->>'product_name_snapshot', v_item->>'productNameSnapshot', v_item->>'product_name', v_item->>'name', 'Product');
        v_part_num       := COALESCE(v_item->>'part_number_snapshot', v_item->>'partNumberSnapshot', v_item->>'part_number', '');
        v_item_qty       := ABS(COALESCE((v_item->>'quantity')::NUMERIC, 0.00));
        v_item_rate      := COALESCE((v_item->>'rate')::NUMERIC, (v_item->>'price')::NUMERIC, 0.00);
        v_item_amt       := COALESCE((v_item->>'amount')::NUMERIC, (v_item_qty * v_item_rate));
        v_item_buy_price := COALESCE((v_item->>'buy_price_snapshot')::NUMERIC, (v_item->>'buy_price')::NUMERIC, 0.00);

        INSERT INTO public.counter_sale_items (
            workspace_id,
            counter_sale_id,
            branch_id,
            product_id,
            product_name_snapshot,
            part_number_snapshot,
            quantity,
            rate,
            amount,
            buy_price_snapshot
        ) VALUES (
            v_workspace_id,
            v_counter_sale_id,
            v_branch_id,
            v_prod_id,
            v_prod_name,
            v_part_num,
            v_item_qty,
            v_item_rate,
            v_item_amt,
            v_item_buy_price
        );

        -- Deduct from products table
        IF v_prod_id IS NOT NULL AND v_item_qty > 0 THEN
            UPDATE public.products
            SET current_stock = GREATEST(0, current_stock - v_item_qty),
                updated_at = NOW()
            WHERE id = v_prod_id AND workspace_id = v_workspace_id;

            -- Record stock movement linking directly to this sale
            INSERT INTO public.stock_movements (
                workspace_id,
                branch_id,
                product_id,
                movement_type,
                quantity,
                source_type,
                source_id,
                reference_number,
                notes
            ) VALUES (
                v_workspace_id,
                v_branch_id,
                v_prod_id,
                'Sale',
                -v_item_qty,
                'COUNTER_SALE',
                v_counter_sale_id,
                v_invoice_number,
                'Counter Sale #' || v_invoice_number
            );
        END IF;
    END LOOP;

    -- 7. Record Authoritative Payment Entry
    IF v_amount_received > 0 AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
        INSERT INTO public.payments (
            workspace_id,
            branch_id,
            counter_sale_id,
            customer_id,
            customer_name,
            amount,
            payment_date,
            method,
            payment_method,
            reference_no,
            reference_number,
            notes
        ) VALUES (
            v_workspace_id,
            v_branch_id,
            v_counter_sale_id,
            v_customer_id,
            v_customer_name,
            v_amount_received,
            v_sale_date,
            v_payment_method,
            v_payment_method,
            v_payment_ref,
            v_payment_ref,
            COALESCE(v_payment_notes, 'Counter Sale payment #' || v_invoice_number)
        );
    END IF;

    -- 8. Record Daybook Transaction
    INSERT INTO public.daybook_transactions (
        workspace_id,
        branch_id,
        reference_type,
        reference_id,
        reference_number,
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
        description,
        transaction_date
    ) VALUES (
        v_workspace_id,
        v_branch_id,
        'COUNTER_SALE',
        v_counter_sale_id::TEXT,
        v_invoice_number,
        'SALE',
        'IN',
        v_amount_received,
        v_final_total,
        v_balance_amount,
        CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' WHEN v_amount_received > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
        v_payment_method,
        'customer',
        v_customer_id::TEXT,
        v_customer_name,
        'Counter Sale #' || v_invoice_number,
        v_sale_date
    );

    -- 9. Build and Return Result JSON
    SELECT row_to_json(cs) INTO v_result_sale
    FROM (
        SELECT s.*, 
            COALESCE((
                SELECT json_agg(i.*) FROM public.counter_sale_items i WHERE i.counter_sale_id = s.id
            ), '[]'::JSON) AS items
        FROM public.counter_sales s
        WHERE s.id = v_counter_sale_id
    ) cs;

    RETURN jsonb_build_object('success', true, 'data', v_result_sale, 'sale_id', v_counter_sale_id, 'invoice_number', v_invoice_number);
END;
$$;

-- 4. Authoritative PostgreSQL RPC: finalize_invoice_transaction
CREATE OR REPLACE FUNCTION public.finalize_invoice_transaction(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_branch_id UUID;
    v_invoice_id UUID;
    v_existing_inv RECORD;
    
    v_invoice_number TEXT;
    v_quotation_id UUID;
    v_customer_id UUID;
    v_customer_name TEXT;
    v_customer_phone TEXT;
    v_customer_email TEXT;
    v_date DATE;
    v_due_date DATE;
    v_subtotal NUMERIC(15,2);
    v_discount_total NUMERIC(15,2);
    v_tax_total NUMERIC(15,2);
    v_grand_total NUMERIC(15,2);
    v_paid_amount NUMERIC(15,2);
    v_balance_amount NUMERIC(15,2);
    v_payment_mode TEXT;
    v_payment_ref TEXT;
    v_payment_notes TEXT;
    v_notes TEXT;
    v_status TEXT;
    v_items_json JSONB;
    
    v_item JSONB;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_part_num TEXT;
    v_item_qty NUMERIC(15,2);
    v_item_price NUMERIC(15,2);
    v_item_total NUMERIC(15,2);
    v_cur_stock NUMERIC(15,2);
BEGIN
    -- 1. Robust Workspace ID Resolution
    v_workspace_id := NULLIF(COALESCE(p_payload->>'workspace_id', p_payload->>'workspaceId', ''), '')::UUID;
    IF v_workspace_id IS NULL THEN
        BEGIN
            v_workspace_id := public.current_user_workspace_id();
        EXCEPTION WHEN OTHERS THEN
            v_workspace_id := NULL;
        END;
    END IF;
    IF v_workspace_id IS NULL AND auth.uid() IS NOT NULL THEN
        SELECT workspace_id INTO v_workspace_id FROM public.users WHERE id = auth.uid() LIMIT 1;
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User is not associated with an active workspace.';
    END IF;

    -- 2. Extract Fields
    v_invoice_id    := NULLIF(COALESCE(p_payload->>'id', p_payload->>'invoice_id', ''), '')::UUID;
    v_branch_id     := NULLIF(COALESCE(p_payload->>'branch_id', p_payload->>'branchId', ''), '')::UUID;
    v_invoice_number:= TRIM(COALESCE(p_payload->>'invoice_number', p_payload->>'invoiceNumber', ''));
    v_quotation_id  := NULLIF(COALESCE(p_payload->>'quotation_id', p_payload->>'quotationId', ''), '')::UUID;
    v_customer_id   := NULLIF(COALESCE(p_payload->>'customer_id', p_payload->>'customerId', ''), '')::UUID;
    v_customer_name := TRIM(COALESCE(p_payload->>'customer_name', p_payload->>'customerName', 'Walk-in Customer'));
    v_customer_phone:= TRIM(COALESCE(p_payload->>'customer_phone', p_payload->>'customerPhone', ''));
    v_customer_email:= TRIM(COALESCE(p_payload->>'customer_email', p_payload->>'customerEmail', ''));
    v_date          := COALESCE((p_payload->>'date')::DATE, CURRENT_DATE);
    v_due_date      := COALESCE((p_payload->>'due_date')::DATE, (p_payload->>'dueDate')::DATE, v_date + 15);
    v_subtotal      := COALESCE((p_payload->>'subtotal')::NUMERIC, 0.00);
    v_discount_total:= COALESCE((p_payload->>'discount_total')::NUMERIC, (p_payload->>'discountTotal')::NUMERIC, 0.00);
    v_tax_total     := COALESCE((p_payload->>'tax_total')::NUMERIC, (p_payload->>'taxTotal')::NUMERIC, 0.00);
    v_grand_total   := COALESCE((p_payload->>'grand_total')::NUMERIC, (p_payload->>'grandTotal')::NUMERIC, 0.00);
    v_paid_amount   := COALESCE((p_payload->>'paid_amount')::NUMERIC, (p_payload->>'paidAmount')::NUMERIC, 0.00);
    v_balance_amount:= GREATEST(0.00, v_grand_total - v_paid_amount);
    v_payment_mode  := COALESCE(p_payload->>'payment_mode', p_payload->>'paymentMode', 'Cash');
    v_payment_ref   := NULLIF(COALESCE(p_payload->>'payment_reference', p_payload->>'paymentReference', ''), '');
    v_payment_notes := NULLIF(COALESCE(p_payload->>'payment_notes', p_payload->>'paymentNotes', ''), '');
    v_notes         := NULLIF(COALESCE(p_payload->>'notes', ''), '');
    v_items_json    := COALESCE(p_payload->'items', '[]'::JSONB);

    v_status := CASE 
        WHEN v_balance_amount <= 0.01 AND v_grand_total > 0 THEN 'Paid'
        WHEN v_paid_amount > 0 THEN 'Partially Paid'
        ELSE 'Issued'
    END;

    -- 3. Check for existing invoice
    IF v_invoice_id IS NOT NULL THEN
        SELECT * INTO v_existing_inv FROM public.invoices WHERE id = v_invoice_id AND workspace_id = v_workspace_id;
    ELSIF v_invoice_number <> '' THEN
        SELECT * INTO v_existing_inv FROM public.invoices WHERE invoice_number = v_invoice_number AND workspace_id = v_workspace_id;
    END IF;

    IF v_existing_inv.id IS NOT NULL THEN
        v_invoice_id := v_existing_inv.id;
        IF v_existing_inv.is_stock_finalized = TRUE THEN
            -- Already finalized
            RETURN jsonb_build_object(
                'success', true,
                'invoice_id', v_invoice_id,
                'invoice_number', v_existing_inv.invoice_number,
                'status', v_existing_inv.status,
                'idempotent', true
            );
        END IF;
    ELSE
        IF v_invoice_id IS NULL THEN v_invoice_id := gen_random_uuid(); END IF;
        IF v_invoice_number = '' THEN v_invoice_number := 'INV-' || EXTRACT(EPOCH FROM NOW())::BIGINT; END IF;
    END IF;

    -- 4. Validate Stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json)
    LOOP
        v_prod_id  := NULLIF(COALESCE(v_item->>'product_id', v_item->>'productId', ''), '')::UUID;
        v_prod_name:= COALESCE(v_item->>'product_name', v_item->>'productName', v_item->>'name', 'Product');
        v_item_qty := ABS(COALESCE((v_item->>'quantity')::NUMERIC, 0.00));

        IF v_prod_id IS NOT NULL AND v_item_qty > 0 THEN
            SELECT current_stock INTO v_cur_stock
            FROM public.products
            WHERE id = v_prod_id AND workspace_id = v_workspace_id
            FOR UPDATE;

            IF v_cur_stock IS NULL OR v_cur_stock < v_item_qty THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Product "%" has % units available, requested %.',
                    v_prod_name, COALESCE(v_cur_stock, 0), v_item_qty;
            END IF;
        END IF;
    END LOOP;

    -- 5. Upsert Invoice Header
    INSERT INTO public.invoices (
        id,
        workspace_id,
        branch_id,
        quotation_id,
        customer_id,
        invoice_number,
        customer_name,
        customer_phone,
        customer_email,
        date,
        due_date,
        subtotal,
        discount_total,
        tax_total,
        grand_total,
        paid_amount,
        balance_amount,
        status,
        notes,
        is_stock_finalized
    ) VALUES (
        v_invoice_id,
        v_workspace_id,
        v_branch_id,
        v_quotation_id,
        v_customer_id,
        v_invoice_number,
        v_customer_name,
        v_customer_phone,
        v_customer_email,
        v_date,
        v_due_date,
        v_subtotal,
        v_discount_total,
        v_tax_total,
        v_grand_total,
        v_paid_amount,
        v_balance_amount,
        v_status,
        v_notes,
        TRUE
    ) ON CONFLICT (id) DO UPDATE SET
        branch_id = EXCLUDED.branch_id,
        customer_id = EXCLUDED.customer_id,
        invoice_number = EXCLUDED.invoice_number,
        customer_name = EXCLUDED.customer_name,
        customer_phone = EXCLUDED.customer_phone,
        customer_email = EXCLUDED.customer_email,
        date = EXCLUDED.date,
        due_date = EXCLUDED.due_date,
        subtotal = EXCLUDED.subtotal,
        discount_total = EXCLUDED.discount_total,
        tax_total = EXCLUDED.tax_total,
        grand_total = EXCLUDED.grand_total,
        paid_amount = EXCLUDED.paid_amount,
        balance_amount = EXCLUDED.balance_amount,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        is_stock_finalized = TRUE,
        updated_at = NOW();

    -- 6. Insert / Replace Line Items and Mutate Stock Atomically
    DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json)
    LOOP
        v_prod_id   := NULLIF(COALESCE(v_item->>'product_id', v_item->>'productId', ''), '')::UUID;
        v_prod_name := COALESCE(v_item->>'product_name', v_item->>'productName', v_item->>'name', 'Product');
        v_part_num  := COALESCE(v_item->>'part_number', v_item->>'partNumber', '');
        v_item_qty  := ABS(COALESCE((v_item->>'quantity')::NUMERIC, 0.00));
        v_item_price:= COALESCE((v_item->>'selling_price')::NUMERIC, (v_item->>'price')::NUMERIC, 0.00);
        v_item_total:= COALESCE((v_item->>'total')::NUMERIC, (v_item_qty * v_item_price));

        INSERT INTO public.invoice_items (
            workspace_id,
            invoice_id,
            branch_id,
            product_id,
            product_name,
            part_number,
            quantity,
            selling_price,
            total
        ) VALUES (
            v_workspace_id,
            v_invoice_id,
            v_branch_id,
            v_prod_id,
            v_prod_name,
            v_part_num,
            v_item_qty,
            v_item_price,
            v_item_total
        );

        -- Deduct stock
        IF v_prod_id IS NOT NULL AND v_item_qty > 0 THEN
            UPDATE public.products
            SET current_stock = GREATEST(0, current_stock - v_item_qty),
                updated_at = NOW()
            WHERE id = v_prod_id AND workspace_id = v_workspace_id;

            INSERT INTO public.stock_movements (
                workspace_id,
                branch_id,
                product_id,
                movement_type,
                quantity,
                source_type,
                source_id,
                reference_number,
                notes
            ) VALUES (
                v_workspace_id,
                v_branch_id,
                v_prod_id,
                'Sale',
                -v_item_qty,
                'INVOICE',
                v_invoice_id,
                v_invoice_number,
                'Invoice Finalization #' || v_invoice_number
            );
        END IF;
    END LOOP;

    -- 7. Record Payment Entry if paid_amount > 0
    IF v_paid_amount > 0 THEN
        INSERT INTO public.payments (
            workspace_id,
            branch_id,
            invoice_id,
            customer_id,
            customer_name,
            amount,
            payment_date,
            method,
            payment_method,
            reference_no,
            reference_number,
            notes
        ) VALUES (
            v_workspace_id,
            v_branch_id,
            v_invoice_id,
            v_customer_id,
            v_customer_name,
            v_paid_amount,
            v_date,
            v_payment_mode,
            v_payment_mode,
            v_payment_ref,
            v_payment_ref,
            COALESCE(v_payment_notes, 'Payment for Invoice #' || v_invoice_number)
        );
    END IF;

    -- 8. Record Daybook Transaction
    INSERT INTO public.daybook_transactions (
        workspace_id,
        branch_id,
        reference_type,
        reference_id,
        reference_number,
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
        description,
        transaction_date
    ) VALUES (
        v_workspace_id,
        v_branch_id,
        'INVOICE',
        v_invoice_id::TEXT,
        v_invoice_number,
        'SALE',
        'IN',
        v_paid_amount,
        v_grand_total,
        v_balance_amount,
        CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
        v_payment_mode,
        'customer',
        v_customer_id::TEXT,
        v_customer_name,
        'Invoice #' || v_invoice_number,
        v_date
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'status', v_status,
        'paid_amount', v_paid_amount,
        'balance_amount', v_balance_amount
    );
END;
$$;

COMMIT;

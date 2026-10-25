-- =============================================================================
-- Migration 074: Fix Daybook Duplicates, Quotation/Invoice Persistence,
--                and Authoritative Financial Reconciliation
-- =============================================================================

BEGIN;

-- 1. Ensure Daybook & Ledger Schema Integrity
ALTER TABLE IF EXISTS public.daybook_transactions
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);

ALTER TABLE IF EXISTS public.invoices
    ADD COLUMN IF NOT EXISTS quotation_id UUID,
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS is_stock_finalized BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.quotations
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS converted_invoice_id UUID,
    ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

-- 2. Performance & Idempotency Indexes
CREATE INDEX IF NOT EXISTS idx_daybook_ws_ref_type_num 
    ON public.daybook_transactions(workspace_id, reference_type, reference_number);

CREATE INDEX IF NOT EXISTS idx_daybook_ws_ref_type_id 
    ON public.daybook_transactions(workspace_id, reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_quotations_ws_branch 
    ON public.quotations(workspace_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_quotations_ws_converted_inv 
    ON public.quotations(workspace_id, converted_invoice_id);

-- 3. Authoritative PostgreSQL RPC: finalize_invoice_transaction
-- Decouples commercial sales volume (total_amount on SALE row) from financial cash inflow (amount on PAYMENT row).
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
    v_payment_id UUID;
    v_existing_daybook_sale RECORD;
    v_existing_daybook_pay RECORD;
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
        v_payment_id := gen_random_uuid();
        INSERT INTO public.payments (
            id,
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
            v_payment_id,
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

        -- Daybook PAYMENT entry representing actual financial cash inflow
        SELECT * INTO v_existing_daybook_pay FROM public.daybook_transactions
        WHERE workspace_id = v_workspace_id
          AND reference_type = 'PAYMENT'
          AND (reference_id = v_payment_id::TEXT OR reference_number = v_invoice_number)
        LIMIT 1;

        IF v_existing_daybook_pay.id IS NULL THEN
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
                'PAYMENT',
                v_payment_id::TEXT,
                v_invoice_number,
                'CUSTOMER_PAYMENT',
                'IN',
                v_paid_amount,
                v_grand_total,
                v_balance_amount,
                CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' ELSE 'PARTIALLY PAID' END,
                v_payment_mode,
                'customer',
                v_customer_id::TEXT,
                v_customer_name,
                'Invoice #' || v_invoice_number,
                v_date
            );
        END IF;
    END IF;

    -- 8. Record Daybook INVOICE Commercial Transaction
    -- CRITICAL ACCOUNTING RULE:
    -- The INVOICE row records commercial transaction total (total_amount = v_grand_total).
    -- Its inflow amount MUST BE 0 when payments exist, preventing duplicate inflow counting!
    SELECT * INTO v_existing_daybook_sale FROM public.daybook_transactions
    WHERE workspace_id = v_workspace_id
      AND reference_type = 'INVOICE'
      AND (reference_id = v_invoice_id::TEXT OR reference_number = v_invoice_number)
    LIMIT 1;

    IF v_existing_daybook_sale.id IS NOT NULL THEN
        UPDATE public.daybook_transactions
        SET amount = 0,
            total_amount = v_grand_total,
            remaining_amount = v_balance_amount,
            payment_status = CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
            payment_mode = v_payment_mode,
            party_name = v_customer_name,
            updated_at = NOW()
        WHERE id = v_existing_daybook_sale.id;
    ELSE
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
            0, -- Authoritative commercial row has 0 cash inflow; PAYMENT row carries the cash inflow
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
    END IF;

    -- If created from quotation, ensure quotation status is updated to Converted
    IF v_quotation_id IS NOT NULL THEN
        UPDATE public.quotations
        SET status = 'Converted',
            converted_invoice_id = v_invoice_id,
            converted_at = NOW(),
            updated_at = NOW()
        WHERE id = v_quotation_id AND workspace_id = v_workspace_id;
    END IF;

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

-- 4. Authoritative PostgreSQL RPC: finalize_counter_sale
-- Ensures counter sale daybook entry records amount = amount_received (not final_total),
-- avoiding false inflow inflation on credit sales.
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
    v_prod_id UUID;
    v_prod_name TEXT;
    v_part_num TEXT;
    v_item_qty NUMERIC(15,2);
    v_item_rate NUMERIC(15,2);
    v_item_amt NUMERIC(15,2);
    v_item_buy_price NUMERIC(15,2);
    v_cur_stock NUMERIC(15,2);

    v_receipt RECORD;
    v_remaining_deduct NUMERIC(15,2);
    v_rec_deduct NUMERIC(15,2);

    v_db_payment_method VARCHAR(50);
    v_is_credit BOOLEAN;
    v_effective_inflow NUMERIC(15,2);
    v_existing_daybook RECORD;
    v_result_sale JSONB;
BEGIN
    -- 1. Resolve Workspace ID & User ID
    v_workspace_id := NULLIF(COALESCE(p_sale->>'workspace_id', p_sale->>'workspaceId', ''), '')::UUID;
    v_user_id := auth.uid();

    IF v_workspace_id IS NULL AND v_user_id IS NOT NULL THEN
        SELECT workspace_id INTO v_workspace_id FROM public.users WHERE id = v_user_id LIMIT 1;
    END IF;

    IF v_workspace_id IS NULL THEN
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

    v_is_credit := (v_db_payment_method = 'Credit / Udhari');
    IF v_is_credit THEN
        v_effective_inflow := 0.00;
        IF v_balance_amount <= 0 THEN v_balance_amount := v_final_total; END IF;
    ELSE
        v_effective_inflow := v_amount_received;
        IF v_amount_received = 0 AND v_balance_amount = 0 THEN
            v_effective_inflow := v_final_total;
            v_amount_received := v_final_total;
        END IF;
    END IF;

    IF jsonb_array_length(v_items_json) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Counter sale must contain at least one line item.';
    END IF;

    -- 3. Idempotency Check
    SELECT * INTO v_existing_sale
    FROM public.counter_sales
    WHERE workspace_id = v_workspace_id
      AND (
          (sale_number = v_sale_number AND v_sale_number <> '') OR
          (invoice_number = v_invoice_number AND v_invoice_number <> '')
      )
    LIMIT 1;

    IF v_existing_sale.id IS NOT NULL AND v_existing_sale.status = 'COMPLETED' THEN
        RETURN jsonb_build_object(
            'id', v_existing_sale.id,
            'saleNumber', v_existing_sale.sale_number,
            'invoiceNumber', v_existing_sale.invoice_number,
            'status', v_existing_sale.status,
            'idempotent', true
        );
    END IF;

    -- 4. Stock validation
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json)
    LOOP
        v_prod_id := NULLIF(COALESCE(v_item->>'productId', v_item->>'product_id', ''), '')::UUID;
        v_prod_name := COALESCE(v_item->>'productName', v_item->>'product_name', 'Product');
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
    v_counter_sale_id := gen_random_uuid();
    INSERT INTO public.counter_sales (
        id, workspace_id, branch_id, customer_id, sale_number, invoice_number,
        customer_name, phone_number, sale_date, estimate_reference,
        subtotal, discount_type, discount_value, discount_amount, final_total,
        status, payment_method, amount_received, balance_amount,
        payment_reference, payment_notes, notes, created_by
    ) VALUES (
        v_counter_sale_id, v_workspace_id, v_branch_id, v_customer_id, v_sale_number, v_invoice_number,
        v_customer_name, v_phone_number, v_sale_date, v_estimate_ref,
        v_subtotal, v_discount_type, v_discount_val, v_discount_amt, v_final_total,
        'COMPLETED', v_db_payment_method, v_amount_received, v_balance_amount,
        v_payment_ref, v_payment_notes, v_notes, v_user_id
    );

    -- 6. Insert Line Items & Deduct Stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json)
    LOOP
        v_prod_id   := NULLIF(COALESCE(v_item->>'productId', v_item->>'product_id', ''), '')::UUID;
        v_prod_name := COALESCE(v_item->>'productName', v_item->>'product_name', 'Product');
        v_part_num  := COALESCE(v_item->>'partNumber', v_item->>'part_number', '');
        v_item_qty  := ABS(COALESCE((v_item->>'quantity')::NUMERIC, 0.00));
        v_item_rate := COALESCE((v_item->>'rate')::NUMERIC, (v_item->>'price')::NUMERIC, 0.00);
        v_item_amt  := COALESCE((v_item->>'amount')::NUMERIC, (v_item_qty * v_item_rate));
        v_item_buy_price := COALESCE((v_item->>'buyPrice')::NUMERIC, (v_item->>'buy_price')::NUMERIC, 0.00);

        INSERT INTO public.counter_sale_items (
            counter_sale_id, branch_id, product_id, product_name_snapshot,
            part_number_snapshot, quantity, rate, amount, buy_price_snapshot
        ) VALUES (
            v_counter_sale_id, v_branch_id, v_prod_id, v_prod_name,
            v_part_num, v_item_qty, v_item_rate, v_item_amt, v_item_buy_price
        );

        IF v_prod_id IS NOT NULL AND v_item_qty > 0 THEN
            UPDATE public.products
            SET current_stock = GREATEST(0, current_stock - v_item_qty),
                updated_at = NOW()
            WHERE id = v_prod_id AND workspace_id = v_workspace_id;

            INSERT INTO public.stock_movements (
                workspace_id, branch_id, product_id, movement_type, quantity,
                source_type, source_id, reference_number, notes
            ) VALUES (
                v_workspace_id, v_branch_id, v_prod_id, 'Sale', -v_item_qty,
                'COUNTER_SALE', v_counter_sale_id, v_invoice_number,
                'Counter Sale #' || v_invoice_number
            );
        END IF;
    END LOOP;

    -- 7. Record Daybook Financial Journal
    -- Inflow amount represents actual money collected (v_effective_inflow); total_amount holds commercial total.
    SELECT * INTO v_existing_daybook FROM public.daybook_transactions
    WHERE workspace_id = v_workspace_id
      AND reference_type = 'COUNTER_SALE'
      AND (reference_id = v_counter_sale_id::TEXT OR reference_number = v_invoice_number OR reference_number = v_sale_number)
    LIMIT 1;

    IF v_existing_daybook.id IS NOT NULL THEN
        UPDATE public.daybook_transactions
        SET amount = v_effective_inflow,
            total_amount = v_final_total,
            remaining_amount = v_balance_amount,
            payment_status = CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' WHEN v_effective_inflow > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
            payment_mode = v_db_payment_method,
            updated_at = NOW()
        WHERE id = v_existing_daybook.id;
    ELSE
        INSERT INTO public.daybook_transactions (
            workspace_id, branch_id, transaction_date, transaction_type, reference_type, reference_id,
            reference_number, entity_name, description, amount, total_amount, remaining_amount,
            payment_status, payment_mode, is_inflow, created_by
        ) VALUES (
            v_workspace_id, v_branch_id, v_sale_date, 'SALE', 'COUNTER_SALE', v_counter_sale_id::TEXT,
            v_invoice_number, v_customer_name,
            'Counter Sale #' || v_invoice_number || ' (' || v_db_payment_method || ')',
            v_effective_inflow, v_final_total, v_balance_amount,
            CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' WHEN v_effective_inflow > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
            v_db_payment_method,
            TRUE, v_user_id
        );
    END IF;

    RETURN jsonb_build_object(
        'id', v_counter_sale_id,
        'workspaceId', v_workspace_id,
        'branchId', v_branch_id,
        'saleNumber', v_sale_number,
        'invoiceNumber', v_invoice_number,
        'customerName', v_customer_name,
        'finalTotal', v_final_total,
        'amountReceived', v_effective_inflow,
        'balanceAmount', v_balance_amount,
        'status', 'COMPLETED',
        'success', true
    );
END;
$$;

-- 5. Authoritative PostgreSQL RPC: reconcile_quotation_conversions
CREATE OR REPLACE FUNCTION public.reconcile_quotation_conversions(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ws_id UUID := p_workspace_id;
    v_inv RECORD;
    v_fixed_daybook INT := 0;
    v_fixed_cashbook INT := 0;
    v_fixed_udhari INT := 0;
BEGIN
    IF v_ws_id IS NULL THEN
        v_ws_id := public.current_user_workspace_id();
    END IF;

    IF v_ws_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Workspace ID required');
    END IF;

    -- Iterate over all invoices created from quotations
    FOR v_inv IN
        SELECT i.*, q.quotation_number
        FROM public.invoices i
        LEFT JOIN public.quotations q ON q.id = i.quotation_id
        WHERE i.workspace_id = v_ws_id AND i.quotation_id IS NOT NULL
    LOOP
        -- Check if Daybook transaction exists
        IF NOT EXISTS (
            SELECT 1 FROM public.daybook_transactions
            WHERE workspace_id = v_ws_id
              AND reference_type = 'INVOICE'
              AND (reference_id = v_inv.id::TEXT OR reference_number = v_inv.invoice_number)
        ) THEN
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
                status,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(),
                v_ws_id,
                v_inv.branch_id,
                'ACC-' || v_inv.invoice_number,
                v_inv.date,
                'SALE',
                'IN',
                0, -- Commercial volume only; payments carry inflow
                v_inv.grand_total,
                COALESCE(v_inv.balance_amount, v_inv.grand_total - COALESCE(v_inv.paid_amount, 0)),
                CASE WHEN v_inv.balance_amount <= 0.01 THEN 'PAID' WHEN v_inv.paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
                'Cash',
                'customer',
                v_inv.customer_id,
                v_inv.customer_name,
                'INVOICE',
                v_inv.id::TEXT,
                v_inv.invoice_number,
                'Invoice #' || v_inv.invoice_number || ' (Quotation #' || COALESCE(v_inv.quotation_number, '') || ')',
                'COMPLETED',
                NOW(),
                NOW()
            );
            v_fixed_daybook := v_fixed_daybook + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'fixed_daybook', v_fixed_daybook,
        'fixed_cashbook', v_fixed_cashbook,
        'fixed_udhari', v_fixed_udhari
    );
END;
$$;

-- 6. Safe & Auditable Historical Daybook Deduplication Procedure
CREATE OR REPLACE FUNCTION public.reconcile_historical_financial_records(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ws_id UUID := p_workspace_id;
    v_inflow_reconciled INT := 0;
    v_exact_duplicates_purged INT := 0;
    v_r RECORD;
BEGIN
    IF v_ws_id IS NULL THEN
        v_ws_id := public.current_user_workspace_id();
    END IF;

    IF v_ws_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Workspace ID required');
    END IF;

    -- 1. Reconcile double-counted upfront invoice payments:
    -- If a SALE row for an INVOICE has amount > 0, but a corresponding PAYMENT row exists,
    -- set the SALE row amount to 0 (commercial total preserved in total_amount).
    WITH matching_payments AS (
        SELECT DISTINCT LOWER(TRIM(reference_number)) AS ref_num
        FROM public.daybook_transactions
        WHERE workspace_id = v_ws_id
          AND (reference_type = 'PAYMENT' OR transaction_type = 'CUSTOMER_PAYMENT')
          AND reference_number IS NOT NULL
    )
    UPDATE public.daybook_transactions dt
    SET amount = 0,
        updated_at = NOW()
    FROM matching_payments mp
    WHERE dt.workspace_id = v_ws_id
      AND dt.reference_type = 'INVOICE'
      AND LOWER(TRIM(dt.reference_number)) = mp.ref_num
      AND dt.amount > 0;

    GET DIAGNOSTICS v_inflow_reconciled = ROW_COUNT;

    -- 2. Deduplicate exact duplicate daybook rows (same workspace, same reference_type, same reference_number, same amount)
    -- Keeping the row with the lowest id (earliest created)
    WITH ranked_duplicates AS (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY workspace_id, reference_type, LOWER(TRIM(reference_number)), transaction_type, amount, direction
                   ORDER BY created_at ASC, id ASC
               ) AS rnum
        FROM public.daybook_transactions
        WHERE workspace_id = v_ws_id
          AND reference_number IS NOT NULL
          AND reference_type IS NOT NULL
    )
    DELETE FROM public.daybook_transactions
    WHERE id IN (
        SELECT id FROM ranked_duplicates WHERE rnum > 1
    );

    GET DIAGNOSTICS v_exact_duplicates_purged = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'inflow_reconciled_count', v_inflow_reconciled,
        'exact_duplicates_purged', v_exact_duplicates_purged
    );
END;
$$;

-- 7. Grant Privileges
GRANT EXECUTE ON FUNCTION public.finalize_invoice_transaction(JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_counter_sale(JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_quotation_conversions(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_historical_financial_records(UUID) TO authenticated, service_role;

COMMIT;

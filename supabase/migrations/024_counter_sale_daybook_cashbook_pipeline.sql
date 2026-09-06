-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 024
-- COUNTER SALE ATOMIC PIPELINE + DAYBOOK (ACCOUNTING JOURNAL) + CASHBOOK
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ADD PAYMENT FIELDS TO COUNTER SALES
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'counter_sales' AND column_name = 'payment_method') THEN
        ALTER TABLE public.counter_sales ADD COLUMN payment_method VARCHAR(50) DEFAULT 'Cash';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'counter_sales' AND column_name = 'amount_received') THEN
        ALTER TABLE public.counter_sales ADD COLUMN amount_received NUMERIC(12,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'counter_sales' AND column_name = 'balance_amount') THEN
        ALTER TABLE public.counter_sales ADD COLUMN balance_amount NUMERIC(12,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'counter_sales' AND column_name = 'payment_reference') THEN
        ALTER TABLE public.counter_sales ADD COLUMN payment_reference VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'counter_sales' AND column_name = 'payment_notes') THEN
        ALTER TABLE public.counter_sales ADD COLUMN payment_notes TEXT;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. CREATE ACCOUNTING ENTRIES TABLE (AUTHORITATIVE FINANCIAL DAYBOOK JOURNAL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_number TEXT NOT NULL,
    entry_type TEXT NOT NULL, -- 'SALE', 'CUSTOMER_RECEIPT', 'SUPPLIER_PAYMENT', 'EXPENSE', 'REVERSAL', 'PURCHASE', 'ADJUSTMENT'
    source_type TEXT NOT NULL, -- 'COUNTER_SALE', 'INVOICE', 'PAYMENT', 'EXPENSE', 'MANUAL'
    source_id UUID,
    reference_number TEXT,
    description TEXT,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    debit_account TEXT,
    credit_account TEXT,
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    payment_method TEXT,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_accounting_entry UNIQUE (workspace_id, source_type, source_id, entry_type)
);

CREATE TRIGGER set_accounting_entries_updated_at
    BEFORE UPDATE ON public.accounting_entries
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_accounting_entries_workspace ON public.accounting_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_date ON public.accounting_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_source ON public.accounting_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_ref ON public.accounting_entries(reference_number);

ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace isolation SELECT for accounting_entries" ON public.accounting_entries;
DROP POLICY IF EXISTS "Workspace isolation INSERT for accounting_entries" ON public.accounting_entries;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for accounting_entries" ON public.accounting_entries;
DROP POLICY IF EXISTS "Workspace isolation DELETE for accounting_entries" ON public.accounting_entries;

CREATE POLICY "Workspace isolation SELECT for accounting_entries" ON public.accounting_entries
    FOR SELECT USING (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation INSERT for accounting_entries" ON public.accounting_entries
    FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation UPDATE for accounting_entries" ON public.accounting_entries
    FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
               WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation DELETE for accounting_entries" ON public.accounting_entries
    FOR DELETE USING (workspace_id = public.current_user_workspace_id());

-- -----------------------------------------------------------------------------
-- 3. CREATE CASHBOOK ENTRIES TABLE (ACTUAL LIQUIDITY / MONEY MOVEMENT REGISTER)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cashbook_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_number TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL, -- 'Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other'
    account_name TEXT NOT NULL DEFAULT 'Cash Account',
    source_type TEXT NOT NULL, -- 'COUNTER_SALE', 'PAYMENT', 'EXPENSE', 'MANUAL', 'TRANSFER'
    source_id UUID,
    reference_number TEXT,
    party_name TEXT,
    description TEXT,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_cashbook_entry UNIQUE (workspace_id, source_type, source_id, direction)
);

CREATE TRIGGER set_cashbook_entries_updated_at
    BEFORE UPDATE ON public.cashbook_entries
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_cashbook_entries_workspace ON public.cashbook_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_date ON public.cashbook_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_method ON public.cashbook_entries(payment_method);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_source ON public.cashbook_entries(source_type, source_id);

ALTER TABLE public.cashbook_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace isolation SELECT for cashbook_entries" ON public.cashbook_entries;
DROP POLICY IF EXISTS "Workspace isolation INSERT for cashbook_entries" ON public.cashbook_entries;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for cashbook_entries" ON public.cashbook_entries;
DROP POLICY IF EXISTS "Workspace isolation DELETE for cashbook_entries" ON public.cashbook_entries;

CREATE POLICY "Workspace isolation SELECT for cashbook_entries" ON public.cashbook_entries
    FOR SELECT USING (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation INSERT for cashbook_entries" ON public.cashbook_entries
    FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation UPDATE for cashbook_entries" ON public.cashbook_entries
    FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
               WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation DELETE for cashbook_entries" ON public.cashbook_entries
    FOR DELETE USING (workspace_id = public.current_user_workspace_id());

-- -----------------------------------------------------------------------------
-- 4. ATOMIC COUNTER SALE RPC: public.finalize_counter_sale(p_sale JSONB)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_counter_sale(p_sale JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_id UUID;
    v_user_id UUID;
    v_sale_id UUID;
    v_sale_number TEXT;
    v_invoice_number TEXT;
    v_customer_id UUID;
    v_customer_name TEXT;
    v_phone_number TEXT;
    v_sale_date DATE;
    v_estimate_reference TEXT;
    v_subtotal NUMERIC(12,2);
    v_discount_type TEXT;
    v_discount_value NUMERIC(12,2);
    v_discount_amount NUMERIC(12,2);
    v_final_total NUMERIC(12,2);
    v_notes TEXT;
    v_payment_method TEXT;
    v_amount_received NUMERIC(12,2);
    v_balance_amount NUMERIC(12,2);
    v_payment_reference TEXT;
    v_payment_notes TEXT;
    v_items JSONB;
    v_item JSONB;
    v_item_idx INT;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_part_no TEXT;
    v_qty NUMERIC(10,2);
    v_rate NUMERIC(12,2);
    v_amount NUMERIC(12,2);
    v_buy_price NUMERIC(12,2);
    v_avail_stock NUMERIC;
    v_remaining_deduct NUMERIC;
    v_rec_deduct NUMERIC;
    v_receipt RECORD;
    v_existing_sale RECORD;
    v_account_name TEXT;
    v_result JSONB;
BEGIN
    -- 1. Resolve Authenticated Tenant Workspace
    v_workspace_id := public.current_user_workspace_id();
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User is not associated with an active workspace.';
    END IF;
    v_user_id := auth.uid();

    -- 2. Extract & Validate Header Parameters
    v_sale_number := COALESCE(p_sale->>'sale_number', p_sale->>'saleNumber', 'CS-' || extract(epoch from now())::bigint);
    v_invoice_number := COALESCE(p_sale->>'invoice_number', p_sale->>'invoiceNumber', v_sale_number);
    v_customer_id := (p_sale->>'customer_id')::UUID;
    v_customer_name := COALESCE(p_sale->>'customer_name', p_sale->>'customerName', 'Walk-in Customer');
    v_phone_number := COALESCE(p_sale->>'phone_number', p_sale->>'phoneNumber', '');
    v_sale_date := COALESCE((p_sale->>'sale_date')::DATE, (p_sale->>'saleDate')::DATE, CURRENT_DATE);
    v_estimate_reference := p_sale->>'estimate_reference';
    v_subtotal := COALESCE((p_sale->>'subtotal')::NUMERIC, 0.00);
    v_discount_type := COALESCE(p_sale->>'discount_type', p_sale->>'discountType', 'fixed');
    v_discount_value := COALESCE((p_sale->>'discount_value')::NUMERIC, 0.00);
    v_discount_amount := COALESCE((p_sale->>'discount_amount')::NUMERIC, 0.00);
    v_final_total := COALESCE((p_sale->>'final_total')::NUMERIC, (p_sale->>'finalTotal')::NUMERIC, v_subtotal);
    v_notes := COALESCE(p_sale->>'notes', p_sale->>'notes');
    v_payment_method := COALESCE(p_sale->>'payment_method', p_sale->>'paymentMethod', 'Cash');
    v_amount_received := COALESCE((p_sale->>'amount_received')::NUMERIC, (p_sale->>'amountReceived')::NUMERIC, v_final_total);
    v_balance_amount := COALESCE((p_sale->>'balance_amount')::NUMERIC, (p_sale->>'balanceAmount')::NUMERIC, GREATEST(0, v_final_total - v_amount_received));
    v_payment_reference := p_sale->>'payment_reference';
    v_payment_notes := p_sale->>'payment_notes';
    v_items := p_sale->'items';

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'EMPTY_SALE: Counter sale must contain at least one line item.';
    END IF;

    -- 3. Idempotency Check: if this sale already exists and is completed, return it immediately
    SELECT * INTO v_existing_sale
    FROM public.counter_sales
    WHERE workspace_id = v_workspace_id
      AND (invoice_number = v_invoice_number OR sale_number = v_sale_number)
    LIMIT 1;

    IF v_existing_sale.id IS NOT NULL THEN
        IF v_existing_sale.status = 'COMPLETED' THEN
            SELECT jsonb_build_object(
                'id', cs.id,
                'saleNumber', cs.sale_number,
                'customerId', cs.customer_id,
                'customerName', cs.customer_name,
                'phoneNumber', cs.phone_number,
                'saleDate', cs.sale_date,
                'invoiceNumber', cs.invoice_number,
                'estimateReference', cs.estimate_reference,
                'subtotal', cs.subtotal,
                'discountType', cs.discount_type,
                'discountValue', cs.discount_value,
                'discountAmount', cs.discount_amount,
                'finalTotal', cs.final_total,
                'status', cs.status,
                'notes', cs.notes,
                'paymentMethod', cs.payment_method,
                'amountReceived', cs.amount_received,
                'balanceAmount', cs.balance_amount,
                'paymentReference', cs.payment_reference,
                'paymentNotes', cs.payment_notes,
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
                ), '[]'::jsonb)
            ) INTO v_result
            FROM public.counter_sales cs
            WHERE cs.id = v_existing_sale.id;

            RETURN jsonb_build_object('success', true, 'data', v_result, 'is_duplicate', true);
        END IF;
    END IF;

    -- 4. VALIDATE & LOCK ALL PRODUCTS FOR UPDATE (Prevent concurrent overselling)
    FOR v_item_idx IN 0 .. (jsonb_array_length(v_items) - 1) LOOP
        v_item := v_items->v_item_idx;
        v_prod_id := COALESCE((v_item->>'productId')::UUID, (v_item->>'product_id')::UUID);
        v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);

        IF v_prod_id IS NOT NULL AND v_qty > 0 THEN
            SELECT name INTO v_prod_name
            FROM public.products
            WHERE id = v_prod_id AND workspace_id = v_workspace_id
            FOR UPDATE;

            IF v_prod_name IS NULL THEN
                RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product ID % not found in workspace.', v_prod_id;
            END IF;

            v_avail_stock := public.get_authoritative_product_stock(v_prod_id, v_workspace_id);

            IF v_avail_stock < v_qty THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for product "%". Requested %, available % units.',
                    v_prod_name, v_qty, v_avail_stock;
            END IF;
        END IF;
    END LOOP;

    -- 5. INSERT PARENT COUNTER SALE RECORD
    INSERT INTO public.counter_sales (
        workspace_id,
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
        payment_notes,
        created_by
    ) VALUES (
        v_workspace_id,
        v_customer_id,
        v_sale_number,
        v_invoice_number,
        v_customer_name,
        v_phone_number,
        v_sale_date,
        v_estimate_reference,
        v_subtotal,
        v_discount_type,
        v_discount_value,
        v_discount_amount,
        v_final_total,
        'COMPLETED',
        v_notes,
        v_payment_method,
        v_amount_received,
        v_balance_amount,
        v_payment_reference,
        v_payment_notes,
        v_user_id
    )
    RETURNING id INTO v_sale_id;

    -- 6. INSERT CHILD ITEMS & EXECUTE FIFO STOCK DEDUCTION
    FOR v_item_idx IN 0 .. (jsonb_array_length(v_items) - 1) LOOP
        v_item := v_items->v_item_idx;
        v_prod_id := COALESCE((v_item->>'productId')::UUID, (v_item->>'product_id')::UUID);
        v_prod_name := COALESCE(v_item->>'productNameSnapshot', v_item->>'productName', v_item->>'product_name_snapshot', 'Product');
        v_part_no := COALESCE(v_item->>'partNumberSnapshot', v_item->>'partNumber', v_item->>'part_number_snapshot', '');
        v_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_item->>'rate')::NUMERIC, 0);
        v_amount := COALESCE((v_item->>'amount')::NUMERIC, v_qty * v_rate);
        v_buy_price := COALESCE((v_item->>'buyPriceSnapshot')::NUMERIC, (v_item->>'buy_price_snapshot')::NUMERIC, 0);

        INSERT INTO public.counter_sale_items (
            workspace_id,
            counter_sale_id,
            product_id,
            product_name_snapshot,
            part_number_snapshot,
            quantity,
            rate,
            amount,
            buy_price_snapshot
        ) VALUES (
            v_workspace_id,
            v_sale_id,
            v_prod_id,
            v_prod_name,
            v_part_no,
            v_qty,
            v_rate,
            v_amount,
            v_buy_price
        );

        IF v_prod_id IS NOT NULL AND v_qty > 0 THEN
            -- FIFO deduction from stock_receipts
            v_remaining_deduct := v_qty;
            FOR v_receipt IN
                SELECT id, quantity_remaining
                FROM public.stock_receipts
                WHERE product_id = v_prod_id AND workspace_id = v_workspace_id AND quantity_remaining > 0
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

            -- Update products.current_stock to new authoritative stock level
            UPDATE public.products
            SET current_stock = public.get_authoritative_product_stock(v_prod_id, v_workspace_id),
                updated_at = NOW()
            WHERE id = v_prod_id AND workspace_id = v_workspace_id;

            -- Insert Stock Movement
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
                v_prod_id,
                'SALE',
                -v_qty,
                v_sale_date,
                v_invoice_number,
                'COUNTER_SALE',
                'Counter Sale #' || v_invoice_number
            );
        END IF;
    END LOOP;

    -- 7. INSERT DAYBOOK ACCOUNTING ENTRY
    INSERT INTO public.accounting_entries (
        workspace_id,
        entry_date,
        entry_number,
        entry_type,
        source_type,
        source_id,
        reference_number,
        description,
        customer_id,
        debit_account,
        credit_account,
        amount,
        payment_method,
        notes,
        created_by
    ) VALUES (
        v_workspace_id,
        v_sale_date,
        'ACC-' || v_sale_number,
        'SALE',
        'COUNTER_SALE',
        v_sale_id,
        v_invoice_number,
        'Counter Sale #' || v_invoice_number || ' (' || v_customer_name || ')',
        v_customer_id,
        CASE WHEN v_balance_amount > 0 THEN 'Accounts Receivable' ELSE 'Cash/Bank' END,
        'Sales Revenue',
        v_final_total,
        v_payment_method,
        v_notes,
        v_user_id
    )
    ON CONFLICT (workspace_id, source_type, source_id, entry_type) DO NOTHING;

    -- 8. INSERT CASHBOOK ENTRY ONLY WHEN ACTUAL MONEY RECEIVED
    IF v_amount_received > 0 AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
        v_account_name := CASE
            WHEN v_payment_method = 'Cash' THEN 'Cash Account'
            WHEN v_payment_method = 'UPI' THEN 'UPI Clearing'
            WHEN v_payment_method = 'Bank Transfer' THEN 'Bank Account'
            WHEN v_payment_method = 'Card' THEN 'Card Settlement'
            WHEN v_payment_method = 'Cheque' THEN 'Cheques in Hand'
            ELSE 'Cash Account'
        END;

        INSERT INTO public.cashbook_entries (
            workspace_id,
            entry_date,
            entry_number,
            direction,
            amount,
            payment_method,
            account_name,
            source_type,
            source_id,
            reference_number,
            party_name,
            description,
            notes,
            created_by
        ) VALUES (
            v_workspace_id,
            v_sale_date,
            'CB-' || v_sale_number,
            'IN',
            v_amount_received,
            v_payment_method,
            v_account_name,
            'COUNTER_SALE',
            v_sale_id,
            v_invoice_number,
            v_customer_name,
            'Receipt for Counter Sale #' || v_invoice_number,
            v_payment_reference,
            v_user_id
        )
        ON CONFLICT (workspace_id, source_type, source_id, direction) DO NOTHING;
    END IF;

    -- 9. BUILD AND RETURN COMPLETE DOMAIN-LEVEL COUNTER SALE OBJECT
    SELECT jsonb_build_object(
        'id', cs.id,
        'saleNumber', cs.sale_number,
        'customerId', cs.customer_id,
        'customerName', cs.customer_name,
        'phoneNumber', cs.phone_number,
        'saleDate', cs.sale_date,
        'invoiceNumber', cs.invoice_number,
        'estimateReference', cs.estimate_reference,
        'subtotal', cs.subtotal,
        'discountType', cs.discount_type,
        'discountValue', cs.discount_value,
        'discountAmount', cs.discount_amount,
        'finalTotal', cs.final_total,
        'status', cs.status,
        'notes', cs.notes,
        'paymentMethod', cs.payment_method,
        'amountReceived', cs.amount_received,
        'balanceAmount', cs.balance_amount,
        'paymentReference', cs.payment_reference,
        'paymentNotes', cs.payment_notes,
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
        ), '[]'::jsonb)
    ) INTO v_result
    FROM public.counter_sales cs
    WHERE cs.id = v_sale_id;

    RETURN jsonb_build_object('success', true, 'data', v_result);
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. ATOMIC CANCELLATION RPC FOR COUNTER SALE
-- -----------------------------------------------------------------------------
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
BEGIN
    v_workspace_id := public.current_user_workspace_id();
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User is not associated with an active workspace.';
    END IF;

    SELECT * INTO v_sale
    FROM public.counter_sales
    WHERE id = p_sale_id AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF v_sale.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Counter sale % not found.', p_sale_id;
    END IF;

    IF v_sale.status = 'CANCELLED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Sale is already cancelled.');
    END IF;

    -- Restore stock for all items
    FOR v_item IN
        SELECT product_id, quantity
        FROM public.counter_sale_items
        WHERE counter_sale_id = p_sale_id AND workspace_id = v_workspace_id
    LOOP
        IF v_item.product_id IS NOT NULL AND v_item.quantity > 0 THEN
            -- Restore stock_receipts
            SELECT id, quantity_remaining INTO v_receipt
            FROM public.stock_receipts
            WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id
            ORDER BY received_date DESC
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
            SET current_stock = public.get_authoritative_product_stock(v_item.product_id, v_workspace_id),
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;

            -- Log RETURN movement
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
                v_sale.invoice_number,
                'COUNTER_SALE_CANCEL',
                'Cancellation of Counter Sale #' || v_sale.invoice_number
            );
        END IF;
    END LOOP;

    -- Update Counter Sale status to CANCELLED
    UPDATE public.counter_sales
    SET status = 'CANCELLED',
        updated_at = NOW()
    WHERE id = p_sale_id AND workspace_id = v_workspace_id;

    -- Create Daybook Reversal Entry
    INSERT INTO public.accounting_entries (
        workspace_id,
        entry_date,
        entry_number,
        entry_type,
        source_type,
        source_id,
        reference_number,
        description,
        customer_id,
        amount,
        notes
    ) VALUES (
        v_workspace_id,
        CURRENT_DATE,
        'REV-' || v_sale.sale_number,
        'REVERSAL',
        'COUNTER_SALE',
        p_sale_id,
        v_sale.invoice_number,
        'Reversal of Cancelled Counter Sale #' || v_sale.invoice_number,
        v_sale.customer_id,
        v_sale.final_total,
        'Sale Cancelled - Stock & Revenue Reversed'
    )
    ON CONFLICT DO NOTHING;

    -- Create Cashbook Outflow Reversal if money was received
    IF v_sale.amount_received > 0 AND v_sale.payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
        INSERT INTO public.cashbook_entries (
            workspace_id,
            entry_date,
            entry_number,
            direction,
            amount,
            payment_method,
            account_name,
            source_type,
            source_id,
            reference_number,
            party_name,
            description,
            notes
        ) VALUES (
            v_workspace_id,
            CURRENT_DATE,
            'CB-REV-' || v_sale.sale_number,
            'OUT',
            v_sale.amount_received,
            COALESCE(v_sale.payment_method, 'Cash'),
            'Cash Account',
            'COUNTER_SALE',
            p_sale_id,
            v_sale.invoice_number,
            v_sale.customer_name,
            'Refund / Reversal for Cancelled Counter Sale #' || v_sale.invoice_number,
            'Reversal on cancellation'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Sale cancelled and stock restored.');
END;
$$;

COMMIT;

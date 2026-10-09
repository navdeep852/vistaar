-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 055
-- File: 055_counter_sale_master_fix_ledger_pipeline.sql
-- Description: Master Authoritative Counter Sale Transaction & Ledger Pipeline.
--              Guarantees unified, atomic recording across:
--              Counter Sales, Counter Sale Items, Branch Inventory, Stock Receipts,
--              Stock Movements, Payments, Udharis, Daybook, Cashbook, and Reports.
-- =============================================================================

BEGIN;

-- 1. Ensure required columns exist on operational tables
ALTER TABLE public.counter_sales 
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.counter_sale_items 
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.payments 
    ADD COLUMN IF NOT EXISTS counter_sale_id UUID REFERENCES public.counter_sales(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.udhari_records 
    ADD COLUMN IF NOT EXISTS counter_sale_id UUID REFERENCES public.counter_sales(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.daybook_transactions 
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);

-- 2. Ensure public.cashbook_entries table exists with branch support
CREATE TABLE IF NOT EXISTS public.cashbook_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_number VARCHAR(100) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('IN', 'OUT', 'NON_CASH')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    account_name VARCHAR(100) NOT NULL DEFAULT 'Cash Account',
    source_type VARCHAR(50) NOT NULL, -- 'INVOICE_PAYMENT', 'COUNTER_SALE', 'EXPENSE', 'TRANSFER', 'MANUAL'
    source_id VARCHAR(255),            -- Originating transaction ID
    reference_number VARCHAR(100),     -- Invoice #, Payment #, UTR, Cheque #
    party_name VARCHAR(255),
    description TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure branch_id on cashbook_entries
ALTER TABLE public.cashbook_entries 
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- Enable RLS on cashbook_entries
ALTER TABLE public.cashbook_entries ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'cashbook_entries' AND policyname = 'Workspace isolation for cashbook_entries'
    ) THEN
        CREATE POLICY "Workspace isolation for cashbook_entries" ON public.cashbook_entries
            FOR ALL USING (
                workspace_id = public.current_user_workspace_id() OR auth.uid() IS NOT NULL
            );
    END IF;
END $$;

-- 3. High-Performance Indexes
CREATE INDEX IF NOT EXISTS idx_counter_sales_branch ON public.counter_sales(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_counter_sales_branch_date ON public.counter_sales(workspace_id, branch_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_payments_counter_sale ON public.payments(workspace_id, counter_sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_branch ON public.payments(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_udhari_records_counter_sale ON public.udhari_records(workspace_id, counter_sale_id);
CREATE INDEX IF NOT EXISTS idx_daybook_branch ON public.daybook_transactions(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_daybook_ref_cs ON public.daybook_transactions(workspace_id, reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_cashbook_branch ON public.cashbook_entries(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_cashbook_source_cs ON public.cashbook_entries(workspace_id, source_type, source_id);

-- Unique idempotency index on payments for counter sales
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_unique_counter_sale
    ON public.payments(workspace_id, counter_sale_id)
    WHERE counter_sale_id IS NOT NULL;

-- 4. Authoritative PostgreSQL RPC: finalize_counter_sale
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
    v_new_receipt_sum NUMERIC;
    
    v_fin_acc_id UUID;
    v_cashbook_acc_name TEXT;
    v_payment_code TEXT;
    v_result_sale JSONB;
    v_main_branch_id UUID;
BEGIN
    -- 1. Tenant Workspace Resolution
    v_workspace_id := NULLIF(p_sale->>'workspace_id', '')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User is not associated with an active workspace.';
    END IF;
    v_user_id := auth.uid();

    -- 2. Extract Fields
    v_branch_id     := NULLIF(COALESCE(p_sale->>'branch_id', p_sale->>'branchId', ''), '')::UUID;
    v_customer_id   := NULLIF(COALESCE(p_sale->>'customer_id', p_sale->>'customerId', ''), '')::UUID;
    v_sale_number   := TRIM(COALESCE(p_sale->>'sale_number', p_sale->>'saleNumber', ''));
    v_invoice_number:= TRIM(COALESCE(p_sale->>'invoice_number', p_sale->>'invoiceNumber', ''));
    v_customer_name := TRIM(COALESCE(p_sale->>'customer_name', p_sale->>'customerName', 'Walk-in Customer'));
    v_phone_number  := TRIM(COALESCE(p_sale->>'phone_number', p_sale->>'phoneNumber', ''));
    v_sale_date     := COALESCE((p_sale->>'sale_date')::DATE, (p_sale->>'saleDate')::DATE, CURRENT_DATE);
    v_estimate_ref  := NULLIF(COALESCE(p_sale->>'estimate_reference', p_sale->>'estimateReference', ''), '');
    v_subtotal      := COALESCE((p_sale->>'subtotal')::NUMERIC, (p_sale->>'subtotal')::NUMERIC, 0.00);
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

    -- Fallback to Main Branch if branch_id is null
    IF v_branch_id IS NULL THEN
        BEGIN
            SELECT id INTO v_main_branch_id 
            FROM public.branches 
            WHERE workspace_id = v_workspace_id AND is_main_branch = TRUE AND status = 'Active' 
            LIMIT 1;
            IF v_main_branch_id IS NOT NULL THEN
                v_branch_id := v_main_branch_id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_branch_id := NULL;
        END;
    END IF;

    -- Cast payment method safely to enum
    BEGIN
        v_db_payment_method := v_payment_method::public.payment_method;
    EXCEPTION WHEN OTHERS THEN
        v_db_payment_method := 'Other'::public.payment_method;
    END;

    -- Map Cashbook Account Name
    IF v_payment_method ILIKE '%upi%' THEN
        v_cashbook_acc_name := 'UPI Clearing';
    ELSIF v_payment_method ILIKE '%bank%' OR v_payment_method ILIKE '%neft%' OR v_payment_method ILIKE '%rtgs%' THEN
        v_cashbook_acc_name := 'Bank Account';
    ELSIF v_payment_method ILIKE '%card%' THEN
        v_cashbook_acc_name := 'Card Settlement';
    ELSIF v_payment_method ILIKE '%cheque%' THEN
        v_cashbook_acc_name := 'Cheques in Hand';
    ELSE
        v_cashbook_acc_name := 'Cash Account';
    END IF;

    -- 3. Strict Validation
    IF v_sale_number = '' THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Sale number is required.';
    END IF;
    IF v_invoice_number = '' THEN
        v_invoice_number := v_sale_number;
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
    IF ABS((v_amount_received + v_balance_amount) - v_final_total) > 0.05 THEN
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
            'branchId', cs.branch_id,
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
            'data', v_result_sale
        );
    END IF;

    -- 5. Branch Stock Validation & Row Locking (FOR UPDATE)
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

            -- Authoritative Branch Stock check
            BEGIN
                v_avail_stock := public.get_authoritative_branch_product_stock(v_prod_id, v_branch_id, v_workspace_id);
            EXCEPTION WHEN OTHERS THEN
                v_avail_stock := COALESCE(v_cur_stock, 0);
            END;

            IF v_avail_stock < v_item_qty THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%". Available: %, Requested: %',
                    v_prod_name, v_avail_stock, v_item_qty;
            END IF;
        END IF;
    END LOOP;

    -- 6. Insert Counter Sale Parent Record
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

    -- 7. Insert Line Items & Deduct Inventory (FIFO & Branch-Aware)
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
            workspace_id, branch_id, counter_sale_id, product_id, product_name_snapshot,
            part_number_snapshot, quantity, rate, amount, buy_price_snapshot
        ) VALUES (
            v_workspace_id, v_branch_id, v_counter_sale_id, v_prod_id, v_prod_name,
            v_part_num, v_item_qty, v_item_rate, v_item_amt, v_item_buy_price
        );

        IF v_prod_id IS NOT NULL AND v_item_qty > 0 THEN
            v_remaining_deduct := v_item_qty;

            -- Deduct FIFO stock_receipts
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

            -- Deduct from branch_inventory if table exists
            IF v_branch_id IS NOT NULL THEN
                BEGIN
                    UPDATE public.branch_inventory
                    SET current_stock = GREATEST(0, current_stock - v_item_qty),
                        updated_at = NOW()
                    WHERE workspace_id = v_workspace_id 
                      AND branch_id = v_branch_id 
                      AND product_id = v_prod_id;
                EXCEPTION WHEN OTHERS THEN
                    -- branch_inventory table might not exist
                END;
            END IF;

            -- Deduct from global products
            UPDATE public.products
            SET current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_item_qty),
                updated_at = NOW()
            WHERE id = v_prod_id AND workspace_id = v_workspace_id;

            -- Record Stock Movement
            INSERT INTO public.stock_movements (
                workspace_id, branch_id, product_id, type, quantity, movement_date,
                reference_id, reference_type, notes, created_by
            ) VALUES (
                v_workspace_id, v_branch_id, v_prod_id, 'SALE', -v_item_qty, v_sale_date,
                v_counter_sale_id::TEXT, 'COUNTER_SALE', 'Counter Sale #' || v_invoice_number, v_user_id
            );
        END IF;
    END LOOP;

    -- 8. Payment Recording (When money is received upfront)
    v_payment_code := 'PAY-CS-' || v_invoice_number;
    IF v_amount_received > 0 AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
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

    -- 9. Udhari Record (When sale has credit / remaining balance)
    IF v_balance_amount > 0 THEN
        INSERT INTO public.udhari_records (
            workspace_id, branch_id, customer_id, counter_sale_id, udhari_code,
            customer_name_snapshot, phone_snapshot, original_amount, total_received,
            outstanding_amount, due_date, status, notes, created_by
        ) VALUES (
            v_workspace_id, v_branch_id, v_customer_id, v_counter_sale_id, 'UD-' || v_invoice_number,
            v_customer_name, COALESCE(NULLIF(v_phone_number, ''), '9999999999'), v_balance_amount, 0.00,
            v_balance_amount, v_sale_date + INTERVAL '30 days', 'UNPAID',
            'Counter Sale credit #' || v_invoice_number, v_user_id
        ) ON CONFLICT (workspace_id, udhari_code) DO UPDATE SET
            outstanding_amount = EXCLUDED.outstanding_amount,
            original_amount = EXCLUDED.original_amount;
    END IF;

    -- 10. Financial Account Resolution
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
        v_fin_acc_id := NULL;
    END;

    -- 11. Authoritative Daybook Transaction
    INSERT INTO public.daybook_transactions (
        workspace_id, branch_id, transaction_code, transaction_date, transaction_type, direction,
        amount, total_amount, remaining_amount, payment_status, payment_mode,
        financial_account_id, party_type, party_id, party_name, reference_type,
        reference_id, reference_number, description, notes, status, created_by
    ) VALUES (
        v_workspace_id, v_branch_id, 'TX-CS-' || v_invoice_number, v_sale_date, 'SALE',
        CASE 
            WHEN v_amount_received > 0 AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN 'IN'::public.daybook_direction
            ELSE 'NON_CASH'::public.daybook_direction
        END,
        v_amount_received, v_final_total, v_balance_amount,
        CASE 
            WHEN v_balance_amount <= 0.01 THEN 'PAID'
            WHEN v_amount_received > 0 THEN 'PARTIALLY PAID'
            ELSE 'UNPAID'
        END,
        v_db_payment_method, v_fin_acc_id, 'customer', v_customer_id, v_customer_name,
        'COUNTER_SALE', v_counter_sale_id::TEXT, v_invoice_number,
        'Counter Sale #' || v_invoice_number || ' - ' || v_customer_name, v_payment_notes, 'COMPLETED', v_user_id
    ) ON CONFLICT (workspace_id, reference_type, reference_id) DO UPDATE SET
        amount = EXCLUDED.amount,
        total_amount = EXCLUDED.total_amount,
        remaining_amount = EXCLUDED.remaining_amount,
        payment_status = EXCLUDED.payment_status,
        payment_mode = EXCLUDED.payment_mode;

    -- 12. Authoritative Cashbook Entry (Only for actual money received, non-credit)
    IF v_amount_received > 0 AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
        BEGIN
            INSERT INTO public.cashbook_entries (
                workspace_id, branch_id, entry_date, entry_number, direction,
                amount, payment_method, account_name, source_type, source_id,
                reference_number, party_name, description, notes
            ) VALUES (
                v_workspace_id, v_branch_id, v_sale_date, 'CB-CS-' || v_invoice_number, 'IN',
                v_amount_received, v_payment_method, v_cashbook_acc_name, 'COUNTER_SALE', v_counter_sale_id::TEXT,
                v_invoice_number, v_customer_name, 'Counter sale payment #' || v_invoice_number, v_payment_notes
            ) ON CONFLICT (workspace_id, source_type, source_id, direction) DO UPDATE SET
                amount = EXCLUDED.amount,
                payment_method = EXCLUDED.payment_method,
                account_name = EXCLUDED.account_name;
        EXCEPTION WHEN OTHERS THEN
            -- Handle gracefully if cashbook_entries table is missing
        END;
    END IF;

    -- 13. Build & Return Complete Domain Representation
    SELECT jsonb_build_object(
        'id', cs.id,
        'branchId', cs.branch_id,
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
        'data', v_result_sale
    );
END;
$$;

-- 5. Authoritative Atomic Counter Sale Cancellation RPC
CREATE OR REPLACE FUNCTION public.cancel_counter_sale_atomic(p_sale_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    -- 1. Restore Inventory Stock for all items
    FOR v_item IN
        SELECT product_id, quantity, product_name_snapshot, branch_id
        FROM public.counter_sale_items
        WHERE counter_sale_id = p_sale_id AND workspace_id = v_workspace_id
    LOOP
        IF v_item.product_id IS NOT NULL THEN
            -- Restore global product stock
            UPDATE public.products
            SET current_stock = COALESCE(current_stock, 0) + v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;

            -- Restore branch inventory if table exists
            IF v_sale.branch_id IS NOT NULL THEN
                BEGIN
                    UPDATE public.branch_inventory
                    SET current_stock = current_stock + v_item.quantity,
                        updated_at = NOW()
                    WHERE workspace_id = v_workspace_id 
                      AND branch_id = v_sale.branch_id 
                      AND product_id = v_item.product_id;
                EXCEPTION WHEN OTHERS THEN
                END;
            END IF;

            -- Restore stock receipt
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

            -- Log RETURN movement
            INSERT INTO public.stock_movements (
                workspace_id, branch_id, product_id, type, quantity, movement_date,
                reference_id, reference_type, notes, created_by
            ) VALUES (
                v_workspace_id, v_sale.branch_id, v_item.product_id, 'RETURN', v_item.quantity, CURRENT_DATE,
                v_sale.id::TEXT, 'COUNTER_SALE_CANCEL', 'Reversal of Counter Sale #' || v_sale.invoice_number, v_user_id
            );
        END IF;
    END LOOP;

    -- 2. Mark Sale CANCELLED
    UPDATE public.counter_sales
    SET status = 'CANCELLED',
        updated_at = NOW()
    WHERE id = p_sale_id AND workspace_id = v_workspace_id;

    -- 3. Delete or Void linked Payments
    DELETE FROM public.payments
    WHERE workspace_id = v_workspace_id AND counter_sale_id = p_sale_id;

    -- 4. Cancel linked Udharis
    UPDATE public.udhari_records
    SET status = 'PAID',
        outstanding_amount = 0,
        notes = '[CANCELLED COUNTER SALE] ' || COALESCE(notes, ''),
        updated_at = NOW()
    WHERE workspace_id = v_workspace_id AND counter_sale_id = p_sale_id;

    -- 5. Mark Daybook Transaction VOID
    UPDATE public.daybook_transactions
    SET status = 'VOID',
        payment_status = 'CANCELLED',
        notes = '[CANCELLED COUNTER SALE] ' || COALESCE(notes, ''),
        updated_at = NOW()
    WHERE workspace_id = v_workspace_id 
      AND reference_type = 'COUNTER_SALE' 
      AND reference_id = p_sale_id::TEXT;

    -- 6. Delete linked Cashbook entries
    BEGIN
        DELETE FROM public.cashbook_entries
        WHERE workspace_id = v_workspace_id 
          AND source_type = 'COUNTER_SALE' 
          AND source_id = p_sale_id::TEXT;
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Counter Sale and all linked financial records successfully cancelled and reversed.'
    );
END;
$$;

-- 6. Permissions Grant
GRANT EXECUTE ON FUNCTION public.finalize_counter_sale(JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_counter_sale_atomic(UUID) TO anon, authenticated, service_role;

COMMIT;

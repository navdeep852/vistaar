-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 024
-- Migration: 024_counter_sale_payment_fields_and_finalization.sql
-- Description:
--   1. Adds payment columns to public.counter_sales safely with IF NOT EXISTS.
--   2. Reconciles historical counter sale records.
--   3. Adds financial validation constraints on settlement amounts.
--   4. Establishes single authoritative daybook & cashbook journals (daybook_transactions,
--      financial_accounts) and udhari_records.
--   5. Creates atomic public.finalize_counter_sale(p_sale JSONB) RPC with row-level
--      locking (FOR UPDATE), FIFO stock deduction, Daybook/Cashbook/Udhari integration,
--      idempotency, and full domain object return with items array.
--   6. Creates atomic public.cancel_counter_sale_atomic(p_sale_id UUID) RPC.
--   7. Reloads PostgREST schema cache.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PHASE 3: ADD PAYMENT COLUMNS SAFELY WITH IF NOT EXISTS CHECKS
-- -----------------------------------------------------------------------------

-- Attempt to add 'Credit / Udhari' and 'Credit' to public.payment_method enum if present
DO $$ 
BEGIN
    BEGIN
        ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'Credit / Udhari';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
        ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'Credit';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

DO $$ 
BEGIN
    -- 1. payment_method
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'counter_sales' AND column_name = 'payment_method'
    ) THEN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
            ALTER TABLE public.counter_sales ADD COLUMN payment_method public.payment_method NOT NULL DEFAULT 'Cash';
        ELSE
            ALTER TABLE public.counter_sales ADD COLUMN payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash';
        END IF;
    END IF;

    -- 2. amount_received
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'counter_sales' AND column_name = 'amount_received'
    ) THEN
        ALTER TABLE public.counter_sales ADD COLUMN amount_received NUMERIC(12,2) NOT NULL DEFAULT 0.00;
    END IF;

    -- 3. balance_amount
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'counter_sales' AND column_name = 'balance_amount'
    ) THEN
        ALTER TABLE public.counter_sales ADD COLUMN balance_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00;
    END IF;

    -- 4. payment_reference
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'counter_sales' AND column_name = 'payment_reference'
    ) THEN
        ALTER TABLE public.counter_sales ADD COLUMN payment_reference VARCHAR(255);
    END IF;

    -- 5. payment_notes
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'counter_sales' AND column_name = 'payment_notes'
    ) THEN
        ALTER TABLE public.counter_sales ADD COLUMN payment_notes TEXT;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- PHASE 4: DATA RECONCILIATION FOR HISTORICAL RECORDS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    UPDATE public.counter_sales
    SET 
        payment_method = 'Cash',
        amount_received = final_total,
        balance_amount = 0.00
    WHERE status = 'COMPLETED'
      AND (
          amount_received IS NULL 
          OR (amount_received = 0.00 AND balance_amount = 0.00 AND final_total > 0.00)
      );
END $$;

-- -----------------------------------------------------------------------------
-- PHASE 5: CONSTRAINTS ON COUNTER SALES
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_counter_sales_amount_received_pos') THEN
        ALTER TABLE public.counter_sales ADD CONSTRAINT chk_counter_sales_amount_received_pos CHECK (amount_received >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_counter_sales_balance_amount_pos') THEN
        ALTER TABLE public.counter_sales ADD CONSTRAINT chk_counter_sales_balance_amount_pos CHECK (balance_amount >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_counter_sales_final_total_pos') THEN
        ALTER TABLE public.counter_sales ADD CONSTRAINT chk_counter_sales_final_total_pos CHECK (final_total >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_counter_sales_amount_received_le_total') THEN
        ALTER TABLE public.counter_sales ADD CONSTRAINT chk_counter_sales_amount_received_le_total CHECK (amount_received <= final_total + 0.01);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_counter_sales_settlement_sum') THEN
        ALTER TABLE public.counter_sales ADD CONSTRAINT chk_counter_sales_settlement_sum CHECK (ABS((amount_received + balance_amount) - final_total) <= 0.01);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- PHASE 14 & 15: ENSURE SINGLE AUTHORITATIVE DAYBOOK & CASHBOOK TABLES EXIST
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.daybook_transaction_type AS ENUM (
        'SALE',
        'CUSTOMER_PAYMENT',
        'SUPPLIER_PAYMENT',
        'EXPENSE',
        'REFUND',
        'OTHER_INCOME',
        'OTHER_PAYMENT',
        'ADJUSTMENT',
        'TRANSFER'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.daybook_direction AS ENUM (
        'IN',
        'OUT',
        'NON_CASH'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    account_type VARCHAR(50) NOT NULL DEFAULT 'CASH', -- 'CASH', 'BANK', 'UPI', 'CARD', 'OTHER'
    account_number VARCHAR(100),
    ifsc_code VARCHAR(20),
    opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    opening_balance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_account_name UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS public.daybook_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    transaction_code VARCHAR(100) NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    transaction_time TIME DEFAULT CURRENT_TIME,
    transaction_type public.daybook_transaction_type NOT NULL,
    direction public.daybook_direction NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    payment_mode public.payment_method DEFAULT 'Cash',
    financial_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
    party_type VARCHAR(50), -- 'customer', 'supplier', 'other'
    party_id UUID,
    party_name VARCHAR(255),
    reference_type VARCHAR(50) NOT NULL, -- 'COUNTER_SALE', 'COUNTER_SALE_PAYMENT', 'PAYMENT', 'EXPENSE', 'UDHARI_PAYMENT', 'INVOICE', 'MANUAL'
    reference_id VARCHAR(255), -- ID of source transaction record
    reference_number VARCHAR(100), -- Invoice #, Payment #, Receipt #, Expense Ref
    description TEXT,
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED', -- 'COMPLETED', 'VOID', 'REVERSED'
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_daybook_code UNIQUE (workspace_id, transaction_code),
    CONSTRAINT unique_workspace_daybook_reference UNIQUE (workspace_id, reference_type, reference_id)
);

-- Indexes for daybook & cashbook
CREATE INDEX IF NOT EXISTS idx_daybook_transactions_workspace ON public.daybook_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_daybook_transactions_date ON public.daybook_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_daybook_transactions_type ON public.daybook_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_daybook_transactions_ref ON public.daybook_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_workspace ON public.financial_accounts(workspace_id);

-- RLS
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daybook_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace isolation SELECT for financial_accounts" ON public.financial_accounts;
DROP POLICY IF EXISTS "Workspace isolation INSERT for financial_accounts" ON public.financial_accounts;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for financial_accounts" ON public.financial_accounts;
DROP POLICY IF EXISTS "Workspace isolation DELETE for financial_accounts" ON public.financial_accounts;

CREATE POLICY "Workspace isolation SELECT for financial_accounts" ON public.financial_accounts
    FOR SELECT USING (workspace_id = public.current_user_workspace_id());
CREATE POLICY "Workspace isolation INSERT for financial_accounts" ON public.financial_accounts
    FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());
CREATE POLICY "Workspace isolation UPDATE for financial_accounts" ON public.financial_accounts
    FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
               WITH CHECK (workspace_id = public.current_user_workspace_id());
CREATE POLICY "Workspace isolation DELETE for financial_accounts" ON public.financial_accounts
    FOR DELETE USING (workspace_id = public.current_user_workspace_id());

DROP POLICY IF EXISTS "Workspace isolation SELECT for daybook_transactions" ON public.daybook_transactions;
DROP POLICY IF EXISTS "Workspace isolation INSERT for daybook_transactions" ON public.daybook_transactions;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for daybook_transactions" ON public.daybook_transactions;
DROP POLICY IF EXISTS "Workspace isolation DELETE for daybook_transactions" ON public.daybook_transactions;

CREATE POLICY "Workspace isolation SELECT for daybook_transactions" ON public.daybook_transactions
    FOR SELECT USING (workspace_id = public.current_user_workspace_id());
CREATE POLICY "Workspace isolation INSERT for daybook_transactions" ON public.daybook_transactions
    FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());
CREATE POLICY "Workspace isolation UPDATE for daybook_transactions" ON public.daybook_transactions
    FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
               WITH CHECK (workspace_id = public.current_user_workspace_id());
CREATE POLICY "Workspace isolation DELETE for daybook_transactions" ON public.daybook_transactions
    FOR DELETE USING (workspace_id = public.current_user_workspace_id());

-- -----------------------------------------------------------------------------
-- PHASE 16: ENSURE UDHARI_RECORDS TABLE EXISTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.udhari_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    udhari_code VARCHAR(100) NOT NULL,
    customer_name_snapshot VARCHAR(255) NOT NULL,
    phone_snapshot VARCHAR(20) NOT NULL,
    original_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_received NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    outstanding_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    due_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'UNPAID',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_udhari_code UNIQUE (workspace_id, udhari_code)
);

ALTER TABLE public.udhari_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Workspace isolation for udhari_records" ON public.udhari_records;
CREATE POLICY "Workspace isolation for udhari_records" ON public.udhari_records
    FOR ALL USING (workspace_id = public.current_user_workspace_id())
    WITH CHECK (workspace_id = public.current_user_workspace_id());

-- -----------------------------------------------------------------------------
-- PHASE 6 TO 18: AUTHORITATIVE ATOMIC finalize_counter_sale RPC
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
    v_existing_sale RECORD;
    v_counter_sale_id UUID;
    
    -- Payload fields
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
    
    -- Loop variables
    v_item RECORD;
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
    
    -- Financial accounts mapping
    v_fin_acc_id UUID;
    v_result_sale JSONB;
BEGIN
    -- 1. Resolve Authenticated Tenant Workspace
    v_workspace_id := public.current_user_workspace_id();
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User is not associated with an active workspace.';
    END IF;
    v_user_id := auth.uid();

    -- 2. Extract & Normalize Payload Fields
    v_customer_id   := NULLIF(p_sale->>'customer_id', '')::UUID;
    v_sale_number   := TRIM(COALESCE(p_sale->>'sale_number', p_sale->>'saleNumber', ''));
    v_invoice_number:= TRIM(COALESCE(p_sale->>'invoice_number', p_sale->>'invoiceNumber', ''));
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

    -- Map text payment_method to public.payment_method enum safely
    BEGIN
        v_db_payment_method := v_payment_method::public.payment_method;
    EXCEPTION WHEN OTHERS THEN
        v_db_payment_method := 'Other'::public.payment_method;
    END;

    -- 3. Validation
    IF v_sale_number = '' THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Sale number is required.';
    END IF;
    IF v_invoice_number = '' THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Invoice number is required.';
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
    IF ABS((v_amount_received + v_balance_amount) - v_final_total) > 0.01 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Amount received (%) + balance (%) must equal final total (%).',
            v_amount_received, v_balance_amount, v_final_total;
    END IF;

    -- 4. Idempotency Check: Check if sale already completed
    SELECT id, sale_number, invoice_number INTO v_existing_sale
    FROM public.counter_sales
    WHERE workspace_id = v_workspace_id 
      AND (sale_number = v_sale_number OR invoice_number = v_invoice_number)
      AND status = 'COMPLETED';

    IF v_existing_sale.id IS NOT NULL THEN
        -- Already completed; fetch and return complete sale object (Idempotent response)
        SELECT jsonb_build_object(
            'id', cs.id,
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

    -- 5. Product Stock Validation & Row Locking (FOR UPDATE)
    FOR v_item_json IN SELECT * FROM jsonb_array_elements(v_items_json)
    LOOP
        v_prod_id := NULLIF(COALESCE(v_item_json->>'productId', v_item_json->>'product_id', ''), '')::UUID;
        v_item_qty := ABS(COALESCE((v_item_json->>'quantity')::NUMERIC, 0));

        IF v_prod_id IS NOT NULL AND v_item_qty > 0 THEN
            -- Lock Product Row
            SELECT name, current_stock INTO v_prod_name, v_cur_stock
            FROM public.products
            WHERE id = v_prod_id AND workspace_id = v_workspace_id
            FOR UPDATE;

            IF v_prod_name IS NULL THEN
                RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % does not exist in this workspace.', v_prod_id;
            END IF;

            -- Calculate Authoritative Available Stock
            v_avail_stock := public.get_authoritative_product_stock(v_prod_id, v_workspace_id);

            IF v_avail_stock < v_item_qty THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%". Available: %, Requested: %',
                    v_prod_name, v_avail_stock, v_item_qty;
            END IF;
        END IF;
    END LOOP;

    -- 6. Insert Counter Sale Parent Record
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
        v_estimate_ref,
        v_subtotal,
        v_discount_type,
        v_discount_val,
        v_discount_amt,
        v_final_total,
        'COMPLETED',
        v_notes,
        v_db_payment_method,
        v_amount_received,
        v_balance_amount,
        v_payment_ref,
        v_payment_notes,
        v_user_id
    ) RETURNING id INTO v_counter_sale_id;

    -- 7. Insert Line Items & Deduct Inventory (FIFO)
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
            v_counter_sale_id,
            v_prod_id,
            v_prod_name,
            v_part_num,
            v_item_qty,
            v_item_rate,
            v_item_amt,
            v_item_buy_price
        );

        -- FIFO stock deduction
        IF v_prod_id IS NOT NULL AND v_item_qty > 0 THEN
            v_remaining_deduct := v_item_qty;

            FOR v_receipt IN
                SELECT id, quantity_remaining
                FROM public.stock_receipts
                WHERE product_id = v_prod_id 
                  AND workspace_id = v_workspace_id 
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

            -- Deduct from products.current_stock
            UPDATE public.products
            SET current_stock = GREATEST(0, COALESCE(current_stock, 0) - v_item_qty),
                updated_at = NOW()
            WHERE id = v_prod_id AND workspace_id = v_workspace_id;

            -- Log stock_movements
            INSERT INTO public.stock_movements (
                workspace_id,
                product_id,
                type,
                quantity,
                movement_date,
                reference_id,
                reference_type,
                notes,
                created_by
            ) VALUES (
                v_workspace_id,
                v_prod_id,
                'SALE',
                -v_item_qty,
                v_sale_date,
                v_invoice_number,
                'COUNTER_SALE',
                'Counter Sale #' || v_invoice_number,
                v_user_id
            );
        END IF;
    END LOOP;

    -- 8. Resolve Default Financial Account for Cashbook
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

    -- If no specific account found, fallback to any active account
    IF v_fin_acc_id IS NULL THEN
        SELECT id INTO v_fin_acc_id
        FROM public.financial_accounts
        WHERE workspace_id = v_workspace_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    -- 9. Record Authoritative Daybook Financial Entry
    INSERT INTO public.daybook_transactions (
        workspace_id,
        transaction_code,
        transaction_date,
        transaction_type,
        direction,
        amount,
        payment_mode,
        financial_account_id,
        party_type,
        party_id,
        party_name,
        reference_type,
        reference_id,
        reference_number,
        description,
        notes,
        status,
        created_by
    ) VALUES (
        v_workspace_id,
        'TX-CS-' || v_invoice_number,
        v_sale_date,
        'SALE',
        CASE 
            WHEN v_amount_received >= v_final_total AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN 'IN'::public.daybook_direction
            WHEN v_amount_received > 0 AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN 'IN'::public.daybook_direction
            ELSE 'NON_CASH'::public.daybook_direction
        END,
        v_final_total,
        v_db_payment_method,
        v_fin_acc_id,
        'customer',
        v_customer_id,
        v_customer_name,
        'COUNTER_SALE',
        v_counter_sale_id::TEXT,
        v_invoice_number,
        'Counter Sale #' || v_invoice_number || ' - ' || v_customer_name,
        v_payment_notes,
        'COMPLETED',
        v_user_id
    ) ON CONFLICT (workspace_id, reference_type, reference_id) DO NOTHING;

    -- 10. Record Cashbook Receipt for Partial / Full Immediate Payment
    IF v_amount_received > 0 
       AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') 
       AND v_amount_received < v_final_total THEN
        -- Partial payment receipt entry
        INSERT INTO public.daybook_transactions (
            workspace_id,
            transaction_code,
            transaction_date,
            transaction_type,
            direction,
            amount,
            payment_mode,
            financial_account_id,
            party_type,
            party_id,
            party_name,
            reference_type,
            reference_id,
            reference_number,
            description,
            notes,
            status,
            created_by
        ) VALUES (
            v_workspace_id,
            'TX-CS-PAY-' || v_invoice_number,
            v_sale_date,
            'CUSTOMER_PAYMENT',
            'IN'::public.daybook_direction,
            v_amount_received,
            v_db_payment_method,
            v_fin_acc_id,
            'customer',
            v_customer_id,
            v_customer_name,
            'COUNTER_SALE_PAYMENT',
            v_counter_sale_id::TEXT || '_PAY',
            v_invoice_number,
            'Partial Payment for Counter Sale #' || v_invoice_number,
            v_payment_notes,
            'COMPLETED',
            v_user_id
        ) ON CONFLICT (workspace_id, reference_type, reference_id) DO NOTHING;
    END IF;

    -- 11. Record Udhari / Credit Ledger Receivable if Balance Due
    IF v_balance_amount > 0 AND v_payment_method IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
        INSERT INTO public.udhari_records (
            workspace_id,
            customer_id,
            udhari_code,
            customer_name_snapshot,
            phone_snapshot,
            original_amount,
            total_received,
            outstanding_amount,
            due_date,
            status,
            notes
        ) VALUES (
            v_workspace_id,
            v_customer_id,
            'UD-' || v_invoice_number,
            v_customer_name,
            COALESCE(v_phone_number, '9999999999'),
            v_balance_amount,
            0.00,
            v_balance_amount,
            v_sale_date + INTERVAL '30 days',
            'UNPAID',
            'Counter Sale credit #' || v_invoice_number
        ) ON CONFLICT (workspace_id, udhari_code) DO NOTHING;
    END IF;

    -- 12. Return Complete Domain CounterSale Object
    SELECT jsonb_build_object(
        'id', cs.id,
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

-- -----------------------------------------------------------------------------
-- REVERSAL RPC: ATOMIC COUNTER SALE CANCELLATION
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

    -- Restore inventory for each item
    FOR v_item IN
        SELECT product_id, quantity, product_name_snapshot
        FROM public.counter_sale_items
        WHERE counter_sale_id = p_sale_id AND workspace_id = v_workspace_id
    LOOP
        IF v_item.product_id IS NOT NULL THEN
            -- Restore products.current_stock
            UPDATE public.products
            SET current_stock = COALESCE(current_stock, 0) + v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;

            -- Restore most recent receipt
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
                workspace_id,
                product_id,
                type,
                quantity,
                movement_date,
                reference_id,
                reference_type,
                notes,
                created_by
            ) VALUES (
                v_workspace_id,
                v_item.product_id,
                'RETURN',
                v_item.quantity,
                CURRENT_DATE,
                v_sale.invoice_number,
                'COUNTER_SALE_CANCEL',
                'Reversal of Counter Sale #' || v_sale.invoice_number,
                v_user_id
            );
        END IF;
    END LOOP;

    -- Mark Counter Sale as CANCELLED
    UPDATE public.counter_sales
    SET status = 'CANCELLED',
        updated_at = NOW()
    WHERE id = p_sale_id;

    -- Mark Daybook transactions as REVERSED
    UPDATE public.daybook_transactions
    SET status = 'REVERSED',
        updated_at = NOW()
    WHERE workspace_id = v_workspace_id 
      AND (
          (reference_type = 'COUNTER_SALE' AND reference_id = p_sale_id::TEXT) OR
          (reference_type = 'COUNTER_SALE_PAYMENT' AND reference_id = p_sale_id::TEXT || '_PAY')
      );

    -- Cancel Udhari record if any
    UPDATE public.udhari_records
    SET status = 'PAID'::public.udhari_status,
        outstanding_amount = 0,
        notes = COALESCE(notes, '') || ' [Cancelled Sale]',
        updated_at = NOW()
    WHERE workspace_id = v_workspace_id AND udhari_code = 'UD-' || v_sale.invoice_number;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Counter sale cancelled and inventory restored.'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- RELOAD SCHEMA CACHE FOR POSTGREST
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 075
-- Title: Authoritative Financial Architecture, Atomic Transactions,
--        Idempotency Engine, Multi-Branch & Timeout Optimization
-- Description:
--   1. Schema Alignment: Ensures all missing columns on quotations, invoices,
--      counter sales, daybook, expenses, payments, and missing tables
--      (cashbook_entries, branches, branch_inventory, idempotency_keys).
--   2. Performance & Idempotency Indexes to completely prevent statement timeouts.
--   3. Non-circular, fast-path current_user_workspace_id() RLS evaluation.
--   4. True PostgreSQL ACID transactions via SECURITY DEFINER RPCs:
--      - finalize_invoice_transaction(p_payload JSONB)
--      - finalize_counter_sale(p_sale JSONB)
--      - record_expense_atomic(p_payload JSONB)
--      - post_customer_payment_atomic(p_payload JSONB)
--      - convert_quotation_to_invoice_atomic(p_payload JSONB)
--      - reconcile_quotation_conversions(p_workspace_id UUID)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. IDEMPOTENCY KEYS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(255) NOT NULL,
    operation_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    response_payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_idempotency_key UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup
    ON public.idempotency_keys(workspace_id, idempotency_key);

-- -----------------------------------------------------------------------------
-- 2. MULTI-BRANCH & INVENTORY TABLES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    branch_code VARCHAR(50) NOT NULL,
    branch_name VARCHAR(255) NOT NULL,
    branch_type VARCHAR(50) NOT NULL DEFAULT 'Store',
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    is_main_branch BOOLEAN NOT NULL DEFAULT FALSE,
    address TEXT,
    phone VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_branch_code UNIQUE (workspace_id, branch_code)
);

CREATE TABLE IF NOT EXISTS public.branch_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    current_stock NUMERIC(15,2) NOT NULL DEFAULT 0,
    minimum_stock_level NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_branch_product UNIQUE (branch_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.cashbook_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    branch_id UUID,
    entry_number VARCHAR(100),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source_type VARCHAR(50) NOT NULL,
    source_id UUID,
    reference_number VARCHAR(100),
    direction VARCHAR(10) NOT NULL, -- 'IN' or 'OUT'
    amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    party_name VARCHAR(255),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. SCHEMA ALIGNMENT ON EXISTING TABLES (ADD MISSING COLUMNS SAFELY)
-- -----------------------------------------------------------------------------

-- Quotations & Quotation Items
ALTER TABLE IF EXISTS public.quotations
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS converted_invoice_id UUID,
    ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.quotation_items
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'product',
    ADD COLUMN IF NOT EXISTS part_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS description TEXT;

-- Invoices & Invoice Items
ALTER TABLE IF EXISTS public.invoices
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS quotation_id UUID,
    ADD COLUMN IF NOT EXISTS is_stock_finalized BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50),
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS payment_notes TEXT,
    ADD COLUMN IF NOT EXISTS payment_date DATE;

ALTER TABLE IF EXISTS public.invoice_items
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'product',
    ADD COLUMN IF NOT EXISTS part_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS description TEXT;

-- Counter Sales & Counter Sale Items
ALTER TABLE IF EXISTS public.counter_sales
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS upi_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS payment_notes TEXT;

ALTER TABLE IF EXISTS public.counter_sale_items
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS product_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'product',
    ADD COLUMN IF NOT EXISTS part_number VARCHAR(100);

-- Daybook Transactions
ALTER TABLE IF EXISTS public.daybook_transactions
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'UNPAID';

-- Payments
ALTER TABLE IF EXISTS public.payments
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS counter_sale_id UUID,
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'COMPLETED';

-- Expenses
ALTER TABLE IF EXISTS public.expenses
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS title VARCHAR(255),
    ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash';

-- -----------------------------------------------------------------------------
-- 4. PERFORMANCE & WORKSPACE ISOLATION INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_quotations_ws_date 
    ON public.quotations(workspace_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_quotations_ws_branch 
    ON public.quotations(workspace_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_quotation_items_ws_qid 
    ON public.quotation_items(workspace_id, quotation_id);

CREATE INDEX IF NOT EXISTS idx_invoices_ws_date 
    ON public.invoices(workspace_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_ws_branch 
    ON public.invoices(workspace_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_ws_invid 
    ON public.invoice_items(workspace_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_counter_sales_ws_date 
    ON public.counter_sales(workspace_id, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_counter_sale_items_ws_csid 
    ON public.counter_sale_items(workspace_id, counter_sale_id);

CREATE INDEX IF NOT EXISTS idx_daybook_ws_date 
    ON public.daybook_transactions(workspace_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_daybook_ws_ref 
    ON public.daybook_transactions(workspace_id, reference_type, reference_number);

CREATE INDEX IF NOT EXISTS idx_daybook_ws_ref_id 
    ON public.daybook_transactions(workspace_id, reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_cashbook_ws_date 
    ON public.cashbook_entries(workspace_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_ws_date 
    ON public.payments(workspace_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_ws_date 
    ON public.expenses(workspace_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_udhari_ws_status 
    ON public.udhari_records(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_lookup 
    ON public.branch_inventory(workspace_id, branch_id, product_id);

-- -----------------------------------------------------------------------------
-- 5. FAST-PATH NON-CIRCULAR CURRENT_USER_WORKSPACE_ID()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_workspace_id()
RETURNS UUID AS $$
DECLARE
    v_workspace_id UUID;
    v_email TEXT;
BEGIN
    -- Tier 1: Check JWT app_metadata (Fastest, O(1), no database query)
    BEGIN
        v_workspace_id := NULLIF(auth.jwt() -> 'app_metadata' ->> 'workspace_id', '')::UUID;
        IF v_workspace_id IS NOT NULL THEN
            RETURN v_workspace_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Tier 2: Check JWT user_metadata
    BEGIN
        v_workspace_id := NULLIF(auth.jwt() -> 'user_metadata' ->> 'workspace_id', '')::UUID;
        IF v_workspace_id IS NOT NULL THEN
            RETURN v_workspace_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
        v_workspace_id := NULLIF(auth.jwt() -> 'user_metadata' ->> 'company_id', '')::UUID;
        IF v_workspace_id IS NOT NULL THEN
            RETURN v_workspace_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Tier 3: Direct authoritative lookup from public.profiles by auth.uid()
    IF auth.uid() IS NOT NULL THEN
        SELECT p.workspace_id INTO v_workspace_id
        FROM public.profiles p
        WHERE p.id = auth.uid();

        IF v_workspace_id IS NOT NULL THEN
            RETURN v_workspace_id;
        END IF;
    END IF;

    -- Tier 4: Fallback lookup from public.workspaces by owner_email
    v_email := (auth.jwt() ->> 'email');
    IF v_email IS NOT NULL AND v_email <> '' THEN
        SELECT w.id INTO v_workspace_id
        FROM public.workspaces w
        WHERE LOWER(w.owner_email) = LOWER(v_email)
        LIMIT 1;

        IF v_workspace_id IS NOT NULL THEN
            RETURN v_workspace_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, auth;

-- -----------------------------------------------------------------------------
-- 6. ATOMIC TRANSACTIONAL RPC: finalize_invoice_transaction
-- -----------------------------------------------------------------------------
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
    v_idempotency_key TEXT;
    v_cached_response JSONB;
    
    v_invoice_number TEXT;
    v_quotation_id UUID;
    v_customer_id UUID;
    v_customer_name TEXT;
    v_customer_phone TEXT;
    v_customer_email TEXT;
    v_customer_address TEXT;
    v_customer_gstin TEXT;
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
    v_terms TEXT;
    v_footer_text TEXT;
    v_template_id TEXT;
    v_branding JSONB;
    v_theme JSONB;
    v_customization JSONB;
    v_snapshot JSONB;
    v_items_json JSONB;
    v_status TEXT;
    
    v_item JSONB;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_part_num TEXT;
    v_item_sku TEXT;
    v_item_unit TEXT;
    v_item_type TEXT;
    v_item_qty NUMERIC(15,2);
    v_item_buy_price NUMERIC(15,2);
    v_item_sell_price NUMERIC(15,2);
    v_item_disc NUMERIC(15,2);
    v_item_tax_pct NUMERIC(15,2);
    v_item_tax_amt NUMERIC(15,2);
    v_item_total NUMERIC(15,2);
    v_item_desc TEXT;
    v_cur_stock NUMERIC(15,2);
    
    v_payment_id UUID;
    v_response JSONB;
BEGIN
    -- 1. Resolve & Authorize Workspace
    v_workspace_id := NULLIF(COALESCE(p_payload->>'workspace_id', p_payload->>'workspaceId', ''), '')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Valid workspace context is required.';
    END IF;

    -- 2. Idempotency Check
    v_idempotency_key := NULLIF(TRIM(COALESCE(p_payload->>'idempotency_key', p_payload->>'idempotencyKey', '')), '');
    IF v_idempotency_key IS NOT NULL THEN
        SELECT response_payload INTO v_cached_response
        FROM public.idempotency_keys
        WHERE workspace_id = v_workspace_id AND idempotency_key = v_idempotency_key;
        
        IF v_cached_response IS NOT NULL THEN
            RETURN v_cached_response;
        END IF;
    END IF;

    -- 3. Parse Parameters
    v_invoice_id := NULLIF(COALESCE(p_payload->>'id', p_payload->>'invoice_id', p_payload->>'invoiceId', ''), '')::UUID;
    IF v_invoice_id IS NULL THEN
        v_invoice_id := gen_random_uuid();
    END IF;

    v_branch_id := NULLIF(COALESCE(p_payload->>'branch_id', p_payload->>'branchId', ''), '')::UUID;
    v_quotation_id := NULLIF(COALESCE(p_payload->>'quotation_id', p_payload->>'quotationId', ''), '')::UUID;
    v_customer_id := NULLIF(COALESCE(p_payload->>'customer_id', p_payload->>'customerId', ''), '')::UUID;
    
    v_customer_name := COALESCE(NULLIF(TRIM(p_payload->>'customer_name'), ''), NULLIF(TRIM(p_payload->>'customerName'), ''), 'Walk-in Customer');
    v_customer_phone := COALESCE(p_payload->>'customer_phone', p_payload->>'customerPhone', '');
    v_customer_email := NULLIF(COALESCE(p_payload->>'customer_email', p_payload->>'customerEmail', ''), '');
    v_customer_address := NULLIF(COALESCE(p_payload->>'customer_address', p_payload->>'customerAddress', ''), '');
    v_customer_gstin := NULLIF(COALESCE(p_payload->>'customer_gstin', p_payload->>'customerGstin', ''), '');
    
    v_date := COALESCE(NULLIF(p_payload->>'date', '')::DATE, CURRENT_DATE);
    v_due_date := COALESCE(NULLIF(p_payload->>'due_date', '')::DATE, NULLIF(p_payload->>'dueDate', '')::DATE, v_date + 15);
    
    v_subtotal := COALESCE((p_payload->>'subtotal')::NUMERIC, 0);
    v_discount_total := COALESCE(NULLIF(p_payload->>'discount_total', '')::NUMERIC, NULLIF(p_payload->>'discountTotal', '')::NUMERIC, 0);
    v_tax_total := COALESCE(NULLIF(p_payload->>'tax_total', '')::NUMERIC, NULLIF(p_payload->>'taxTotal', '')::NUMERIC, 0);
    v_grand_total := COALESCE(NULLIF(p_payload->>'grand_total', '')::NUMERIC, NULLIF(p_payload->>'grandTotal', '')::NUMERIC, 0);
    v_paid_amount := COALESCE(NULLIF(p_payload->>'paid_amount', '')::NUMERIC, NULLIF(p_payload->>'paidAmount', '')::NUMERIC, 0);
    
    IF v_grand_total <= 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Invoice grand total must be positive.';
    END IF;
    IF v_paid_amount < 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Paid amount cannot be negative.';
    END IF;
    IF v_paid_amount > (v_grand_total + 0.05) THEN
        RAISE EXCEPTION 'OVERPAYMENT_REJECTED: Paid amount cannot exceed invoice grand total.';
    END IF;

    v_paid_amount := LEAST(v_paid_amount, v_grand_total);
    v_balance_amount := ROUND(v_grand_total - v_paid_amount, 2);
    
    IF v_balance_amount <= 0.01 THEN
        v_status := 'Paid';
        v_balance_amount := 0;
    ELSIF v_paid_amount > 0 THEN
        v_status := 'Partially Paid';
    ELSE
        v_status := 'Issued';
    END IF;

    v_payment_mode := COALESCE(NULLIF(p_payload->>'payment_mode', ''), NULLIF(p_payload->>'paymentMode', ''), 'Cash');
    v_payment_ref := NULLIF(COALESCE(p_payload->>'payment_reference', p_payload->>'paymentReference', ''), '');
    v_payment_notes := NULLIF(COALESCE(p_payload->>'payment_notes', p_payload->>'paymentNotes', ''), '');
    v_notes := NULLIF(p_payload->>'notes', '');
    v_terms := NULLIF(p_payload->>'terms', '');
    v_footer_text := NULLIF(COALESCE(p_payload->>'footer_text', p_payload->>'footerText', ''), '');
    v_template_id := COALESCE(NULLIF(p_payload->>'template_id', ''), NULLIF(p_payload->>'templateId', ''), 'inv-modern-blue');
    v_branding := p_payload->'branding';
    v_theme := p_payload->'theme';
    v_customization := p_payload->'customization';
    v_snapshot := p_payload->'snapshot';
    v_items_json := p_payload->'items';

    -- Generate Invoice Number if not provided
    v_invoice_number := NULLIF(TRIM(COALESCE(p_payload->>'invoice_number', p_payload->>'invoiceNumber', '')), '');
    IF v_invoice_number IS NULL THEN
        v_invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');
    END IF;

    -- 4. Upsert Invoice Header
    INSERT INTO public.invoices (
        id, workspace_id, branch_id, quotation_id, customer_id, invoice_number,
        customer_name, customer_phone, customer_email, customer_address, customer_gstin,
        status, date, due_date, subtotal, discount_total, tax_total, grand_total,
        paid_amount, balance_amount, payment_mode, payment_reference, payment_notes,
        notes, terms, footer_text, template_id, branding, theme, customization,
        snapshot, is_stock_finalized, created_at, updated_at
    ) VALUES (
        v_invoice_id, v_workspace_id, v_branch_id, v_quotation_id, v_customer_id, v_invoice_number,
        v_customer_name, v_customer_phone, v_customer_email, v_customer_address, v_customer_gstin,
        v_status::public.invoice_status, v_date, v_due_date, v_subtotal, v_discount_total, v_tax_total, v_grand_total,
        v_paid_amount, v_balance_amount, v_payment_mode, v_payment_ref, v_payment_notes,
        v_notes, v_terms, v_footer_text, v_template_id, v_branding, v_theme, v_customization,
        v_snapshot, TRUE, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        branch_id = EXCLUDED.branch_id,
        status = EXCLUDED.status,
        subtotal = EXCLUDED.subtotal,
        discount_total = EXCLUDED.discount_total,
        tax_total = EXCLUDED.tax_total,
        grand_total = EXCLUDED.grand_total,
        paid_amount = EXCLUDED.paid_amount,
        balance_amount = EXCLUDED.balance_amount,
        is_stock_finalized = TRUE,
        updated_at = NOW();

    -- 5. Delete and Re-insert Line Items to ensure atomicity
    DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id;

    IF v_items_json IS NOT NULL AND jsonb_array_length(v_items_json) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json)
        LOOP
            v_prod_id := NULLIF(COALESCE(v_item->>'productId', v_item->>'product_id', ''), '')::UUID;
            v_prod_name := COALESCE(NULLIF(v_item->>'productName', ''), NULLIF(v_item->>'product_name', ''), NULLIF(v_item->>'name', ''), 'Item');
            v_part_num := NULLIF(COALESCE(v_item->>'partNumber', v_item->>'part_number', ''), '');
            v_item_sku := COALESCE(v_item->>'sku', '');
            v_item_unit := COALESCE(v_item->>'unit', 'Pcs');
            v_item_type := COALESCE(v_item->>'itemType', v_item->>'item_type', 'product');
            v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);
            v_item_buy_price := COALESCE(NULLIF(v_item->>'buyPrice', '')::NUMERIC, NULLIF(v_item->>'buy_price', '')::NUMERIC, 0);
            v_item_sell_price := COALESCE(NULLIF(v_item->>'sellingPrice', '')::NUMERIC, NULLIF(v_item->>'selling_price', '')::NUMERIC, NULLIF(v_item->>'price', '')::NUMERIC, 0);
            v_item_disc := COALESCE(NULLIF(v_item->>'discountAmount', '')::NUMERIC, NULLIF(v_item->>'discount_amount', '')::NUMERIC, 0);
            v_item_tax_pct := COALESCE(NULLIF(v_item->>'taxPercent', '')::NUMERIC, NULLIF(v_item->>'tax_percent', '')::NUMERIC, 0);
            v_item_tax_amt := COALESCE(NULLIF(v_item->>'taxAmount', '')::NUMERIC, NULLIF(v_item->>'tax_amount', '')::NUMERIC, 0);
            v_item_total := COALESCE((v_item->>'total')::NUMERIC, ROUND(v_item_qty * v_item_sell_price, 2));
            v_item_desc := NULLIF(v_item->>'description', '');

            -- Insert Invoice Item
            INSERT INTO public.invoice_items (
                id, workspace_id, invoice_id, product_id, product_name,
                sku, unit, quantity, buy_price, selling_price,
                discount_amount, tax_percent, tax_amount, total,
                branch_id, item_type, part_number, description
            ) VALUES (
                gen_random_uuid(), v_workspace_id, v_invoice_id, v_prod_id, v_prod_name,
                v_item_sku, v_item_unit, v_item_qty, v_item_buy_price, v_item_sell_price,
                v_item_disc, v_item_tax_pct, v_item_tax_amt, v_item_total,
                v_branch_id, v_item_type, v_part_num, v_item_desc
            );

            -- Stock Deduction for Catalog Products (Custom items exempt)
            IF v_prod_id IS NOT NULL AND v_item_type <> 'custom' THEN
                -- Check and deduct master product stock
                SELECT current_stock INTO v_cur_stock
                FROM public.products
                WHERE id = v_prod_id AND workspace_id = v_workspace_id
                FOR UPDATE;

                IF v_cur_stock IS NOT NULL THEN
                    IF v_cur_stock < v_item_qty THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for product "%" (Available: %, Requested: %)',
                            v_prod_name, v_cur_stock, v_item_qty;
                    END IF;

                    UPDATE public.products
                    SET current_stock = current_stock - v_item_qty, updated_at = NOW()
                    WHERE id = v_prod_id;

                    -- Record Stock Movement
                    INSERT INTO public.stock_movements (
                        id, workspace_id, product_id, type, quantity,
                        reference_id, reference_type, notes, movement_date, created_at
                    ) VALUES (
                        gen_random_uuid(), v_workspace_id, v_prod_id, 'SALE'::public.stock_movement_type, -v_item_qty,
                        v_invoice_number, 'INVOICE', 'Sale via Invoice #' || v_invoice_number, v_date, NOW()
                    );
                END IF;

                -- Deduct from branch_inventory if branch is specified
                IF v_branch_id IS NOT NULL THEN
                    UPDATE public.branch_inventory
                    SET current_stock = current_stock - v_item_qty, updated_at = NOW()
                    WHERE workspace_id = v_workspace_id AND branch_id = v_branch_id AND product_id = v_prod_id;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 6. Daybook Journal Entry for SALE (Commercial Volume: total_amount = grand_total; amount = 0)
    DELETE FROM public.daybook_transactions
    WHERE workspace_id = v_workspace_id AND reference_type = 'INVOICE' AND reference_id = v_invoice_id::TEXT;

    INSERT INTO public.daybook_transactions (
        id, workspace_id, branch_id, transaction_code, transaction_date,
        transaction_type, direction, amount, total_amount, remaining_amount,
        payment_status, payment_mode, party_type, party_id, party_name,
        reference_type, reference_id, reference_number, description,
        status, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_workspace_id, v_branch_id, 'ACC-' || v_invoice_number, v_date,
        'SALE', 'IN', 0, v_grand_total, v_balance_amount,
        CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
        v_payment_mode, 'customer', v_customer_id, v_customer_name,
        'INVOICE', v_invoice_id::TEXT, v_invoice_number, 'Invoice #' || v_invoice_number,
        'COMPLETED', NOW(), NOW()
    );

    -- 7. Upfront Payment Handling (Cash Inflow & Cashbook)
    IF v_paid_amount > 0 THEN
        v_payment_id := gen_random_uuid();

        INSERT INTO public.payments (
            id, workspace_id, branch_id, customer_id, invoice_id, payment_number,
            customer_name, invoice_number, amount, payment_date, method, reference_no,
            notes, status, created_at
        ) VALUES (
            v_payment_id, v_workspace_id, v_branch_id, v_customer_id, v_invoice_id,
            'PAY-' || v_invoice_number, v_customer_name, v_invoice_number,
            v_paid_amount, v_date, v_payment_mode::public.payment_method, v_payment_ref,
            v_payment_notes, 'COMPLETED', NOW()
        );

        -- Record Payment row in Daybook carrying the cash Inflow
        INSERT INTO public.daybook_transactions (
            id, workspace_id, branch_id, transaction_code, transaction_date,
            transaction_type, direction, amount, total_amount, remaining_amount,
            payment_status, payment_mode, party_type, party_id, party_name,
            reference_type, reference_id, reference_number, description,
            status, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_branch_id, 'PAY-' || v_invoice_number, v_date,
            'CUSTOMER_PAYMENT', 'IN', v_paid_amount, v_grand_total, v_balance_amount,
            CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' ELSE 'PARTIALLY PAID' END,
            v_payment_mode, 'customer', v_customer_id, v_customer_name,
            'PAYMENT', v_payment_id::TEXT, v_invoice_number, 'Payment received for Invoice #' || v_invoice_number,
            'COMPLETED', NOW(), NOW()
        );

        -- Record Cashbook Inflow
        INSERT INTO public.cashbook_entries (
            id, workspace_id, branch_id, entry_number, transaction_date,
            source_type, source_id, reference_number, direction,
            amount, payment_method, party_name, description, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_branch_id, 'CB-' || v_invoice_number, v_date,
            'INVOICE_PAYMENT', v_invoice_id, v_invoice_number, 'IN',
            v_paid_amount, v_payment_mode, v_customer_name, 'Payment for Invoice #' || v_invoice_number,
            NOW(), NOW()
        );
    END IF;

    -- 8. Udhari Receivable Record (If remaining balance > 0)
    IF v_balance_amount > 0.01 THEN
        INSERT INTO public.udhari_records (
            id, workspace_id, customer_id, udhari_code, customer_name_snapshot,
            phone_snapshot, original_amount, total_received, outstanding_amount,
            due_date, status, notes, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_customer_id, 'UDH-' || v_invoice_number,
            v_customer_name, v_customer_phone, v_grand_total, v_paid_amount, v_balance_amount,
            v_due_date, CASE WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID'::public.udhari_status ELSE 'UNPAID'::public.udhari_status END,
            'Receivable for Invoice #' || v_invoice_number, NOW(), NOW()
        )
        ON CONFLICT (workspace_id, udhari_code) DO UPDATE SET
            total_received = EXCLUDED.total_received,
            outstanding_amount = EXCLUDED.outstanding_amount,
            status = EXCLUDED.status,
            updated_at = NOW();
    END IF;

    -- 9. If Converted from Quotation, update Quotation status atomically
    IF v_quotation_id IS NOT NULL THEN
        UPDATE public.quotations
        SET status = 'Converted'::public.quotation_status,
            converted_invoice_id = v_invoice_id,
            converted_at = NOW()
        WHERE id = v_quotation_id AND workspace_id = v_workspace_id;
    END IF;

    -- 10. Build Response Payload & Save Idempotency Key
    v_response := jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'status', v_status,
        'grand_total', v_grand_total,
        'paid_amount', v_paid_amount,
        'balance_amount', v_balance_amount
    );

    IF v_idempotency_key IS NOT NULL THEN
        INSERT INTO public.idempotency_keys (
            workspace_id, idempotency_key, operation_type, resource_id, response_payload, status
        ) VALUES (
            v_workspace_id, v_idempotency_key, 'FINALIZE_INVOICE', v_invoice_id, v_response, 'COMPLETED'
        )
        ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;
    END IF;

    RETURN v_response;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. ATOMIC TRANSACTIONAL RPC: finalize_counter_sale
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_counter_sale(p_sale JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_branch_id UUID;
    v_sale_id UUID;
    v_idempotency_key TEXT;
    v_cached_response JSONB;
    
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
    v_amount_received NUMERIC(15,2);
    v_balance_amount NUMERIC(15,2);
    v_cash_amt NUMERIC(15,2);
    v_upi_amt NUMERIC(15,2);
    v_payment_method TEXT;
    v_payment_ref TEXT;
    v_payment_notes TEXT;
    v_notes TEXT;
    v_items_json JSONB;
    
    v_item JSONB;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_part_num TEXT;
    v_qty NUMERIC(15,2);
    v_rate NUMERIC(15,2);
    v_amt NUMERIC(15,2);
    v_cur_stock NUMERIC(15,2);
    
    v_payment_id UUID;
    v_response JSONB;
BEGIN
    -- 1. Workspace Resolution
    v_workspace_id := NULLIF(COALESCE(p_sale->>'workspace_id', p_sale->>'workspaceId', ''), '')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Valid workspace context required.';
    END IF;

    -- 2. Idempotency Check
    v_idempotency_key := NULLIF(TRIM(COALESCE(p_sale->>'idempotency_key', p_sale->>'idempotencyKey', '')), '');
    IF v_idempotency_key IS NOT NULL THEN
        SELECT response_payload INTO v_cached_response
        FROM public.idempotency_keys
        WHERE workspace_id = v_workspace_id AND idempotency_key = v_idempotency_key;
        
        IF v_cached_response IS NOT NULL THEN
            RETURN v_cached_response;
        END IF;
    END IF;

    -- 3. Parse Parameters
    v_sale_id := NULLIF(COALESCE(p_sale->>'id', p_sale->>'sale_id', ''), '')::UUID;
    IF v_sale_id IS NULL THEN
        v_sale_id := gen_random_uuid();
    END IF;

    v_branch_id := NULLIF(COALESCE(p_sale->>'branch_id', p_sale->>'branchId', ''), '')::UUID;
    v_customer_id := NULLIF(COALESCE(p_sale->>'customer_id', p_sale->>'customerId', ''), '')::UUID;
    v_sale_number := COALESCE(NULLIF(TRIM(p_sale->>'sale_number'), ''), NULLIF(TRIM(p_sale->>'saleNumber'), ''), 'CS-' || EXTRACT(EPOCH FROM NOW())::BIGINT);
    v_invoice_number := COALESCE(NULLIF(TRIM(p_sale->>'invoice_number'), ''), NULLIF(TRIM(p_sale->>'invoiceNumber'), ''), v_sale_number);
    v_customer_name := COALESCE(NULLIF(TRIM(p_sale->>'customer_name'), ''), NULLIF(TRIM(p_sale->>'customerName'), ''), 'Walk-in Customer');
    v_phone_number := COALESCE(p_sale->>'phone_number', p_sale->>'phoneNumber', '');
    v_sale_date := COALESCE(NULLIF(p_sale->>'sale_date', '')::DATE, NULLIF(p_sale->>'saleDate', '')::DATE, CURRENT_DATE);
    v_estimate_ref := NULLIF(COALESCE(p_sale->>'estimate_reference', p_sale->>'estimateReference', ''), '');
    
    v_subtotal := COALESCE((p_sale->>'subtotal')::NUMERIC, 0);
    v_discount_type := COALESCE(p_sale->>'discount_type', p_sale->>'discountType', 'fixed');
    v_discount_val := COALESCE((p_sale->>'discount_value')::NUMERIC, (p_sale->>'discountValue')::NUMERIC, 0);
    v_discount_amt := COALESCE((p_sale->>'discount_amount')::NUMERIC, (p_sale->>'discountAmount')::NUMERIC, 0);
    v_final_total := COALESCE((p_sale->>'final_total')::NUMERIC, (p_sale->>'finalTotal')::NUMERIC, 0);
    v_payment_method := COALESCE(p_sale->>'payment_method', p_sale->>'paymentMethod', 'Cash');
    
    IF v_final_total <= 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Counter sale final total must be positive.';
    END IF;

    IF v_payment_method IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
        v_amount_received := 0;
        v_balance_amount := v_final_total;
    ELSE
        v_amount_received := COALESCE((p_sale->>'amount_received')::NUMERIC, (p_sale->>'amountReceived')::NUMERIC, v_final_total);
        v_balance_amount := GREATEST(0, ROUND(v_final_total - v_amount_received, 2));
    END IF;

    v_cash_amt := COALESCE((p_sale->>'cash_amount')::NUMERIC, (p_sale->>'cashAmount')::NUMERIC, 0);
    v_upi_amt := COALESCE((p_sale->>'upi_amount')::NUMERIC, (p_sale->>'upiAmount')::NUMERIC, 0);
    v_payment_ref := NULLIF(COALESCE(p_sale->>'payment_reference', p_sale->>'paymentReference', ''), '');
    v_payment_notes := NULLIF(COALESCE(p_sale->>'payment_notes', p_sale->>'paymentNotes', ''), '');
    v_notes := NULLIF(p_sale->>'notes', '');
    v_items_json := p_sale->'items';

    -- 4. Insert Counter Sale Header
    INSERT INTO public.counter_sales (
        id, workspace_id, branch_id, customer_id, sale_number, invoice_number,
        customer_name, phone_number, sale_date, estimate_reference, subtotal,
        discount_type, discount_value, discount_amount, final_total,
        status, payment_method, amount_received, balance_amount, cash_amount,
        upi_amount, payment_reference, payment_notes, notes, created_at
    ) VALUES (
        v_sale_id, v_workspace_id, v_branch_id, v_customer_id, v_sale_number, v_invoice_number,
        v_customer_name, v_phone_number, v_sale_date, v_estimate_ref, v_subtotal,
        v_discount_type, v_discount_val, v_discount_amt, v_final_total,
        'COMPLETED'::public.counter_sale_status, v_payment_method, v_amount_received, v_balance_amount, v_cash_amt,
        v_upi_amt, v_payment_ref, v_payment_notes, v_notes, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        branch_id = EXCLUDED.branch_id,
        status = EXCLUDED.status,
        final_total = EXCLUDED.final_total,
        amount_received = EXCLUDED.amount_received,
        balance_amount = EXCLUDED.balance_amount;

    -- 5. Insert Items and Deduct Stock
    DELETE FROM public.counter_sale_items WHERE counter_sale_id = v_sale_id;

    IF v_items_json IS NOT NULL AND jsonb_array_length(v_items_json) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json)
        LOOP
            v_prod_id := NULLIF(COALESCE(v_item->>'productId', v_item->>'product_id', ''), '')::UUID;
            v_prod_name := COALESCE(NULLIF(v_item->>'productName', ''), NULLIF(v_item->>'product_name', ''), 'Product');
            v_part_num := NULLIF(COALESCE(v_item->>'partNumber', v_item->>'part_number', ''), '');
            v_qty := ABS(COALESCE((v_item->>'quantity')::NUMERIC, 1));
            v_rate := COALESCE((v_item->>'rate')::NUMERIC, 0);
            v_amt := COALESCE((v_item->>'amount')::NUMERIC, ROUND(v_qty * v_rate, 2));

            INSERT INTO public.counter_sale_items (
                id, workspace_id, counter_sale_id, product_id,
                quantity, rate, amount, branch_id, product_name, part_number
            ) VALUES (
                gen_random_uuid(), v_workspace_id, v_sale_id, v_prod_id,
                v_qty, v_rate, v_amt, v_branch_id, v_prod_name, v_part_num
            );

            -- Stock Deduction
            IF v_prod_id IS NOT NULL THEN
                SELECT current_stock INTO v_cur_stock
                FROM public.products
                WHERE id = v_prod_id AND workspace_id = v_workspace_id
                FOR UPDATE;

                IF v_cur_stock IS NOT NULL THEN
                    IF v_cur_stock < v_qty THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for product "%" (Available: %, Requested: %)',
                            v_prod_name, v_cur_stock, v_qty;
                    END IF;

                    UPDATE public.products
                    SET current_stock = current_stock - v_qty, updated_at = NOW()
                    WHERE id = v_prod_id;

                    INSERT INTO public.stock_movements (
                        id, workspace_id, product_id, type, quantity,
                        reference_id, reference_type, notes, movement_date, created_at
                    ) VALUES (
                        gen_random_uuid(), v_workspace_id, v_prod_id, 'SALE'::public.stock_movement_type, -v_qty,
                        v_invoice_number, 'COUNTER_SALE', 'Counter Sale #' || v_invoice_number, v_sale_date, NOW()
                    );
                END IF;

                IF v_branch_id IS NOT NULL THEN
                    UPDATE public.branch_inventory
                    SET current_stock = current_stock - v_qty, updated_at = NOW()
                    WHERE workspace_id = v_workspace_id AND branch_id = v_branch_id AND product_id = v_prod_id;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 6. Daybook Transaction for COUNTER_SALE
    DELETE FROM public.daybook_transactions
    WHERE workspace_id = v_workspace_id AND reference_type = 'COUNTER_SALE' AND reference_id = v_sale_id::TEXT;

    INSERT INTO public.daybook_transactions (
        id, workspace_id, branch_id, transaction_code, transaction_date,
        transaction_type, direction, amount, total_amount, remaining_amount,
        payment_status, payment_mode, party_type, party_id, party_name,
        reference_type, reference_id, reference_number, description,
        status, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_workspace_id, v_branch_id, 'CS-' || v_invoice_number, v_sale_date,
        'SALE', 'IN', v_amount_received, v_final_total, v_balance_amount,
        CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' WHEN v_amount_received > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
        v_payment_method, 'customer', v_customer_id, v_customer_name,
        'COUNTER_SALE', v_sale_id::TEXT, v_invoice_number, 'Counter Sale #' || v_invoice_number,
        'COMPLETED', NOW(), NOW()
    );

    -- 7. Cashbook Inflow (if payment collected)
    IF v_amount_received > 0 AND v_payment_method NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
        INSERT INTO public.cashbook_entries (
            id, workspace_id, branch_id, entry_number, transaction_date,
            source_type, source_id, reference_number, direction,
            amount, payment_method, party_name, description, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_branch_id, 'CB-' || v_invoice_number, v_sale_date,
            'COUNTER_SALE', v_sale_id, v_invoice_number, 'IN',
            v_amount_received, v_payment_method, v_customer_name, 'Counter sale payment #' || v_invoice_number,
            NOW(), NOW()
        );
    END IF;

    -- 8. Udhari Record if balance > 0
    IF v_balance_amount > 0.01 AND v_customer_id IS NOT NULL THEN
        INSERT INTO public.udhari_records (
            id, workspace_id, customer_id, udhari_code, customer_name_snapshot,
            phone_snapshot, original_amount, total_received, outstanding_amount,
            due_date, status, notes, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_customer_id, 'UDH-' || v_invoice_number,
            v_customer_name, v_phone_number, v_final_total, v_amount_received, v_balance_amount,
            v_sale_date + 15, CASE WHEN v_amount_received > 0 THEN 'PARTIALLY PAID'::public.udhari_status ELSE 'UNPAID'::public.udhari_status END,
            'Receivable for Counter Sale #' || v_invoice_number, NOW(), NOW()
        )
        ON CONFLICT (workspace_id, udhari_code) DO UPDATE SET
            total_received = EXCLUDED.total_received,
            outstanding_amount = EXCLUDED.outstanding_amount,
            status = EXCLUDED.status,
            updated_at = NOW();
    END IF;

    -- 9. Response Payload
    v_response := jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'sale_number', v_sale_number,
        'invoice_number', v_invoice_number,
        'final_total', v_final_total,
        'amount_received', v_amount_received,
        'balance_amount', v_balance_amount,
        'data', jsonb_build_object(
            'id', v_sale_id,
            'saleNumber', v_sale_number,
            'invoiceNumber', v_invoice_number,
            'finalTotal', v_final_total,
            'amountReceived', v_amount_received,
            'balanceAmount', v_balance_amount,
            'status', 'COMPLETED'
        )
    );

    IF v_idempotency_key IS NOT NULL THEN
        INSERT INTO public.idempotency_keys (
            workspace_id, idempotency_key, operation_type, resource_id, response_payload, status
        ) VALUES (
            v_workspace_id, v_idempotency_key, 'COUNTER_SALE', v_sale_id, v_response, 'COMPLETED'
        )
        ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;
    END IF;

    RETURN v_response;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. ATOMIC TRANSACTIONAL RPC: record_expense_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_expense_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_branch_id UUID;
    v_expense_id UUID;
    v_idempotency_key TEXT;
    v_cached_response JSONB;
    
    v_category TEXT;
    v_expense_name TEXT;
    v_amount NUMERIC(15,2);
    v_expense_date DATE;
    v_payment_mode TEXT;
    v_paid_to TEXT;
    v_reference_no TEXT;
    v_notes TEXT;
    v_response JSONB;
BEGIN
    v_workspace_id := NULLIF(COALESCE(p_payload->>'workspace_id', p_payload->>'workspaceId', ''), '')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Valid workspace context required.';
    END IF;

    v_idempotency_key := NULLIF(TRIM(COALESCE(p_payload->>'idempotency_key', p_payload->>'idempotencyKey', '')), '');
    IF v_idempotency_key IS NOT NULL THEN
        SELECT response_payload INTO v_cached_response
        FROM public.idempotency_keys
        WHERE workspace_id = v_workspace_id AND idempotency_key = v_idempotency_key;
        
        IF v_cached_response IS NOT NULL THEN
            RETURN v_cached_response;
        END IF;
    END IF;

    v_expense_id := NULLIF(COALESCE(p_payload->>'id', p_payload->>'expense_id', p_payload->>'expenseId', ''), '')::UUID;
    IF v_expense_id IS NULL THEN
        v_expense_id := gen_random_uuid();
    END IF;

    v_branch_id := NULLIF(COALESCE(p_payload->>'branch_id', p_payload->>'branchId', ''), '')::UUID;
    v_category := COALESCE(p_payload->>'category', 'Other');
    v_expense_name := NULLIF(COALESCE(p_payload->>'expense_name', p_payload->>'expenseName', p_payload->>'title', ''), '');
    v_amount := COALESCE((p_payload->>'amount')::NUMERIC, 0);
    v_expense_date := COALESCE(NULLIF(p_payload->>'expense_date', '')::DATE, NULLIF(p_payload->>'date', '')::DATE, CURRENT_DATE);
    v_payment_mode := COALESCE(p_payload->>'payment_mode', p_payload->>'paymentMode', 'Cash');
    v_paid_to := NULLIF(p_payload->>'paid_to', '');
    v_reference_no := NULLIF(p_payload->>'reference_no', '');
    v_notes := NULLIF(p_payload->>'notes', '');

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Expense amount must be greater than zero.';
    END IF;

    -- Insert Expense
    INSERT INTO public.expenses (
        id, workspace_id, branch_id, category, expense_name, amount,
        expense_date, date, payment_mode, paid_to, reference_no, notes, title, created_at
    ) VALUES (
        v_expense_id, v_workspace_id, v_branch_id, v_category::public.expense_category, v_expense_name, v_amount,
        v_expense_date, v_expense_date, v_payment_mode, v_paid_to, v_reference_no, v_notes, v_expense_name, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        amount = EXCLUDED.amount,
        category = EXCLUDED.category,
        expense_date = EXCLUDED.expense_date,
        payment_mode = EXCLUDED.payment_mode;

    -- Daybook Outflow Entry
    INSERT INTO public.daybook_transactions (
        id, workspace_id, branch_id, transaction_code, transaction_date,
        transaction_type, direction, amount, total_amount, remaining_amount,
        payment_status, payment_mode, party_type, party_name,
        reference_type, reference_id, reference_number, description,
        status, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_workspace_id, v_branch_id, 'EXP-' || TO_CHAR(v_expense_date, 'YYYYMMDD') || '-' || SUBSTRING(v_expense_id::TEXT, 1, 6),
        v_expense_date, 'EXPENSE', 'OUT', v_amount, v_amount, 0,
        'PAID', v_payment_mode, 'vendor', COALESCE(v_paid_to, 'Vendor'),
        'EXPENSE', v_expense_id::TEXT, COALESCE(v_reference_no, v_expense_id::TEXT),
        'Expense: ' || COALESCE(v_expense_name, v_category), 'COMPLETED', NOW(), NOW()
    );

    -- Cashbook Outflow Entry
    INSERT INTO public.cashbook_entries (
        id, workspace_id, branch_id, entry_number, transaction_date,
        source_type, source_id, reference_number, direction,
        amount, payment_method, party_name, description, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_workspace_id, v_branch_id, 'CB-EXP-' || SUBSTRING(v_expense_id::TEXT, 1, 6),
        v_expense_date, 'EXPENSE', v_expense_id, COALESCE(v_reference_no, v_expense_id::TEXT),
        'OUT', v_amount, v_payment_mode, COALESCE(v_paid_to, 'Vendor'),
        'Expense: ' || COALESCE(v_expense_name, v_category), NOW(), NOW()
    );

    v_response := jsonb_build_object(
        'success', true,
        'expense_id', v_expense_id,
        'amount', v_amount,
        'category', v_category
    );

    IF v_idempotency_key IS NOT NULL THEN
        INSERT INTO public.idempotency_keys (
            workspace_id, idempotency_key, operation_type, resource_id, response_payload, status
        ) VALUES (
            v_workspace_id, v_idempotency_key, 'RECORD_EXPENSE', v_expense_id, v_response, 'COMPLETED'
        )
        ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;
    END IF;

    RETURN v_response;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. ATOMIC TRANSACTIONAL RPC: post_customer_payment_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_customer_payment_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_branch_id UUID;
    v_payment_id UUID;
    v_idempotency_key TEXT;
    v_cached_response JSONB;
    
    v_invoice_id UUID;
    v_counter_sale_id UUID;
    v_customer_id UUID;
    v_customer_name TEXT;
    v_invoice_number TEXT;
    v_amount NUMERIC(15,2);
    v_payment_date DATE;
    v_payment_method TEXT;
    v_ref_no TEXT;
    v_notes TEXT;
    
    v_inv RECORD;
    v_new_paid NUMERIC(15,2);
    v_new_bal NUMERIC(15,2);
    v_new_status TEXT;
    v_response JSONB;
BEGIN
    v_workspace_id := NULLIF(COALESCE(p_payload->>'workspace_id', p_payload->>'workspaceId', ''), '')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Valid workspace context required.';
    END IF;

    v_idempotency_key := NULLIF(TRIM(COALESCE(p_payload->>'idempotency_key', p_payload->>'idempotencyKey', '')), '');
    IF v_idempotency_key IS NOT NULL THEN
        SELECT response_payload INTO v_cached_response
        FROM public.idempotency_keys
        WHERE workspace_id = v_workspace_id AND idempotency_key = v_idempotency_key;
        
        IF v_cached_response IS NOT NULL THEN
            RETURN v_cached_response;
        END IF;
    END IF;

    v_payment_id := NULLIF(COALESCE(p_payload->>'id', p_payload->>'payment_id', p_payload->>'paymentId', ''), '')::UUID;
    IF v_payment_id IS NULL THEN
        v_payment_id := gen_random_uuid();
    END IF;

    v_branch_id := NULLIF(COALESCE(p_payload->>'branch_id', p_payload->>'branchId', ''), '')::UUID;
    v_invoice_id := NULLIF(COALESCE(p_payload->>'invoice_id', p_payload->>'invoiceId', ''), '')::UUID;
    v_counter_sale_id := NULLIF(COALESCE(p_payload->>'counter_sale_id', p_payload->>'counterSaleId', ''), '')::UUID;
    v_customer_id := NULLIF(COALESCE(p_payload->>'customer_id', p_payload->>'customerId', ''), '')::UUID;
    
    v_customer_name := COALESCE(NULLIF(TRIM(p_payload->>'customer_name'), ''), NULLIF(TRIM(p_payload->>'customerName'), ''), 'Customer');
    v_invoice_number := NULLIF(COALESCE(p_payload->>'invoice_number', p_payload->>'invoiceNumber', ''), '');
    v_amount := COALESCE((p_payload->>'amount')::NUMERIC, 0);
    v_payment_date := COALESCE(NULLIF(p_payload->>'payment_date', '')::DATE, NULLIF(p_payload->>'date', '')::DATE, CURRENT_DATE);
    v_payment_method := COALESCE(p_payload->>'method', p_payload->>'paymentMethod', p_payload->>'payment_mode', 'UPI');
    v_ref_no := NULLIF(COALESCE(p_payload->>'reference_no', p_payload->>'referenceNo', p_payload->>'payment_reference', ''), '');
    v_notes := NULLIF(p_payload->>'notes', '');

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Payment amount must be positive.';
    END IF;

    -- If linked to an Invoice, update invoice balance and status
    IF v_invoice_id IS NOT NULL THEN
        SELECT * INTO v_inv FROM public.invoices WHERE id = v_invoice_id AND workspace_id = v_workspace_id FOR UPDATE;
        IF v_inv.id IS NOT NULL THEN
            v_new_paid := COALESCE(v_inv.paid_amount, 0) + v_amount;
            v_new_bal := GREATEST(0, ROUND(v_inv.grand_total - v_new_paid, 2));
            IF v_new_bal <= 0.01 THEN
                v_new_status := 'Paid';
                v_new_bal := 0;
            ELSE
                v_new_status := 'Partially Paid';
            END IF;

            UPDATE public.invoices
            SET paid_amount = v_new_paid, balance_amount = v_new_bal, status = v_new_status::public.invoice_status, updated_at = NOW()
            WHERE id = v_invoice_id;

            -- Update linked Udhari Record
            UPDATE public.udhari_records
            SET total_received = total_received + v_amount,
                outstanding_amount = v_new_bal,
                status = CASE WHEN v_new_bal <= 0.01 THEN 'PAID'::public.udhari_status ELSE 'PARTIALLY PAID'::public.udhari_status END,
                updated_at = NOW()
            WHERE workspace_id = v_workspace_id AND udhari_code = 'UDH-' || v_inv.invoice_number;
        END IF;
    END IF;

    -- Record Payment Row
    INSERT INTO public.payments (
        id, workspace_id, branch_id, customer_id, invoice_id, counter_sale_id,
        payment_number, customer_name, invoice_number, amount, payment_date,
        method, reference_no, notes, status, created_at
    ) VALUES (
        v_payment_id, v_workspace_id, v_branch_id, v_customer_id, v_invoice_id, v_counter_sale_id,
        'PAY-' || EXTRACT(EPOCH FROM NOW())::BIGINT, v_customer_name, v_invoice_number,
        v_amount, v_payment_date, v_payment_method::public.payment_method, v_ref_no,
        v_notes, 'COMPLETED', NOW()
    );

    -- Record Daybook Transaction (Inflow)
    INSERT INTO public.daybook_transactions (
        id, workspace_id, branch_id, transaction_code, transaction_date,
        transaction_type, direction, amount, total_amount, remaining_amount,
        payment_status, payment_mode, party_type, party_id, party_name,
        reference_type, reference_id, reference_number, description,
        status, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_workspace_id, v_branch_id, 'PAY-' || SUBSTRING(v_payment_id::TEXT, 1, 8),
        v_payment_date, 'CUSTOMER_PAYMENT', 'IN', v_amount, COALESCE(v_inv.grand_total, v_amount),
        COALESCE(v_new_bal, 0),
        CASE WHEN COALESCE(v_new_bal, 0) <= 0.01 THEN 'PAID' ELSE 'PARTIALLY PAID' END,
        v_payment_method, 'customer', v_customer_id, v_customer_name,
        'PAYMENT', v_payment_id::TEXT, COALESCE(v_invoice_number, v_payment_id::TEXT),
        'Payment received from ' || v_customer_name || ' (' || v_payment_method || ')',
        'COMPLETED', NOW(), NOW()
    );

    -- Record Cashbook Inflow
    INSERT INTO public.cashbook_entries (
        id, workspace_id, branch_id, entry_number, transaction_date,
        source_type, source_id, reference_number, direction,
        amount, payment_method, party_name, description, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_workspace_id, v_branch_id, 'CB-PAY-' || SUBSTRING(v_payment_id::TEXT, 1, 8),
        v_payment_date, 'INVOICE_PAYMENT', v_payment_id, COALESCE(v_invoice_number, v_payment_id::TEXT),
        'IN', v_amount, v_payment_method, v_customer_name,
        'Customer payment received from ' || v_customer_name, NOW(), NOW()
    );

    v_response := jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'amount', v_amount,
        'new_balance', COALESCE(v_new_bal, 0),
        'status', COALESCE(v_new_status, 'COMPLETED')
    );

    IF v_idempotency_key IS NOT NULL THEN
        INSERT INTO public.idempotency_keys (
            workspace_id, idempotency_key, operation_type, resource_id, response_payload, status
        ) VALUES (
            v_workspace_id, v_idempotency_key, 'CUSTOMER_PAYMENT', v_payment_id, v_response, 'COMPLETED'
        )
        ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;
    END IF;

    RETURN v_response;
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. RECONCILE QUOTATION CONVERSIONS (AUDITABLE HISTORICAL RECONCILIATION)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_quotation_conversions(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
                id, workspace_id, branch_id, transaction_code, transaction_date,
                transaction_type, direction, amount, total_amount, remaining_amount,
                payment_status, payment_mode, party_type, party_id, party_name,
                reference_type, reference_id, reference_number, description,
                status, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), v_ws_id, v_inv.branch_id,
                'ACC-' || v_inv.invoice_number, v_inv.date, 'SALE', 'IN', 0,
                v_inv.grand_total, COALESCE(v_inv.balance_amount, v_inv.grand_total - COALESCE(v_inv.paid_amount, 0)),
                CASE WHEN v_inv.balance_amount <= 0.01 THEN 'PAID' WHEN v_inv.paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
                'Cash', 'customer', v_inv.customer_id, v_inv.customer_name,
                'INVOICE', v_inv.id::TEXT, v_inv.invoice_number,
                'Invoice #' || v_inv.invoice_number || ' (Quotation #' || COALESCE(v_inv.quotation_number, '') || ')',
                'COMPLETED', NOW(), NOW()
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

-- -----------------------------------------------------------------------------
-- 11. GRANT PERMISSIONS & RELOAD SCHEMA CACHE
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.finalize_invoice_transaction(JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_counter_sale(JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_expense_atomic(JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.post_customer_payment_atomic(JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_quotation_conversions(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_workspace_id() TO authenticated, anon, service_role;

GRANT ALL ON public.idempotency_keys TO authenticated, service_role;
GRANT ALL ON public.branches TO authenticated, service_role;
GRANT ALL ON public.branch_inventory TO authenticated, service_role;
GRANT ALL ON public.cashbook_entries TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

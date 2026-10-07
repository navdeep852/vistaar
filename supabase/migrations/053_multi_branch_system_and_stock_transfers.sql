-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 053: MULTI-BRANCH / MULTI-LOCATION SYSTEM
-- =============================================================================
-- Production-grade Multi-Branch / Multi-Location System Architecture
-- 1. Dedicated Branches Entity (public.branches)
-- 2. User/Employee Branch Access Control (public.user_branch_access)
-- 3. Branch-Specific Product Inventory (public.branch_inventory)
-- 4. Multi-Branch Stock Transfer Engine (public.stock_transfers & items)
-- 5. Branch-Aware Foreign Keys on all Transaction and Financial Tables
-- 6. Comprehensive Row-Level Security (RLS) enforcing Tenant + Branch Isolation
-- 7. Authoritative Branch-Aware RPCs:
--    - public.get_authoritative_branch_product_stock
--    - public.finalize_invoice_transaction (updated)
--    - public.finalize_counter_sale (updated)
--    - public.execute_stock_transfer (atomic inter-branch stock transfer)
--    - public.post_customer_payment_atomic (updated)
--    - public.record_expense_atomic (updated)
--    - public.convert_quotation_to_invoice_atomic (updated)
-- 8. Safe, Idempotent Historical Migration of All Existing Workspace Data
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. DEDICATED BRANCHES ENTITY (public.branches)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    branch_code VARCHAR(50) NOT NULL,
    branch_name VARCHAR(255) NOT NULL,
    branch_type VARCHAR(50) NOT NULL DEFAULT 'Store', -- Store, Office, Warehouse, Factory, Other
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    phone VARCHAR(50),
    email VARCHAR(255),
    gstin VARCHAR(50),
    state_code VARCHAR(10),
    status VARCHAR(50) NOT NULL DEFAULT 'Active', -- Active, Inactive
    is_main_branch BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraint: branch_code unique per workspace (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_workspace_code_upper
    ON public.branches (workspace_id, UPPER(TRIM(branch_code)));

-- Partial unique index: Only one active main branch per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_one_active_main_per_workspace
    ON public.branches (workspace_id)
    WHERE is_main_branch = TRUE AND status = 'Active';

CREATE INDEX IF NOT EXISTS idx_branches_workspace_id ON public.branches(workspace_id);
CREATE INDEX IF NOT EXISTS idx_branches_workspace_status ON public.branches(workspace_id, status);

-- Enable RLS on branches
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. USER / EMPLOYEE BRANCH ASSIGNMENT (public.user_branch_access)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_branch_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_branch UNIQUE (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_branch_access_lookup ON public.user_branch_access(user_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_workspace ON public.user_branch_access(workspace_id, user_id);

-- Add default_branch_id to profiles if not present
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS default_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- Enable RLS on user_branch_access
ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. BRANCH-SPECIFIC INVENTORY (public.branch_inventory)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branch_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    opening_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
    current_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
    min_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
    reorder_level NUMERIC(12,2) NOT NULL DEFAULT 0,
    rack_location VARCHAR(100),
    purchase_price NUMERIC(12,2),
    selling_price NUMERIC(12,2),
    status VARCHAR(50) NOT NULL DEFAULT 'In Stock',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_branch_product UNIQUE (branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_ws_branch ON public.branch_inventory(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_product ON public.branch_inventory(workspace_id, product_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_lookup ON public.branch_inventory(branch_id, product_id);

-- Enable RLS on branch_inventory
ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. STOCK TRANSFERS MODULE (public.stock_transfers & items)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    transfer_number VARCHAR(100) NOT NULL,
    source_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    destination_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'Completed', -- Draft, Requested, Approved, In Transit, Completed, Cancelled
    requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_transfer_number UNIQUE (workspace_id, transfer_number),
    CONSTRAINT check_different_branches CHECK (source_branch_id <> destination_branch_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_ws_date ON public.stock_transfers(workspace_id, transfer_date);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_source ON public.stock_transfers(workspace_id, source_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_dest ON public.stock_transfers(workspace_id, destination_branch_id);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON public.stock_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product ON public.stock_transfer_items(product_id);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 5. EXTEND EXISTING TRANSACTION AND OPERATIONAL TABLES WITH branch_id
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.stock_receipts
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_stock_receipts_branch ON public.stock_receipts(workspace_id, branch_id);

ALTER TABLE IF EXISTS public.stock_movements
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON public.stock_movements(workspace_id, branch_id);

ALTER TABLE IF EXISTS public.invoices
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON public.invoices(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch_date ON public.invoices(workspace_id, branch_id, date);

ALTER TABLE IF EXISTS public.invoice_items
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.counter_sales
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_counter_sales_branch ON public.counter_sales(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_counter_sales_branch_date ON public.counter_sales(workspace_id, branch_id, sale_date);

ALTER TABLE IF EXISTS public.counter_sale_items
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.payments
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_payments_branch ON public.payments(workspace_id, branch_id);

ALTER TABLE IF EXISTS public.udhari_records
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_udhari_records_branch ON public.udhari_records(workspace_id, branch_id);

ALTER TABLE IF EXISTS public.udhari_payments
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_udhari_payments_branch ON public.udhari_payments(workspace_id, branch_id);

ALTER TABLE IF EXISTS public.daybook_transactions
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_daybook_branch ON public.daybook_transactions(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_daybook_branch_date ON public.daybook_transactions(workspace_id, branch_id, transaction_date);

ALTER TABLE IF EXISTS public.financial_accounts
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_financial_accounts_branch ON public.financial_accounts(workspace_id, branch_id);

ALTER TABLE IF EXISTS public.cashbook_entries
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_cashbook_branch ON public.cashbook_entries(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_cashbook_branch_date ON public.cashbook_entries(workspace_id, branch_id, entry_date);

ALTER TABLE IF EXISTS public.expenses
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON public.expenses(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON public.expenses(workspace_id, branch_id, expense_date);

ALTER TABLE IF EXISTS public.quotations
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_branch ON public.quotations(workspace_id, branch_id);

ALTER TABLE IF EXISTS public.quotation_items
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.purchase_orders
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch ON public.purchase_orders(workspace_id, branch_id);

ALTER TABLE IF EXISTS public.purchase_order_receipts
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_po_receipts_branch ON public.purchase_order_receipts(workspace_id, branch_id);

ALTER TABLE IF EXISTS public.follow_ups
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_follow_ups_branch ON public.follow_ups(workspace_id, branch_id);

ALTER TABLE IF EXISTS public.security_audit_logs
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.inventory_audit_logs
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 6. AUTHORITATIVE BRANCH ACCESS HELPER FUNCTIONS & RLS SECURITY
-- -----------------------------------------------------------------------------

-- Helper: Check if current user has access to a specific branch
CREATE OR REPLACE FUNCTION public.user_has_branch_access(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
    v_ws_id UUID;
    v_role TEXT;
    v_uid UUID;
BEGIN
    -- NULL branch means company-level item; allowed for anyone in workspace
    IF p_branch_id IS NULL THEN
        RETURN TRUE;
    END IF;

    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN FALSE;
    END IF;

    v_ws_id := public.current_user_workspace_id();
    IF v_ws_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Owner has unrestricted access to all branches in their workspace
    IF public.is_workspace_owner() THEN
        -- Verify branch actually belongs to this workspace
        RETURN EXISTS (
            SELECT 1 FROM public.branches
            WHERE id = p_branch_id AND workspace_id = v_ws_id
        );
    END IF;

    -- Non-owner: Check explicit assignment in user_branch_access
    RETURN EXISTS (
        SELECT 1 FROM public.user_branch_access uba
        JOIN public.branches b ON b.id = uba.branch_id
        WHERE uba.user_id = v_uid
          AND uba.branch_id = p_branch_id
          AND uba.workspace_id = v_ws_id
          AND b.status = 'Active'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_branch_access(UUID) TO anon, authenticated, service_role;

-- RLS POLICIES FOR BRANCHES
DROP POLICY IF EXISTS "Users can view permitted branches in their workspace" ON public.branches;
CREATE POLICY "Users can view permitted branches in their workspace"
    ON public.branches FOR SELECT
    USING (
        workspace_id = public.current_user_workspace_id()
        AND (
            public.is_workspace_owner()
            OR id IN (SELECT branch_id FROM public.user_branch_access WHERE user_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Owners can manage branches in their workspace" ON public.branches;
CREATE POLICY "Owners can manage branches in their workspace"
    ON public.branches FOR ALL
    USING (
        workspace_id = public.current_user_workspace_id()
        AND public.is_workspace_owner()
    )
    WITH CHECK (
        workspace_id = public.current_user_workspace_id()
        AND public.is_workspace_owner()
    );

-- RLS POLICIES FOR USER_BRANCH_ACCESS
DROP POLICY IF EXISTS "Users can view user_branch_access in their workspace" ON public.user_branch_access;
CREATE POLICY "Users can view user_branch_access in their workspace"
    ON public.user_branch_access FOR SELECT
    USING (
        workspace_id = public.current_user_workspace_id()
        AND (
            public.is_workspace_owner()
            OR user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Owners can manage user_branch_access" ON public.user_branch_access;
CREATE POLICY "Owners can manage user_branch_access"
    ON public.user_branch_access FOR ALL
    USING (
        workspace_id = public.current_user_workspace_id()
        AND public.is_workspace_owner()
    )
    WITH CHECK (
        workspace_id = public.current_user_workspace_id()
        AND public.is_workspace_owner()
    );

-- RLS POLICIES FOR BRANCH_INVENTORY
DROP POLICY IF EXISTS "Users can view permitted branch_inventory" ON public.branch_inventory;
CREATE POLICY "Users can view permitted branch_inventory"
    ON public.branch_inventory FOR SELECT
    USING (
        workspace_id = public.current_user_workspace_id()
        AND public.user_has_branch_access(branch_id)
    );

DROP POLICY IF EXISTS "Owners and authorized staff can manage branch_inventory" ON public.branch_inventory;
CREATE POLICY "Owners and authorized staff can manage branch_inventory"
    ON public.branch_inventory FOR ALL
    USING (
        workspace_id = public.current_user_workspace_id()
        AND public.user_has_branch_access(branch_id)
    )
    WITH CHECK (
        workspace_id = public.current_user_workspace_id()
        AND public.user_has_branch_access(branch_id)
    );

-- RLS POLICIES FOR STOCK_TRANSFERS
DROP POLICY IF EXISTS "Users can view stock_transfers in their permitted branches" ON public.stock_transfers;
CREATE POLICY "Users can view stock_transfers in their permitted branches"
    ON public.stock_transfers FOR SELECT
    USING (
        workspace_id = public.current_user_workspace_id()
        AND (
            public.user_has_branch_access(source_branch_id)
            OR public.user_has_branch_access(destination_branch_id)
        )
    );

DROP POLICY IF EXISTS "Users can insert stock_transfers for permitted branches" ON public.stock_transfers;
CREATE POLICY "Users can insert stock_transfers for permitted branches"
    ON public.stock_transfers FOR INSERT
    WITH CHECK (
        workspace_id = public.current_user_workspace_id()
        AND public.user_has_branch_access(source_branch_id)
    );

DROP POLICY IF EXISTS "Users can manage stock_transfers in their permitted branches" ON public.stock_transfers;
CREATE POLICY "Users can manage stock_transfers in their permitted branches"
    ON public.stock_transfers FOR UPDATE
    USING (
        workspace_id = public.current_user_workspace_id()
        AND (
            public.user_has_branch_access(source_branch_id)
            OR public.user_has_branch_access(destination_branch_id)
        )
    );

-- RLS POLICIES FOR STOCK_TRANSFER_ITEMS
DROP POLICY IF EXISTS "Users can view stock_transfer_items" ON public.stock_transfer_items;
CREATE POLICY "Users can view stock_transfer_items"
    ON public.stock_transfer_items FOR SELECT
    USING (
        workspace_id = public.current_user_workspace_id()
        AND transfer_id IN (
            SELECT id FROM public.stock_transfers
            WHERE workspace_id = public.current_user_workspace_id()
              AND (
                  public.user_has_branch_access(source_branch_id)
                  OR public.user_has_branch_access(destination_branch_id)
              )
        )
    );

-- RLS POLICIES FOR INVOICES (HARDENED WITH BRANCH CHECK)
DROP POLICY IF EXISTS "Users can view invoices with branch check" ON public.invoices;
CREATE POLICY "Users can view invoices with branch check"
    ON public.invoices FOR SELECT
    USING (
        workspace_id = public.current_user_workspace_id()
        AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
    );

DROP POLICY IF EXISTS "Users can insert invoices with branch check" ON public.invoices;
CREATE POLICY "Users can insert invoices with branch check"
    ON public.invoices FOR INSERT
    WITH CHECK (
        workspace_id = public.current_user_workspace_id()
        AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
    );

DROP POLICY IF EXISTS "Users can update invoices with branch check" ON public.invoices;
CREATE POLICY "Users can update invoices with branch check"
    ON public.invoices FOR UPDATE
    USING (
        workspace_id = public.current_user_workspace_id()
        AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
    );

-- RLS POLICIES FOR COUNTER_SALES (HARDENED WITH BRANCH CHECK)
DROP POLICY IF EXISTS "Users can view counter_sales with branch check" ON public.counter_sales;
CREATE POLICY "Users can view counter_sales with branch check"
    ON public.counter_sales FOR SELECT
    USING (
        workspace_id = public.current_user_workspace_id()
        AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
    );

DROP POLICY IF EXISTS "Users can insert counter_sales with branch check" ON public.counter_sales;
CREATE POLICY "Users can insert counter_sales with branch check"
    ON public.counter_sales FOR INSERT
    WITH CHECK (
        workspace_id = public.current_user_workspace_id()
        AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
    );

-- RLS POLICIES FOR DAYBOOK & CASHBOOK
DROP POLICY IF EXISTS "Users can view daybook with branch check" ON public.daybook_transactions;
CREATE POLICY "Users can view daybook with branch check"
    ON public.daybook_transactions FOR SELECT
    USING (
        workspace_id = public.current_user_workspace_id()
        AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
    );

DROP POLICY IF EXISTS "Users can view cashbook with branch check" ON public.cashbook_entries;
CREATE POLICY "Users can view cashbook with branch check"
    ON public.cashbook_entries FOR SELECT
    USING (
        workspace_id = public.current_user_workspace_id()
        AND (branch_id IS NULL OR public.user_has_branch_access(branch_id))
    );

-- -----------------------------------------------------------------------------
-- 7. AUTHORITATIVE BRANCH STOCK CALCULATION FUNCTIONS
-- -----------------------------------------------------------------------------

-- Helper: Get authoritative stock for a product at a specific branch (or consolidated)
CREATE OR REPLACE FUNCTION public.get_authoritative_branch_product_stock(
    p_product_id UUID,
    p_branch_id UUID,
    p_workspace_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_receipt_stock NUMERIC := 0;
    v_branch_stock NUMERIC := 0;
    v_global_stock NUMERIC := 0;
BEGIN
    IF p_product_id IS NULL OR p_workspace_id IS NULL THEN
        RETURN 0;
    END IF;

    -- Specific branch requested
    IF p_branch_id IS NOT NULL THEN
        -- 1. Sum active receipts for this product at this branch
        SELECT COALESCE(SUM(quantity_remaining), 0)
        INTO v_receipt_stock
        FROM public.stock_receipts
        WHERE product_id = p_product_id
          AND branch_id = p_branch_id
          AND workspace_id = p_workspace_id
          AND quantity_remaining > 0;

        IF v_receipt_stock > 0 THEN
            RETURN v_receipt_stock;
        END IF;

        -- 2. Fallback to branch_inventory current_stock
        SELECT COALESCE(current_stock, 0)
        INTO v_branch_stock
        FROM public.branch_inventory
        WHERE product_id = p_product_id
          AND branch_id = p_branch_id
          AND workspace_id = p_workspace_id;

        RETURN COALESCE(v_branch_stock, 0);
    END IF;

    -- No specific branch requested: consolidated stock across all branches in workspace
    SELECT COALESCE(SUM(quantity_remaining), 0)
    INTO v_receipt_stock
    FROM public.stock_receipts
    WHERE product_id = p_product_id
      AND workspace_id = p_workspace_id
      AND quantity_remaining > 0;

    IF v_receipt_stock > 0 THEN
        RETURN v_receipt_stock;
    END IF;

    SELECT COALESCE(current_stock, 0)
    INTO v_global_stock
    FROM public.products
    WHERE id = p_product_id AND workspace_id = p_workspace_id;

    RETURN COALESCE(v_global_stock, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_authoritative_branch_product_stock(UUID, UUID, UUID) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. ATOMIC STOCK TRANSFER RPC (execute_stock_transfer)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_stock_transfer(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_user_id UUID;
    v_transfer_id UUID;
    v_transfer_number TEXT;
    v_source_branch_id UUID;
    v_destination_branch_id UUID;
    v_transfer_date DATE;
    v_notes TEXT;
    v_items JSONB;
    v_item JSONB;
    v_prod_id UUID;
    v_qty NUMERIC(12,2);
    v_cost NUMERIC(12,2);
    v_avail_stock NUMERIC(12,2);
    v_prod_name TEXT;
    v_remaining_deduct NUMERIC(12,2);
    v_receipt RECORD;
    v_rec_deduct NUMERIC(12,2);
    v_trf_count INT;
    v_year_str TEXT;
    v_new_dest_receipt_id UUID;
    v_source_new_stock NUMERIC(12,2);
    v_dest_new_stock NUMERIC(12,2);
BEGIN
    -- 1. Workspace & Auth Validation
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Workspace could not be resolved.';
    END IF;

    v_user_id := auth.uid();

    -- 2. Extract & Validate Branches
    v_source_branch_id := (p_payload->>'source_branch_id')::UUID;
    v_destination_branch_id := (p_payload->>'destination_branch_id')::UUID;

    IF v_source_branch_id IS NULL OR v_destination_branch_id IS NULL THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Source and destination branches are required.';
    END IF;

    IF v_source_branch_id = v_destination_branch_id THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Source and destination branches must be different.';
    END IF;

    -- Verify caller branch permissions
    IF NOT public.user_has_branch_access(v_source_branch_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: You do not have permission to transfer stock out of source branch %.', v_source_branch_id;
    END IF;

    v_transfer_date := COALESCE((p_payload->>'transfer_date')::DATE, CURRENT_DATE);
    v_notes := p_payload->>'notes';
    v_items := p_payload->'items';

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Stock transfer must include at least one item.';
    END IF;

    -- 3. Generate Transfer Number if not provided
    v_transfer_number := trim(COALESCE(p_payload->>'transfer_number', ''));
    IF v_transfer_number = '' THEN
        v_year_str := TO_CHAR(v_transfer_date, 'YYYY');
        SELECT COUNT(*) + 1 INTO v_trf_count
        FROM public.stock_transfers
        WHERE workspace_id = v_workspace_id;
        v_transfer_number := 'TRF-' || v_year_str || '-' || LPAD(v_trf_count::TEXT, 5, '0');
    END IF;

    -- 4. Check Stock Availability at Source Branch (Locking rows)
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_prod_id := (v_item->>'productId')::UUID;
        v_qty := ROUND(COALESCE((v_item->>'quantity')::NUMERIC, 0), 2);

        IF v_prod_id IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Invalid product ID or transfer quantity (%).', v_qty;
        END IF;

        SELECT name INTO v_prod_name
        FROM public.products
        WHERE id = v_prod_id AND workspace_id = v_workspace_id
        FOR UPDATE;

        IF v_prod_name IS NULL THEN
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % not found.', v_prod_id;
        END IF;

        v_avail_stock := public.get_authoritative_branch_product_stock(v_prod_id, v_source_branch_id, v_workspace_id);

        IF v_avail_stock < v_qty THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Source branch has % units of "%", but % was requested for transfer.',
                v_avail_stock, v_prod_name, v_qty;
        END IF;
    END LOOP;

    -- 5. Insert Stock Transfer Header
    v_transfer_id := gen_random_uuid();
    INSERT INTO public.stock_transfers (
        id,
        workspace_id,
        transfer_number,
        source_branch_id,
        destination_branch_id,
        transfer_date,
        status,
        requested_by,
        approved_by,
        notes,
        created_at,
        completed_at,
        updated_at
    ) VALUES (
        v_transfer_id,
        v_workspace_id,
        v_transfer_number,
        v_source_branch_id,
        v_destination_branch_id,
        v_transfer_date,
        'Completed',
        v_user_id,
        v_user_id,
        v_notes,
        NOW(),
        NOW(),
        NOW()
    );

    -- 6. Process Transfer Line Items & Atomically Shift Inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_prod_id := (v_item->>'productId')::UUID;
        v_qty := ROUND(COALESCE((v_item->>'quantity')::NUMERIC, 0), 2);
        v_cost := ROUND(COALESCE((v_item->>'unitCost')::NUMERIC, (v_item->>'unit_cost')::NUMERIC, 0), 2);

        -- Insert transfer item record
        INSERT INTO public.stock_transfer_items (
            id,
            workspace_id,
            transfer_id,
            product_id,
            quantity,
            unit_cost,
            notes
        ) VALUES (
            gen_random_uuid(),
            v_workspace_id,
            v_transfer_id,
            v_prod_id,
            v_qty,
            v_cost,
            v_item->>'notes'
        );

        -- A. Deduct FIFO from Source Branch stock_receipts
        v_remaining_deduct := v_qty;
        FOR v_receipt IN
            SELECT id, quantity_remaining, buy_price
            FROM public.stock_receipts
            WHERE product_id = v_prod_id
              AND branch_id = v_source_branch_id
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

            IF v_cost = 0 AND v_receipt.buy_price IS NOT NULL THEN
                v_cost := v_receipt.buy_price;
            END IF;
        END LOOP;

        -- Record TRANSFER_OUT stock movement at source branch
        INSERT INTO public.stock_movements (
            id,
            workspace_id,
            branch_id,
            product_id,
            type,
            quantity,
            movement_date,
            reference_id,
            reference_type,
            notes,
            created_by
        ) VALUES (
            gen_random_uuid(),
            v_workspace_id,
            v_source_branch_id,
            v_prod_id,
            'TRANSFER_OUT',
            -v_qty,
            v_transfer_date,
            v_transfer_number,
            'STOCK_TRANSFER',
            'Stock transfer out to destination branch (' || v_transfer_number || ')',
            v_user_id
        );

        -- Update Source Branch branch_inventory
        SELECT COALESCE(SUM(quantity_remaining), 0)
        INTO v_source_new_stock
        FROM public.stock_receipts
        WHERE product_id = v_prod_id AND branch_id = v_source_branch_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

        INSERT INTO public.branch_inventory (
            workspace_id, branch_id, product_id, current_stock, updated_at
        ) VALUES (
            v_workspace_id, v_source_branch_id, v_prod_id, v_source_new_stock, NOW()
        )
        ON CONFLICT (branch_id, product_id)
        DO UPDATE SET
            current_stock = EXCLUDED.current_stock,
            updated_at = NOW();

        -- B. Add Stock Receipt at Destination Branch
        v_new_dest_receipt_id := gen_random_uuid();
        INSERT INTO public.stock_receipts (
            id,
            workspace_id,
            branch_id,
            product_id,
            receipt_number,
            received_date,
            quantity_received,
            quantity_remaining,
            buy_price,
            notes,
            created_at,
            updated_at
        ) VALUES (
            v_new_dest_receipt_id,
            v_workspace_id,
            v_destination_branch_id,
            v_prod_id,
            'REC-' || v_transfer_number,
            v_transfer_date,
            v_qty,
            v_qty,
            v_cost,
            'Stock transfer in from source branch (' || v_transfer_number || ')',
            NOW(),
            NOW()
        );

        -- Record TRANSFER_IN stock movement at destination branch
        INSERT INTO public.stock_movements (
            id,
            workspace_id,
            branch_id,
            product_id,
            type,
            quantity,
            movement_date,
            reference_id,
            reference_type,
            notes,
            created_by
        ) VALUES (
            gen_random_uuid(),
            v_workspace_id,
            v_destination_branch_id,
            v_prod_id,
            'TRANSFER_IN',
            v_qty,
            v_transfer_date,
            v_transfer_number,
            'STOCK_TRANSFER',
            'Stock transfer in from source branch (' || v_transfer_number || ')',
            v_user_id
        );

        -- Update Destination Branch branch_inventory
        SELECT COALESCE(SUM(quantity_remaining), 0)
        INTO v_dest_new_stock
        FROM public.stock_receipts
        WHERE product_id = v_prod_id AND branch_id = v_destination_branch_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

        INSERT INTO public.branch_inventory (
            workspace_id, branch_id, product_id, current_stock, updated_at
        ) VALUES (
            v_workspace_id, v_destination_branch_id, v_prod_id, v_dest_new_stock, NOW()
        )
        ON CONFLICT (branch_id, product_id)
        DO UPDATE SET
            current_stock = EXCLUDED.current_stock,
            updated_at = NOW();

        -- Consolidated product stock remains conserved (total sum unchanged)
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Stock transfer completed successfully.',
        'transfer_id', v_transfer_id,
        'transfer_number', v_transfer_number
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_stock_transfer(JSONB) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. UPDATE finalize_invoice_transaction WITH AUTHORITATIVE BRANCH CONTEXT
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
    v_branch_prefix TEXT;
BEGIN
    -- 1. Workspace Validation
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Active workspace could not be resolved.';
    END IF;

    -- 2. Resolve & Authorize Branch ID
    IF p_payload->>'branch_id' IS NOT NULL AND (p_payload->>'branch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_branch_id := (p_payload->>'branch_id')::UUID;
    END IF;

    -- If no branch provided, fallback to user default branch or workspace main branch
    IF v_branch_id IS NULL THEN
        SELECT default_branch_id INTO v_branch_id
        FROM public.profiles
        WHERE id = auth.uid() AND workspace_id = v_workspace_id;

        IF v_branch_id IS NULL THEN
            SELECT id INTO v_branch_id
            FROM public.branches
            WHERE workspace_id = v_workspace_id AND is_main_branch = TRUE AND status = 'Active'
            LIMIT 1;
        END IF;

        IF v_branch_id IS NULL THEN
            SELECT id INTO v_branch_id
            FROM public.branches
            WHERE workspace_id = v_workspace_id AND status = 'Active'
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;
    END IF;

    IF v_branch_id IS NOT NULL AND NOT public.user_has_branch_access(v_branch_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: You do not have permission to create invoices for branch %.', v_branch_id;
    END IF;

    -- 3. Extract & Validate Financial Amounts
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

    v_balance_amount := GREATEST(0, ROUND(v_grand_total - v_paid_amount, 2));

    IF v_paid_amount >= v_grand_total AND v_grand_total > 0 THEN
        v_status := 'Paid';
        v_balance_amount := 0;
    ELSIF v_paid_amount > 0 THEN
        v_status := 'Partially Paid';
    ELSE
        v_status := 'Issued';
    END IF;

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
        -- Branch-aware prefix if branch exists
        SELECT branch_code INTO v_branch_prefix FROM public.branches WHERE id = v_branch_id;
        SELECT COUNT(*) + 1 INTO v_inv_count FROM public.invoices WHERE workspace_id = v_workspace_id;
        v_year_str := TO_CHAR(v_date, 'YYYY');
        v_invoice_number := COALESCE(v_branch_prefix || '-', '') || 'INV-' || v_year_str || '-' || LPAD(v_inv_count::TEXT, 4, '0');
    END IF;

    -- 5. Check If Target Invoice Already Exists
    SELECT * INTO v_existing_inv
    FROM public.invoices
    WHERE (id = v_invoice_id OR invoice_number = v_invoice_number)
      AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF v_existing_inv.id IS NOT NULL THEN
        v_invoice_id := v_existing_inv.id;
        v_invoice_number := v_existing_inv.invoice_number;

        UPDATE public.invoices
        SET branch_id = COALESCE(v_branch_id, branch_id),
            customer_id = COALESCE(v_customer_id, customer_id),
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
        INSERT INTO public.invoices (
            id,
            workspace_id,
            branch_id,
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
            v_branch_id,
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

    -- 6. Insert Line Items
    v_items := p_payload->'items';
    IF v_items IS NOT NULL AND jsonb_array_length(v_items) > 0 THEN
        DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id AND workspace_id = v_workspace_id;

        FOR v_item_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
            v_line_item := v_items->v_item_idx;
            INSERT INTO public.invoice_items (
                id,
                workspace_id,
                branch_id,
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
                v_branch_id,
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

    -- 7. Authoritative Branch Stock Validation & FIFO Deduction
    IF NOT EXISTS (
        SELECT 1 FROM public.stock_movements
        WHERE workspace_id = v_workspace_id
          AND reference_id = v_invoice_number
          AND reference_type = 'INVOICE_SALE'
    ) THEN
        -- Validate Stock at specific branch
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

            v_avail_stock := public.get_authoritative_branch_product_stock(v_item.product_id, v_branch_id, v_workspace_id);

            IF (v_avail_stock < v_item.quantity) THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%" at selected branch. Requested %, but only % units are available.',
                    COALESCE(v_product_name, v_item.product_name), v_item.quantity, v_avail_stock;
            END IF;
        END LOOP;

        -- Deduct Stock FIFO at specific branch
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
            WHERE product_id = v_item.product_id
              AND workspace_id = v_workspace_id
              AND (v_branch_id IS NULL OR branch_id = v_branch_id)
              AND quantity_remaining > 0;

            v_remaining_deduct := v_item.quantity;
            v_receipt_deducted := 0;

            IF v_total_active_receipts > 0 THEN
                FOR v_receipt IN
                    SELECT id, quantity_remaining
                    FROM public.stock_receipts
                    WHERE product_id = v_item.product_id
                      AND workspace_id = v_workspace_id
                      AND (v_branch_id IS NULL OR branch_id = v_branch_id)
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
                    v_receipt_deducted := v_receipt_deducted + v_rec_deduct;
                END LOOP;
            END IF;

            v_uncovered_deduct := v_remaining_deduct;

            -- Recalculate and update branch_inventory
            IF v_branch_id IS NOT NULL THEN
                SELECT COALESCE(SUM(quantity_remaining), 0)
                INTO v_new_receipt_sum
                FROM public.stock_receipts
                WHERE product_id = v_item.product_id AND branch_id = v_branch_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

                INSERT INTO public.branch_inventory (
                    workspace_id, branch_id, product_id, current_stock, updated_at
                ) VALUES (
                    v_workspace_id, v_branch_id, v_item.product_id, v_new_receipt_sum, NOW()
                )
                ON CONFLICT (branch_id, product_id)
                DO UPDATE SET
                    current_stock = EXCLUDED.current_stock,
                    updated_at = NOW();
            END IF;

            -- Update overall products.current_stock
            SELECT COALESCE(SUM(quantity_remaining), 0)
            INTO v_new_receipt_sum
            FROM public.stock_receipts
            WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

            UPDATE public.products
            SET current_stock = v_new_receipt_sum,
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;

            -- Log Stock Movement with branch_id
            INSERT INTO public.stock_movements (
                workspace_id,
                branch_id,
                product_id,
                type,
                quantity,
                movement_date,
                reference_id,
                reference_type,
                notes
            ) VALUES (
                v_workspace_id,
                v_branch_id,
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

    UPDATE public.invoices
    SET is_stock_finalized = TRUE,
        stock_finalized_at = NOW()
    WHERE id = v_invoice_id AND workspace_id = v_workspace_id;

    -- 8. Record Initial Payment with branch_id
    IF v_paid_amount > 0 THEN
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
                branch_id,
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
                v_branch_id,
                v_customer_id,
                v_customer_name,
                v_invoice_id,
                v_invoice_number,
                v_payment_code,
                v_paid_amount,
                v_payment_date,
                v_payment_mode::public.payment_method,
                v_payment_ref,
                COALESCE(v_payment_notes, 'Initial payment recorded during invoice finalization'),
                NOW()
            );

            -- Post Cashbook Entry with branch_id
            BEGIN
                INSERT INTO public.cashbook_entries (
                    id,
                    workspace_id,
                    branch_id,
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
                    v_branch_id,
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
            EXCEPTION WHEN OTHERS THEN NULL; END;
        ELSE
            v_payment_id := v_existing_pay_id;
        END IF;
    END IF;

    -- 9. Post Daybook Sale Entry with branch_id
    v_daybook_id := gen_random_uuid();
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
        v_daybook_id,
        v_workspace_id,
        v_branch_id,
        'ACC-' || v_invoice_number,
        v_date,
        'SALE',
        'IN',
        v_paid_amount,
        v_grand_total,
        v_balance_amount,
        CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
        CASE WHEN v_paid_amount > 0 THEN v_payment_mode ELSE 'Cash' END,
        'customer',
        v_customer_id,
        v_customer_name,
        'INVOICE',
        v_invoice_id,
        v_invoice_number,
        'Tax Invoice #' || v_invoice_number,
        'ACTIVE',
        NOW(),
        NOW()
    )
    ON CONFLICT (workspace_id, reference_type, reference_id) WHERE reference_id IS NOT NULL
    DO UPDATE SET
        branch_id = COALESCE(EXCLUDED.branch_id, daybook_transactions.branch_id),
        amount = EXCLUDED.amount,
        total_amount = EXCLUDED.total_amount,
        remaining_amount = EXCLUDED.remaining_amount,
        payment_status = EXCLUDED.payment_status,
        payment_mode = EXCLUDED.payment_mode,
        party_name = EXCLUDED.party_name,
        updated_at = NOW();

    -- 10. Synchronize Udhari Record with branch_id
    IF v_balance_amount > 0 AND v_customer_id IS NOT NULL THEN
        INSERT INTO public.udhari_records (
            id,
            workspace_id,
            branch_id,
            customer_id,
            udhari_code,
            customer_name_snapshot,
            phone_snapshot,
            original_amount,
            total_received,
            outstanding_amount,
            due_date,
            status,
            notes,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_workspace_id,
            v_branch_id,
            v_customer_id,
            'UDH-' || v_invoice_number,
            v_customer_name,
            v_customer_phone,
            v_grand_total,
            v_paid_amount,
            v_balance_amount,
            v_due_date,
            'PARTIALLY_PAID',
            'Credit balance from Invoice #' || v_invoice_number,
            NOW(),
            NOW()
        )
        ON CONFLICT (workspace_id, udhari_code)
        DO UPDATE SET
            branch_id = COALESCE(EXCLUDED.branch_id, udhari_records.branch_id),
            total_received = EXCLUDED.total_received,
            outstanding_amount = EXCLUDED.outstanding_amount,
            status = CASE WHEN EXCLUDED.outstanding_amount <= 0 THEN 'PAID'::public.udhari_status ELSE 'PARTIALLY_PAID'::public.udhari_status END,
            updated_at = NOW();
    END IF;

    -- 11. Convert Quotation if present
    IF v_quotation_id IS NOT NULL THEN
        UPDATE public.quotations
        SET status = 'Converted',
            converted_invoice_id = v_invoice_id,
            updated_at = NOW()
        WHERE id = v_quotation_id AND workspace_id = v_workspace_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Invoice, branch inventory and accounting finalized successfully.',
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'branch_id', v_branch_id,
        'status', v_status,
        'paid_amount', v_paid_amount,
        'balance_amount', v_balance_amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_invoice_transaction(JSONB) TO authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- 10. UPDATE finalize_counter_sale WITH AUTHORITATIVE BRANCH CONTEXT
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
    v_user_id UUID;
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
    v_result_sale JSONB;
BEGIN
    -- 1. Tenant Workspace
    v_workspace_id := public.current_user_workspace_id();
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User is not associated with an active workspace.';
    END IF;
    v_user_id := auth.uid();

    -- 2. Resolve & Authorize Branch
    IF p_sale->>'branch_id' IS NOT NULL AND (p_sale->>'branch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_branch_id := (p_sale->>'branch_id')::UUID;
    END IF;

    IF v_branch_id IS NULL THEN
        SELECT default_branch_id INTO v_branch_id
        FROM public.profiles
        WHERE id = v_user_id AND workspace_id = v_workspace_id;

        IF v_branch_id IS NULL THEN
            SELECT id INTO v_branch_id
            FROM public.branches
            WHERE workspace_id = v_workspace_id AND is_main_branch = TRUE AND status = 'Active'
            LIMIT 1;
        END IF;

        IF v_branch_id IS NULL THEN
            SELECT id INTO v_branch_id
            FROM public.branches
            WHERE workspace_id = v_workspace_id AND status = 'Active'
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;
    END IF;

    IF v_branch_id IS NOT NULL AND NOT public.user_has_branch_access(v_branch_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: You do not have permission to execute counter sales at branch %.', v_branch_id;
    END IF;

    -- 3. Extract Fields
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

    BEGIN
        v_db_payment_method := v_payment_method::public.payment_method;
    EXCEPTION WHEN OTHERS THEN
        v_db_payment_method := 'Other'::public.payment_method;
    END;

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
            'finalTotal', cs.final_total,
            'status', cs.status,
            'paymentMethod', cs.payment_method,
            'amountReceived', cs.amount_received,
            'balanceAmount', cs.balance_amount
        ) INTO v_result_sale
        FROM public.counter_sales cs
        WHERE cs.id = v_existing_sale.id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Transaction previously completed (idempotent)',
            'data', v_result_sale
        );
    END IF;

    -- 5. Branch Stock Validation & Row Locking
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

            v_avail_stock := public.get_authoritative_branch_product_stock(v_prod_id, v_branch_id, v_workspace_id);

            IF v_avail_stock < v_item_qty THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%" at selected branch. Available: %, Requested: %',
                    v_prod_name, v_avail_stock, v_item_qty;
            END IF;
        END IF;
    END LOOP;

    -- 6. Insert Counter Sale Parent Record with branch_id
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

    -- 7. Insert Line Items & Deduct Branch Inventory (FIFO)
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

            FOR v_receipt IN
                SELECT id, quantity_remaining
                FROM public.stock_receipts
                WHERE product_id = v_prod_id 
                  AND workspace_id = v_workspace_id 
                  AND (v_branch_id IS NULL OR branch_id = v_branch_id)
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

            -- Update Branch Inventory
            IF v_branch_id IS NOT NULL THEN
                SELECT COALESCE(SUM(quantity_remaining), 0)
                INTO v_new_receipt_sum
                FROM public.stock_receipts
                WHERE product_id = v_prod_id AND branch_id = v_branch_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

                INSERT INTO public.branch_inventory (
                    workspace_id, branch_id, product_id, current_stock, updated_at
                ) VALUES (
                    v_workspace_id, v_branch_id, v_prod_id, v_new_receipt_sum, NOW()
                )
                ON CONFLICT (branch_id, product_id)
                DO UPDATE SET
                    current_stock = EXCLUDED.current_stock,
                    updated_at = NOW();
            END IF;

            -- Update global product stock
            SELECT COALESCE(SUM(quantity_remaining), 0)
            INTO v_new_receipt_sum
            FROM public.stock_receipts
            WHERE product_id = v_prod_id AND workspace_id = v_workspace_id AND quantity_remaining > 0;

            UPDATE public.products
            SET current_stock = v_new_receipt_sum,
                updated_at = NOW()
            WHERE id = v_prod_id AND workspace_id = v_workspace_id;

            -- Record Stock Movement with branch_id
            INSERT INTO public.stock_movements (
                workspace_id, branch_id, product_id, type, quantity, movement_date,
                reference_id, reference_type, notes, created_by
            ) VALUES (
                v_workspace_id, v_branch_id, v_prod_id, 'SALE', -v_item_qty, v_sale_date,
                v_invoice_number, 'COUNTER_SALE', 'Counter sale #' || v_sale_number, v_user_id
            );
        END IF;
    END LOOP;

    -- Return full counter sale record
    SELECT jsonb_build_object(
        'id', cs.id,
        'branchId', cs.branch_id,
        'saleNumber', cs.sale_number,
        'invoiceNumber', cs.invoice_number,
        'customerId', cs.customer_id,
        'customerName', cs.customer_name,
        'phoneNumber', cs.phone_number,
        'saleDate', cs.sale_date,
        'subtotal', cs.subtotal,
        'finalTotal', cs.final_total,
        'status', cs.status,
        'paymentMethod', cs.payment_method,
        'amountReceived', cs.amount_received,
        'balanceAmount', cs.balance_amount
    ) INTO v_result_sale
    FROM public.counter_sales cs
    WHERE cs.id = v_counter_sale_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Counter sale finalized successfully.',
        'data', v_result_sale
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_counter_sale(JSONB) TO authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- 11. UPDATE post_customer_payment_atomic WITH BRANCH PROPAGATION
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
    v_invoice_id UUID;
    v_udhari_id UUID;
    v_amount NUMERIC(12,2);
    v_payment_method VARCHAR(50);
    v_payment_date DATE;
    v_customer_id UUID;
    v_customer_name VARCHAR(255);
    v_customer_phone VARCHAR(50);
    v_reference VARCHAR(100);
    v_notes TEXT;
    v_payment_id UUID;
    v_payment_code VARCHAR(100);

    v_inv RECORD;
    v_udhari RECORD;

    v_new_paid NUMERIC(12,2);
    v_new_balance NUMERIC(12,2);
    v_new_status VARCHAR(50);

    v_new_inv_paid NUMERIC(12,2);
    v_new_inv_bal NUMERIC(12,2);
    v_new_inv_status VARCHAR(50);
    v_inv_total NUMERIC(12,2);

    v_target_ref_num VARCHAR(100);
    v_account_name VARCHAR(100);
BEGIN
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Workspace could not be resolved.';
    END IF;

    -- Extract payload fields
    v_invoice_id := NULLIF(p_payload->>'invoice_id', '')::UUID;
    v_udhari_id := NULLIF(p_payload->>'udhari_id', '')::UUID;
    v_amount := ROUND(COALESCE((p_payload->>'amount')::NUMERIC, 0), 2);
    v_payment_method := COALESCE(p_payload->>'payment_method', 'Cash');
    v_payment_date := COALESCE((p_payload->>'payment_date')::DATE, CURRENT_DATE);
    v_reference := p_payload->>'reference';
    v_notes := p_payload->>'notes';
    v_customer_id := NULLIF(p_payload->>'customer_id', '')::UUID;
    v_customer_name := COALESCE(p_payload->>'customer_name', 'Customer');
    v_customer_phone := COALESCE(p_payload->>'customer_phone', '');

    IF p_payload->>'branch_id' IS NOT NULL AND (p_payload->>'branch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_branch_id := (p_payload->>'branch_id')::UUID;
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Payment amount must be greater than zero.';
    END IF;

    -- If branch_id not provided, resolve from linked invoice or udhari record
    IF v_branch_id IS NULL AND v_invoice_id IS NOT NULL THEN
        SELECT branch_id INTO v_branch_id FROM public.invoices WHERE id = v_invoice_id AND workspace_id = v_workspace_id;
    END IF;
    IF v_branch_id IS NULL AND v_udhari_id IS NOT NULL THEN
        SELECT branch_id INTO v_branch_id FROM public.udhari_records WHERE id = v_udhari_id AND workspace_id = v_workspace_id;
    END IF;

    -- 1. Synchronize Invoice if provided
    IF v_invoice_id IS NOT NULL THEN
        SELECT * INTO v_inv
        FROM public.invoices
        WHERE id = v_invoice_id AND workspace_id = v_workspace_id
        FOR UPDATE;

        IF v_inv.id IS NOT NULL THEN
            v_branch_id := COALESCE(v_branch_id, v_inv.branch_id);
            v_inv_total := COALESCE(v_inv.grand_total, 0);
            v_new_inv_paid := COALESCE(v_inv.paid_amount, 0) + v_amount;
            v_new_inv_bal := GREATEST(0, v_inv_total - v_new_inv_paid);
            v_new_inv_status := CASE WHEN v_new_inv_bal <= 0.01 THEN 'Paid' ELSE 'Partially Paid' END;
            v_target_ref_num := v_inv.invoice_number;
            v_customer_id := COALESCE(v_customer_id, v_inv.customer_id);
            v_customer_name := COALESCE(v_inv.customer_name, v_customer_name);

            UPDATE public.invoices
            SET paid_amount = v_new_inv_paid,
                balance_amount = v_new_inv_bal,
                status = v_new_inv_status,
                updated_at = NOW()
            WHERE id = v_invoice_id;
        END IF;
    END IF;

    -- 2. Synchronize Udhari Record if provided
    IF v_udhari_id IS NOT NULL THEN
        SELECT * INTO v_udhari
        FROM public.udhari_records
        WHERE id = v_udhari_id AND workspace_id = v_workspace_id
        FOR UPDATE;

        IF v_udhari.id IS NOT NULL THEN
            v_branch_id := COALESCE(v_branch_id, v_udhari.branch_id);
            v_new_paid := COALESCE(v_udhari.total_received, 0) + v_amount;
            v_new_balance := GREATEST(0, COALESCE(v_udhari.original_amount, 0) - v_new_paid);
            v_new_status := CASE WHEN v_new_balance <= 0.01 THEN 'PAID' ELSE 'PARTIALLY_PAID' END;
            v_target_ref_num := COALESCE(v_target_ref_num, v_udhari.udhari_code);
            v_customer_id := COALESCE(v_customer_id, v_udhari.customer_id);
            v_customer_name := COALESCE(v_udhari.customer_name_snapshot, v_customer_name);

            UPDATE public.udhari_records
            SET total_received = v_new_paid,
                outstanding_amount = v_new_balance,
                status = v_new_status::public.udhari_status,
                updated_at = NOW()
            WHERE id = v_udhari_id;
        END IF;
    END IF;

    -- 3. Create Authoritative Payment Record
    v_payment_id := gen_random_uuid();
    v_payment_code := 'PAY-' || TO_CHAR(v_payment_date, 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');

    INSERT INTO public.payments (
        id,
        workspace_id,
        branch_id,
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
        v_branch_id,
        v_customer_id,
        v_customer_name,
        v_invoice_id,
        v_target_ref_num,
        v_payment_code,
        v_amount,
        v_payment_date,
        v_payment_method::public.payment_method,
        v_reference,
        v_notes,
        NOW()
    );

    -- Also record in udhari_payments if linked to an udhari record
    IF v_udhari_id IS NOT NULL THEN
        INSERT INTO public.udhari_payments (
            id,
            workspace_id,
            branch_id,
            udhari_id,
            customer_id,
            payment_code,
            amount,
            payment_method,
            payment_date,
            phone_number,
            reference,
            notes,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_workspace_id,
            v_branch_id,
            v_udhari_id,
            v_customer_id,
            v_payment_code,
            v_amount,
            v_payment_method::public.payment_method,
            v_payment_date,
            v_customer_phone,
            v_reference,
            v_notes,
            NOW()
        );
    END IF;

    -- 4. Create Cashbook Inflow Entry with branch_id
    IF v_amount > 0 AND v_payment_method != 'Credit' AND v_payment_method != 'Credit / Udhari' THEN
        INSERT INTO public.cashbook_entries (
            id,
            workspace_id,
            branch_id,
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
            v_branch_id,
            'CUSTOMER_PAYMENT',
            v_payment_id::TEXT,
            COALESCE(v_target_ref_num, v_payment_code),
            'IN',
            v_amount,
            v_payment_method,
            v_customer_name,
            'Payment receipt #' || v_payment_code || ' for ' || COALESCE(v_target_ref_num, 'customer account'),
            v_notes,
            v_payment_date,
            NOW(),
            NOW()
        );
    END IF;

    -- 5. Create Daybook Transaction Entry with branch_id
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
        v_workspace_id,
        v_branch_id,
        'ACC-' || v_payment_code,
        v_payment_date,
        'PAYMENT_RECEIVED',
        'IN',
        v_amount,
        COALESCE(v_inv_total, v_amount),
        COALESCE(v_new_inv_bal, v_new_balance, 0),
        'PAID',
        v_payment_method,
        'customer',
        v_customer_id,
        v_customer_name,
        'PAYMENT',
        v_payment_id,
        v_payment_code,
        'Payment received #' || v_payment_code || ' for #' || COALESCE(v_target_ref_num, 'account'),
        'ACTIVE',
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Payment recorded and synchronized across accounting ledgers.',
        'payment_id', v_payment_id,
        'payment_code', v_payment_code,
        'branch_id', v_branch_id,
        'amount', v_amount,
        'remaining_balance', COALESCE(v_new_inv_bal, v_new_balance, 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_customer_payment_atomic(JSONB) TO authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- 12. UPDATE record_expense_atomic WITH BRANCH PROPAGATION
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
    v_category public.expense_category;
    v_expense_name VARCHAR(255);
    v_amount NUMERIC(12,2);
    v_expense_date DATE;
    v_paid_to VARCHAR(255);
    v_payment_mode VARCHAR(50);
    v_reference_no VARCHAR(100);
    v_notes TEXT;
    v_is_edit BOOLEAN := FALSE;
    v_tx_code VARCHAR(100);
    v_daybook_id UUID;
    v_description TEXT;
    v_party_name VARCHAR(255);
BEGIN
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id is required';
    END IF;

    -- Branch ID: NULL means company-level expense
    IF p_payload->>'branch_id' IS NOT NULL AND (p_payload->>'branch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_branch_id := (p_payload->>'branch_id')::UUID;
    END IF;

    v_category := (p_payload->>'category')::public.expense_category;
    v_expense_name := p_payload->>'expense_name';
    v_amount := ROUND(COALESCE((p_payload->>'amount')::NUMERIC, 0), 2);
    v_expense_date := COALESCE((p_payload->>'expense_date')::DATE, CURRENT_DATE);
    v_paid_to := p_payload->>'paid_to';
    v_payment_mode := COALESCE(p_payload->>'payment_mode', 'Cash');
    v_reference_no := p_payload->>'reference_no';
    v_notes := p_payload->>'notes';

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'Expense amount must be greater than zero.';
    END IF;

    IF p_payload->>'id' IS NOT NULL AND (p_payload->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_expense_id := (p_payload->>'id')::UUID;
        v_is_edit := TRUE;
    ELSE
        v_expense_id := gen_random_uuid();
    END IF;

    IF v_is_edit THEN
        UPDATE public.expenses
        SET branch_id = v_branch_id,
            category = v_category,
            expense_name = v_expense_name,
            amount = v_amount,
            expense_date = v_expense_date,
            paid_to = v_paid_to,
            payment_mode = v_payment_mode,
            reference_no = v_reference_no,
            notes = v_notes
        WHERE id = v_expense_id AND workspace_id = v_workspace_id;
    ELSE
        INSERT INTO public.expenses (
            id, workspace_id, branch_id, category, expense_name, amount,
            expense_date, paid_to, payment_mode, reference_no, notes, created_at
        ) VALUES (
            v_expense_id, v_workspace_id, v_branch_id, v_category, v_expense_name, v_amount,
            v_expense_date, v_paid_to, v_payment_mode, v_reference_no, v_notes, NOW()
        );
    END IF;

    v_tx_code := 'EXP-' || TO_CHAR(v_expense_date, 'YYYYMMDD') || '-' || SUBSTRING(v_expense_id::TEXT FROM 1 FOR 6);
    v_description := COALESCE(v_expense_name, v_category::TEXT || ' Expense');
    v_party_name := COALESCE(v_paid_to, 'Operational Vendor');

    -- Upsert Daybook entry with branch_id
    INSERT INTO public.daybook_transactions (
        id, workspace_id, branch_id, transaction_code, transaction_date,
        transaction_type, direction, amount, total_amount, remaining_amount,
        payment_status, payment_mode, party_type, party_name,
        reference_type, reference_id, reference_number, description,
        status, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_workspace_id, v_branch_id, v_tx_code, v_expense_date,
        'EXPENSE', 'OUT', v_amount, v_amount, 0,
        'PAID', v_payment_mode, 'vendor', v_party_name,
        'EXPENSE', v_expense_id, COALESCE(v_reference_no, v_tx_code), v_description,
        'ACTIVE', NOW(), NOW()
    )
    ON CONFLICT (workspace_id, reference_type, reference_id) WHERE reference_id IS NOT NULL
    DO UPDATE SET
        branch_id = EXCLUDED.branch_id,
        transaction_date = EXCLUDED.transaction_date,
        amount = EXCLUDED.amount,
        total_amount = EXCLUDED.total_amount,
        payment_mode = EXCLUDED.payment_mode,
        party_name = EXCLUDED.party_name,
        description = EXCLUDED.description,
        updated_at = NOW();

    -- Upsert Cashbook entry with branch_id
    INSERT INTO public.cashbook_entries (
        id, workspace_id, branch_id, entry_date, entry_number, direction,
        amount, payment_method, account_name, source_type, source_id,
        reference_number, party_name, description, notes, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_workspace_id, v_branch_id, v_expense_date, 'CB-' || v_tx_code, 'OUT',
        v_amount, v_payment_mode, 'Cash Account', 'EXPENSE', v_expense_id::TEXT,
        v_reference_no, v_party_name, v_description, v_notes, NOW(), NOW()
    )
    ON CONFLICT (workspace_id, source_type, source_id, direction)
    DO UPDATE SET
        branch_id = EXCLUDED.branch_id,
        entry_date = EXCLUDED.entry_date,
        amount = EXCLUDED.amount,
        payment_method = EXCLUDED.payment_method,
        party_name = EXCLUDED.party_name,
        description = EXCLUDED.description,
        notes = EXCLUDED.notes,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'expense_id', v_expense_id,
        'branch_id', v_branch_id,
        'transaction_code', v_tx_code,
        'amount', v_amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_expense_atomic(JSONB) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 13. UPDATE convert_quotation_to_invoice_atomic TO RETAIN QUOTATION BRANCH
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_quotation_to_invoice_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_quotation_id UUID;
    v_quotation RECORD;
    v_invoice_id UUID;
    v_invoice_number VARCHAR(100);
    v_invoice_date DATE;
    v_due_date DATE;
    v_payment_status TEXT;
    v_paid_amount NUMERIC(12,2);
    v_balance_amount NUMERIC(12,2);
    v_payment_mode VARCHAR(50);
    v_payment_ref TEXT;
    v_payment_notes TEXT;
    v_payment_date DATE;
    v_inv_status public.invoice_status;
    v_payment_id UUID;
    v_payment_code VARCHAR(100);
    v_daybook_id UUID;
    v_item RECORD;
    v_year_str TEXT;
    v_inv_count INT;
    v_branch_id UUID;
BEGIN
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Workspace ID could not be resolved.';
    END IF;

    v_quotation_id := (p_payload->>'quotation_id')::UUID;
    IF v_quotation_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: quotation_id is required.';
    END IF;

    SELECT * INTO v_quotation
    FROM public.quotations
    WHERE id = v_quotation_id AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF v_quotation.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Quotation with ID % not found.', v_quotation_id;
    END IF;

    -- Retain quotation branch, or fallback to payload branch, or default branch
    v_branch_id := COALESCE(
        v_quotation.branch_id,
        NULLIF(p_payload->>'branch_id', '')::UUID
    );

    IF v_branch_id IS NULL THEN
        SELECT default_branch_id INTO v_branch_id
        FROM public.profiles
        WHERE id = auth.uid() AND workspace_id = v_workspace_id;
    END IF;

    IF v_branch_id IS NULL THEN
        SELECT id INTO v_branch_id
        FROM public.branches
        WHERE workspace_id = v_workspace_id AND is_main_branch = TRUE AND status = 'Active'
        LIMIT 1;
    END IF;

    -- Generate invoice number
    v_invoice_date := COALESCE((p_payload->>'invoice_date')::DATE, CURRENT_DATE);
    v_due_date := COALESCE((p_payload->>'due_date')::DATE, v_invoice_date + INTERVAL '15 days');
    v_year_str := TO_CHAR(v_invoice_date, 'YYYY');

    SELECT COUNT(*) + 1 INTO v_inv_count FROM public.invoices WHERE workspace_id = v_workspace_id;
    v_invoice_number := 'INV-' || v_year_str || '-' || LPAD(v_inv_count::TEXT, 4, '0');

    v_payment_status := COALESCE(p_payload->>'payment_status', 'Unpaid');
    v_paid_amount := ROUND(COALESCE((p_payload->>'paid_amount')::NUMERIC, 0), 2);
    v_payment_mode := COALESCE(p_payload->>'payment_mode', 'Cash');
    v_payment_ref := p_payload->>'payment_reference';
    v_payment_notes := p_payload->>'payment_notes';
    v_payment_date := COALESCE((p_payload->>'payment_date')::DATE, v_invoice_date);

    IF v_payment_status = 'Fully Paid' THEN
        v_paid_amount := v_quotation.grand_total;
        v_balance_amount := 0;
        v_inv_status := 'Paid';
    ELSIF v_payment_status = 'Partially Paid' THEN
        v_balance_amount := GREATEST(0, v_quotation.grand_total - v_paid_amount);
        v_inv_status := 'Partially Paid';
    ELSE
        v_paid_amount := 0;
        v_balance_amount := v_quotation.grand_total;
        v_inv_status := 'Issued';
    END IF;

    v_invoice_id := gen_random_uuid();

    -- Create invoice with branch_id
    INSERT INTO public.invoices (
        id, workspace_id, branch_id, quotation_id, customer_id, invoice_number,
        customer_name, customer_phone, customer_whatsapp, customer_email,
        customer_address, customer_gstin, status, date, due_date,
        subtotal, discount_total, tax_total, grand_total, paid_amount,
        balance_amount, payment_mode, payment_reference, payment_notes,
        notes, terms, footer_text, template_id, branding, theme,
        customization, snapshot, is_snapshot_finalized, is_stock_finalized,
        created_at, updated_at
    ) VALUES (
        v_invoice_id, v_workspace_id, v_branch_id, v_quotation_id, v_quotation.customer_id,
        v_invoice_number, v_quotation.customer_name, v_quotation.customer_phone,
        v_quotation.customer_whatsapp, v_quotation.customer_email, v_quotation.customer_address,
        v_quotation.customer_gstin, v_inv_status, v_invoice_date, v_due_date,
        v_quotation.subtotal, v_quotation.discount_total, v_quotation.tax_total,
        v_quotation.grand_total, v_paid_amount, v_balance_amount, v_payment_mode,
        v_payment_ref, v_payment_notes, v_quotation.notes, v_quotation.terms,
        v_quotation.footer_text, v_quotation.template_id, v_quotation.branding,
        v_quotation.theme, v_quotation.customization, v_quotation.snapshot,
        TRUE, FALSE, NOW(), NOW()
    );

    -- Copy line items with branch_id
    FOR v_item IN SELECT * FROM public.quotation_items WHERE quotation_id = v_quotation_id
    LOOP
        INSERT INTO public.invoice_items (
            id, workspace_id, branch_id, invoice_id, product_id, product_name,
            sku, unit, quantity, buy_price, selling_price, discount_amount,
            tax_percent, tax_amount, total
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_branch_id, v_invoice_id, v_item.product_id,
            v_item.product_name, v_item.sku, v_item.unit, v_item.quantity,
            v_item.buy_price, v_item.selling_price, v_item.discount_amount,
            v_item.tax_percent, v_item.tax_amount, v_item.total
        );
    END LOOP;

    -- Update Quotation status
    UPDATE public.quotations
    SET status = 'Converted',
        converted_invoice_id = v_invoice_id,
        branch_id = v_branch_id,
        updated_at = NOW()
    WHERE id = v_quotation_id;

    -- Finalize Stock & Payments if paid
    PERFORM public.finalize_invoice_stock(v_invoice_id);

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'branch_id', v_branch_id,
        'paid_amount', v_paid_amount,
        'balance_amount', v_balance_amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_quotation_to_invoice_atomic(JSONB) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 14. SAFE, IDEMPOTENT DATA MIGRATION OF ALL EXISTING WORKSPACES
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_ws RECORD;
    v_main_branch_id UUID;
    v_bs RECORD;
    v_p RECORD;
    v_usr RECORD;
    v_branch_name TEXT;
    v_gstin TEXT;
    v_addr TEXT;
    v_city TEXT;
    v_state TEXT;
    v_pin TEXT;
BEGIN
    FOR v_ws IN SELECT id, name, owner_email FROM public.workspaces
    LOOP
        -- Check if an active main branch already exists for this workspace
        SELECT id INTO v_main_branch_id
        FROM public.branches
        WHERE workspace_id = v_ws.id AND is_main_branch = TRUE AND status = 'Active'
        LIMIT 1;

        IF v_main_branch_id IS NULL THEN
            -- Check if any branch exists for this workspace
            SELECT id INTO v_main_branch_id
            FROM public.branches
            WHERE workspace_id = v_ws.id
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;

        IF v_main_branch_id IS NULL THEN
            -- Fetch business settings details if present
            SELECT business_name, gstin, address, city, state, pincode
            INTO v_bs
            FROM public.business_settings
            WHERE workspace_id = v_ws.id
            LIMIT 1;

            v_branch_name := COALESCE(NULLIF(TRIM(v_bs.business_name), ''), NULLIF(TRIM(v_ws.name), ''), 'Main Branch');
            v_gstin := NULLIF(TRIM(v_bs.gstin), '');
            v_addr := NULLIF(TRIM(v_bs.address), '');
            v_city := NULLIF(TRIM(v_bs.city), '');
            v_state := NULLIF(TRIM(v_bs.state), '');
            v_pin := NULLIF(TRIM(v_bs.pincode), '');

            v_main_branch_id := gen_random_uuid();

            INSERT INTO public.branches (
                id,
                workspace_id,
                branch_code,
                branch_name,
                branch_type,
                address,
                city,
                state,
                pincode,
                gstin,
                status,
                is_main_branch,
                created_at,
                updated_at
            ) VALUES (
                v_main_branch_id,
                v_ws.id,
                'MAIN',
                v_branch_name,
                'Store',
                v_addr,
                v_city,
                v_state,
                v_pin,
                v_gstin,
                'Active',
                TRUE,
                NOW(),
                NOW()
            );
        END IF;

        -- 1. Grant user_branch_access to all users in this workspace
        FOR v_usr IN SELECT id, default_branch_id FROM public.profiles WHERE workspace_id = v_ws.id
        LOOP
            INSERT INTO public.user_branch_access (
                workspace_id, user_id, branch_id, is_default, created_at
            ) VALUES (
                v_ws.id, v_usr.id, v_main_branch_id, TRUE, NOW()
            )
            ON CONFLICT (user_id, branch_id) DO NOTHING;

            IF v_usr.default_branch_id IS NULL THEN
                UPDATE public.profiles
                SET default_branch_id = v_main_branch_id
                WHERE id = v_usr.id;
            END IF;
        END LOOP;

        -- 2. Populate branch_inventory from existing products
        FOR v_p IN SELECT id, current_stock, minimum_stock, location, buy_price, selling_price
                   FROM public.products
                   WHERE workspace_id = v_ws.id
        LOOP
            INSERT INTO public.branch_inventory (
                workspace_id,
                branch_id,
                product_id,
                opening_stock,
                current_stock,
                min_stock,
                reorder_level,
                rack_location,
                purchase_price,
                selling_price,
                status,
                created_at,
                updated_at
            ) VALUES (
                v_ws.id,
                v_main_branch_id,
                v_p.id,
                COALESCE(v_p.current_stock, 0),
                COALESCE(v_p.current_stock, 0),
                COALESCE(v_p.minimum_stock, 0),
                COALESCE(v_p.minimum_stock, 0),
                v_p.location,
                v_p.buy_price,
                v_p.selling_price,
                CASE WHEN COALESCE(v_p.current_stock, 0) > 0 THEN 'In Stock' ELSE 'Out of Stock' END,
                NOW(),
                NOW()
            )
            ON CONFLICT (branch_id, product_id)
            DO UPDATE SET
                rack_location = COALESCE(branch_inventory.rack_location, EXCLUDED.rack_location);
        END LOOP;

        -- 3. Backfill branch_id on all operational tables
        UPDATE public.stock_receipts SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.stock_movements SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.invoices SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.invoice_items SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.counter_sales SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.counter_sale_items SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.payments SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.udhari_records SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.udhari_payments SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.daybook_transactions SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.financial_accounts SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.cashbook_entries SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.expenses SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.quotations SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.quotation_items SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.purchase_orders SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.purchase_order_receipts SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
        UPDATE public.follow_ups SET branch_id = v_main_branch_id WHERE workspace_id = v_ws.id AND branch_id IS NULL;
    END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 056
-- File: 056_multi_branch_master_fix_consolidation.sql
-- Description: Master Multi-Branch Data Isolation, Sales Recording,
--              Branch Stock Partitioning, and Secure RLS Enforcement.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CORE ENTITIES: BRANCHES & USER BRANCH ACCESS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    branch_code VARCHAR(50) NOT NULL,
    branch_name VARCHAR(255) NOT NULL,
    branch_type VARCHAR(50) NOT NULL DEFAULT 'Store',
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    phone VARCHAR(50),
    email VARCHAR(255),
    gstin VARCHAR(50),
    state_code VARCHAR(10),
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    is_main_branch BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_workspace_code_upper
    ON public.branches (workspace_id, UPPER(TRIM(branch_code)));

CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_one_active_main_per_workspace
    ON public.branches (workspace_id)
    WHERE is_main_branch = TRUE AND status = 'Active';

CREATE INDEX IF NOT EXISTS idx_branches_workspace_id ON public.branches(workspace_id);
CREATE INDEX IF NOT EXISTS idx_branches_workspace_status ON public.branches(workspace_id, status);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS default_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. BRANCH INVENTORY & STOCK TRANSFERS
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_branch_product UNIQUE (workspace_id, branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_inventory_lookup ON public.branch_inventory(workspace_id, branch_id, product_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_product ON public.branch_inventory(product_id);

ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    transfer_number VARCHAR(100) NOT NULL,
    from_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    to_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_diff_branches CHECK (from_branch_id <> to_branch_id)
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. ENSURE branch_id ON ALL OPERATIONAL & FINANCIAL TABLES
-- -----------------------------------------------------------------------------
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS default_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.stock_receipts
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.stock_movements
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.invoice_items
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.counter_sales
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.counter_sale_items
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.quotations
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.quotation_items
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS counter_sale_id UUID REFERENCES public.counter_sales(id) ON DELETE SET NULL;

ALTER TABLE public.daybook_transactions
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);

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
    source_type VARCHAR(50) NOT NULL,
    source_id VARCHAR(255),
    reference_number VARCHAR(100),
    party_name VARCHAR(255),
    description TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cashbook_entries
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.cashbook_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.udhari_records
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS counter_sale_id UUID REFERENCES public.counter_sales(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- Indexes for lightning fast branch queries
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON public.invoices(workspace_id, branch_id, date);
CREATE INDEX IF NOT EXISTS idx_counter_sales_branch ON public.counter_sales(workspace_id, branch_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_payments_branch ON public.payments(workspace_id, branch_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_daybook_branch ON public.daybook_transactions(workspace_id, branch_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_cashbook_branch ON public.cashbook_entries(workspace_id, branch_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON public.stock_movements(workspace_id, branch_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_receipts_branch ON public.stock_receipts(workspace_id, branch_id, product_id);

-- -----------------------------------------------------------------------------
-- 4. HISTORICAL STOCK & DATA MIGRATION TO MAIN BRANCH (Part 11)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    r_ws RECORD;
    v_main_branch_id UUID;
BEGIN
    FOR r_ws IN SELECT id, name FROM public.workspaces LOOP
        -- 1. Ensure Main Branch exists for each workspace
        SELECT id INTO v_main_branch_id
        FROM public.branches
        WHERE workspace_id = r_ws.id AND (is_main_branch = TRUE OR UPPER(TRIM(branch_code)) = 'MAIN')
        LIMIT 1;

        IF v_main_branch_id IS NULL THEN
            INSERT INTO public.branches (
                workspace_id,
                branch_code,
                branch_name,
                branch_type,
                status,
                is_main_branch
            ) VALUES (
                r_ws.id,
                'MAIN',
                COALESCE(r_ws.name, 'Enterprise') || ' (HQ)',
                'Store',
                'Active',
                TRUE
            )
            RETURNING id INTO v_main_branch_id;
        END IF;

        -- 2. Migrate legacy products.current_stock to branch_inventory for Main Branch
        INSERT INTO public.branch_inventory (
            workspace_id,
            branch_id,
            product_id,
            opening_stock,
            current_stock,
            min_stock,
            purchase_price,
            selling_price
        )
        SELECT
            p.workspace_id,
            v_main_branch_id,
            p.id,
            COALESCE(p.opening_stock, 0),
            COALESCE(p.current_stock, 0),
            COALESCE(p.min_stock, 0),
            p.buy_price,
            p.selling_price
        FROM public.products p
        WHERE p.workspace_id = r_ws.id
        ON CONFLICT (workspace_id, branch_id, product_id)
        DO UPDATE SET
            current_stock = EXCLUDED.current_stock,
            updated_at = NOW();

        -- 3. Assign orphaned historical records to Main Branch
        UPDATE public.stock_receipts SET branch_id = v_main_branch_id WHERE workspace_id = r_ws.id AND branch_id IS NULL;
        UPDATE public.stock_movements SET branch_id = v_main_branch_id WHERE workspace_id = r_ws.id AND branch_id IS NULL;
        UPDATE public.invoices SET branch_id = v_main_branch_id WHERE workspace_id = r_ws.id AND branch_id IS NULL;
        UPDATE public.counter_sales SET branch_id = v_main_branch_id WHERE workspace_id = r_ws.id AND branch_id IS NULL;
        UPDATE public.quotations SET branch_id = v_main_branch_id WHERE workspace_id = r_ws.id AND branch_id IS NULL;
        UPDATE public.payments SET branch_id = v_main_branch_id WHERE workspace_id = r_ws.id AND branch_id IS NULL;
        UPDATE public.daybook_transactions SET branch_id = v_main_branch_id WHERE workspace_id = r_ws.id AND branch_id IS NULL;
        UPDATE public.cashbook_entries SET branch_id = v_main_branch_id WHERE workspace_id = r_ws.id AND branch_id IS NULL;
        UPDATE public.expenses SET branch_id = v_main_branch_id WHERE workspace_id = r_ws.id AND branch_id IS NULL;
        UPDATE public.udhari_records SET branch_id = v_main_branch_id WHERE workspace_id = r_ws.id AND branch_id IS NULL;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS) POLICIES (Part 3 & Part 4)
-- -----------------------------------------------------------------------------

-- Helper function: is current user owner/admin of workspace?
CREATE OR REPLACE FUNCTION public.is_workspace_admin_or_owner(p_ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND workspace_id = p_ws_id
          AND role IN ('Owner', 'Admin', 'Enterprise Admin')
    );
$$;

-- Helper function: is current user authorized for branch?
CREATE OR REPLACE FUNCTION public.is_user_authorized_for_branch(p_ws_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT (
        -- Owner or Admin has access to all branches
        public.is_workspace_admin_or_owner(p_ws_id)
        OR
        -- Explicit branch assignment
        EXISTS (
            SELECT 1 FROM public.user_branch_access
            WHERE user_id = auth.uid()
              AND workspace_id = p_ws_id
              AND branch_id = p_branch_id
        )
        OR
        -- Default branch in profile
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND workspace_id = p_ws_id
              AND default_branch_id = p_branch_id
        )
    );
$$;

-- RLS: public.branches
DROP POLICY IF EXISTS "branches_select_policy" ON public.branches;
CREATE POLICY "branches_select_policy" ON public.branches
    FOR SELECT TO authenticated
    USING (
        workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
        AND (
            public.is_workspace_admin_or_owner(workspace_id)
            OR id IN (SELECT branch_id FROM public.user_branch_access WHERE user_id = auth.uid())
            OR id IN (SELECT default_branch_id FROM public.profiles WHERE id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "branches_write_policy" ON public.branches;
CREATE POLICY "branches_write_policy" ON public.branches
    FOR ALL TO authenticated
    USING (public.is_workspace_admin_or_owner(workspace_id))
    WITH CHECK (public.is_workspace_admin_or_owner(workspace_id));

-- RLS: public.branch_inventory
DROP POLICY IF EXISTS "branch_inventory_select_policy" ON public.branch_inventory;
CREATE POLICY "branch_inventory_select_policy" ON public.branch_inventory
    FOR SELECT TO authenticated
    USING (public.is_user_authorized_for_branch(workspace_id, branch_id));

DROP POLICY IF EXISTS "branch_inventory_write_policy" ON public.branch_inventory;
CREATE POLICY "branch_inventory_write_policy" ON public.branch_inventory
    FOR ALL TO authenticated
    USING (public.is_user_authorized_for_branch(workspace_id, branch_id))
    WITH CHECK (public.is_user_authorized_for_branch(workspace_id, branch_id));

-- RLS: public.counter_sales
DROP POLICY IF EXISTS "counter_sales_branch_isolation_select" ON public.counter_sales;
CREATE POLICY "counter_sales_branch_isolation_select" ON public.counter_sales
    FOR SELECT TO authenticated
    USING (
        workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
        AND (branch_id IS NULL OR public.is_user_authorized_for_branch(workspace_id, branch_id))
    );

DROP POLICY IF EXISTS "counter_sales_branch_isolation_write" ON public.counter_sales;
CREATE POLICY "counter_sales_branch_isolation_write" ON public.counter_sales
    FOR ALL TO authenticated
    USING (
        workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
        AND (branch_id IS NULL OR public.is_user_authorized_for_branch(workspace_id, branch_id))
    )
    WITH CHECK (
        workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
        AND (branch_id IS NULL OR public.is_user_authorized_for_branch(workspace_id, branch_id))
    );

-- RLS: public.invoices
DROP POLICY IF EXISTS "invoices_branch_isolation_select" ON public.invoices;
CREATE POLICY "invoices_branch_isolation_select" ON public.invoices
    FOR SELECT TO authenticated
    USING (
        workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
        AND (branch_id IS NULL OR public.is_user_authorized_for_branch(workspace_id, branch_id))
    );

DROP POLICY IF EXISTS "invoices_branch_isolation_write" ON public.invoices;
CREATE POLICY "invoices_branch_isolation_write" ON public.invoices
    FOR ALL TO authenticated
    USING (
        workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
        AND (branch_id IS NULL OR public.is_user_authorized_for_branch(workspace_id, branch_id))
    )
    WITH CHECK (
        workspace_id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
        AND (branch_id IS NULL OR public.is_user_authorized_for_branch(workspace_id, branch_id))
    );

-- -----------------------------------------------------------------------------
-- 6. AUTHORITATIVE BRANCH STOCK RPC (Part 10)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_authoritative_branch_product_stock(
    p_product_id UUID,
    p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_branch_id UUID := p_branch_id;
    v_ws_id UUID;
    v_branch_stock NUMERIC(12,2) := 0;
    v_main_branch_id UUID;
BEGIN
    SELECT workspace_id INTO v_ws_id FROM public.products WHERE id = p_product_id;
    IF v_ws_id IS NULL THEN
        RETURN jsonb_build_object('availableStock', 0, 'currentStock', 0, 'branchId', NULL);
    END IF;

    -- If no branch provided, resolve main branch
    IF v_target_branch_id IS NULL THEN
        SELECT id INTO v_main_branch_id
        FROM public.branches
        WHERE workspace_id = v_ws_id AND (is_main_branch = TRUE OR UPPER(TRIM(branch_code)) = 'MAIN')
        LIMIT 1;
        v_target_branch_id := v_main_branch_id;
    END IF;

    IF v_target_branch_id IS NOT NULL THEN
        SELECT COALESCE(current_stock, 0)
        INTO v_branch_stock
        FROM public.branch_inventory
        WHERE workspace_id = v_ws_id
          AND branch_id = v_target_branch_id
          AND product_id = p_product_id;
    END IF;

    RETURN jsonb_build_object(
        'availableStock', COALESCE(v_branch_stock, 0),
        'currentStock', COALESCE(v_branch_stock, 0),
        'branchId', v_target_branch_id
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. ATOMIC STOCK TRANSFER RPC (Part 12)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_stock_transfer(p_transfer_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ws_id UUID;
    v_from_branch_id UUID;
    v_to_branch_id UUID;
    v_transfer_number VARCHAR(100);
    v_notes TEXT;
    v_items JSONB;
    v_item JSONB;
    v_prod_id UUID;
    v_qty NUMERIC(12,2);
    v_avail NUMERIC(12,2);
    v_transfer_id UUID;
    v_user_id UUID := auth.uid();
BEGIN
    v_ws_id          := (p_transfer_data->>'workspace_id')::UUID;
    v_from_branch_id := (p_transfer_data->>'from_branch_id')::UUID;
    v_to_branch_id   := (p_transfer_data->>'to_branch_id')::UUID;
    v_transfer_number:= COALESCE(p_transfer_data->>'transfer_number', 'TRF-' || to_char(NOW(), 'YYYYMMDD-HH24MISS'));
    v_notes          := p_transfer_data->>'notes';
    v_items          := p_transfer_data->'items';

    IF v_from_branch_id = v_to_branch_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Source and destination branches cannot be the same.');
    END IF;

    -- Validate stock availability at source branch
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_qty     := (v_item->>'quantity')::NUMERIC;

        SELECT COALESCE(current_stock, 0) INTO v_avail
        FROM public.branch_inventory
        WHERE workspace_id = v_ws_id AND branch_id = v_from_branch_id AND product_id = v_prod_id;

        IF COALESCE(v_avail, 0) < v_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Insufficient stock at source branch. Requested ' || v_qty || ', available ' || COALESCE(v_avail, 0)
            );
        END IF;
    END LOOP;

    -- Create stock_transfers record
    INSERT INTO public.stock_transfers (
        workspace_id,
        transfer_number,
        from_branch_id,
        to_branch_id,
        transfer_date,
        status,
        notes,
        created_by
    ) VALUES (
        v_ws_id,
        v_transfer_number,
        v_from_branch_id,
        v_to_branch_id,
        CURRENT_DATE,
        'COMPLETED',
        v_notes,
        v_user_id
    ) RETURNING id INTO v_transfer_id;

    -- Atomic stock deduction from source, increment at destination
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_qty     := (v_item->>'quantity')::NUMERIC;

        INSERT INTO public.stock_transfer_items (transfer_id, product_id, quantity)
        VALUES (v_transfer_id, v_prod_id, v_qty);

        -- Deduct from source branch
        UPDATE public.branch_inventory
        SET current_stock = current_stock - v_qty, updated_at = NOW()
        WHERE workspace_id = v_ws_id AND branch_id = v_from_branch_id AND product_id = v_prod_id;

        -- Record movement: OUT
        INSERT INTO public.stock_movements (
            workspace_id, branch_id, product_id, movement_type, quantity, reference_type, reference_id, notes
        ) VALUES (
            v_ws_id, v_from_branch_id, v_prod_id, 'TRANSFER_OUT', -v_qty, 'TRANSFER', v_transfer_id, 'Transfer to ' || v_to_branch_id
        );

        -- Increment destination branch (upsert)
        INSERT INTO public.branch_inventory (
            workspace_id, branch_id, product_id, opening_stock, current_stock
        ) VALUES (
            v_ws_id, v_to_branch_id, v_prod_id, 0, v_qty
        )
        ON CONFLICT (workspace_id, branch_id, product_id)
        DO UPDATE SET
            current_stock = public.branch_inventory.current_stock + EXCLUDED.current_stock,
            updated_at = NOW();

        -- Record movement: IN
        INSERT INTO public.stock_movements (
            workspace_id, branch_id, product_id, movement_type, quantity, reference_type, reference_id, notes
        ) VALUES (
            v_ws_id, v_to_branch_id, v_prod_id, 'TRANSFER_IN', v_qty, 'TRANSFER', v_transfer_id, 'Transfer from ' || v_from_branch_id
        );
    END LOOP;

    RETURN jsonb_build_object('success', true, 'transferId', v_transfer_id, 'transferNumber', v_transfer_number);
END;
$$;

COMMIT;

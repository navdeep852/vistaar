-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 054: FIX BRANCH INVENTORY & STOCK RECEIPTS
-- =============================================================================
-- Authoritative, idempotent reconciliation of multi-branch inventory:
-- 1. Ensures branches and branch_inventory tables and indexes exist.
-- 2. Ensures branch_id columns exist on all transactional & inventory tables.
-- 3. Migrates legacy global product stock and stock receipts to Main Branch.
-- 4. Creates opening stock receipts for products with stock but missing FIFO receipts.
-- 5. Updates authoritative branch stock query RPC (get_authoritative_branch_product_stock).
-- 6. Implements atomic inter-branch stock transfer RPC (execute_stock_transfer).
-- =============================================================================

BEGIN;

-- 1. Ensure public.branches exists
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

-- 2. Ensure public.branch_inventory exists
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

ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;

-- 3. Ensure branch_id column exists on all operational tables
ALTER TABLE public.stock_receipts ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.counter_sales ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.daybook_transactions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.cashbook_entries ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.udhari_records ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_receipts_branch ON public.stock_receipts(workspace_id, branch_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON public.stock_movements(workspace_id, branch_id, product_id);

-- 4. Ensure stock_transfers and stock_transfer_items exist
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    transfer_number VARCHAR(100) NOT NULL,
    source_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    destination_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'Completed',
    requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_ws ON public.stock_transfers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_source ON public.stock_transfers(source_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_dest ON public.stock_transfers(destination_branch_id);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,2) NOT NULL,
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON public.stock_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product ON public.stock_transfer_items(product_id);

ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- 5. Authoritative branch stock lookup function
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
    v_stock NUMERIC := 0;
    v_is_main BOOLEAN := FALSE;
    v_product_stock NUMERIC := 0;
BEGIN
    IF p_branch_id IS NOT NULL THEN
        SELECT is_main_branch INTO v_is_main
        FROM public.branches
        WHERE id = p_branch_id AND workspace_id = p_workspace_id;

        SELECT COALESCE(current_stock, 0) INTO v_stock
        FROM public.branch_inventory
        WHERE product_id = p_product_id
          AND branch_id = p_branch_id
          AND workspace_id = p_workspace_id;

        IF (v_stock IS NULL OR v_stock = 0) AND v_is_main THEN
            SELECT COALESCE(current_stock, 0) INTO v_product_stock
            FROM public.products
            WHERE id = p_product_id AND workspace_id = p_workspace_id;

            IF v_product_stock > 0 THEN
                RETURN v_product_stock;
            END IF;
        END IF;

        RETURN COALESCE(v_stock, 0);
    END IF;

    -- If no branch specified, return total product stock
    SELECT COALESCE(current_stock, 0) INTO v_product_stock
    FROM public.products
    WHERE id = p_product_id AND workspace_id = p_workspace_id;

    RETURN COALESCE(v_product_stock, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_authoritative_branch_product_stock(UUID, UUID, UUID) TO anon, authenticated, service_role;

-- 6. Atomic Inter-Branch Stock Transfer RPC
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
    v_source_cur_stock NUMERIC(12,2);
    v_dest_cur_stock NUMERIC(12,2);
BEGIN
    -- Resolve Workspace
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Workspace could not be resolved.';
    END IF;

    v_user_id := auth.uid();
    v_source_branch_id := (p_payload->>'source_branch_id')::UUID;
    v_destination_branch_id := (p_payload->>'destination_branch_id')::UUID;

    IF v_source_branch_id IS NULL OR v_destination_branch_id IS NULL THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Source and destination branches are required.';
    END IF;
    IF v_source_branch_id = v_destination_branch_id THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Source and destination branches cannot be the same.';
    END IF;

    v_transfer_date := COALESCE((p_payload->>'transfer_date')::DATE, CURRENT_DATE);
    v_notes := p_payload->>'notes';
    v_items := p_payload->'items';

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Transfer items list cannot be empty.';
    END IF;

    -- Generate Transfer Number
    v_transfer_number := trim(COALESCE(p_payload->>'transfer_number', ''));
    IF v_transfer_number = '' THEN
        v_year_str := TO_CHAR(v_transfer_date, 'YYYY');
        SELECT COUNT(*) + 1 INTO v_trf_count
        FROM public.stock_transfers
        WHERE workspace_id = v_workspace_id;
        v_transfer_number := 'TRF-' || v_year_str || '-' || LPAD(v_trf_count::TEXT, 5, '0');
    END IF;

    -- Validate stock availability at source
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_prod_id := (v_item->>'productId')::UUID;
        v_qty := ROUND(COALESCE((v_item->>'quantity')::NUMERIC, 0), 2);

        IF v_prod_id IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: Invalid product ID or transfer quantity.';
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

    -- Create transfer header
    v_transfer_id := gen_random_uuid();
    INSERT INTO public.stock_transfers (
        id, workspace_id, transfer_number, source_branch_id, destination_branch_id,
        transfer_date, status, requested_by, approved_by, notes,
        created_at, completed_at, updated_at
    ) VALUES (
        v_transfer_id, v_workspace_id, v_transfer_number, v_source_branch_id, v_destination_branch_id,
        v_transfer_date, 'Completed', v_user_id, v_user_id, v_notes,
        NOW(), NOW(), NOW()
    );

    -- Process each item atomically
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_prod_id := (v_item->>'productId')::UUID;
        v_qty := ROUND(COALESCE((v_item->>'quantity')::NUMERIC, 0), 2);
        v_cost := ROUND(COALESCE((v_item->>'unitCost')::NUMERIC, (v_item->>'unit_cost')::NUMERIC, 0), 2);

        INSERT INTO public.stock_transfer_items (
            id, workspace_id, transfer_id, product_id, quantity, unit_cost, notes
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_transfer_id, v_prod_id, v_qty, v_cost, v_item->>'notes'
        );

        -- Deduct FIFO from source receipts
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
            IF v_remaining_deduct <= 0 THEN EXIT; END IF;

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

        -- Deduct source branch_inventory
        SELECT COALESCE(current_stock, 0) INTO v_source_cur_stock
        FROM public.branch_inventory
        WHERE product_id = v_prod_id AND branch_id = v_source_branch_id AND workspace_id = v_workspace_id
        FOR UPDATE;

        IF v_source_cur_stock IS NULL OR v_source_cur_stock = 0 THEN
            SELECT COALESCE(current_stock, 0) INTO v_source_cur_stock
            FROM public.products
            WHERE id = v_prod_id AND workspace_id = v_workspace_id;
        END IF;

        INSERT INTO public.branch_inventory (
            workspace_id, branch_id, product_id, current_stock, updated_at
        ) VALUES (
            v_workspace_id, v_source_branch_id, v_prod_id, GREATEST(0, v_source_cur_stock - v_qty), NOW()
        )
        ON CONFLICT (branch_id, product_id)
        DO UPDATE SET
            current_stock = GREATEST(0, EXCLUDED.current_stock),
            updated_at = NOW();

        -- Record TRANSFER_OUT movement at source
        INSERT INTO public.stock_movements (
            id, workspace_id, branch_id, product_id, type, quantity, movement_date,
            reference_id, reference_type, notes, created_by
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_source_branch_id, v_prod_id,
            'TRANSFER_OUT', -v_qty, v_transfer_date,
            v_transfer_number, 'STOCK_TRANSFER',
            'Stock transfer out (' || v_transfer_number || ')', v_user_id
        );

        -- Add destination receipt
        v_new_dest_receipt_id := gen_random_uuid();
        INSERT INTO public.stock_receipts (
            id, workspace_id, branch_id, product_id, receipt_number, received_date,
            quantity_received, quantity_remaining, buy_price, notes, created_at, updated_at
        ) VALUES (
            v_new_dest_receipt_id, v_workspace_id, v_destination_branch_id, v_prod_id,
            'REC-' || v_transfer_number, v_transfer_date,
            v_qty, v_qty, v_cost,
            'Received via Inter-Branch Transfer ' || v_transfer_number, NOW(), NOW()
        );

        -- Increment destination branch_inventory
        SELECT COALESCE(current_stock, 0) INTO v_dest_cur_stock
        FROM public.branch_inventory
        WHERE product_id = v_prod_id AND branch_id = v_destination_branch_id AND workspace_id = v_workspace_id
        FOR UPDATE;

        INSERT INTO public.branch_inventory (
            workspace_id, branch_id, product_id, current_stock, updated_at
        ) VALUES (
            v_workspace_id, v_destination_branch_id, v_prod_id, COALESCE(v_dest_cur_stock, 0) + v_qty, NOW()
        )
        ON CONFLICT (branch_id, product_id)
        DO UPDATE SET
            current_stock = branch_inventory.current_stock + v_qty,
            updated_at = NOW();

        -- Record TRANSFER_IN movement at destination
        INSERT INTO public.stock_movements (
            id, workspace_id, branch_id, product_id, type, quantity, movement_date,
            reference_id, reference_type, notes, created_by
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_destination_branch_id, v_prod_id,
            'TRANSFER_IN', v_qty, v_transfer_date,
            v_transfer_number, 'STOCK_TRANSFER',
            'Stock transfer in (' || v_transfer_number || ')', v_user_id
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Stock transfer completed successfully.',
        'transfer_id', v_transfer_id,
        'transfer_number', v_transfer_number
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_stock_transfer(JSONB) TO authenticated, anon, service_role;

-- 7. Safe Historical Data Migration into Main Branch
DO $$
DECLARE
    v_ws RECORD;
    v_main_branch_id UUID;
    v_bs RECORD;
    v_p RECORD;
    v_branch_name TEXT;
    v_rec_sum NUMERIC;
BEGIN
    FOR v_ws IN SELECT id, name FROM public.workspaces
    LOOP
        -- Find or create Main Branch
        SELECT id INTO v_main_branch_id
        FROM public.branches
        WHERE workspace_id = v_ws.id AND is_main_branch = TRUE AND status = 'Active'
        LIMIT 1;

        IF v_main_branch_id IS NULL THEN
            SELECT id INTO v_main_branch_id
            FROM public.branches
            WHERE workspace_id = v_ws.id AND status = 'Active'
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;

        IF v_main_branch_id IS NULL THEN
            SELECT business_name, gstin, address, city, state, pincode
            INTO v_bs
            FROM public.business_settings
            WHERE workspace_id = v_ws.id
            LIMIT 1;

            v_branch_name := COALESCE(NULLIF(TRIM(v_bs.business_name), ''), NULLIF(TRIM(v_ws.name), ''), 'Main Branch');
            v_main_branch_id := gen_random_uuid();

            INSERT INTO public.branches (
                id, workspace_id, branch_code, branch_name, branch_type,
                address, city, state, pincode, gstin, status, is_main_branch,
                created_at, updated_at
            ) VALUES (
                v_main_branch_id, v_ws.id, 'MAIN', v_branch_name, 'Store',
                v_bs.address, v_bs.city, v_bs.state, v_bs.pincode, v_bs.gstin, 'Active', TRUE,
                NOW(), NOW()
            );
        END IF;

        -- Backfill stock_receipts branch_id to Main Branch if null
        UPDATE public.stock_receipts
        SET branch_id = v_main_branch_id
        WHERE workspace_id = v_ws.id AND branch_id IS NULL;

        -- Backfill stock_movements branch_id to Main Branch if null
        UPDATE public.stock_movements
        SET branch_id = v_main_branch_id
        WHERE workspace_id = v_ws.id AND branch_id IS NULL;

        -- Populate / synchronize branch_inventory for Main Branch
        FOR v_p IN SELECT id, current_stock, minimum_stock, location, buy_price, selling_price
                   FROM public.products
                   WHERE workspace_id = v_ws.id
        LOOP
            INSERT INTO public.branch_inventory (
                workspace_id, branch_id, product_id, opening_stock, current_stock,
                min_stock, reorder_level, rack_location, purchase_price, selling_price,
                status, created_at, updated_at
            ) VALUES (
                v_ws.id, v_main_branch_id, v_p.id,
                COALESCE(v_p.current_stock, 0), COALESCE(v_p.current_stock, 0),
                COALESCE(v_p.minimum_stock, 0), COALESCE(v_p.minimum_stock, 0),
                v_p.location, v_p.buy_price, v_p.selling_price,
                CASE WHEN COALESCE(v_p.current_stock, 0) > 0 THEN 'In Stock' ELSE 'Out of Stock' END,
                NOW(), NOW()
            )
            ON CONFLICT (branch_id, product_id)
            DO UPDATE SET
                current_stock = CASE
                    WHEN branch_inventory.current_stock = 0 AND COALESCE(v_p.current_stock, 0) > 0 THEN v_p.current_stock
                    ELSE branch_inventory.current_stock
                END,
                updated_at = NOW();

            -- Create opening stock receipt for FIFO if product has stock but no active receipts
            IF COALESCE(v_p.current_stock, 0) > 0 THEN
                SELECT COALESCE(SUM(quantity_remaining), 0) INTO v_rec_sum
                FROM public.stock_receipts
                WHERE product_id = v_p.id AND branch_id = v_main_branch_id AND workspace_id = v_ws.id AND quantity_remaining > 0;

                IF v_rec_sum < v_p.current_stock THEN
                    INSERT INTO public.stock_receipts (
                        id, workspace_id, branch_id, product_id, receipt_number,
                        received_date, quantity_received, quantity_remaining,
                        buy_price, notes, created_at, updated_at
                    ) VALUES (
                        gen_random_uuid(), v_ws.id, v_main_branch_id, v_p.id,
                        'GRN-OPENING-' || SUBSTRING(v_p.id::TEXT FROM 1 FOR 8),
                        CURRENT_DATE, v_p.current_stock - v_rec_sum, v_p.current_stock - v_rec_sum,
                        v_p.buy_price, 'Opening Stock Balance Migration', NOW(), NOW()
                    );
                END IF;
            END IF;
        END LOOP;
    END LOOP;
END $$;

COMMIT;

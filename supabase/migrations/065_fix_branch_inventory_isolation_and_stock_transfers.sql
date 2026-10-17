-- =============================================================================
-- Migration 065: Fix Branch-Wise Inventory Isolation, Stock Transfer Mutation,
-- and Idempotent Inter-Branch Synchronization
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ensure public.branch_inventory Table & Unique Constraints
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
    status VARCHAR(50) DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure strict UNIQUE constraint on (workspace_id, branch_id, product_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname IN ('uq_branch_inventory_lookup', 'uq_branch_product')
          AND conrelid = 'public.branch_inventory'::regclass
    ) THEN
        ALTER TABLE public.branch_inventory
            ADD CONSTRAINT uq_branch_inventory_lookup UNIQUE (workspace_id, branch_id, product_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_branch_inventory_ws_branch ON public.branch_inventory(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_product ON public.branch_inventory(workspace_id, product_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_lookup ON public.branch_inventory(workspace_id, branch_id, product_id);

ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Ensure public.stock_transfers Table & Idempotency Key
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    transfer_number VARCHAR(100) NOT NULL,
    from_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    to_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    notes TEXT,
    idempotency_key VARCHAR(150),
    requested_by VARCHAR(200),
    approved_by VARCHAR(200),
    dispatched_by VARCHAR(200),
    received_by VARCHAR(200),
    total_quantity NUMERIC(12,2) DEFAULT 0,
    total_line_items INT DEFAULT 0,
    total_transfer_value NUMERIC(14,2) DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'stock_transfers' AND column_name = 'idempotency_key'
    ) THEN
        ALTER TABLE public.stock_transfers ADD COLUMN idempotency_key VARCHAR(150);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'stock_transfers' AND column_name = 'total_quantity'
    ) THEN
        ALTER TABLE public.stock_transfers ADD COLUMN total_quantity NUMERIC(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'stock_transfers' AND column_name = 'total_line_items'
    ) THEN
        ALTER TABLE public.stock_transfers ADD COLUMN total_line_items INT DEFAULT 0;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'stock_transfers' AND column_name = 'total_transfer_value'
    ) THEN
        ALTER TABLE public.stock_transfers ADD COLUMN total_transfer_value NUMERIC(14,2) DEFAULT 0;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stock_transfers_ws ON public.stock_transfers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_branch ON public.stock_transfers(workspace_id, from_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_branch ON public.stock_transfers(workspace_id, to_branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfers_idemp ON public.stock_transfers(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,2) NOT NULL,
    unit_cost NUMERIC(12,2) DEFAULT 0,
    transfer_value NUMERIC(14,2) DEFAULT 0,
    source_stock_before NUMERIC(12,2),
    source_stock_after NUMERIC(12,2),
    dest_stock_before NUMERIC(12,2),
    dest_stock_after NUMERIC(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON public.stock_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product ON public.stock_transfer_items(product_id);

-- -----------------------------------------------------------------------------
-- 3. Atomic, Idempotent, Multi-Branch Stock Transfer RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_stock_transfer(p_payload JSONB)
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
    v_idempotency_key VARCHAR(150);
    v_notes TEXT;
    v_items JSONB;
    v_item JSONB;
    v_prod_id UUID;
    v_qty NUMERIC(12,2);
    v_unit_cost NUMERIC(12,2);
    v_avail NUMERIC(12,2);
    v_transfer_id UUID;
    v_existing_id UUID;
    v_user_id UUID := auth.uid();
    v_total_qty NUMERIC(12,2) := 0;
    v_total_val NUMERIC(14,2) := 0;
    v_src_before NUMERIC(12,2);
    v_src_after NUMERIC(12,2);
    v_dst_before NUMERIC(12,2);
    v_dst_after NUMERIC(12,2);
    v_is_main_source BOOLEAN := false;
BEGIN
    -- Extract workspace and branches supporting snake_case and camelCase
    v_ws_id := (COALESCE(p_payload->>'workspace_id', p_payload->>'workspaceId'))::UUID;
    v_from_branch_id := (COALESCE(
        p_payload->>'from_branch_id',
        p_payload->>'source_branch_id',
        p_payload->>'sourceBranchId',
        p_payload->>'fromBranchId'
    ))::UUID;
    v_to_branch_id := (COALESCE(
        p_payload->>'to_branch_id',
        p_payload->>'destination_branch_id',
        p_payload->>'destinationBranchId',
        p_payload->>'destBranchId',
        p_payload->>'toBranchId'
    ))::UUID;

    v_transfer_number := COALESCE(
        p_payload->>'transfer_number',
        p_payload->>'transferNumber',
        'STN-' || to_char(NOW(), 'YYYY') || '-' || to_char(NOW(), 'MMDD-HH24MISS')
    );
    v_idempotency_key := COALESCE(
        p_payload->>'idempotency_key',
        p_payload->>'idempotencyKey',
        v_transfer_number
    );
    v_notes := p_payload->>'notes';
    v_items := p_payload->'items';

    IF v_ws_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Workspace ID is required.');
    END IF;
    IF v_from_branch_id IS NULL OR v_to_branch_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Source and destination branches are required.');
    END IF;
    IF v_from_branch_id = v_to_branch_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Source and destination branches must be different.');
    END IF;
    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'At least one line item is required.');
    END IF;

    -- IDEMPOTENCY CHECK: If already executed, return existing transfer safely
    SELECT id INTO v_existing_id
    FROM public.stock_transfers
    WHERE workspace_id = v_ws_id
      AND (idempotency_key = v_idempotency_key OR transfer_number = v_transfer_number)
      AND status IN ('COMPLETED', 'Completed');

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'transferId', v_existing_id,
            'transferNumber', v_transfer_number,
            'already_processed', true,
            'message', 'Transfer was already processed successfully.'
        );
    END IF;

    -- Check if source branch is main branch
    SELECT COALESCE(is_main_branch, false) INTO v_is_main_source
    FROM public.branches
    WHERE id = v_from_branch_id;

    -- 1. Strict Stock Availability Check
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
        v_prod_id := (COALESCE(v_item->>'product_id', v_item->>'productId'))::UUID;
        v_qty     := (v_item->>'quantity')::NUMERIC;

        IF v_qty <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Transfer quantity must be greater than zero.');
        END IF;

        -- Check branch_inventory first
        SELECT COALESCE(current_stock, 0) INTO v_avail
        FROM public.branch_inventory
        WHERE workspace_id = v_ws_id AND branch_id = v_from_branch_id AND product_id = v_prod_id;

        -- If no branch_inventory record yet and source is main branch, check products master
        IF v_avail IS NULL AND v_is_main_source THEN
            SELECT COALESCE(current_stock, 0) INTO v_avail
            FROM public.products
            WHERE workspace_id = v_ws_id AND id = v_prod_id;
        END IF;

        IF COALESCE(v_avail, 0) < v_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Insufficient stock in source branch. Available: ' || COALESCE(v_avail, 0) || ', Requested: ' || v_qty
            );
        END IF;
    END LOOP;

    -- 2. Insert Stock Transfer Header
    INSERT INTO public.stock_transfers (
        workspace_id,
        transfer_number,
        idempotency_key,
        from_branch_id,
        to_branch_id,
        transfer_date,
        status,
        notes,
        created_by,
        completed_at
    ) VALUES (
        v_ws_id,
        v_transfer_number,
        v_idempotency_key,
        v_from_branch_id,
        v_to_branch_id,
        CURRENT_DATE,
        'COMPLETED',
        v_notes,
        v_user_id,
        NOW()
    ) RETURNING id INTO v_transfer_id;

    -- 3. Atomic Mutations per Line Item
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
        v_prod_id   := (COALESCE(v_item->>'product_id', v_item->>'productId'))::UUID;
        v_qty       := (v_item->>'quantity')::NUMERIC;
        v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, (v_item->>'unitCost')::NUMERIC, 0);

        IF v_unit_cost = 0 THEN
            SELECT COALESCE(buy_price, 0) INTO v_unit_cost
            FROM public.products WHERE id = v_prod_id;
        END IF;

        -- Current source stock before
        SELECT COALESCE(current_stock, 0) INTO v_src_before
        FROM public.branch_inventory
        WHERE workspace_id = v_ws_id AND branch_id = v_from_branch_id AND product_id = v_prod_id;

        IF v_src_before IS NULL AND v_is_main_source THEN
            SELECT COALESCE(current_stock, 0) INTO v_src_before
            FROM public.products WHERE id = v_prod_id;
        END IF;
        v_src_before := COALESCE(v_src_before, 0);
        v_src_after  := GREATEST(0, v_src_before - v_qty);

        -- Current destination stock before
        SELECT COALESCE(current_stock, 0) INTO v_dst_before
        FROM public.branch_inventory
        WHERE workspace_id = v_ws_id AND branch_id = v_to_branch_id AND product_id = v_prod_id;
        v_dst_before := COALESCE(v_dst_before, 0);
        v_dst_after  := v_dst_before + v_qty;

        -- Deduct from Source Branch
        INSERT INTO public.branch_inventory (
            workspace_id, branch_id, product_id, opening_stock, current_stock, updated_at
        ) VALUES (
            v_ws_id, v_from_branch_id, v_prod_id, v_src_before, v_src_after, NOW()
        )
        ON CONFLICT (workspace_id, branch_id, product_id)
        DO UPDATE SET
            current_stock = GREATEST(0, public.branch_inventory.current_stock - EXCLUDED.opening_stock + EXCLUDED.current_stock),
            updated_at = NOW();

        -- Increment Destination Branch
        INSERT INTO public.branch_inventory (
            workspace_id, branch_id, product_id, opening_stock, current_stock, updated_at
        ) VALUES (
            v_ws_id, v_to_branch_id, v_prod_id, 0, v_qty, NOW()
        )
        ON CONFLICT (workspace_id, branch_id, product_id)
        DO UPDATE SET
            current_stock = public.branch_inventory.current_stock + EXCLUDED.current_stock,
            updated_at = NOW();

        -- Insert Line Item Snapshot
        INSERT INTO public.stock_transfer_items (
            transfer_id,
            product_id,
            quantity,
            unit_cost,
            transfer_value,
            source_stock_before,
            source_stock_after,
            dest_stock_before,
            dest_stock_after,
            notes
        ) VALUES (
            v_transfer_id,
            v_prod_id,
            v_qty,
            v_unit_cost,
            v_unit_cost * v_qty,
            v_src_before,
            v_src_after,
            v_dst_before,
            v_dst_after,
            v_item->>'notes'
        );

        -- Audit Movements
        INSERT INTO public.stock_movements (
            workspace_id, branch_id, product_id, movement_type, quantity, reference_type, reference_id, notes
        ) VALUES
        (v_ws_id, v_from_branch_id, v_prod_id, 'TRANSFER_OUT', -v_qty, 'STOCK_TRANSFER', v_transfer_id, 'Transfer to branch ' || v_to_branch_id),
        (v_ws_id, v_to_branch_id, v_prod_id, 'TRANSFER_IN', v_qty, 'STOCK_TRANSFER', v_transfer_id, 'Transfer from branch ' || v_from_branch_id);

        v_total_qty := v_total_qty + v_qty;
        v_total_val := v_total_val + (v_unit_cost * v_qty);
    END LOOP;

    -- Update transfer summary
    UPDATE public.stock_transfers
    SET total_quantity = v_total_qty,
        total_transfer_value = v_total_val,
        total_line_items = jsonb_array_length(v_items),
        updated_at = NOW()
    WHERE id = v_transfer_id;

    RETURN jsonb_build_object(
        'success', true,
        'transferId', v_transfer_id,
        'transferNumber', v_transfer_number,
        'totalQuantity', v_total_qty,
        'totalTransferValue', v_total_val
    );
END;
$$;

-- Alias for backwards compatibility with legacy parameter naming
CREATE OR REPLACE FUNCTION public.execute_stock_transfer(p_transfer_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.execute_stock_transfer(p_transfer_data);
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_stock_transfer(JSONB) TO authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- 4. Authoritative Branch Inventory Reconciliation Procedure
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_branch_inventory(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_main_branch_id UUID;
    v_branch RECORD;
    v_prod RECORD;
    v_repaired_count INT := 0;
    v_branch_stock NUMERIC(12,2);
BEGIN
    -- 1. Identify Main Branch
    SELECT id INTO v_main_branch_id
    FROM public.branches
    WHERE workspace_id = p_workspace_id AND is_main_branch = true
    LIMIT 1;

    IF v_main_branch_id IS NULL THEN
        SELECT id INTO v_main_branch_id
        FROM public.branches
        WHERE workspace_id = p_workspace_id
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    -- 2. Ensure each product has branch_inventory for each branch
    FOR v_branch IN SELECT id, is_main_branch FROM public.branches WHERE workspace_id = p_workspace_id LOOP
        FOR v_prod IN SELECT id, current_stock, buy_price, selling_price, minimum_stock FROM public.products WHERE workspace_id = p_workspace_id LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.branch_inventory
                WHERE workspace_id = p_workspace_id AND branch_id = v_branch.id AND product_id = v_prod.id
            ) THEN
                -- Main branch starts with master stock, sub-branch starts with 0
                IF v_branch.is_main_branch THEN
                    v_branch_stock := COALESCE(v_prod.current_stock, 0);
                ELSE
                    v_branch_stock := 0;
                END IF;

                INSERT INTO public.branch_inventory (
                    workspace_id,
                    branch_id,
                    product_id,
                    opening_stock,
                    current_stock,
                    min_stock,
                    purchase_price,
                    selling_price,
                    status
                ) VALUES (
                    p_workspace_id,
                    v_branch.id,
                    v_prod.id,
                    v_branch_stock,
                    v_branch_stock,
                    COALESCE(v_prod.minimum_stock, 0),
                    v_prod.buy_price,
                    v_prod.selling_price,
                    CASE WHEN v_branch_stock > 0 THEN 'Active' ELSE 'Out of Stock' END
                );
                v_repaired_count := v_repaired_count + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'workspaceId', p_workspace_id,
        'repairedRecords', v_repaired_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_branch_inventory(UUID) TO authenticated, service_role;

COMMIT;

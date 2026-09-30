-- =============================================================================
-- VISTAAR BUSINESS OS — RBAC, STOCK INTEGRITY & AUDIT PIPELINE
-- Migration File: supabase/migrations/046_rbac_stock_integrity_and_audit_pipeline.sql
-- Description:
--   1. Creates public.inventory_audit_logs & public.security_audit_logs tables.
--   2. Introduces public.current_user_role() and hardens public.is_workspace_owner().
--   3. Implements BEFORE UPDATE trigger on public.products to prohibit non-owner
--      client-side direct current_stock manipulation ("black sale" prevention).
--   4. Enforces immutability on public.stock_movements (prohibits UPDATE / non-owner DELETE).
--   5. Creates authoritative RPC public.owner_adjust_stock() with audit trail.
--   6. Hardens public.get_email_by_employee_id() for tenant-safe, active-only resolution.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. SECURITY & INVENTORY AUDIT TABLES
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    employee_id TEXT,
    action TEXT NOT NULL,
    result TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_workspace ON public.security_audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_action ON public.security_audit_logs(action, result);

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace isolation SELECT for security_audit_logs" ON public.security_audit_logs;
DROP POLICY IF EXISTS "Workspace isolation INSERT for security_audit_logs" ON public.security_audit_logs;

CREATE POLICY "Workspace isolation SELECT for security_audit_logs"
    ON public.security_audit_logs FOR SELECT
    USING (workspace_id = public.current_user_workspace_id() OR workspace_id IS NULL);

CREATE POLICY "Workspace isolation INSERT for security_audit_logs"
    ON public.security_audit_logs FOR INSERT
    WITH CHECK (workspace_id = public.current_user_workspace_id() OR workspace_id IS NULL);

-- INVENTORY AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.inventory_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL,
    quantity_delta NUMERIC(10,2) NOT NULL,
    previous_quantity NUMERIC(10,2) NOT NULL,
    resulting_quantity NUMERIC(10,2) NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    performed_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    performed_by_employee_id TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_audit_workspace_product ON public.inventory_audit_logs(workspace_id, product_id, created_at DESC);

ALTER TABLE public.inventory_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace isolation SELECT for inventory_audit_logs" ON public.inventory_audit_logs;
DROP POLICY IF EXISTS "Workspace isolation INSERT for inventory_audit_logs" ON public.inventory_audit_logs;

CREATE POLICY "Workspace isolation SELECT for inventory_audit_logs"
    ON public.inventory_audit_logs FOR SELECT
    USING (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation INSERT for inventory_audit_logs"
    ON public.inventory_audit_logs FOR INSERT
    WITH CHECK (workspace_id = public.current_user_workspace_id());

-- -----------------------------------------------------------------------------
-- 2. ROLE & WORKSPACE OWNER RESOLUTION HELPERS
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT LOWER(role::TEXT) INTO v_role
    FROM public.profiles
    WHERE id = auth.uid();

    RETURN COALESCE(v_role, 'employee');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_workspace_owner()
RETURNS BOOLEAN AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT LOWER(role::TEXT) INTO v_role
    FROM public.profiles
    WHERE id = auth.uid();

    RETURN (v_role = 'owner');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- 3. STOCK INTEGRITY TRIGGER ON PRODUCTS ("BLACK SALE" PREVENTION)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_product_stock_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_is_owner BOOLEAN;
    v_is_trusted TEXT;
BEGIN
    -- If current_stock was not modified, allow the metadata update (e.g. price, name, category, etc.)
    IF OLD.current_stock IS NOT DISTINCT FROM NEW.current_stock THEN
        RETURN NEW;
    END IF;

    -- Check if execution is inside an authorized system RPC (trusted stock call)
    v_is_trusted := NULLIF(current_setting('vistaar.trusted_stock_call', true), '');
    IF v_is_trusted = 'true' THEN
        RETURN NEW;
    END IF;

    -- Check if caller is authenticated workspace owner
    v_is_owner := public.is_workspace_owner();
    IF v_is_owner THEN
        RETURN NEW;
    END IF;

    -- Non-owner direct modification of stock is strictly forbidden
    RAISE EXCEPTION 'STOCK_MUTATION_DENIED: Manual modification of stock quantity is strictly restricted to Business Owners. Day-to-day stock adjustments require Owner authorization.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_product_stock_integrity ON public.products;
CREATE TRIGGER trg_enforce_product_stock_integrity
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_product_stock_integrity();

-- Restrict product DELETE to owner only
DROP POLICY IF EXISTS "Workspace isolation DELETE for products" ON public.products;
DROP POLICY IF EXISTS "Owner-only DELETE for products" ON public.products;

CREATE POLICY "Owner-only DELETE for products"
    ON public.products FOR DELETE
    USING (
        workspace_id = public.current_user_workspace_id()
        AND public.is_workspace_owner()
    );

-- -----------------------------------------------------------------------------
-- 4. STOCK MOVEMENTS & RECEIPTS IMMUTABILITY TRIGGER
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_stock_movement_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'STOCK_INTEGRITY_VIOLATION: Historical stock movements are immutable and cannot be edited.';
    END IF;
    IF TG_OP = 'DELETE' THEN
        IF NOT public.is_workspace_owner() THEN
            RAISE EXCEPTION 'STOCK_INTEGRITY_VIOLATION: Deletion of stock movements is strictly restricted to Business Owners.';
        END IF;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_stock_movement_immutability ON public.stock_movements;
CREATE TRIGGER trg_enforce_stock_movement_immutability
    BEFORE UPDATE OR DELETE ON public.stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_stock_movement_immutability();

-- -----------------------------------------------------------------------------
-- 5. AUTHORITATIVE OWNER STOCK ADJUSTMENT RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.owner_adjust_stock(
    p_product_id UUID,
    p_actual_quantity NUMERIC,
    p_reason TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_workspace_id UUID;
    v_is_owner BOOLEAN;
    v_caller_emp_id TEXT;
    v_product_name TEXT;
    v_old_stock NUMERIC;
    v_delta NUMERIC;
    v_movement_id UUID;
BEGIN
    v_caller_id := auth.uid();
    v_workspace_id := public.current_user_workspace_id();
    v_is_owner := public.is_workspace_owner();

    IF NOT v_is_owner THEN
        -- Record security audit event for denied attempt
        INSERT INTO public.security_audit_logs (
            workspace_id, user_id, action, result, details
        ) VALUES (
            v_workspace_id, v_caller_id, 'STOCK_ADJUSTMENT_ATTEMPT', 'DENIED',
            jsonb_build_object(
                'product_id', p_product_id,
                'requested_quantity', p_actual_quantity,
                'reason', p_reason
            )
        );
        RAISE EXCEPTION 'PERMISSION_DENIED: Stock adjustment requires Owner authorization.';
    END IF;

    -- Fetch current product info
    SELECT name, current_stock INTO v_product_name, v_old_stock
    FROM public.products
    WHERE id = p_product_id AND workspace_id = v_workspace_id;

    IF v_product_name IS NULL THEN
        RAISE EXCEPTION 'Product not found in this workspace.';
    END IF;

    IF p_actual_quantity < 0 THEN
        RAISE EXCEPTION 'Actual stock quantity cannot be negative.';
    END IF;

    v_old_stock := COALESCE(v_old_stock, 0);
    v_delta := p_actual_quantity - v_old_stock;

    IF v_delta = 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Stock is already at target quantity', 'current_stock', v_old_stock);
    END IF;

    -- Get caller employee ID
    SELECT employee_id INTO v_caller_emp_id
    FROM public.profiles
    WHERE id = v_caller_id;

    -- Enable trusted stock update
    PERFORM set_config('vistaar.trusted_stock_call', 'true', true);

    -- 1. Authoritatively update product stock
    UPDATE public.products
    SET current_stock = p_actual_quantity,
        updated_at = NOW()
    WHERE id = p_product_id AND workspace_id = v_workspace_id;

    -- 2. Record immutable stock movement
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
        p_product_id,
        'ADJUSTMENT',
        v_delta,
        CURRENT_DATE,
        'ADJ-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
        'OWNER_ADJUSTMENT',
        COALESCE(p_reason, 'Stock Adjustment') || COALESCE(' - ' || p_notes, ''),
        v_caller_id
    ) RETURNING id INTO v_movement_id;

    -- 3. Record immutable inventory audit log
    INSERT INTO public.inventory_audit_logs (
        workspace_id,
        product_id,
        movement_type,
        quantity_delta,
        previous_quantity,
        resulting_quantity,
        reference_type,
        reference_id,
        performed_by_user_id,
        performed_by_employee_id,
        reason
    ) VALUES (
        v_workspace_id,
        p_product_id,
        'ADJUSTMENT',
        v_delta,
        v_old_stock,
        p_actual_quantity,
        'OWNER_ADJUSTMENT',
        v_movement_id::TEXT,
        v_caller_id,
        v_caller_emp_id,
        p_reason
    );

    -- 4. Record security audit log
    INSERT INTO public.security_audit_logs (
        workspace_id, user_id, employee_id, action, result, details
    ) VALUES (
        v_workspace_id, v_caller_id, v_caller_emp_id, 'OWNER_STOCK_ADJUSTMENT', 'SUCCESS',
        jsonb_build_object(
            'product_id', p_product_id,
            'product_name', v_product_name,
            'previous_quantity', v_old_stock,
            'resulting_quantity', p_actual_quantity,
            'difference', v_delta,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'previous_quantity', v_old_stock,
        'resulting_quantity', p_actual_quantity,
        'delta', v_delta
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_adjust_stock(UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. UPGRADE GET_EMAIL_BY_EMPLOYEE_ID FOR TENANT-SAFE RESOLUTION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_email_by_employee_id(
    p_employee_id TEXT,
    p_workspace_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_id TEXT;
    v_count INT;
    v_email TEXT;
BEGIN
    v_clean_id := UPPER(TRIM(p_employee_id));
    IF v_clean_id IS NULL OR v_clean_id = '' THEN
        RETURN NULL;
    END IF;

    IF p_workspace_id IS NOT NULL THEN
        -- Workspace-scoped resolution
        SELECT LOWER(email) INTO v_email
        FROM public.profiles
        WHERE UPPER(TRIM(employee_id)) = v_clean_id
          AND workspace_id = p_workspace_id
          AND status = 'Active'
          AND deleted_at IS NULL
        LIMIT 1;

        RETURN v_email;
    END IF;

    -- Global resolution: verify exactly ONE active match across tenants to prevent ambiguity
    SELECT COUNT(*) INTO v_count
    FROM public.profiles
    WHERE UPPER(TRIM(employee_id)) = v_clean_id
      AND status = 'Active'
      AND deleted_at IS NULL;

    IF v_count = 1 THEN
        SELECT LOWER(email) INTO v_email
        FROM public.profiles
        WHERE UPPER(TRIM(employee_id)) = v_clean_id
          AND status = 'Active'
          AND deleted_at IS NULL
        LIMIT 1;

        RETURN v_email;
    END IF;

    -- If 0 or >1 matches, return NULL (caller will require email login or specific workspace)
    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_employee_id(TEXT, UUID) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. MARK LEGITIMATE FINALIZATION FUNCTIONS AS TRUSTED STOCK CALLERS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'atomic_finalize_invoice_payment') THEN
        ALTER FUNCTION public.atomic_finalize_invoice_payment(UUID, JSONB, TEXT, NUMERIC, NUMERIC) SET vistaar.trusted_stock_call = 'true';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_counter_sale_atomic') THEN
        ALTER FUNCTION public.create_counter_sale_atomic(JSONB, JSONB) SET vistaar.trusted_stock_call = 'true';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cancel_counter_sale_atomic') THEN
        ALTER FUNCTION public.cancel_counter_sale_atomic(UUID) SET vistaar.trusted_stock_call = 'true';
    END IF;
END $$;

COMMIT;

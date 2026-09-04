-- ============================================================================
-- MIGRATION 022: HARDEN RLS WORKSPACE RESOLUTION & TENANT AUTHORIZATION POLICIES
-- Description: Ensures current_user_workspace_id() robustly resolves workspace for
--              authenticated users via JWT claims, profiles table, and owner fallbacks.
--              Ensures workspace isolation RLS policies on all counter-sale related
--              tables (products, stock_receipts, stock_movements, counter_sales,
--              counter_sale_items, categories) are strictly enforced without blocking
--              authorized operations.
-- ============================================================================

-- 1. HARDEN CURRENT_USER_WORKSPACE_ID RESOLUTION FUNCTION
CREATE OR REPLACE FUNCTION public.current_user_workspace_id()
RETURNS UUID AS $$
DECLARE
    v_workspace_id UUID;
    v_email TEXT;
BEGIN
    -- Tier 1: Check JWT app_metadata
    BEGIN
        v_workspace_id := NULLIF(auth.jwt() -> 'app_metadata' ->> 'workspace_id', '')::UUID;
        IF v_workspace_id IS NOT NULL THEN
            RETURN v_workspace_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Tier 2: Check JWT user_metadata / raw_user_meta_data
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

    -- Tier 3: Authoritative lookup from public.profiles bound to auth.uid()
    IF auth.uid() IS NOT NULL THEN
        SELECT workspace_id INTO v_workspace_id
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_workspace_id IS NOT NULL THEN
            RETURN v_workspace_id;
        END IF;
    END IF;

    -- Tier 4: Fallback lookup from public.workspaces by owner_email or id matching auth.uid()
    v_email := (auth.jwt() ->> 'email');
    IF v_email IS NOT NULL AND v_email <> '' THEN
        SELECT id INTO v_workspace_id
        FROM public.workspaces
        WHERE LOWER(owner_email) = LOWER(v_email)
        LIMIT 1;

        IF v_workspace_id IS NOT NULL THEN
            RETURN v_workspace_id;
        END IF;
    END IF;

    IF auth.uid() IS NOT NULL THEN
        SELECT id INTO v_workspace_id
        FROM public.workspaces
        WHERE id = auth.uid();

        IF v_workspace_id IS NOT NULL THEN
            RETURN v_workspace_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. ENSURE RLS POLICIES FOR COUNTER SALE & CATALOGUE TABLES
DO $$ 
DECLARE
    tbl TEXT;
    tbls TEXT[] := ARRAY[
        'products', 'categories', 'suppliers', 'stock_receipts', 
        'stock_movements', 'counter_sales', 'counter_sale_items'
    ];
BEGIN
    FOREACH tbl IN ARRAY tbls LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

        -- Drop existing generic workspace policies to prevent duplication
        EXECUTE format('DROP POLICY IF EXISTS "Workspace isolation SELECT for %I" ON public.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Workspace isolation INSERT for %I" ON public.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Workspace isolation UPDATE for %I" ON public.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Workspace isolation DELETE for %I" ON public.%I;', tbl, tbl);

        -- Re-create canonical workspace isolation policies
        EXECUTE format('
            CREATE POLICY "Workspace isolation SELECT for %I" ON public.%I
            FOR SELECT USING (workspace_id = public.current_user_workspace_id());
        ', tbl, tbl);

        EXECUTE format('
            CREATE POLICY "Workspace isolation INSERT for %I" ON public.%I
            FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());
        ', tbl, tbl);

        EXECUTE format('
            CREATE POLICY "Workspace isolation UPDATE for %I" ON public.%I
            FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
                       WITH CHECK (workspace_id = public.current_user_workspace_id());
        ', tbl, tbl);

        EXECUTE format('
            CREATE POLICY "Workspace isolation DELETE for %I" ON public.%I
            FOR DELETE USING (workspace_id = public.current_user_workspace_id());
        ', tbl, tbl);
    END LOOP;
END $$;

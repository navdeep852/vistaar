-- =============================================================================
-- VISTAAR BUSINESS OS — MULTI-TENANT SECURITY & DATA ISOLATION FIX
-- Migration File: supabase/migrations/007_multi_tenant_isolation_fix.sql
-- Description: Establishes authoritative auth.uid() -> profiles.workspace_id binding,
--              implements automatic trigger-based workspace & profile creation on signUp,
--              backfills missing user profiles, hardens RLS policies with anti-spoofing
--              WITH CHECK constraints across all 26 public business tables.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. AUTOMATIC WORKSPACE & PROFILE CREATION TRIGGER FOR AUTH.USERS SIGNUP
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id UUID;
    v_company_name TEXT;
    v_owner_name TEXT;
    v_phone TEXT;
BEGIN
    v_workspace_id := uuid_generate_v4();

    v_company_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), '') || '''s Business',
        'My Business'
    );

    v_owner_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        'Owner'
    );

    v_phone := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
        ''
    );

    -- 1. Create unique Workspace
    INSERT INTO public.workspaces (id, company_name, owner_name, owner_email, owner_phone)
    VALUES (v_workspace_id, v_company_name, v_owner_name, NEW.email, v_phone)
    ON CONFLICT (id) DO NOTHING;

    -- 2. Create User Profile linked to auth.users.id and workspace_id
    INSERT INTO public.profiles (
        id, workspace_id, employee_id, name, email, phone, role, status
    ) VALUES (
        NEW.id, v_workspace_id, 'VST-00001', v_owner_name, NEW.email, v_phone, 'owner', 'Active'
    ) ON CONFLICT (id) DO NOTHING;

    -- 3. Create default Business Settings for workspace
    INSERT INTO public.business_settings (
        workspace_id, legal_name, owner_name, phone, email, address, city, state, pincode, currency
    ) VALUES (
        v_workspace_id, v_company_name, v_owner_name, v_phone, NEW.email, 'Business Address', 'City', 'State', '000000', '₹'
    ) ON CONFLICT (workspace_id) DO NOTHING;

    -- 4. Create default Inventory Settings for workspace
    INSERT INTO public.inventory_settings (
        workspace_id, uses_part_number
    ) VALUES (
        v_workspace_id, true
    ) ON CONFLICT (workspace_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. REMEDIATION & BACKFILL FOR EXISTING AUTH USERS LACKING PROFILES
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    u RECORD;
    v_ws_id UUID;
    v_comp_name TEXT;
    v_own_name TEXT;
    v_ph TEXT;
BEGIN
    FOR u IN 
        SELECT au.id, au.email, au.raw_user_meta_data
        FROM auth.users au
        LEFT JOIN public.profiles p ON p.id = au.id
        WHERE p.id IS NULL
    LOOP
        v_ws_id := uuid_generate_v4();

        v_comp_name := COALESCE(
            NULLIF(TRIM(u.raw_user_meta_data->>'company_name'), ''),
            NULLIF(TRIM(u.raw_user_meta_data->>'name'), '') || '''s Business',
            'My Business'
        );

        v_own_name := COALESCE(
            NULLIF(TRIM(u.raw_user_meta_data->>'name'), ''),
            'Owner'
        );

        v_ph := COALESCE(
            NULLIF(TRIM(u.raw_user_meta_data->>'phone'), ''),
            ''
        );

        INSERT INTO public.workspaces (id, company_name, owner_name, owner_email, owner_phone)
        VALUES (v_ws_id, v_comp_name, v_own_name, u.email, v_ph)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.profiles (
            id, workspace_id, employee_id, name, email, phone, role, status
        ) VALUES (
            u.id, v_ws_id, 'VST-00001', v_own_name, u.email, v_ph, 'owner', 'Active'
        ) ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.business_settings (
            workspace_id, legal_name, owner_name, phone, email, address, city, state, pincode, currency
        ) VALUES (
            v_ws_id, v_comp_name, v_own_name, v_ph, u.email, 'Business Address', 'City', 'State', '000000', '₹'
        ) ON CONFLICT (workspace_id) DO NOTHING;

        INSERT INTO public.inventory_settings (
            workspace_id, uses_part_number
        ) VALUES (
            v_ws_id, true
        ) ON CONFLICT (workspace_id) DO NOTHING;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. HARDEN CURRENT_USER_WORKSPACE_ID RESOLUTION FUNCTION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_workspace_id()
RETURNS UUID AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    -- 1. Check JWT app_metadata if explicitly injected
    v_workspace_id := (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::UUID;
    IF v_workspace_id IS NOT NULL THEN
        RETURN v_workspace_id;
    END IF;

    -- 2. Authoritative lookup from public.profiles bound to auth.uid()
    SELECT workspace_id INTO v_workspace_id
    FROM public.profiles
    WHERE id = auth.uid();
    
    RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- 4. HARDEN RLS & ANTI-SPOOFING WITH CHECK POLICIES ACROSS ALL 26 TABLES
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'business_settings', 'categories', 'suppliers', 'customers', 'products',
        'inventory_settings', 'stock_receipts', 'stock_movements', 'import_sessions',
        'counter_sales', 'counter_sale_items', 'quotations', 'quotation_items',
        'invoices', 'invoice_items', 'payments', 'udhari_records', 'udhari_payments',
        'expenses', 'follow_ups', 'notifications', 'feedbacks', 'offers', 'id_mappings'
    ];
BEGIN
    -- Enable RLS on core tables
    ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    -- Workspaces Policies
    DROP POLICY IF EXISTS "Users can view their own workspace" ON public.workspaces;
    DROP POLICY IF EXISTS "Workspace owners can update their workspace" ON public.workspaces;
    
    CREATE POLICY "Users can view their own workspace"
        ON public.workspaces FOR SELECT
        USING (id = public.current_user_workspace_id());

    CREATE POLICY "Workspace owners can update their workspace"
        ON public.workspaces FOR UPDATE
        USING (id = public.current_user_workspace_id())
        WITH CHECK (id = public.current_user_workspace_id());

    -- Profiles Policies
    DROP POLICY IF EXISTS "Users can view profiles in their workspace" ON public.profiles;
    DROP POLICY IF EXISTS "Owners and admins can insert profiles in their workspace" ON public.profiles;
    DROP POLICY IF EXISTS "Users can update their own profile or admins update workspace profiles" ON public.profiles;
    DROP POLICY IF EXISTS "Users can update profiles in their workspace" ON public.profiles;

    CREATE POLICY "Users can view profiles in their workspace"
        ON public.profiles FOR SELECT
        USING (workspace_id = public.current_user_workspace_id());

    CREATE POLICY "Owners and admins can insert profiles in their workspace"
        ON public.profiles FOR INSERT
        WITH CHECK (workspace_id = public.current_user_workspace_id());

    CREATE POLICY "Users can update profiles in their workspace"
        ON public.profiles FOR UPDATE
        USING (workspace_id = public.current_user_workspace_id())
        WITH CHECK (workspace_id = public.current_user_workspace_id());

    -- Apply workspace isolation policies across all standard business tables
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

        EXECUTE format('DROP POLICY IF EXISTS "Workspace isolation SELECT for %I" ON public.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Workspace isolation INSERT for %I" ON public.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Workspace isolation UPDATE for %I" ON public.%I;', tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Workspace isolation DELETE for %I" ON public.%I;', tbl, tbl);

        EXECUTE format('
            CREATE POLICY "Workspace isolation SELECT for %I" ON public.%I
                FOR SELECT USING (workspace_id = public.current_user_workspace_id());
            CREATE POLICY "Workspace isolation INSERT for %I" ON public.%I
                FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());
            CREATE POLICY "Workspace isolation UPDATE for %I" ON public.%I
                FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
                           WITH CHECK (workspace_id = public.current_user_workspace_id());
            CREATE POLICY "Workspace isolation DELETE for %I" ON public.%I
                FOR DELETE USING (workspace_id = public.current_user_workspace_id());
        ', tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl);
    END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- END OF MIGRATION SCRIPT 007_multi_tenant_isolation_fix.sql
-- =============================================================================

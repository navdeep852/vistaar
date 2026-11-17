-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 077
-- ATOMIC WORKSPACE PROVISIONING & PRODUCTION AUTHENTICATION REPAIR
-- =============================================================================
-- Migration File: supabase/migrations/077_atomic_workspace_provisioning_and_auth_repair.sql
-- Description:
--   1. Implements public.check_email_registered(p_email TEXT) for tenant-safe
--      pre-registration email existence checks without leaking table rows.
--   2. Implements public.provision_company_workspace(...) RPC for atomic, server-side
--      workspace provisioning bound to auth.uid() and authoritative email.
--   3. Guarantees idempotency: safely updates existing workspaces/profiles if
--      called repeatedly; never duplicates workspaces or profiles.
--   4. Preserves all existing owner and employee accounts (Migration 049/051).
--   5. Reloads PostgREST schema cache.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 2. TENANT-SAFE EMAIL REGISTRATION CHECK RPC
-- -----------------------------------------------------------------------------
-- Allows the frontend registration flow to verify if an email is already
-- registered in Supabase Auth or public.profiles without violating RLS.
CREATE OR REPLACE FUNCTION public.check_email_registered(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_clean_email TEXT;
    v_exists BOOLEAN := FALSE;
BEGIN
    v_clean_email := LOWER(TRIM(p_email));
    IF v_clean_email IS NULL OR v_clean_email = '' THEN
        RETURN FALSE;
    END IF;

    -- 1. Check in auth.users
    SELECT EXISTS (
        SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email
    ) INTO v_exists;

    IF v_exists THEN
        RETURN TRUE;
    END IF;

    -- 2. Check in public.profiles
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE LOWER(email) = v_clean_email
    ) INTO v_exists;

    RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_email_registered(TEXT) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. ATOMIC WORKSPACE PROVISIONING RPC: public.provision_company_workspace
-- -----------------------------------------------------------------------------
-- Called immediately after OTP verification when the user submits their company
-- name, owner name, and phone. Creates or updates exactly one workspace,
-- one owner profile, default business settings, and default inventory settings.
CREATE OR REPLACE FUNCTION public.provision_company_workspace(
    p_company_name TEXT,
    p_owner_name TEXT,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_clean_company TEXT;
    v_clean_owner TEXT;
    v_clean_phone TEXT;
    v_workspace_id UUID;
    v_existing_profile RECORD;
    v_existing_ws RECORD;
BEGIN
    -- 1. Identify caller strictly from authenticated session token
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not authenticated.';
    END IF;

    -- 2. Retrieve authoritative email from auth.users (never trust client email)
    SELECT LOWER(email) INTO v_user_email
    FROM auth.users
    WHERE id = v_user_id;

    IF v_user_email IS NULL OR v_user_email = '' THEN
        RAISE EXCEPTION 'User email not found for authenticated user ID %', v_user_id;
    END IF;

    -- 3. Sanitize inputs
    v_clean_company := NULLIF(TRIM(p_company_name), '');
    v_clean_owner := NULLIF(TRIM(p_owner_name), '');
    v_clean_phone := COALESCE(NULLIF(TRIM(p_phone), ''), '');

    IF v_clean_company IS NULL THEN
        RAISE EXCEPTION 'Company / Business Name cannot be empty.';
    END IF;
    IF v_clean_owner IS NULL THEN
        RAISE EXCEPTION 'Owner Name cannot be empty.';
    END IF;

    -- 4. Check if profile already exists for this user
    SELECT * INTO v_existing_profile
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_existing_profile.id IS NOT NULL THEN
        -- Profile exists; bind to authoritative workspace
        v_workspace_id := v_existing_profile.workspace_id;

        -- Atomically update workspace with authoritative company details
        UPDATE public.workspaces
        SET company_name = v_clean_company,
            owner_name = v_clean_owner,
            owner_phone = v_clean_phone,
            updated_at = NOW()
        WHERE id = v_workspace_id;

        -- Atomically update owner profile
        UPDATE public.profiles
        SET name = v_clean_owner,
            phone = v_clean_phone,
            role = 'owner',
            status = 'Active',
            updated_at = NOW()
        WHERE id = v_user_id;
    ELSE
        -- Profile does not exist yet; check if workspace exists for owner_email
        SELECT * INTO v_existing_ws
        FROM public.workspaces
        WHERE LOWER(owner_email) = v_user_email;

        IF v_existing_ws.id IS NOT NULL THEN
            v_workspace_id := v_existing_ws.id;
            UPDATE public.workspaces
            SET company_name = v_clean_company,
                owner_name = v_clean_owner,
                owner_phone = v_clean_phone,
                updated_at = NOW()
            WHERE id = v_workspace_id;
        ELSE
            v_workspace_id := extensions.uuid_generate_v4();
            INSERT INTO public.workspaces (
                id, company_name, owner_name, owner_email, owner_phone, created_at, updated_at
            ) VALUES (
                v_workspace_id, v_clean_company, v_clean_owner, v_user_email, v_clean_phone, NOW(), NOW()
            );
        END IF;

        -- Create owner profile linked to auth.users.id and workspace_id
        INSERT INTO public.profiles (
            id, workspace_id, employee_id, name, email, phone, role, status, must_change_password, created_at, updated_at
        ) VALUES (
            v_user_id, v_workspace_id, 'VST-EMP-001', v_clean_owner, v_user_email, v_clean_phone, 'owner', 'Active', FALSE, NOW(), NOW()
        ) ON CONFLICT (id) DO UPDATE SET
            workspace_id = EXCLUDED.workspace_id,
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            updated_at = NOW();
    END IF;

    -- 5. Atomically initialize / update Business Settings
    INSERT INTO public.business_settings (
        workspace_id, legal_name, owner_name, phone, email, address, city, state, pincode, currency, created_at, updated_at
    ) VALUES (
        v_workspace_id, v_clean_company, v_clean_owner, v_clean_phone, v_user_email, 'Business Address', 'City', 'State', '000000', '₹', NOW(), NOW()
    ) ON CONFLICT (workspace_id) DO UPDATE SET
        legal_name = EXCLUDED.legal_name,
        owner_name = EXCLUDED.owner_name,
        phone = EXCLUDED.phone,
        updated_at = NOW();

    -- 6. Atomically initialize Inventory Settings
    INSERT INTO public.inventory_settings (
        workspace_id, uses_part_number, created_at, updated_at
    ) VALUES (
        v_workspace_id, true, NOW(), NOW()
    ) ON CONFLICT (workspace_id) DO NOTHING;

    -- Return authoritative provisioning result
    RETURN jsonb_build_object(
        'success', true,
        'workspace_id', v_workspace_id,
        'company_name', v_clean_company,
        'owner_name', v_clean_owner,
        'email', v_user_email
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_company_workspace(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. HARDEN handle_new_user() TRIGGER FUNCTION FOR SEAMLESS FORWARD COMPATIBILITY
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_is_employee BOOLEAN := FALSE;
    v_target_ws_id UUID;
    v_meta_ws TEXT;
    v_role public.user_role;
    v_emp_id TEXT;
    v_must_change_pwd BOOLEAN;
    v_existing_ws UUID;
    v_company_name TEXT;
    v_owner_name TEXT;
    v_phone TEXT;
BEGIN
    -- Check if metadata explicitly denotes employee provisioning
    IF (NEW.raw_user_meta_data->>'account_type' = 'employee') OR
       (NEW.raw_user_meta_data->>'role' = 'employee') OR
       (NEW.raw_user_meta_data->>'role' IN ('staff', 'manager')) THEN
        v_is_employee := TRUE;
    END IF;

    v_meta_ws := NULLIF(TRIM(NEW.raw_user_meta_data->>'workspace_id'), '');
    IF v_meta_ws IS NOT NULL THEN
        BEGIN
            v_target_ws_id := v_meta_ws::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_target_ws_id := NULL;
        END;
    END IF;

    -- =========================================================================
    -- BRANCH A: EMPLOYEE PROVISIONING (PRESERVED FROM MIGRATION 049 & 051)
    -- =========================================================================
    IF v_is_employee OR (v_target_ws_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_target_ws_id)) THEN
        IF v_target_ws_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_target_ws_id) THEN
            SELECT id INTO v_target_ws_id FROM public.workspaces LIMIT 1;
        END IF;

        v_role := COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '')::public.user_role,
            'employee'::public.user_role
        );

        v_emp_id := COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'employee_id'), ''),
            public.generate_next_employee_id(v_target_ws_id)
        );

        v_must_change_pwd := COALESCE(
            (NEW.raw_user_meta_data->>'must_change_password')::BOOLEAN,
            TRUE
        );

        INSERT INTO public.profiles (
            id,
            workspace_id,
            employee_id,
            name,
            email,
            phone,
            department,
            designation,
            role,
            status,
            must_change_password,
            created_at,
            updated_at
        ) VALUES (
            NEW.id,
            v_target_ws_id,
            v_emp_id,
            COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''), 'Employee'),
            LOWER(NEW.email),
            COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''), ''),
            NULLIF(TRIM(NEW.raw_user_meta_data->>'department'), ''),
            NULLIF(TRIM(NEW.raw_user_meta_data->>'designation'), ''),
            v_role,
            'Active',
            v_must_change_pwd,
            NOW(),
            NOW()
        ) ON CONFLICT (id) DO UPDATE SET
            workspace_id = COALESCE(EXCLUDED.workspace_id, public.profiles.workspace_id),
            employee_id = COALESCE(EXCLUDED.employee_id, public.profiles.employee_id),
            name = COALESCE(EXCLUDED.name, public.profiles.name),
            email = EXCLUDED.email,
            phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
            department = COALESCE(EXCLUDED.department, public.profiles.department),
            designation = COALESCE(EXCLUDED.designation, public.profiles.designation),
            role = EXCLUDED.role,
            status = 'Active',
            must_change_password = EXCLUDED.must_change_password,
            updated_at = NOW();

        RETURN NEW;
    END IF;

    -- =========================================================================
    -- BRANCH B: STANDARD OWNER REGISTRATION WORKFLOW
    -- =========================================================================
    v_existing_ws := extensions.uuid_generate_v4();

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

    -- 1. Create or retrieve unique Workspace based on owner_email
    INSERT INTO public.workspaces (id, company_name, owner_name, owner_email, owner_phone)
    VALUES (v_existing_ws, v_company_name, v_owner_name, NEW.email, v_phone)
    ON CONFLICT (owner_email) DO NOTHING
    RETURNING id INTO v_existing_ws;

    IF v_existing_ws IS NULL THEN
        SELECT id INTO v_existing_ws
        FROM public.workspaces
        WHERE owner_email = NEW.email;
    END IF;

    -- 2. Create User Profile linked to auth.users.id and workspace_id
    INSERT INTO public.profiles (
        id, workspace_id, employee_id, name, email, phone, role, status, must_change_password
    ) VALUES (
        NEW.id, v_existing_ws, 'VST-EMP-001', v_owner_name, NEW.email, v_phone, 'owner', 'Active', FALSE
    ) ON CONFLICT (id) DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        updated_at = NOW();

    -- 3. Create default Business Settings for workspace
    INSERT INTO public.business_settings (
        workspace_id, legal_name, owner_name, phone, email, address, city, state, pincode, currency
    ) VALUES (
        v_existing_ws, v_company_name, v_owner_name, v_phone, NEW.email, 'Business Address', 'City', 'State', '000000', '₹'
    ) ON CONFLICT (workspace_id) DO NOTHING;

    -- 4. Create default Inventory Settings for workspace
    INSERT INTO public.inventory_settings (
        workspace_id, uses_part_number
    ) VALUES (
        v_existing_ws, true
    ) ON CONFLICT (workspace_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Re-attach trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Notify PostgREST to refresh its schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

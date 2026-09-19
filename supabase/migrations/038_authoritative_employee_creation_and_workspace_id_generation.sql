-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 038: AUTHORITATIVE EMPLOYEE CREATION & WORKSPACE-SCOPED ID GENERATION
-- Migration File: supabase/migrations/038_authoritative_employee_creation_and_workspace_id_generation.sql
-- Description:
--   1. Workspace-scoped sequential Employee ID generation (VST-00001, VST-00002, ...)
--   2. Multi-tenant employee trigger on auth.users preventing orphan workspaces
--   3. Unauthenticated Employee ID-to-email resolution RPC for login screen
--   4. RLS verification & idempotent employee profile provisioning
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. WORKSPACE-SCOPED SEQUENTIAL EMPLOYEE ID GENERATOR
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_next_employee_id(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_max_num INTEGER := 0;
    v_next_id TEXT;
BEGIN
    IF p_workspace_id IS NULL THEN
        RAISE EXCEPTION 'p_workspace_id cannot be null for employee ID generation';
    END IF;

    -- Concurrently safe workspace-scoped lookup for highest VST-XXXXX suffix
    SELECT COALESCE(
        MAX(
            CASE 
                WHEN employee_id ~ '^VST-[0-9]+$' 
                THEN SUBSTRING(employee_id FROM 5)::INTEGER 
                ELSE 0 
            END
        ), 0
    ) INTO v_max_num
    FROM public.profiles
    WHERE workspace_id = p_workspace_id;

    -- Generate zero-padded 5 digit sequential ID (e.g. VST-00001, VST-00002)
    v_next_id := 'VST-' || LPAD((v_max_num + 1)::TEXT, 5, '0');
    RETURN v_next_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_next_employee_id(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. SAFE EMPLOYEE ID RESOLUTION RPC FOR UNAUTHENTICATED LOGIN SCREEN
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_email_by_employee_id(p_employee_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_id TEXT;
    v_email TEXT;
BEGIN
    v_clean_id := UPPER(TRIM(p_employee_id));
    IF v_clean_id IS NULL OR v_clean_id = '' THEN
        RETURN NULL;
    END IF;

    -- Authoritatively look up active employee email without leaking other tenant attributes
    SELECT LOWER(email) INTO v_email
    FROM public.profiles
    WHERE UPPER(TRIM(employee_id)) = v_clean_id
      AND status = 'Active'
      AND deleted_at IS NULL
    LIMIT 1;

    RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_employee_id(TEXT) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. UPGRADED HANDLE_NEW_USER() TRIGGER FUNCTION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_target_ws_id UUID;
    v_existing_ws UUID;
    v_company_name TEXT;
    v_owner_name TEXT;
    v_phone TEXT;
    v_role public.user_role;
    v_emp_id TEXT;
    v_must_change_pwd BOOLEAN;
    v_meta_ws TEXT;
BEGIN
    v_meta_ws := NULLIF(TRIM(NEW.raw_user_meta_data->>'workspace_id'), '');

    -- A. Check if the newly registered user is an EMPLOYEE invited into an existing workspace
    IF v_meta_ws IS NOT NULL THEN
        BEGIN
            v_target_ws_id := v_meta_ws::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_target_ws_id := NULL;
        END;
    END IF;

    -- If target workspace is valid and exists in public.workspaces, treat as employee provisioning
    IF v_target_ws_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_target_ws_id) THEN
        v_role := COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '')::public.user_role,
            'employee'::public.user_role
        );

        -- Obtain or compute unique sequential employee ID
        v_emp_id := COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'employee_id'), ''),
            public.generate_next_employee_id(v_target_ws_id)
        );

        v_must_change_pwd := COALESCE(
            (NEW.raw_user_meta_data->>'must_change_password')::BOOLEAN,
            TRUE
        );

        -- Insert or update profile bound to the parent workspace
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
            workspace_id = EXCLUDED.workspace_id,
            employee_id = EXCLUDED.employee_id,
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            department = EXCLUDED.department,
            designation = EXCLUDED.designation,
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            must_change_password = EXCLUDED.must_change_password,
            updated_at = NOW();

        -- IMPORTANT: Do not create workspaces, business_settings, or inventory_settings for employees!
        RETURN NEW;
    END IF;

    -- B. STANDARD OWNER REGISTRATION WORKFLOW
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
        NEW.id, v_existing_ws, 'VST-00001', v_owner_name, NEW.email, v_phone, 'owner', 'Active', FALSE
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

-- -----------------------------------------------------------------------------
-- 4. AUTHORITATIVE PROVISIONING FUNCTION FOR ADMIN CALLS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_employee_profile(
    p_user_id UUID,
    p_workspace_id UUID,
    p_employee_id TEXT,
    p_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_department TEXT,
    p_designation TEXT,
    p_role public.user_role,
    p_must_change_password BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role public.user_role;
    v_caller_ws UUID;
    v_assigned_emp_id TEXT;
    v_result JSONB;
BEGIN
    -- Verify caller authorization: must be authenticated owner/admin of target workspace
    IF auth.uid() IS NOT NULL THEN
        SELECT role, workspace_id INTO v_caller_role, v_caller_ws
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_caller_ws IS NULL OR v_caller_ws <> p_workspace_id OR v_caller_role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'Unauthorized: Only owners or administrators of this workspace may provision employees.';
        END IF;
    END IF;

    -- Determine employee ID
    IF p_employee_id IS NULL OR TRIM(p_employee_id) = '' THEN
        v_assigned_emp_id := public.generate_next_employee_id(p_workspace_id);
    ELSE
        v_assigned_emp_id := TRIM(p_employee_id);
    END IF;

    -- Check if employee_id is already in use in this workspace by another user
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE workspace_id = p_workspace_id 
          AND employee_id = v_assigned_emp_id 
          AND id <> p_user_id
    ) THEN
        v_assigned_emp_id := public.generate_next_employee_id(p_workspace_id);
    END IF;

    -- Upsert profile record
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
        p_user_id,
        p_workspace_id,
        v_assigned_emp_id,
        TRIM(p_name),
        LOWER(TRIM(p_email)),
        COALESCE(TRIM(p_phone), ''),
        NULLIF(TRIM(p_department), ''),
        NULLIF(TRIM(p_designation), ''),
        COALESCE(p_role, 'employee'::public.user_role),
        'Active',
        COALESCE(p_must_change_password, TRUE),
        NOW(),
        NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        employee_id = EXCLUDED.employee_id,
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        department = EXCLUDED.department,
        designation = EXCLUDED.designation,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        must_change_password = EXCLUDED.must_change_password,
        updated_at = NOW();

    SELECT jsonb_build_object(
        'success', true,
        'userId', p_user_id,
        'workspaceId', p_workspace_id,
        'employeeId', v_assigned_emp_id,
        'role', p_role
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_employee_profile(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.user_role, BOOLEAN
) TO authenticated, service_role;

COMMIT;

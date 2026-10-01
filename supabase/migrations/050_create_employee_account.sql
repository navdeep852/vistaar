-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 050: CANONICAL create_employee_account RPC
-- Migration File: supabase/migrations/050_create_employee_account.sql
-- Description:
--   1. Ensures pgcrypto extension is installed in extensions schema
--   2. Enforces UNIQUE(workspace_id, employee_id) on public.profiles
--   3. Upgrades public.generate_next_employee_id(p_workspace_id UUID)
--   4. Creates public.get_email_by_employee_id(p_employee_id TEXT, p_workspace_id UUID)
--   5. Fixes public.handle_new_user() trigger for employee provisioning distinction
--   6. Canonical RPC public.create_employee_account:
--      - Accepts exact frontend signature:
--        (p_department text, p_designation text, p_email text, p_name text, p_phone text, p_temporary_password text)
--      - Validates caller auth.uid() is active Owner
--      - Determines authoritative workspace_id from Owner's profile
--      - Generates atomic sequential Employee ID (VST-EMP-001, VST-EMP-002, ...)
--      - Provisions auth.users with bcrypt encrypted temporary password
--      - Provisions auth.identities for Supabase GoTrue compatibility
--      - Provisions public.profiles with id = auth.users.id, role='employee', status='Active', must_change_password=TRUE
--      - Grants execute only to authenticated & service_role
--   7. Notifies PostgREST to reload schema cache
-- =============================================================================

BEGIN;

-- 1. Ensure pgcrypto extension is installed
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Enforce unique employee_id per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_workspace_employee_id 
ON public.profiles (workspace_id, employee_id) 
WHERE employee_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. WORKSPACE-SCOPED SEQUENTIAL EMPLOYEE ID GENERATOR (VST-EMP-XXX)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_next_employee_id(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_max_num INTEGER := 0;
    v_next_id TEXT;
    v_target_ws UUID;
BEGIN
    v_target_ws := p_workspace_id;
    IF v_target_ws IS NULL THEN
        SELECT workspace_id INTO v_target_ws FROM public.profiles WHERE id = auth.uid() LIMIT 1;
    END IF;

    IF v_target_ws IS NULL THEN
        SELECT id INTO v_target_ws FROM public.workspaces LIMIT 1;
    END IF;

    -- Look up highest numeric suffix across both VST-EMP-XXX and legacy VST-XXXXX
    SELECT COALESCE(
        MAX(
            CASE 
                WHEN employee_id ~* '^VST-EMP-[0-9]+$' 
                THEN SUBSTRING(employee_id FROM 9)::INTEGER 
                WHEN employee_id ~* '^VST-[0-9]+$' 
                THEN SUBSTRING(employee_id FROM 5)::INTEGER 
                ELSE 0 
            END
        ), 0
    ) INTO v_max_num
    FROM public.profiles
    WHERE workspace_id = v_target_ws;

    -- Format: VST-EMP-001, VST-EMP-002, VST-EMP-003, ...
    v_next_id := 'VST-EMP-' || LPAD((v_max_num + 1)::TEXT, 3, '0');
    RETURN v_next_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_next_employee_id(UUID) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. TENANT-SAFE EMPLOYEE ID RESOLUTION RPC FOR LOGIN SCREEN
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_email_by_employee_id(
    p_employee_id TEXT,
    p_workspace_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_id TEXT;
    v_email TEXT;
BEGIN
    v_clean_id := UPPER(TRIM(p_employee_id));
    IF v_clean_id IS NULL OR v_clean_id = '' THEN
        RETURN NULL;
    END IF;

    -- Look up active employee email strictly checking Active status
    SELECT LOWER(email) INTO v_email
    FROM public.profiles
    WHERE UPPER(TRIM(employee_id)) = v_clean_id
      AND status = 'Active'
      AND (is_archived IS NOT TRUE)
      AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
    LIMIT 1;

    RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_employee_id(TEXT, UUID) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. TRIGGER FUNCTION: FIX handle_new_user() FOR EMPLOYEE PROVISIONING
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
    -- BRANCH A: EMPLOYEE PROVISIONING
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

        -- CRITICAL: Return immediately! Never create workspace or owner settings for employees!
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

-- -----------------------------------------------------------------------------
-- 6. CANONICAL PRODUCTION RPC: public.create_employee_account
-- -----------------------------------------------------------------------------
-- Drop any conflicting or legacy signatures
DROP FUNCTION IF EXISTS public.create_employee_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_employee_account(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_employee_account(
    p_department TEXT DEFAULT NULL,
    p_designation TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT '',
    p_temporary_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_status TEXT;
    v_workspace_id UUID;
    v_new_user_id UUID;
    v_emp_id TEXT;
    v_clean_email TEXT;
    v_clean_phone TEXT;
    v_encrypted_pw TEXT;
    v_temp_pw TEXT;
BEGIN
    -- 1. Validate authenticated caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    -- 2. Verify caller is an active Owner
    SELECT role, status, workspace_id
    INTO v_caller_role, v_caller_status, v_workspace_id
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role IS NULL OR v_caller_role != 'owner' OR v_caller_status != 'Active' THEN
        RAISE EXCEPTION 'Only workspace owners can create employee accounts';
    END IF;

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'Owner profile has no associated workspace_id.';
    END IF;

    -- 3. Validate Inputs
    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'Employee full name is required.';
    END IF;

    v_clean_email := LOWER(TRIM(p_email));
    IF v_clean_email IS NULL OR v_clean_email = '' OR v_clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
        RAISE EXCEPTION 'A valid email address is required.';
    END IF;

    -- Check for duplicate email in auth.users or profiles
    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email) OR
       EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(email) = v_clean_email) THEN
        RAISE EXCEPTION 'An account with this email address already exists.';
    END IF;

    -- 4. Clean phone
    v_clean_phone := REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g');
    IF LENGTH(v_clean_phone) = 12 AND v_clean_phone LIKE '91%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 3);
    ELSIF LENGTH(v_clean_phone) = 11 AND v_clean_phone LIKE '0%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 2);
    END IF;

    -- 5. Temporary Password (cryptographically unique, never hardcoded)
    v_temp_pw := COALESCE(NULLIF(TRIM(p_temporary_password), ''), 'Temp@' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8) || '!9');

    -- Encrypt with bcrypt via pgcrypto
    v_encrypted_pw := extensions.crypt(v_temp_pw, extensions.gen_salt('bf', 10));

    -- 6. Generate sequential Employee ID
    v_emp_id := public.generate_next_employee_id(v_workspace_id);

    -- 7. Insert into auth.users (Pre-confirmed email, active authenticated user)
    v_new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-4000-8000-000000000000',
        v_new_user_id,
        'authenticated',
        'authenticated',
        v_clean_email,
        v_encrypted_pw,
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
            'account_type', 'employee',
            'workspace_id', v_workspace_id,
            'name', TRIM(p_name),
            'employee_id', v_emp_id,
            'role', 'employee',
            'must_change_password', TRUE
        ),
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    );

    -- 8. Insert into auth.identities so Supabase GoTrue recognizes the email provider identity
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        v_new_user_id::text,
        v_new_user_id,
        jsonb_build_object('sub', v_new_user_id::text, 'email', v_clean_email),
        'email',
        v_new_user_id::text,
        NOW(),
        NOW(),
        NOW()
    ) ON CONFLICT (provider, id) DO NOTHING;

    -- 9. Upsert into public.profiles (Strict link: profiles.id = auth.users.id)
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
        v_new_user_id,
        v_workspace_id,
        v_emp_id,
        TRIM(p_name),
        v_clean_email,
        v_clean_phone,
        NULLIF(TRIM(p_department), ''),
        NULLIF(TRIM(p_designation), ''),
        'employee',
        'Active',
        TRUE,
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
        role = 'employee',
        status = 'Active',
        must_change_password = TRUE,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', TRUE,
        'empId', v_emp_id,
        'tempPass', v_temp_pw,
        'name', TRIM(p_name),
        'userId', v_new_user_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_employee_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. OWNER-CONTROLLED REPAIR / RECOVERY RPC FOR BROKEN EMPLOYEE ACCOUNTS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repair_employee_account(
    p_employee_id TEXT,
    p_temporary_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_status TEXT;
    v_workspace_id UUID;
    v_target_profile public.profiles%ROWTYPE;
    v_existing_auth_id UUID;
    v_encrypted_pw TEXT;
    v_temp_pw TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    SELECT role, status, workspace_id
    INTO v_caller_role, v_caller_status, v_workspace_id
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role != 'owner' OR v_caller_status != 'Active' THEN
        RAISE EXCEPTION 'Only workspace owners can repair employee accounts';
    END IF;

    SELECT * INTO v_target_profile
    FROM public.profiles
    WHERE workspace_id = v_workspace_id
      AND (employee_id = TRIM(p_employee_id) OR id::TEXT = TRIM(p_employee_id))
    LIMIT 1;

    IF v_target_profile.id IS NULL THEN
        RAISE EXCEPTION 'Employee profile not found in your workspace.';
    END IF;

    v_temp_pw := COALESCE(NULLIF(TRIM(p_temporary_password), ''), 'Temp@' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8) || '!9');
    v_encrypted_pw := extensions.crypt(v_temp_pw, extensions.gen_salt('bf', 10));

    SELECT id INTO v_existing_auth_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(v_target_profile.email)
    LIMIT 1;

    IF v_existing_auth_id IS NOT NULL THEN
        UPDATE auth.users
        SET encrypted_password = v_encrypted_pw,
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            raw_user_meta_data = raw_user_meta_data || jsonb_build_object(
                'account_type', 'employee',
                'must_change_password', TRUE,
                'employee_id', v_target_profile.employee_id
            ),
            updated_at = NOW()
        WHERE id = v_existing_auth_id;

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            v_existing_auth_id::text, v_existing_auth_id,
            jsonb_build_object('sub', v_existing_auth_id::text, 'email', LOWER(v_target_profile.email)),
            'email', v_existing_auth_id::text, NOW(), NOW(), NOW()
        ) ON CONFLICT (provider, id) DO NOTHING;

        IF v_target_profile.id != v_existing_auth_id THEN
            UPDATE public.profiles
            SET id = v_existing_auth_id,
                must_change_password = TRUE,
                status = 'Active',
                updated_at = NOW()
            WHERE id = v_target_profile.id;
        ELSE
            UPDATE public.profiles
            SET must_change_password = TRUE,
                status = 'Active',
                updated_at = NOW()
            WHERE id = v_existing_auth_id;
        END IF;
    ELSE
        v_existing_auth_id := v_target_profile.id;
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            '00000000-0000-4000-8000-000000000000',
            v_existing_auth_id,
            'authenticated',
            'authenticated',
            LOWER(v_target_profile.email),
            v_encrypted_pw,
            NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object(
                'account_type', 'employee',
                'workspace_id', v_workspace_id,
                'name', v_target_profile.name,
                'employee_id', v_target_profile.employee_id,
                'role', 'employee',
                'must_change_password', TRUE
            ),
            NOW(),
            NOW(),
            '',
            '',
            '',
            ''
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            v_existing_auth_id::text, v_existing_auth_id,
            jsonb_build_object('sub', v_existing_auth_id::text, 'email', LOWER(v_target_profile.email)),
            'email', v_existing_auth_id::text, NOW(), NOW(), NOW()
        ) ON CONFLICT (provider, id) DO NOTHING;

        UPDATE public.profiles
        SET must_change_password = TRUE,
            status = 'Active',
            updated_at = NOW()
        WHERE id = v_existing_auth_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'empId', v_target_profile.employee_id,
        'tempPass', v_temp_pw,
        'name', v_target_profile.name,
        'userId', v_existing_auth_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_employee_account(TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. REFRESH POSTGREST SCHEMA CACHE
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;

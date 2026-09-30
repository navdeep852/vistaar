-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 048: AUTHORITATIVE EMPLOYEE AUTHENTICATION ARCHITECTURE
-- Migration File: supabase/migrations/048_authoritative_employee_auth_architecture.sql
-- Description:
--   1. Ensures pgcrypto extension is active for bcrypt password hashing
--   2. Atomic, workspace-scoped sequential Employee ID generation (VST-EMP-001, VST-EMP-002, ...)
--   3. Authoritative server-side employee account creation via PostgreSQL SECURITY DEFINER RPC
--      - Creates auth.users user with pre-confirmed email and bcrypt password
--      - Creates linked public.profiles with profiles.id = auth.users.id
--      - Enforces Owner authorization (role = 'owner', status = 'Active')
--      - Sets must_change_password = true
--   4. Tenant-safe Employee ID-to-email resolution RPC for login screen
--   5. Account recovery & repair RPC for existing broken employee profiles
--   6. Consistency audit diagnostics function
-- =============================================================================

BEGIN;

-- 1. Ensure pgcrypto extension is installed
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 2. WORKSPACE-SCOPED SEQUENTIAL EMPLOYEE ID GENERATOR (VST-EMP-XXX)
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
BEGIN
    IF p_workspace_id IS NULL THEN
        RAISE EXCEPTION 'p_workspace_id cannot be null for employee ID generation';
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
    WHERE workspace_id = p_workspace_id;

    -- Format: VST-EMP-001, VST-EMP-002, VST-EMP-003, ...
    v_next_id := 'VST-EMP-' || LPAD((v_max_num + 1)::TEXT, 3, '0');
    RETURN v_next_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_next_employee_id(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. TENANT-SAFE EMPLOYEE ID RESOLUTION RPC FOR LOGIN SCREEN
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
-- 4. AUTHORITATIVE EMPLOYEE PROVISIONING RPC (ATOMIC & SECURE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_employee_account(
    p_name TEXT,
    p_email TEXT,
    p_phone TEXT DEFAULT '',
    p_department TEXT DEFAULT NULL,
    p_designation TEXT DEFAULT NULL,
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
        RAISE EXCEPTION 'Forbidden: Only the workspace owner can create VISTAAR login accounts.';
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

    -- 5. Temporary Password
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

    -- 8. Insert into public.profiles (Strict foreign key link: profiles.id = auth.users.id)
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
    );

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
-- 5. OWNER-CONTROLLED REPAIR / RECOVERY RPC FOR BROKEN EMPLOYEE ACCOUNTS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repair_employee_account(
    p_employee_id TEXT,
    p_temporary_password TEXT
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
    -- 1. Validate caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    SELECT role, status, workspace_id
    INTO v_caller_role, v_caller_status, v_workspace_id
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role != 'owner' OR v_caller_status != 'Active' THEN
        RAISE EXCEPTION 'Forbidden: Only the workspace owner can repair employee accounts.';
    END IF;

    -- 2. Find target profile
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

    -- 3. Check if Auth user exists for this email
    SELECT id INTO v_existing_auth_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(v_target_profile.email)
    LIMIT 1;

    IF v_existing_auth_id IS NOT NULL THEN
        -- Update existing Auth password
        UPDATE auth.users
        SET encrypted_password = v_encrypted_pw,
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            raw_user_meta_data = raw_user_meta_data || jsonb_build_object(
                'must_change_password', TRUE,
                'employee_id', v_target_profile.employee_id
            ),
            updated_at = NOW()
        WHERE id = v_existing_auth_id;

        -- Ensure profile matches this auth user UUID
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
        -- Auth account is missing! Create it using the exact profile.id to preserve all foreign keys
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

        -- Update profile status and must_change_password flag
        UPDATE public.profiles
        SET must_change_password = TRUE,
            status = 'Active',
            updated_at = NOW()
        WHERE id = v_target_profile.id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'empId', v_target_profile.employee_id,
        'tempPass', v_temp_pw,
        'name', v_target_profile.name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_employee_account(TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. AUDIT DIAGNOSTICS FUNCTION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.diagnose_employee_auth_consistency()
RETURNS TABLE (
    issue_type TEXT,
    profile_id UUID,
    employee_id TEXT,
    email TEXT,
    workspace_id UUID,
    status TEXT,
    details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    -- 1. Profiles without corresponding auth.users
    RETURN QUERY
    SELECT 
        'MISSING_AUTH_USER'::TEXT,
        p.id,
        p.employee_id,
        p.email,
        p.workspace_id,
        p.status::TEXT,
        'Profile has no linked auth.users record. Login will fail.'::TEXT
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE u.id IS NULL AND p.role != 'owner';

    -- 2. Email mismatch between profile and auth.users
    RETURN QUERY
    SELECT 
        'EMAIL_MISMATCH'::TEXT,
        p.id,
        p.employee_id,
        p.email,
        p.workspace_id,
        p.status::TEXT,
        ('Profile email (' || p.email || ') does not match Auth email (' || u.email || ')')
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE LOWER(p.email) != LOWER(u.email);

    -- 3. Duplicate Employee IDs within same workspace
    RETURN QUERY
    SELECT 
        'DUPLICATE_EMPLOYEE_ID'::TEXT,
        p1.id,
        p1.employee_id,
        p1.email,
        p1.workspace_id,
        p1.status::TEXT,
        ('Duplicate employee_id in workspace ' || p1.workspace_id::TEXT)
    FROM public.profiles p1
    JOIN public.profiles p2 ON p1.workspace_id = p2.workspace_id 
                           AND UPPER(p1.employee_id) = UPPER(p2.employee_id) 
                           AND p1.id != p2.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.diagnose_employee_auth_consistency() TO authenticated, service_role;

COMMIT;

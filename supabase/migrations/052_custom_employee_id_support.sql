-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 052: CUSTOM + AUTO-GENERATED EMPLOYEE IDs
-- =============================================================================
-- Authoritative, multi-tenant custom and sequential employee ID management.
-- 
-- Objectives:
-- 1. Enforce case-insensitive unique constraint per workspace:
--    (workspace_id, UPPER(employee_id))
-- 2. Concurrency-safe server-side sequential employee ID generator:
--    public.generate_next_employee_id(p_workspace_id UUID)
-- 3. Enhance public.create_employee_account RPC to support both:
--    - Auto-generated ID (default, p_employee_id = NULL)
--    - Custom Employee ID (p_employee_id = text)
--    with strict database-level validation, normalization, and collision prevention.
-- 4. Reload PostgREST schema cache.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CASE-INSENSITIVE WORKSPACE-SCOPED UNIQUE INDEX ON PROFILES
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_workspace_employee_id_upper
ON public.profiles (workspace_id, UPPER(employee_id));

-- -----------------------------------------------------------------------------
-- 2. CONCURRENCY-SAFE SEQUENTIAL EMPLOYEE ID GENERATOR
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_next_employee_id(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_max_num INT := 0;
    v_rec RECORD;
    v_num INT;
    v_candidate TEXT;
    v_attempts INT := 0;
BEGIN
    -- Advisory transaction lock on the workspace id hash to serialize concurrent auto-generations in this workspace
    IF p_workspace_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext(p_workspace_id::TEXT));
    END IF;

    FOR v_rec IN 
        SELECT employee_id 
        FROM public.profiles 
        WHERE workspace_id = p_workspace_id 
          AND employee_id IS NOT NULL 
          AND employee_id != ''
    LOOP
        -- Check VST-EMP-XXX format
        IF v_rec.employee_id ~* '^VST-EMP-\d+$' THEN
            v_num := SUBSTRING(v_rec.employee_id FROM '\d+')::INT;
            IF v_num > v_max_num THEN
                v_max_num := v_num;
            END IF;
        -- Also check legacy VST-XXXXX format
        ELSIF v_rec.employee_id ~* '^VST-\d+$' THEN
            v_num := SUBSTRING(v_rec.employee_id FROM '\d+')::INT;
            IF v_num > v_max_num THEN
                v_max_num := v_num;
            END IF;
        END IF;
    END LOOP;

    -- Concurrency-safe loop: find next available candidate that does not exist in profiles
    LOOP
        v_candidate := 'VST-EMP-' || LPAD((v_max_num + 1)::TEXT, 3, '0');
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE workspace_id = p_workspace_id 
              AND UPPER(employee_id) = UPPER(v_candidate)
        ) THEN
            RETURN v_candidate;
        END IF;
        v_max_num := v_max_num + 1;
        v_attempts := v_attempts + 1;
        IF v_attempts > 1000 THEN
            RAISE EXCEPTION 'Unable to find an available auto-generated Employee ID.';
        END IF;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_next_employee_id(UUID) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. CANONICAL RPC: public.create_employee_account (CUSTOM + AUTO ID SUPPORT)
-- -----------------------------------------------------------------------------
-- Drop legacy signatures to ensure clean PostgREST schema resolution
DROP FUNCTION IF EXISTS public.create_employee_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_employee_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_employee_account(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_employee_account(
    p_department TEXT DEFAULT NULL,
    p_designation TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT '',
    p_temporary_password TEXT DEFAULT NULL,
    p_employee_id TEXT DEFAULT NULL
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

    -- 6. Resolve & Validate Employee ID (Custom or Auto-generated)
    IF p_employee_id IS NOT NULL AND TRIM(p_employee_id) != '' THEN
        -- Reject leading/trailing whitespace
        IF p_employee_id != TRIM(p_employee_id) THEN
            RAISE EXCEPTION 'Employee ID cannot have leading or trailing whitespace.';
        END IF;

        v_emp_id := UPPER(TRIM(p_employee_id));

        -- Length validation: 3 to 30 characters
        IF LENGTH(v_emp_id) < 3 OR LENGTH(v_emp_id) > 30 THEN
            RAISE EXCEPTION 'Employee ID must be between 3 and 30 characters.';
        END IF;

        -- Allowed characters: A-Z, 0-9, -, _
        IF v_emp_id !~ '^[A-Z0-9_-]+$' THEN
            RAISE EXCEPTION 'Only letters, numbers, hyphens (-), and underscores (_) are allowed.';
        END IF;

        -- Reject IDs consisting only of separators
        IF v_emp_id ~ '^[-_]+$' THEN
            RAISE EXCEPTION 'Employee ID cannot consist only of hyphens or underscores.';
        END IF;

        -- Workspace-scoped uniqueness check (case-insensitive)
        IF EXISTS (
            SELECT 1 FROM public.profiles
            WHERE workspace_id = v_workspace_id
              AND UPPER(employee_id) = v_emp_id
        ) THEN
            RAISE EXCEPTION 'Employee ID % already exists in this business. Please choose another ID.', v_emp_id;
        END IF;
    ELSE
        -- Auto-generate next sequential Employee ID for this workspace
        v_emp_id := public.generate_next_employee_id(v_workspace_id);
    END IF;

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

    -- 8. Insert into auth.identities
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
        v_new_user_id,
        v_new_user_id,
        jsonb_build_object('sub', v_new_user_id::text, 'email', v_clean_email),
        'email',
        v_new_user_id::text,
        NOW(),
        NOW(),
        NOW()
    ) ON CONFLICT (provider, provider_id) DO NOTHING;

    -- 9. Upsert into public.profiles (Strict link: profiles.id = auth.users.id)
    BEGIN
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
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'Employee ID % already exists in this business. Please choose another ID.', v_emp_id;
    END;

    RETURN jsonb_build_object(
        'success', TRUE,
        'empId', v_emp_id,
        'tempPass', v_temp_pw,
        'name', TRIM(p_name),
        'userId', v_new_user_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_employee_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RELOAD SCHEMA CACHE
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

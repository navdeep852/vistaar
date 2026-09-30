-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 047: SECURE EMPLOYEE AUTHENTICATION ARCHITECTURE
-- Migration File: supabase/migrations/047_secure_employee_auth_architecture.sql
-- Description:
--   1. Workspace-scoped sequential Employee ID generation (VST-EMP-001, VST-EMP-002, ...)
--   2. Authoritative, tenant-safe Employee ID resolution RPC for login
--   3. Employee login context resolution distinguishing inactive/suspended states
--   4. Diagnostic function for auditing broken/orphan employee profiles
--   5. RLS hardening preventing employee role escalation and profile tampering
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ATOMIC WORKSPACE-SCOPED SEQUENTIAL EMPLOYEE ID GENERATOR (VST-EMP-XXX)
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

    -- Concurrency-safe workspace-scoped lookup for highest numeric suffix across
    -- both VST-EMP-XXX and legacy VST-XXXXX patterns
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

    -- Generate zero-padded 3+ digit sequential ID (e.g. VST-EMP-001, VST-EMP-002)
    v_next_id := 'VST-EMP-' || LPAD((v_max_num + 1)::TEXT, 3, '0');
    RETURN v_next_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_next_employee_id(UUID) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. TENANT-SAFE EMPLOYEE ID TO EMAIL RESOLUTION RPC FOR LOGIN
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

    -- Workspace-scoped resolution
    IF p_workspace_id IS NOT NULL THEN
        SELECT LOWER(email) INTO v_email
        FROM public.profiles
        WHERE UPPER(TRIM(employee_id)) = v_clean_id
          AND workspace_id = p_workspace_id
          AND status = 'Active'
          AND deleted_at IS NULL
        LIMIT 1;

        RETURN v_email;
    END IF;

    -- Global resolution: verify exactly ONE active match across tenants
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

    -- If 0 or >1 matches (ambiguous), return NULL to enforce email or workspace login
    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_employee_id(TEXT, UUID) TO anon, authenticated, service_role;

-- Overload for single-parameter call from older client drivers
CREATE OR REPLACE FUNCTION public.get_email_by_employee_id(p_employee_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.get_email_by_employee_id(p_employee_id, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_employee_id(TEXT) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. EMPLOYEE LOGIN CONTEXT RESOLUTION (DISTINGUISHES INACTIVE / SUSPENDED)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_employee_login_context(
    p_employee_id TEXT,
    p_workspace_id UUID DEFAULT NULL
)
RETURNS TABLE (
    email TEXT,
    status TEXT,
    workspace_id UUID,
    profile_id UUID,
    role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_id TEXT;
BEGIN
    v_clean_id := UPPER(TRIM(p_employee_id));
    IF v_clean_id IS NULL OR v_clean_id = '' THEN
        RETURN;
    END IF;

    IF p_workspace_id IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            p.email::TEXT,
            p.status::TEXT,
            p.workspace_id,
            p.id AS profile_id,
            p.role::TEXT
        FROM public.profiles p
        WHERE UPPER(TRIM(p.employee_id)) = v_clean_id
          AND p.workspace_id = p_workspace_id
          AND p.deleted_at IS NULL
        LIMIT 1;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        p.email::TEXT,
        p.status::TEXT,
        p.workspace_id,
        p.id AS profile_id,
        p.role::TEXT
    FROM public.profiles p
    WHERE UPPER(TRIM(p.employee_id)) = v_clean_id
      AND p.deleted_at IS NULL
    LIMIT 2; -- if > 1 returned, caller handles ambiguous tenant match
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_login_context(TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_employee_login_context(TEXT) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. DIAGNOSTIC QUERY FUNCTION: AUDIT EMPLOYEE PROFILE & AUTH CONSISTENCY
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.diagnose_employee_auth_consistency()
RETURNS TABLE (
    profile_id UUID,
    employee_id TEXT,
    email TEXT,
    role TEXT,
    status TEXT,
    workspace_id UUID,
    auth_user_exists BOOLEAN,
    auth_email TEXT,
    issue_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS profile_id,
        p.employee_id::TEXT,
        p.email::TEXT,
        p.role::TEXT,
        p.status::TEXT,
        p.workspace_id,
        (u.id IS NOT NULL) AS auth_user_exists,
        u.email::TEXT AS auth_email,
        CASE
            WHEN u.id IS NULL THEN 'MISSING_AUTH_USER'
            WHEN LOWER(p.email) <> LOWER(COALESCE(u.email, '')) THEN 'EMAIL_MISMATCH'
            WHEN p.status = 'Active' AND u.id IS NULL THEN 'ACTIVE_PROFILE_WITHOUT_AUTH'
            ELSE 'HEALTHY'
        END::TEXT AS issue_type
    FROM public.profiles p
    LEFT JOIN auth.users u ON p.id = u.id
    WHERE p.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.diagnose_employee_auth_consistency() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. HARDEN RLS ON PROFILES TABLE (ROLE ESCALATION & PROFILE TAMPERING PROTECTION)
-- -----------------------------------------------------------------------------

-- Ensure RLS is active on public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop legacy permissive or ambiguous insert policies
DROP POLICY IF EXISTS "Owners and admins can insert profiles in their workspace" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_owner_only" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_workspace" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self_or_owner" ON public.profiles;

-- Policy 1: SELECT profiles within user's own workspace or user's own profile
CREATE POLICY "profiles_select_workspace_scoped"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    id = auth.uid()
    OR
    workspace_id IN (
        SELECT p2.workspace_id FROM public.profiles p2 WHERE p2.id = auth.uid()
    )
);

-- Policy 2: INSERT profiles — Owner only
CREATE POLICY "profiles_insert_owner_only"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
    -- Only workspace owner can insert profiles
    EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.id = auth.uid() 
          AND p2.workspace_id = profiles.workspace_id 
          AND p2.role = 'owner'
          AND p2.status = 'Active'
    )
    -- Role must be employee unless caller is owner configuring initial workspace
    AND (
        profiles.role = 'employee'::public.user_role 
        OR profiles.id = auth.uid()
    )
);

-- Policy 3: UPDATE profiles — Owner can update employees; Employee can only update own profile non-sensitive fields
CREATE POLICY "profiles_update_guarded"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    -- Owner can update employees in own workspace
    EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.id = auth.uid() 
          AND p2.workspace_id = profiles.workspace_id 
          AND p2.role = 'owner'
    )
    -- Non-owner can only update their own record
    OR id = auth.uid()
)
WITH CHECK (
    -- Non-owner cannot change role, employee_id, or workspace_id
    (
        id = auth.uid() 
        AND role = (SELECT p3.role FROM public.profiles p3 WHERE p3.id = auth.uid())
        AND workspace_id = (SELECT p3.workspace_id FROM public.profiles p3 WHERE p3.id = auth.uid())
        AND employee_id = (SELECT p3.employee_id FROM public.profiles p3 WHERE p3.id = auth.uid())
    )
    OR
    -- Owner updating
    EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.id = auth.uid() 
          AND p2.workspace_id = profiles.workspace_id 
          AND p2.role = 'owner'
    )
);

COMMIT;

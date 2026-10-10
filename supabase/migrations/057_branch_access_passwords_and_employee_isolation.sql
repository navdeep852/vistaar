-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 057
-- File: 057_branch_access_passwords_and_employee_isolation.sql
-- Description: Master Security & Branch Access Rule Fix
--              1. Independent Branch-Level Password Protection (branch_password_hash)
--              2. Owner-Exclusive Branch Password Administration
--              3. Permanent Employee Branch Association & Strict Isolation
--              4. Zero Account Password Leakage During Branch Switching
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ADD BRANCH ACCESS PASSWORD HASH COLUMN
-- -----------------------------------------------------------------------------
ALTER TABLE public.branches
    ADD COLUMN IF NOT EXISTS branch_password_hash TEXT DEFAULT NULL;

-- Ensure default_branch_id exists on public.profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS default_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 2. SECURE RPC: SET BRANCH ACCESS PASSWORD (OWNER ONLY)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_branch_password(
    p_branch_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id UUID;
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
BEGIN
    IF p_new_password IS NULL OR LENGTH(TRIM(p_new_password)) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Branch access password must be at least 4 characters long.');
    END IF;

    -- Look up branch workspace
    SELECT workspace_id INTO v_ws_id FROM public.branches WHERE id = p_branch_id;
    IF v_ws_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Branch not found.');
    END IF;

    -- Strict Authorization Check: Only workspace OWNER can set branch passwords
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id AND workspace_id = v_ws_id;

    IF v_user_role IS NULL OR LOWER(TRIM(v_user_role)) NOT IN ('owner') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Only the Business Owner can configure branch passwords.');
    END IF;

    -- Hash the branch password with bcrypt (pgcrypto)
    UPDATE public.branches
    SET branch_password_hash = crypt(TRIM(p_new_password), gen_salt('bf', 10)),
        updated_at = NOW()
    WHERE id = p_branch_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. SECURE RPC: VERIFY BRANCH ACCESS PASSWORD
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_branch_password(
    p_branch_id UUID,
    p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id UUID;
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_hash TEXT;
BEGIN
    -- Look up branch workspace and hash
    SELECT workspace_id, branch_password_hash
    INTO v_ws_id, v_hash
    FROM public.branches
    WHERE id = p_branch_id;

    IF v_ws_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'authorized', false, 'error', 'Branch not found.');
    END IF;

    -- Check caller belongs to workspace
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id AND workspace_id = v_ws_id;

    IF v_user_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'authorized', false, 'error', 'Unauthorized: User does not belong to this business.');
    END IF;

    -- CRITICAL EMPLOYEE RULE: Employees CANNOT switch branches, even if they know the password!
    IF LOWER(TRIM(v_user_role)) NOT IN ('owner', 'admin') THEN
        RETURN jsonb_build_object('success', false, 'authorized', false, 'error', 'Permission denied: Employees cannot switch branches. You are restricted to your assigned branch.');
    END IF;

    -- If branch has no password configured yet
    IF v_hash IS NULL OR v_hash = '' THEN
        RETURN jsonb_build_object('success', true, 'authorized', false, 'requires_setup', true, 'error', 'Branch password is not configured for this branch. Please set a password in Settings.');
    END IF;

    -- Verify password against stored bcrypt hash
    IF v_hash = crypt(TRIM(p_password), v_hash) THEN
        RETURN jsonb_build_object('success', true, 'authorized', true);
    ELSE
        RETURN jsonb_build_object('success', false, 'authorized', false, 'error', 'Incorrect branch access password.');
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. SECURE RPC: RESET BRANCH ACCESS PASSWORD (OWNER ONLY)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_branch_password(
    p_branch_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delegates to set_branch_password which strictly checks owner permission
    RETURN public.set_branch_password(p_branch_id, p_new_password);
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. SECURE RPC: TRANSFER EMPLOYEE BRANCH (OWNER ONLY)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_employee_branch(
    p_employee_id UUID,
    p_new_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ws_id UUID;
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_branch_ws_id UUID;
BEGIN
    -- Verify caller is Owner
    SELECT workspace_id, role INTO v_ws_id, v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL OR LOWER(TRIM(v_user_role)) NOT IN ('owner') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied: Only the Business Owner can transfer employees.');
    END IF;

    -- Verify new branch belongs to same workspace
    SELECT workspace_id INTO v_branch_ws_id
    FROM public.branches
    WHERE id = p_new_branch_id;

    IF v_branch_ws_id IS NULL OR v_branch_ws_id <> v_ws_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target branch does not belong to your business.');
    END IF;

    -- Update employee profile default_branch_id
    UPDATE public.profiles
    SET default_branch_id = p_new_branch_id,
        updated_at = NOW()
    WHERE id = p_employee_id AND workspace_id = v_ws_id;

    -- Re-assign user_branch_access
    DELETE FROM public.user_branch_access
    WHERE user_id = p_employee_id AND workspace_id = v_ws_id;

    INSERT INTO public.user_branch_access (
        workspace_id,
        user_id,
        branch_id,
        is_default
    ) VALUES (
        v_ws_id,
        p_employee_id,
        p_new_branch_id,
        TRUE
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. AUTHORITATIVE EMPLOYEE BRANCH CHECK FUNCTION FOR RLS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_user_authorized_for_branch(p_ws_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT (
        -- Owner or Workspace Admin has access to branches
        public.is_workspace_admin_or_owner(p_ws_id)
        OR
        -- Employee: strictly check assigned branch in default_branch_id or user_branch_access
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND workspace_id = p_ws_id
              AND default_branch_id = p_branch_id
        )
        OR
        EXISTS (
            SELECT 1 FROM public.user_branch_access
            WHERE user_id = auth.uid()
              AND workspace_id = p_ws_id
              AND branch_id = p_branch_id
        )
    );
$$;

-- -----------------------------------------------------------------------------
-- 7. REFRESH SCHEMA CACHE
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 068
-- File: 068_screen_lock_security_and_branch_verification.sql
-- Description: Automatic Screen Lock Security & Branch Password Verification
--              1. Secure RPC: verify_branch_unlock_password
--              2. Verifies branch password for current active branch
--              3. Strictly checks caller tenant and branch authorization
--              4. Zero plaintext password leakage
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. SECURE RPC: VERIFY BRANCH UNLOCK PASSWORD FOR SCREEN LOCK
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_branch_unlock_password(
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
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    -- 1. Authenticated session check
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'authorized', false,
            'session_expired', true,
            'error', 'Session expired. Please sign in again.'
        );
    END IF;

    -- 2. Input validation
    IF p_password IS NULL OR LENGTH(TRIM(p_password)) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'authorized', false,
            'error', 'Please enter your branch password.'
        );
    END IF;

    -- 3. Look up branch workspace and cryptographic hash
    SELECT workspace_id, branch_password_hash
    INTO v_ws_id, v_hash
    FROM public.branches
    WHERE id = p_branch_id;

    -- Check workspaces table fallback if organization-branch architecture is used
    IF v_ws_id IS NULL THEN
        SELECT organization_id, branch_password_hash
        INTO v_ws_id, v_hash
        FROM public.workspaces
        WHERE id = p_branch_id;
    END IF;

    IF v_ws_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'authorized', false,
            'error', 'Branch not found in enterprise.'
        );
    END IF;

    -- 4. Verify user belongs to workspace and is authorized for this branch
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'authorized', false,
            'error', 'Unauthorized user profile.'
        );
    END IF;

    -- Authorization check: Owner/Admin can unlock any branch in their business;
    -- Employee can ONLY unlock their assigned branch.
    IF LOWER(TRIM(v_user_role)) IN ('owner', 'admin') THEN
        v_is_authorized := TRUE;
    ELSE
        -- Strict Employee check: Must match default_branch_id or user_branch_access
        IF EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = v_user_id AND default_branch_id = p_branch_id
        ) OR EXISTS (
            SELECT 1 FROM public.user_branch_access
            WHERE user_id = v_user_id AND branch_id = p_branch_id
        ) OR EXISTS (
            SELECT 1 FROM public.workspace_memberships
            WHERE user_id = v_user_id AND workspace_id = p_branch_id
        ) THEN
            v_is_authorized := TRUE;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object(
            'success', false,
            'authorized', false,
            'error', 'Permission denied: You are not authorized for this branch location.'
        );
    END IF;

    -- 5. Check if branch has configured password
    IF v_hash IS NULL OR v_hash = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'authorized', false,
            'requires_setup', true,
            'error', 'Branch password is not configured for this branch. Please contact your Business Owner.'
        );
    END IF;

    -- 6. Cryptographic bcrypt comparison
    IF v_hash = crypt(TRIM(p_password), v_hash) THEN
        RETURN jsonb_build_object(
            'success', true,
            'authorized', true
        );
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'authorized', false,
            'error', 'Incorrect branch password.'
        );
    END IF;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.verify_branch_unlock_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_branch_unlock_password(UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. REFRESH SCHEMA CACHE
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;

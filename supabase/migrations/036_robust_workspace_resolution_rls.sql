-- ============================================================================
-- MIGRATION 036: ROBUST WORKSPACE RESOLUTION & PROFILE RLS HARDENING
-- Description: Ensures authenticated users can always select their own profile
--              (id = auth.uid()) and workspace without circular RLS evaluation.
--              Hardens current_user_workspace_id() with explicit search_path.
-- ============================================================================

-- 1. HARDEN CURRENT_USER_WORKSPACE_ID WITH SECURE SEARCH PATH
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

    -- Tier 2: Check JWT user_metadata
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

    -- Tier 3: Direct authoritative lookup from public.profiles by auth.uid()
    IF auth.uid() IS NOT NULL THEN
        SELECT workspace_id INTO v_workspace_id
        FROM public.profiles
        WHERE id = auth.uid();

        IF v_workspace_id IS NOT NULL THEN
            RETURN v_workspace_id;
        END IF;
    END IF;

    -- Tier 4: Fallback lookup from public.workspaces by owner_email
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

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, auth;

-- 2. HARDEN PROFILES SELECT POLICY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view profiles in their workspace" ON public.profiles;
CREATE POLICY "Users can view profiles in their workspace"
    ON public.profiles FOR SELECT
    USING (
        id = auth.uid() 
        OR workspace_id = public.current_user_workspace_id()
    );

-- 3. HARDEN WORKSPACES SELECT POLICY
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own workspace" ON public.workspaces;
CREATE POLICY "Users can view their own workspace"
    ON public.workspaces FOR SELECT
    USING (
        id = public.current_user_workspace_id()
        OR id IN (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
    );

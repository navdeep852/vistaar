-- ============================================================================
-- MIGRATION 067: SECURE MULTI-TENANT ENTERPRISE BACKUP SYSTEM & RLS REPAIR
-- Description:
--   1. Ensures the public.backups table exists with complete metadata schema:
--      storage destination, SHA-256 integrity checksum, schema versioning,
--      record counts, and size metrics.
--   2. Enforces cryptographic integrity constraints (completed/verified backups
--      must have a valid 64-character SHA-256 hash and positive byte size).
--   3. Closes security vulnerability SEC-1 from migration 064 by dropping any
--      broad "USING (true)" policies and revoking all access from the anon role.
--   4. Establishes strict Owner-Only Row Level Security (RLS) policies scoped
--      to the authenticated user's workspace.
--   5. Creates performant multi-tenant indexes for workspace and status filtering.
-- ============================================================================

-- 1. CREATE BACKUPS TABLE (IF NOT ALREADY PRESENT)
CREATE TABLE IF NOT EXISTS public.backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    backup_name TEXT NOT NULL,
    backup_type TEXT NOT NULL DEFAULT 'manual' CHECK (backup_type IN ('manual', 'automatic', 'safety')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'uploading', 'completed', 'verified', 'failed')),
    storage_location TEXT NOT NULL DEFAULT 'local_download',
    storage_bucket TEXT,
    storage_path TEXT,
    file_size_bytes BIGINT DEFAULT 0,
    record_counts JSONB DEFAULT '{}'::jsonb,
    checksum_sha256 TEXT,
    schema_version TEXT NOT NULL DEFAULT '1.0.0',
    error_message TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    verified_at TIMESTAMPTZ,
    restored_at TIMESTAMPTZ
);

-- Ensure all required columns exist in case table was partially migrated
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backups' AND column_name = 'storage_location') THEN
        ALTER TABLE public.backups ADD COLUMN storage_location TEXT NOT NULL DEFAULT 'local_download';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backups' AND column_name = 'file_size_bytes') THEN
        ALTER TABLE public.backups ADD COLUMN file_size_bytes BIGINT DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backups' AND column_name = 'record_counts') THEN
        ALTER TABLE public.backups ADD COLUMN record_counts JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backups' AND column_name = 'checksum_sha256') THEN
        ALTER TABLE public.backups ADD COLUMN checksum_sha256 TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backups' AND column_name = 'schema_version') THEN
        ALTER TABLE public.backups ADD COLUMN schema_version TEXT NOT NULL DEFAULT '1.0.0';
    END IF;
END $$;

-- 2. INTEGRITY CHECK CONSTRAINT
-- Completed or verified backups MUST have a valid 64-character SHA-256 checksum and positive byte size
ALTER TABLE public.backups DROP CONSTRAINT IF EXISTS chk_backup_integrity_on_completion;
ALTER TABLE public.backups ADD CONSTRAINT chk_backup_integrity_on_completion
    CHECK (
        status NOT IN ('completed', 'verified') OR
        (checksum_sha256 IS NOT NULL AND length(checksum_sha256) = 64 AND file_size_bytes > 0)
    );

-- 3. REMEDIATE RLS POLICIES & REVOKE INSECURE ANON GRANTS
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

-- Drop legacy unconstrained policies if present
DROP POLICY IF EXISTS "Allow staff to insert backups" ON public.backups;
DROP POLICY IF EXISTS "Allow staff to read backups" ON public.backups;
DROP POLICY IF EXISTS "Allow staff to update backups" ON public.backups;
DROP POLICY IF EXISTS "Allow staff to delete backups" ON public.backups;
DROP POLICY IF EXISTS "backups_workspace_isolation" ON public.backups;
DROP POLICY IF EXISTS "backups_owner_access_only" ON public.backups;
DROP POLICY IF EXISTS "backups_owner_select" ON public.backups;
DROP POLICY IF EXISTS "backups_owner_insert" ON public.backups;
DROP POLICY IF EXISTS "backups_owner_update" ON public.backups;
DROP POLICY IF EXISTS "backups_owner_delete" ON public.backups;

-- Strictly REVOKE ALL privileges from unauthenticated (anon) users
REVOKE ALL ON public.backups FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;

-- Helper function to check if the current authenticated user is an authorized owner
CREATE OR REPLACE FUNCTION public.is_current_user_workspace_owner(p_workspace_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check profiles / employees table
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = v_user_id AND workspace_id = p_workspace_id;

    IF v_role = 'owner' THEN
        RETURN TRUE;
    END IF;

    -- Check workspaces owner_id or owner_email
    IF EXISTS (
        SELECT 1 FROM public.workspaces
        WHERE id = p_workspace_id
          AND (
            id = v_user_id
            OR LOWER(owner_email) = LOWER(auth.jwt() ->> 'email')
          )
    ) THEN
        RETURN TRUE;
    END IF;

    -- Check employees table
    SELECT role INTO v_role
    FROM public.employees
    WHERE auth_user_id = v_user_id AND workspace_id = p_workspace_id;

    IF v_role = 'owner' THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4. CREATE OWNER-ONLY WORKSPACE ISOLATION POLICIES
CREATE POLICY "backups_owner_select" ON public.backups
    FOR SELECT TO authenticated
    USING (
        workspace_id = public.current_user_workspace_id()
        AND public.is_current_user_workspace_owner(workspace_id)
    );

CREATE POLICY "backups_owner_insert" ON public.backups
    FOR INSERT TO authenticated
    WITH CHECK (
        workspace_id = public.current_user_workspace_id()
        AND public.is_current_user_workspace_owner(workspace_id)
    );

CREATE POLICY "backups_owner_update" ON public.backups
    FOR UPDATE TO authenticated
    USING (
        workspace_id = public.current_user_workspace_id()
        AND public.is_current_user_workspace_owner(workspace_id)
    )
    WITH CHECK (
        workspace_id = public.current_user_workspace_id()
        AND public.is_current_user_workspace_owner(workspace_id)
    );

CREATE POLICY "backups_owner_delete" ON public.backups
    FOR DELETE TO authenticated
    USING (
        workspace_id = public.current_user_workspace_id()
        AND public.is_current_user_workspace_owner(workspace_id)
    );

-- 5. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_backups_workspace_created
    ON public.backups (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backups_status
    ON public.backups (status);

CREATE INDEX IF NOT EXISTS idx_backups_storage_location
    ON public.backups (storage_location);

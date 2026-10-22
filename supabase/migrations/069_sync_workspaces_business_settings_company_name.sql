-- ============================================================================
-- VISTAAR MIGRATION 069: Authoritative Business Name & Workspace Synchronization
-- ============================================================================
-- Description:
-- 1. Synchronizes public.workspaces.company_name with public.business_settings.legal_name
--    for all existing workspaces where a configured business name exists.
-- 2. Creates an automatic trigger to ensure any future insert or update of
--    public.business_settings.legal_name immediately updates public.workspaces.company_name.
-- 3. Guarantees multi-tenant isolation, data integrity, and cross-session persistence.
-- ============================================================================

-- 1. ONE-OFF SYNCHRONIZATION FOR ALL EXISTING WORKSPACES
UPDATE public.workspaces w
SET 
    company_name = TRIM(bs.legal_name),
    updated_at = NOW()
FROM public.business_settings bs
WHERE 
    w.id = bs.workspace_id
    AND bs.legal_name IS NOT NULL
    AND TRIM(bs.legal_name) != ''
    AND (w.company_name IS NULL OR w.company_name = 'My Business' OR w.company_name != TRIM(bs.legal_name));

-- 2. TRIGGER FUNCTION: AUTOMATICALLY SYNC BUSINESS SETTINGS TO WORKSPACE
CREATE OR REPLACE FUNCTION public.sync_business_settings_to_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.legal_name IS NOT NULL AND TRIM(NEW.legal_name) != '' THEN
        UPDATE public.workspaces
        SET 
            company_name = TRIM(NEW.legal_name),
            updated_at = NOW()
        WHERE id = NEW.workspace_id;
    END IF;
    RETURN NEW;
END;
$$;

-- 3. ATTACH TRIGGER TO business_settings
DROP TRIGGER IF EXISTS trg_sync_business_settings_to_workspace ON public.business_settings;
CREATE TRIGGER trg_sync_business_settings_to_workspace
    AFTER INSERT OR UPDATE OF legal_name ON public.business_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_business_settings_to_workspace();

-- 4. NOTIFY POSTGREST SCHEMA RELOAD
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- VISTAAR BUSINESS OS — FIX SIGNUP WORKSPACE CONFLICT & IDEMPOTENCY
-- Migration File: supabase/migrations/012_fix_signup_workspace_conflict.sql
-- Description: Makes handle_new_user() trigger idempotent on workspaces.owner_email,
--              prevents duplicate workspace creation on user signup, and cleans up
--              orphaned workspaces created by past failed signup attempts.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. UPDATE HANDLE_NEW_USER() TRIGGER TO BE IDEMPOTENT ON OWNER_EMAIL
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id UUID;
    v_company_name TEXT;
    v_owner_name TEXT;
    v_phone TEXT;
BEGIN
    v_workspace_id := extensions.uuid_generate_v4();

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
    VALUES (v_workspace_id, v_company_name, v_owner_name, NEW.email, v_phone)
    ON CONFLICT (owner_email) DO NOTHING
    RETURNING id INTO v_workspace_id;

    -- If conflict occurred (v_workspace_id is NULL), fetch existing workspace_id for owner_email
    IF v_workspace_id IS NULL THEN
        SELECT id INTO v_workspace_id
        FROM public.workspaces
        WHERE owner_email = NEW.email;
    END IF;

    -- 2. Create User Profile linked to auth.users.id and workspace_id
    INSERT INTO public.profiles (
        id, workspace_id, employee_id, name, email, phone, role, status
    ) VALUES (
        NEW.id, v_workspace_id, 'VST-00001', v_owner_name, NEW.email, v_phone, 'owner', 'Active'
    ) ON CONFLICT (id) DO NOTHING;

    -- 3. Create default Business Settings for workspace
    INSERT INTO public.business_settings (
        workspace_id, legal_name, owner_name, phone, email, address, city, state, pincode, currency
    ) VALUES (
        v_workspace_id, v_company_name, v_owner_name, v_phone, NEW.email, 'Business Address', 'City', 'State', '000000', '₹'
    ) ON CONFLICT (workspace_id) DO NOTHING;

    -- 4. Create default Inventory Settings for workspace
    INSERT INTO public.inventory_settings (
        workspace_id, uses_part_number
    ) VALUES (
        v_workspace_id, true
    ) ON CONFLICT (workspace_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Re-attach trigger if needed
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. ONE-OFF CLEANUP: DELETE ORPHANED WORKSPACES AND THEIR CHILD SETTINGS
-- -----------------------------------------------------------------------------
DELETE FROM public.workspaces w
WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.workspace_id = w.id
);

COMMIT;

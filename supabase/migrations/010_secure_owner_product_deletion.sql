-- =============================================================================
-- VISTAAR BUSINESS OS — OWNER-ONLY PRODUCT DELETION RLS POLICY
-- Migration File: supabase/migrations/010_secure_owner_product_deletion.sql
-- Description: Establishes helper function to check owner role and restricts
--              DELETE policy on public.products table to authenticated business owners.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. POSTGRESQL FUNCTION TO CHECK IF CURRENT USER IS WORKSPACE OWNER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_workspace_owner()
RETURNS BOOLEAN AS $$
DECLARE
    v_role public.user_role;
BEGIN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid();

    RETURN (v_role = 'owner');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- 2. HARDEN PRODUCT DELETE POLICY FOR OWNER-ONLY AUTHORIZATION
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Workspace isolation DELETE for products" ON public.products;
DROP POLICY IF EXISTS "Owner-only DELETE for products" ON public.products;

CREATE POLICY "Owner-only DELETE for products"
    ON public.products FOR DELETE
    USING (
        workspace_id = public.current_user_workspace_id()
        AND public.is_workspace_owner()
    );

COMMIT;

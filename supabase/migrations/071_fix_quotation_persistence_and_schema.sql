-- ============================================================================
-- VISTAAR MIGRATION 071: Quotation Persistence, Multi-Branch & Custom Items Fix
-- Description:
--   1. Ensures branch_id column exists on public.quotations and public.quotation_items.
--   2. Ensures item_type, description, part_number exist on public.quotation_items.
--   3. Ensures RLS policies for SELECT, INSERT, UPDATE, DELETE on quotations and quotation_items.
--   4. Adds performance and isolation indexes for quotation lookups.
-- ============================================================================

-- 1. Ensure branch_id on public.quotations
ALTER TABLE IF EXISTS public.quotations 
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_branch 
    ON public.quotations(workspace_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_quotations_date 
    ON public.quotations(workspace_id, date DESC);

-- 2. Ensure columns on public.quotation_items
ALTER TABLE IF EXISTS public.quotation_items 
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.quotation_items 
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'product';

ALTER TABLE IF EXISTS public.quotation_items 
    ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE IF EXISTS public.quotation_items 
    ADD COLUMN IF NOT EXISTS part_number VARCHAR(100);

-- Allow product_id to be NULL for custom items
ALTER TABLE IF EXISTS public.quotation_items 
    ALTER COLUMN product_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation 
    ON public.quotation_items(workspace_id, quotation_id);

-- 3. Ensure Row-Level Security on quotations & quotation_items
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- Quotations Policies
DROP POLICY IF EXISTS "Workspace isolation SELECT for quotations" ON public.quotations;
DROP POLICY IF EXISTS "Workspace isolation INSERT for quotations" ON public.quotations;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for quotations" ON public.quotations;
DROP POLICY IF EXISTS "Workspace isolation DELETE for quotations" ON public.quotations;

CREATE POLICY "Workspace isolation SELECT for quotations" ON public.quotations
    FOR SELECT USING (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation INSERT for quotations" ON public.quotations
    FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation UPDATE for quotations" ON public.quotations
    FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
    WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation DELETE for quotations" ON public.quotations
    FOR DELETE USING (workspace_id = public.current_user_workspace_id());

-- Quotation Items Policies
DROP POLICY IF EXISTS "Workspace isolation SELECT for quotation_items" ON public.quotation_items;
DROP POLICY IF EXISTS "Workspace isolation INSERT for quotation_items" ON public.quotation_items;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for quotation_items" ON public.quotation_items;
DROP POLICY IF EXISTS "Workspace isolation DELETE for quotation_items" ON public.quotation_items;

CREATE POLICY "Workspace isolation SELECT for quotation_items" ON public.quotation_items
    FOR SELECT USING (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation INSERT for quotation_items" ON public.quotation_items
    FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation UPDATE for quotation_items" ON public.quotation_items
    FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
    WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation DELETE for quotation_items" ON public.quotation_items
    FOR DELETE USING (workspace_id = public.current_user_workspace_id());

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

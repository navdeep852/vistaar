-- =============================================================================
-- Migration 027: Add Physical Storage Location / Rack No. to Products Table
-- =============================================================================

-- Add location column if it does not already exist
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS location VARCHAR(100);

-- Query performance index for workspace-scoped location lookup and filtering
CREATE INDEX IF NOT EXISTS idx_products_location 
ON public.products (workspace_id, location) 
WHERE location IS NOT NULL;

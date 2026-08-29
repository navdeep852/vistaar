-- Migration: 011_optimize_product_indexes.sql
-- Description: Create composite performance indexes for Products and Stock Receipts queries

-- 1. Index for workspace-scoped active product listing and sorting by name
CREATE INDEX IF NOT EXISTS idx_products_workspace_active_name
ON public.products (workspace_id, active, name);

-- 2. Index for category filtering within workspace
CREATE INDEX IF NOT EXISTS idx_products_workspace_category
ON public.products (workspace_id, category_id);

-- 3. Index for stock receipts lookups per product and workspace
CREATE INDEX IF NOT EXISTS idx_stock_receipts_workspace_product
ON public.stock_receipts (workspace_id, product_id);

-- 4. Index for stock movements lookups per product and workspace
CREATE INDEX IF NOT EXISTS idx_stock_movements_workspace_product
ON public.stock_movements (workspace_id, product_id);

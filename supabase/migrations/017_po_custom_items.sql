-- ============================================================================
-- VISTAAR MIGRATION 017: Custom PO Items Schema Adjustment
-- ============================================================================

-- 1. Make product_id NULLABLE in purchase_order_items to support custom PO items
ALTER TABLE public.purchase_order_items ALTER COLUMN product_id DROP NOT NULL;

-- 2. Add item_name column to purchase_order_items if not present
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS item_name TEXT;

-- 3. Make product_id NULLABLE in purchase_order_receipt_items
ALTER TABLE public.purchase_order_receipt_items ALTER COLUMN product_id DROP NOT NULL;

-- 4. Add item_name column to purchase_order_receipt_items if not present
ALTER TABLE public.purchase_order_receipt_items ADD COLUMN IF NOT EXISTS item_name TEXT;

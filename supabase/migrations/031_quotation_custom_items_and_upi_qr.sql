-- ============================================================================
-- VISTAAR MIGRATION 031: Quotation Custom Items and UPI QR Support
-- ============================================================================

-- 1. Support custom non-catalog items in quotation_items
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'product';
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS part_number VARCHAR(100);

-- Ensure product_id remains nullable for custom items
ALTER TABLE public.quotation_items ALTER COLUMN product_id DROP NOT NULL;

-- 2. Add UPI QR Code URL and Quotation Display Preference to business_settings
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS upi_qr_url TEXT;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS show_upi_qr_on_quotation BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.quotation_items.item_type IS 'Distinguishes between catalog product and custom quotation item';
COMMENT ON COLUMN public.quotation_items.description IS 'Optional detailed description for custom quotation items';
COMMENT ON COLUMN public.business_settings.upi_qr_url IS 'Workspace-level UPI QR Code image URL for Scan to Pay';
COMMENT ON COLUMN public.business_settings.show_upi_qr_on_quotation IS 'Toggle whether to display UPI QR code on quotation templates';

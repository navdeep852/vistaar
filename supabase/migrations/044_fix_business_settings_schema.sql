-- ============================================================================
-- VISTAAR MIGRATION 044: Fix business_settings Schema and Column Consistency
-- ============================================================================
-- Ensures all optional business branding and QR columns exist on
-- public.business_settings with idempotent ALTER TABLE statements.
-- Does NOT drop tables, does NOT delete data, does NOT disable RLS.
-- ============================================================================

-- 1. Ensure UPI QR Code URL and Quotation preference columns exist
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS upi_qr_url TEXT;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS show_upi_qr_on_quotation BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.business_settings.upi_qr_url IS 'Workspace-level UPI QR Code image URL for Scan to Pay';
COMMENT ON COLUMN public.business_settings.show_upi_qr_on_quotation IS 'Toggle whether to display UPI QR code on quotation templates';

-- 2. Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

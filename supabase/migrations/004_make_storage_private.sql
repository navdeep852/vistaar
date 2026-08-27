-- =============================================================================
-- VISTAAR BUSINESS OS — STORAGE HARDENING (RECOMMENDED PRIVATE STORAGE)
-- Migration File: supabase/migrations/004_make_storage_private.sql
-- Description: Updates storage buckets to private (public = false) and enforces
--              authenticated-only RLS policies for zero-trust security.
-- =============================================================================

-- 1. SET ALL STORAGE BUCKETS TO PRIVATE
UPDATE storage.buckets
SET public = false
WHERE id IN ('avatars', 'business-assets', 'product-media', 'documents');

-- 2. REMOVE UNRESTRICTED PUBLIC READ POLICIES
DROP POLICY IF EXISTS "Public read access for avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for business-assets" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for product-media" ON storage.objects;

-- 3. CREATE SECURE AUTHENTICATED ACCESS POLICIES
CREATE POLICY "Authenticated read access for avatars"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated read access for business-assets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'business-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated read access for product-media"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'product-media' AND auth.role() = 'authenticated');

-- =============================================================================
-- END OF MIGRATION SCRIPT 004_make_storage_private.sql
-- =============================================================================

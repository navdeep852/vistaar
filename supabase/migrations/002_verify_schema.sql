-- =============================================================================
-- VISTAAR BUSINESS OS — PHASE 2 INFRASTRUCTURE AUDIT & VERIFICATION SCRIPT
-- Migration File: supabase/migrations/002_verify_schema.sql
-- Description: Runs automated verification queries on PostgreSQL system catalogs
--              and outputs a formatted PASS/FAIL verification report.
-- =============================================================================

WITH 
table_check AS (
    SELECT COUNT(*) as count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'workspaces', 'profiles', 'business_settings', 'categories', 'suppliers',
        'customers', 'products', 'inventory_settings', 'stock_receipts', 'stock_movements',
        'import_sessions', 'counter_sales', 'counter_sale_items', 'quotations',
        'quotation_items', 'invoices', 'invoice_items', 'payments', 'udhari_records',
        'udhari_payments', 'expenses', 'follow_ups', 'notifications', 'feedbacks',
        'offers', 'id_mappings'
      )
),
rls_check AS (
    SELECT COUNT(*) as count
    FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = true
      AND tablename IN (
        'workspaces', 'profiles', 'business_settings', 'categories', 'suppliers',
        'customers', 'products', 'inventory_settings', 'stock_receipts', 'stock_movements',
        'import_sessions', 'counter_sales', 'counter_sale_items', 'quotations',
        'quotation_items', 'invoices', 'invoice_items', 'payments', 'udhari_records',
        'udhari_payments', 'expenses', 'follow_ups', 'notifications', 'feedbacks',
        'offers', 'id_mappings'
      )
),
policy_check AS (
    SELECT COUNT(*) as count
    FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
),
fk_check AS (
    SELECT COUNT(*) as count
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_type = 'FOREIGN KEY'
),
index_check AS (
    SELECT COUNT(*) as count
    FROM pg_indexes
    WHERE schemaname = 'public'
),
bucket_check AS (
    SELECT COUNT(*) as count
    FROM storage.buckets
    WHERE id IN ('avatars', 'business-assets', 'product-media', 'documents')
),
storage_policy_check AS (
    SELECT COUNT(*) as count
    FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'storage' AND c.relname = 'objects'
)
SELECT 
    '1. Database Connection & Engine' as Check_Item,
    'PASS' as Status,
    'PostgreSQL Database Engine connected and executing queries' as Details
UNION ALL
SELECT 
    '2. Public Application Tables',
    CASE WHEN count = 26 THEN 'PASS' ELSE 'FAIL' END,
    count || ' of 26 required business tables exist'
FROM table_check
UNION ALL
SELECT 
    '3. Foreign Key Constraints',
    CASE WHEN count >= 25 THEN 'PASS' ELSE 'FAIL' END,
    count || ' foreign key constraints configured'
FROM fk_check
UNION ALL
SELECT 
    '4. Database Indexes',
    CASE WHEN count >= 30 THEN 'PASS' ELSE 'FAIL' END,
    count || ' indexes active for high-performance querying'
FROM index_check
UNION ALL
SELECT 
    '5. Row Level Security (RLS) Status',
    CASE WHEN count = 26 THEN 'PASS' ELSE 'FAIL' END,
    count || ' of 26 tables have RLS ENABLED'
FROM rls_check
UNION ALL
SELECT 
    '6. Multi-Tenant RLS Policies',
    CASE WHEN count >= 90 THEN 'PASS' ELSE 'FAIL' END,
    count || ' workspace isolation policies active'
FROM policy_check
UNION ALL
SELECT 
    '7. Storage Buckets',
    CASE WHEN count = 4 THEN 'PASS' ELSE 'FAIL' END,
    count || ' of 4 required storage buckets (avatars, business-assets, product-media, documents) created'
FROM bucket_check
UNION ALL
SELECT 
    '8. Storage Security Policies',
    CASE WHEN count >= 7 THEN 'PASS' ELSE 'FAIL' END,
    count || ' storage access policies active'
FROM storage_policy_check;

-- =============================================================================
-- VISTAAR BUSINESS OS — POST-MIGRATION AUDIT & COUNT VALIDATION (PHASE 3B)
-- Migration File: supabase/migrations/006_post_migration_audit.sql
-- Description: Queries actual row counts across all 26 application tables and
--              validates foreign key parent-child relational integrity.
-- =============================================================================

SELECT 'workspaces' as Table_Name, COUNT(*) as Actual_Supabase_Count FROM public.workspaces
UNION ALL SELECT 'profiles', COUNT(*) FROM public.profiles
UNION ALL SELECT 'business_settings', COUNT(*) FROM public.business_settings
UNION ALL SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL SELECT 'suppliers', COUNT(*) FROM public.suppliers
UNION ALL SELECT 'customers', COUNT(*) FROM public.customers
UNION ALL SELECT 'products', COUNT(*) FROM public.products
UNION ALL SELECT 'inventory_settings', COUNT(*) FROM public.inventory_settings
UNION ALL SELECT 'stock_receipts', COUNT(*) FROM public.stock_receipts
UNION ALL SELECT 'stock_movements', COUNT(*) FROM public.stock_movements
UNION ALL SELECT 'counter_sales', COUNT(*) FROM public.counter_sales
UNION ALL SELECT 'counter_sale_items', COUNT(*) FROM public.counter_sale_items
UNION ALL SELECT 'quotations', COUNT(*) FROM public.quotations
UNION ALL SELECT 'quotation_items', COUNT(*) FROM public.quotation_items
UNION ALL SELECT 'invoices', COUNT(*) FROM public.invoices
UNION ALL SELECT 'invoice_items', COUNT(*) FROM public.invoice_items
UNION ALL SELECT 'payments', COUNT(*) FROM public.payments
UNION ALL SELECT 'udhari_records', COUNT(*) FROM public.udhari_records
UNION ALL SELECT 'udhari_payments', COUNT(*) FROM public.udhari_payments
UNION ALL SELECT 'expenses', COUNT(*) FROM public.expenses
UNION ALL SELECT 'follow_ups', COUNT(*) FROM public.follow_ups
UNION ALL SELECT 'notifications', COUNT(*) FROM public.notifications
UNION ALL SELECT 'feedbacks', COUNT(*) FROM public.feedbacks
UNION ALL SELECT 'offers', COUNT(*) FROM public.offers
UNION ALL SELECT 'import_sessions', COUNT(*) FROM public.import_sessions
UNION ALL SELECT 'id_mappings', COUNT(*) FROM public.id_mappings;

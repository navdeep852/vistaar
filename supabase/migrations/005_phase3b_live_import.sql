-- =============================================================================
-- VISTAAR BUSINESS OS — PHASE 3B CONTROLLED PRODUCTION DATA IMPORT
-- Migration File: supabase/migrations/005_phase3b_live_import.sql
-- Execution Protection: Wrapped in a single atomic PostgreSQL transaction block
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. HARDEN SUPABASE STORAGE BUCKETS (MAKE PRIVATE & APPLY RLS)
-- -----------------------------------------------------------------------------
UPDATE storage.buckets
SET public = false
WHERE id IN ('avatars', 'business-assets', 'product-media', 'documents');

DROP POLICY IF EXISTS "Public read access for avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for business-assets" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for product-media" ON storage.objects;

DO $$ BEGIN
    CREATE POLICY "Authenticated read access for avatars"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Authenticated read access for business-assets"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'business-assets' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Authenticated read access for product-media"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'product-media' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- -----------------------------------------------------------------------------
-- 2. DEPENDENCY ORDER IMPORT (1 through 26)
-- -----------------------------------------------------------------------------

-- 1. WORKSPACES
INSERT INTO public.workspaces (id, company_name, owner_name, owner_email, owner_phone, created_at, updated_at)
VALUES (
    '4f42a205-792d-4bdb-a9e5-be88cbed331a',
    'Vistaar Business OS Demo Company',
    'Rajesh Kumar',
    'admin@vistaar.com',
    '9820011223',
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    company_name = EXCLUDED.company_name,
    owner_name = EXCLUDED.owner_name,
    owner_email = EXCLUDED.owner_email,
    owner_phone = EXCLUDED.owner_phone;

-- 2. PROFILES (Note: auth.users is NOT modified; profiles staging only)
INSERT INTO public.profiles (id, workspace_id, employee_id, name, email, phone, role, status, department, designation)
VALUES 
    ('37baecfb-88c2-476a-a4d2-62a3b2e88494', '4f42a205-792d-4bdb-a9e5-be88cbed331a', 'VST-00001', 'Rajesh Kumar', 'admin@vistaar.com', '9820011223', 'owner', 'Active', 'Management', 'Managing Director'),
    ('8f11c75b-9d41-4e76-8809-7a56bf5c8d10', '4f42a205-792d-4bdb-a9e5-be88cbed331a', 'VST-00002', 'Priya Sharma', 'priya@vistaar.com', '9820099887', 'staff', 'Active', 'Sales', 'Sales Representative')
ON CONFLICT (id) DO NOTHING;

-- 3. BUSINESS SETTINGS
INSERT INTO public.business_settings (
    workspace_id, legal_name, business_type, owner_name, phone, email, address, city, state, pincode, currency,
    logo_url, signature_url, stamp_url
) VALUES (
    '4f42a205-792d-4bdb-a9e5-be88cbed331a',
    'Vistaar Enterprises Pvt Ltd',
    'Retail & Wholesale Electronics',
    'Rajesh Kumar',
    '9820011223',
    'admin@vistaar.com',
    '123 Industrial Area, Phase II',
    'Mumbai',
    'Maharashtra',
    '400001',
    '₹',
    'business-assets/4f42a205-792d-4bdb-a9e5-be88cbed331a/branding/business_logo.png',
    'business-assets/4f42a205-792d-4bdb-a9e5-be88cbed331a/branding/signature.png',
    'business-assets/4f42a205-792d-4bdb-a9e5-be88cbed331a/branding/stamp.png'
) ON CONFLICT (workspace_id) DO UPDATE SET
    legal_name = EXCLUDED.legal_name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email;

-- 4. CATEGORIES
INSERT INTO public.categories (id, workspace_id, name, description)
VALUES 
    ('11111111-1111-4000-a000-000000000001', '4f42a205-792d-4bdb-a9e5-be88cbed331a', 'Electronics', 'Computer peripherals and electronic items'),
    ('11111111-1111-4000-a000-000000000002', '4f42a205-792d-4bdb-a9e5-be88cbed331a', 'Hardware', 'Networking and hardware components')
ON CONFLICT (id) DO NOTHING;

-- 5. SUPPLIERS
INSERT INTO public.suppliers (id, workspace_id, name, contact_person, phone, email, address)
VALUES (
    '22222222-2222-4000-a000-000000000001',
    '4f42a205-792d-4bdb-a9e5-be88cbed331a',
    'TechSource India Pvt Ltd',
    'Amit Shah',
    '9876543210',
    'sales@techsource.in',
    '45 Tech Park, Electronic City, Bengaluru'
) ON CONFLICT (id) DO NOTHING;

-- 6. CUSTOMERS
INSERT INTO public.customers (id, workspace_id, name, phone, whatsapp, email, address, city, state, pincode, customer_type, credit_limit)
VALUES 
    ('375370a6-46f9-4626-a046-6d8b42cb12b5', '4f42a205-792d-4bdb-a9e5-be88cbed331a', 'Rajesh Enterprise', '9820011223', '9820011223', 'rajesh@enterprise.com', 'Market Road', 'Mumbai', 'Maharashtra', '400001', 'Wholesale', 50000),
    ('cfb3e9cf-bac3-4660-ab59-a4e82edb81dd', '4f42a205-792d-4bdb-a9e5-be88cbed331a', 'Sharma Electronics', '9811122233', '9811122233', 'info@sharmaelec.com', 'Station Plaza', 'Delhi', 'Delhi', '110001', 'Retail', 20000),
    ('33333333-3333-4000-a000-000000000003', '4f42a205-792d-4bdb-a9e5-be88cbed331a', 'Navdeep Maurya', '8176013733', '8176013733', 'mauryanavdeep80@gmail.com', 'Civil Lines', 'Lucknow', 'Uttar Pradesh', '226001', 'Retail', 15000)
ON CONFLICT (id) DO NOTHING;

-- 7. PRODUCTS
INSERT INTO public.products (id, workspace_id, category_id, supplier_id, name, sku, part_number, unit, buy_price, selling_price, minimum_stock, tax_percent, hsn_sac)
VALUES 
    ('2a32891d-e359-4960-a714-a72697537073', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '11111111-1111-4000-a000-000000000001', '22222222-2222-4000-a000-000000000001', 'Wireless Ergonomic Mouse', 'WM-001', 'PN-WM-01', 'Pcs', 450.00, 799.00, 5, 18.0, '8471'),
    ('288fcea0-af0f-4fe1-a0c0-5b5c2daef8c8', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '11111111-1111-4000-a000-000000000001', '22222222-2222-4000-a000-000000000001', 'Mechanical RGB Keyboard', 'KB-002', 'PN-KB-02', 'Pcs', 1800.00, 2999.00, 3, 18.0, '8471'),
    ('44444444-4444-4000-a000-000000000003', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '11111111-1111-4000-a000-000000000001', '22222222-2222-4000-a000-000000000001', '27 4K Monitor', 'MN-003', 'PN-MN-03', 'Pcs', 18500.00, 24999.00, 2, 18.0, '8528')
ON CONFLICT (id) DO NOTHING;

-- 8. INVENTORY SETTINGS
INSERT INTO public.inventory_settings (workspace_id, uses_part_number)
VALUES ('4f42a205-792d-4bdb-a9e5-be88cbed331a', true)
ON CONFLICT (workspace_id) DO NOTHING;

-- 9. STOCK RECEIPTS (GRN Batches)
INSERT INTO public.stock_receipts (id, workspace_id, product_id, supplier_id, receipt_number, quantity_received, quantity_remaining, buy_price)
VALUES 
    ('55555555-5555-4000-a000-000000000001', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '2a32891d-e359-4960-a714-a72697537073', '22222222-2222-4000-a000-000000000001', 'GRN-001', 50, 48, 450.00),
    ('55555555-5555-4000-a000-000000000002', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '288fcea0-af0f-4fe1-a0c0-5b5c2daef8c8', '22222222-2222-4000-a000-000000000001', 'GRN-002', 20, 19, 1800.00),
    ('55555555-5555-4000-a000-000000000003', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '44444444-4444-4000-a000-000000000003', '22222222-2222-4000-a000-000000000001', 'GRN-003', 10, 10, 18500.00)
ON CONFLICT (id) DO NOTHING;

-- 10. COUNTER SALES & LINE ITEMS
INSERT INTO public.counter_sales (id, workspace_id, customer_id, sale_number, invoice_number, customer_name, phone_number, subtotal, discount_type, discount_value, discount_amount, final_total, status)
VALUES (
    '66666666-6666-4000-a000-000000000001',
    '4f42a205-792d-4bdb-a9e5-be88cbed331a',
    '375370a6-46f9-4626-a046-6d8b42cb12b5',
    'CS-2026-0001',
    'INV-2026-00101',
    'Rajesh Enterprise',
    '9820011223',
    3798.00,
    'fixed',
    0,
    0,
    3798.00,
    'COMPLETED'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.counter_sale_items (id, workspace_id, counter_sale_id, product_id, stock_receipt_id, product_name_snapshot, part_number_snapshot, quantity, rate, amount, buy_price_snapshot)
VALUES 
    ('66666666-6666-4000-a000-000000000002', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '66666666-6666-4000-a000-000000000001', '2a32891d-e359-4960-a714-a72697537073', '55555555-5555-4000-a000-000000000001', 'Wireless Ergonomic Mouse', 'PN-WM-01', 1, 799.00, 799.00, 450.00),
    ('66666666-6666-4000-a000-000000000003', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '66666666-6666-4000-a000-000000000001', '288fcea0-af0f-4fe1-a0c0-5b5c2daef8c8', '55555555-5555-4000-a000-000000000002', 'Mechanical RGB Keyboard', 'PN-KB-02', 1, 2999.00, 2999.00, 1800.00)
ON CONFLICT (id) DO NOTHING;

-- 11. INVOICES & LINE ITEMS
INSERT INTO public.invoices (id, workspace_id, customer_id, invoice_number, customer_name, customer_phone, status, date, due_date, subtotal, discount_total, tax_total, grand_total, paid_amount, balance_amount)
VALUES (
    '77777777-7777-4000-a000-000000000001',
    '4f42a205-792d-4bdb-a9e5-be88cbed331a',
    '375370a6-46f9-4626-a046-6d8b42cb12b5',
    'INV-2026-0001',
    'Rajesh Enterprise',
    '9820011223',
    'Paid',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '15 days',
    3798.00,
    0,
    683.64,
    4481.64,
    4481.64,
    0.00
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.invoice_items (id, workspace_id, invoice_id, product_id, product_name, sku, unit, quantity, buy_price, selling_price, tax_percent, tax_amount, total)
VALUES 
    ('77777777-7777-4000-a000-000000000002', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '77777777-7777-4000-a000-000000000001', '2a32891d-e359-4960-a714-a72697537073', 'Wireless Ergonomic Mouse', 'WM-001', 'Pcs', 1, 450.00, 799.00, 18.0, 143.82, 942.82),
    ('77777777-7777-4000-a000-000000000003', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '77777777-7777-4000-a000-000000000001', '288fcea0-af0f-4fe1-a0c0-5b5c2daef8c8', 'Mechanical RGB Keyboard', 'KB-002', 'Pcs', 1, 1800.00, 2999.00, 18.0, 539.82, 3538.82)
ON CONFLICT (id) DO NOTHING;

-- 12. PAYMENTS
INSERT INTO public.payments (id, workspace_id, customer_id, invoice_id, payment_number, customer_name, invoice_number, amount, method)
VALUES (
    '88888888-8888-4000-a000-000000000001',
    '4f42a205-792d-4bdb-a9e5-be88cbed331a',
    '375370a6-46f9-4626-a046-6d8b42cb12b5',
    '77777777-7777-4000-a000-000000000001',
    'PAY-2026-0001',
    'Rajesh Enterprise',
    'INV-2026-0001',
    4481.64,
    'UPI'
) ON CONFLICT (id) DO NOTHING;

-- 13. UDHARI RECORDS & PAYMENTS
INSERT INTO public.udhari_records (id, workspace_id, customer_id, udhari_code, customer_name_snapshot, phone_snapshot, original_amount, total_received, outstanding_amount, due_date, status)
VALUES (
    '99999999-9999-4000-a000-000000000001',
    '4f42a205-792d-4bdb-a9e5-be88cbed331a',
    '375370a6-46f9-4626-a046-6d8b42cb12b5',
    'UD-2026-0001',
    'Rajesh Enterprise',
    '9820011223',
    5000.00,
    2000.00,
    3000.00,
    CURRENT_DATE + INTERVAL '10 days',
    'PARTIALLY PAID'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.udhari_payments (id, workspace_id, udhari_id, customer_id, payment_code, amount, payment_method, phone_number)
VALUES (
    '99999999-9999-4000-a000-000000000002',
    '4f42a205-792d-4bdb-a9e5-be88cbed331a',
    '99999999-9999-4000-a000-000000000001',
    '375370a6-46f9-4626-a046-6d8b42cb12b5',
    'PAY-2026-0002',
    2000.00,
    'Cash',
    '9820011223'
) ON CONFLICT (id) DO NOTHING;

-- 14. EXPENSES
INSERT INTO public.expenses (id, workspace_id, category, expense_name, amount, paid_to)
VALUES 
    ('aaaaaaaa-aaaa-4000-a000-000000000001', '4f42a205-792d-4bdb-a9e5-be88cbed331a', 'Rent', 'Office Rent August 2026', 15000.00, 'Commercial Property Owners'),
    ('aaaaaaaa-aaaa-4000-a000-000000000002', '4f42a205-792d-4bdb-a9e5-be88cbed331a', 'Internet', 'High-Speed Broadband Bill', 1200.00, 'Airtel Broadband')
ON CONFLICT (id) DO NOTHING;

-- 15. FOLLOW-UPS (Including exact historical failure preservation)
INSERT INTO public.follow_ups (id, workspace_id, customer_id, customer_name, customer_phone, title, due_date, due_time, priority, status, action_type, attempt_count, max_attempts, execution_logs)
VALUES 
    ('bbbbbbbb-bbbb-4000-a000-000000000001', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '33333333-3333-4000-a000-000000000003', 'Navdeep Maurya', '8176013733', 'Demo', '2026-08-23', '19:32', 'High', 'Completed', 'INTERNAL_REMINDER', 0, 3, '[]'::jsonb),
    ('bbbbbbbb-bbbb-4000-a000-000000000002', '4f42a205-792d-4bdb-a9e5-be88cbed331a', '375370a6-46f9-4626-a046-6d8b42cb12b5', 'Rajesh Enterprise', '9820011223', 'Quotation', '2026-08-23', '19:31', 'High', 'Completed', 'INTERNAL_REMINDER', 0, 3, '[]'::jsonb),
    ('bbbbbbbb-bbbb-4000-a000-000000000003', '4f42a205-792d-4bdb-a9e5-be88cbed331a', null, 'Invalid Contact', '', 'WhatsApp Reminder', '2026-08-23', '19:30', 'High', 'Failed', 'WHATSAPP_MESSAGE', 1, 3, '[{"timestamp":"2026-08-23T19:30:00Z","error":"Customer does not have a valid WhatsApp phone number."}]'::jsonb),
    ('bbbbbbbb-bbbb-4000-a000-000000000004', '4f42a205-792d-4bdb-a9e5-be88cbed331a', null, 'Invalid Email', '', 'Email Reminder', '2026-08-23', '19:30', 'Medium', 'Failed', 'EMAIL', 1, 3, '[{"timestamp":"2026-08-23T19:30:00Z","error":"Customer does not have a valid email address."}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 16. NOTIFICATIONS
INSERT INTO public.notifications (id, workspace_id, type, title, message, is_read, link_route)
VALUES 
    ('cccccccc-cccc-4000-a000-000000000001', '4f42a205-792d-4bdb-a9e5-be88cbed331a', 'followup_due', 'Follow-up Due: Rajesh Enterprise', 'Call Rajesh regarding bulk order', false, 'follow-ups'),
    ('cccccccc-cccc-4000-a000-000000000002', '4f42a205-792d-4bdb-a9e5-be88cbed331a', 'followup_due', 'Follow-up Due: Navdeep Maurya', 'Pre-filled message ready for WhatsApp', false, 'follow-ups')
ON CONFLICT (id) DO NOTHING;

-- 17. ID MAPPING CROSS-REFERENCES
INSERT INTO public.id_mappings (workspace_id, entity_type, legacy_id, supabase_id)
VALUES 
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'workspace', 'ws-default-vistaar', '4f42a205-792d-4bdb-a9e5-be88cbed331a'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'profile', 'usr-owner-001', '37baecfb-88c2-476a-a4d2-62a3b2e88494'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'profile', 'usr-staff-002', '8f11c75b-9d41-4e76-8809-7a56bf5c8d10'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'category', 'cat-1', '11111111-1111-4000-a000-000000000001'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'category', 'cat-2', '11111111-1111-4000-a000-000000000002'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'supplier', 'sup-1', '22222222-2222-4000-a000-000000000001'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'customer', 'cust-1', '375370a6-46f9-4626-a046-6d8b42cb12b5'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'customer', 'cust-2', 'cfb3e9cf-bac3-4660-ab59-a4e82edb81dd'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'customer', 'cust-1787493583207', '33333333-3333-4000-a000-000000000003'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'product', 'prod-1', '2a32891d-e359-4960-a714-a72697537073'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'product', 'prod-2', '288fcea0-af0f-4fe1-a0c0-5b5c2daef8c8'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'product', 'prod-3', '44444444-4444-4000-a000-000000000003'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'stock_receipt', 'rec-1', '55555555-5555-4000-a000-000000000001'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'stock_receipt', 'rec-2', '55555555-5555-4000-a000-000000000002'),
    ('4f42a205-792d-4bdb-a9e5-be88cbed331a', 'stock_receipt', 'rec-3', '55555555-5555-4000-a000-000000000003')
ON CONFLICT (workspace_id, entity_type, legacy_id) DO UPDATE SET
    supabase_id = EXCLUDED.supabase_id;

COMMIT;

-- =============================================================================
-- END OF SEED MIGRATION SCRIPT 005_phase3b_live_import.sql
-- =============================================================================

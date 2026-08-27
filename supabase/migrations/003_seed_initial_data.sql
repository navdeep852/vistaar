-- =============================================================================
-- VISTAAR BUSINESS OS — LIVE DATA MIGRATION SEED SCRIPT (PHASE 3B)
-- Migration File: supabase/migrations/003_seed_initial_data.sql
-- Description: Non-destructive SQL seed script populating all 46 legacy business
--              records, master data, GRN stock receipts, transactions, follow-ups,
--              notifications, and id_mappings into Supabase PostgreSQL.
-- =============================================================================

-- CONSTANTS & UUID DEFINITIONS
-- Workspace UUID: 00000000-0000-4000-a000-000000000001

-- 1. WORKSPACES
INSERT INTO public.workspaces (id, company_name, owner_name, owner_email, owner_phone)
VALUES (
    '00000000-0000-4000-a000-000000000001',
    'Vistaar Business OS Demo Company',
    'Rajesh Kumar',
    'admin@vistaar.com',
    '9820011223'
) ON CONFLICT (id) DO NOTHING;

-- 2. BUSINESS SETTINGS
INSERT INTO public.business_settings (
    workspace_id, legal_name, business_type, owner_name, phone, email, address, city, state, pincode, currency
) VALUES (
    '00000000-0000-4000-a000-000000000001',
    'Vistaar Enterprises Pvt Ltd',
    'Retail & Wholesale Electronics',
    'Rajesh Kumar',
    '9820011223',
    'admin@vistaar.com',
    '123 Industrial Area, Phase II',
    'Mumbai',
    'Maharashtra',
    '400001',
    '₹'
) ON CONFLICT (workspace_id) DO NOTHING;

-- 3. CATEGORIES
INSERT INTO public.categories (id, workspace_id, name, description)
VALUES 
    ('11111111-1111-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'Electronics', 'Computer peripherals and electronic items'),
    ('11111111-1111-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'Hardware', 'Networking and hardware components')
ON CONFLICT (id) DO NOTHING;

-- 4. SUPPLIERS
INSERT INTO public.suppliers (id, workspace_id, name, contact_person, phone, email, address)
VALUES (
    '22222222-2222-4000-a000-000000000001',
    '00000000-0000-4000-a000-000000000001',
    'TechSource India Pvt Ltd',
    'Amit Shah',
    '9876543210',
    'sales@techsource.in',
    '45 Tech Park, Electronic City, Bengaluru'
) ON CONFLICT (id) DO NOTHING;

-- 5. CUSTOMERS
INSERT INTO public.customers (id, workspace_id, name, phone, whatsapp, email, address, city, state, pincode, customer_type, credit_limit)
VALUES 
    ('33333333-3333-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'Rajesh Enterprise', '9820011223', '9820011223', 'rajesh@enterprise.com', 'Market Road', 'Mumbai', 'Maharashtra', '400001', 'Wholesale', 50000),
    ('33333333-3333-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'Sharma Electronics', '9811122233', '9811122233', 'info@sharmaelec.com', 'Station Plaza', 'Delhi', 'Delhi', '110001', 'Retail', 20000),
    ('33333333-3333-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', 'Navdeep Maurya', '8176013733', '8176013733', 'mauryanavdeep80@gmail.com', 'Civil Lines', 'Lucknow', 'Uttar Pradesh', '226001', 'Retail', 15000)
ON CONFLICT (id) DO NOTHING;

-- 6. PRODUCTS
INSERT INTO public.products (id, workspace_id, category_id, supplier_id, name, sku, part_number, unit, buy_price, selling_price, minimum_stock, tax_percent, hsn_sac)
VALUES 
    ('44444444-4444-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', '11111111-1111-4000-a000-000000000001', '22222222-2222-4000-a000-000000000001', 'Wireless Ergonomic Mouse', 'WM-001', 'PN-WM-01', 'Pcs', 450.00, 799.00, 5, 18.0, '8471'),
    ('44444444-4444-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', '11111111-1111-4000-a000-000000000001', '22222222-2222-4000-a000-000000000001', 'Mechanical RGB Keyboard', 'KB-002', 'PN-KB-02', 'Pcs', 1800.00, 2999.00, 3, 18.0, '8471'),
    ('44444444-4444-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', '11111111-1111-4000-a000-000000000001', '22222222-2222-4000-a000-000000000001', '27 4K Monitor', 'MN-003', 'PN-MN-03', 'Pcs', 18500.00, 24999.00, 2, 18.0, '8528')
ON CONFLICT (id) DO NOTHING;

-- 7. INVENTORY SETTINGS
INSERT INTO public.inventory_settings (workspace_id, uses_part_number)
VALUES ('00000000-0000-4000-a000-000000000001', true)
ON CONFLICT (workspace_id) DO NOTHING;

-- 8. STOCK RECEIPTS (GRN Batches)
INSERT INTO public.stock_receipts (id, workspace_id, product_id, supplier_id, receipt_number, quantity_received, quantity_remaining, buy_price)
VALUES 
    ('55555555-5555-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', '44444444-4444-4000-a000-000000000001', '22222222-2222-4000-a000-000000000001', 'GRN-001', 50, 48, 450.00),
    ('55555555-5555-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', '44444444-4444-4000-a000-000000000002', '22222222-2222-4000-a000-000000000001', 'GRN-002', 20, 19, 1800.00),
    ('55555555-5555-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', '44444444-4444-4000-a000-000000000003', '22222222-2222-4000-a000-000000000001', 'GRN-003', 10, 10, 18500.00)
ON CONFLICT (id) DO NOTHING;

-- 9. COUNTER SALES & LINE ITEMS
INSERT INTO public.counter_sales (id, workspace_id, customer_id, sale_number, invoice_number, customer_name, phone_number, subtotal, discount_type, discount_value, discount_amount, final_total, status)
VALUES (
    '66666666-6666-4000-a000-000000000001',
    '00000000-0000-4000-a000-000000000001',
    '33333333-3333-4000-a000-000000000001',
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
    ('66666666-6666-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', '66666666-6666-4000-a000-000000000001', '44444444-4444-4000-a000-000000000001', '55555555-5555-4000-a000-000000000001', 'Wireless Ergonomic Mouse', 'PN-WM-01', 1, 799.00, 799.00, 450.00),
    ('66666666-6666-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', '66666666-6666-4000-a000-000000000001', '44444444-4444-4000-a000-000000000002', '55555555-5555-4000-a000-000000000002', 'Mechanical RGB Keyboard', 'PN-KB-02', 1, 2999.00, 2999.00, 1800.00)
ON CONFLICT (id) DO NOTHING;

-- 10. INVOICES & LINE ITEMS
INSERT INTO public.invoices (id, workspace_id, customer_id, invoice_number, customer_name, customer_phone, status, date, due_date, subtotal, discount_total, tax_total, grand_total, paid_amount, balance_amount)
VALUES (
    '77777777-7777-4000-a000-000000000001',
    '00000000-0000-4000-a000-000000000001',
    '33333333-3333-4000-a000-000000000001',
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
    ('77777777-7777-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', '77777777-7777-4000-a000-000000000001', '44444444-4444-4000-a000-000000000001', 'Wireless Ergonomic Mouse', 'WM-001', 'Pcs', 1, 450.00, 799.00, 18.0, 143.82, 942.82),
    ('77777777-7777-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', '77777777-7777-4000-a000-000000000001', '44444444-4444-4000-a000-000000000002', 'Mechanical RGB Keyboard', 'KB-002', 'Pcs', 1, 1800.00, 2999.00, 18.0, 539.82, 3538.82)
ON CONFLICT (id) DO NOTHING;

-- 11. PAYMENTS
INSERT INTO public.payments (id, workspace_id, customer_id, invoice_id, payment_number, customer_name, invoice_number, amount, method)
VALUES (
    '88888888-8888-4000-a000-000000000001',
    '00000000-0000-4000-a000-000000000001',
    '33333333-3333-4000-a000-000000000001',
    '77777777-7777-4000-a000-000000000001',
    'PAY-2026-0001',
    'Rajesh Enterprise',
    'INV-2026-0001',
    4481.64,
    'UPI'
) ON CONFLICT (id) DO NOTHING;

-- 12. UDHARI RECORDS & PAYMENTS
INSERT INTO public.udhari_records (id, workspace_id, customer_id, udhari_code, customer_name_snapshot, phone_snapshot, original_amount, total_received, outstanding_amount, due_date, status)
VALUES (
    '99999999-9999-4000-a000-000000000001',
    '00000000-0000-4000-a000-000000000001',
    '33333333-3333-4000-a000-000000000001',
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
    '00000000-0000-4000-a000-000000000001',
    '99999999-9999-4000-a000-000000000001',
    '33333333-3333-4000-a000-000000000001',
    'PAY-2026-0002',
    2000.00,
    'Cash',
    '9820011223'
) ON CONFLICT (id) DO NOTHING;

-- 13. EXPENSES
INSERT INTO public.expenses (id, workspace_id, category, expense_name, amount, paid_to)
VALUES 
    ('aaaaaaaa-aaaa-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'Rent', 'Office Rent August 2026', 15000.00, 'Commercial Property Owners'),
    ('aaaaaaaa-aaaa-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'Internet', 'High-Speed Broadband Bill', 1200.00, 'Airtel Broadband')
ON CONFLICT (id) DO NOTHING;

-- 14. FOLLOW-UPS (From store.json)
INSERT INTO public.follow_ups (id, workspace_id, customer_id, customer_name, customer_phone, title, due_date, due_time, priority, status, action_type, attempt_count, max_attempts)
VALUES 
    ('bbbbbbbb-bbbb-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', '33333333-3333-4000-a000-000000000003', 'Navdeep Maurya', '8176013733', 'Demo', '2026-08-23', '19:32', 'High', 'Completed', 'INTERNAL_REMINDER', 0, 3),
    ('bbbbbbbb-bbbb-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', '33333333-3333-4000-a000-000000000001', 'Rajesh Enterprise', '9820011223', 'Quotation', '2026-08-23', '19:31', 'High', 'Completed', 'INTERNAL_REMINDER', 0, 3)
ON CONFLICT (id) DO NOTHING;

-- 15. NOTIFICATIONS (From store.json)
INSERT INTO public.notifications (id, workspace_id, type, title, message, is_read, link_route)
VALUES 
    ('cccccccc-cccc-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'followup_due', 'Follow-up Due: Rajesh Enterprise', 'Call Rajesh regarding bulk order', false, 'follow-ups'),
    ('cccccccc-cccc-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'followup_due', 'Follow-up Due: Navdeep Maurya', 'Pre-filled message ready for WhatsApp', false, 'follow-ups')
ON CONFLICT (id) DO NOTHING;

-- 16. ID MAPPING TABLE (Cross-Reference Engine)
INSERT INTO public.id_mappings (workspace_id, entity_type, legacy_id, supabase_id)
VALUES 
    ('00000000-0000-4000-a000-000000000001', 'workspace', 'ws-default-vistaar', '00000000-0000-4000-a000-000000000001'),
    ('00000000-0000-4000-a000-000000000001', 'category', 'cat-1', '11111111-1111-4000-a000-000000000001'),
    ('00000000-0000-4000-a000-000000000001', 'category', 'cat-2', '11111111-1111-4000-a000-000000000002'),
    ('00000000-0000-4000-a000-000000000001', 'supplier', 'sup-1', '22222222-2222-4000-a000-000000000001'),
    ('00000000-0000-4000-a000-000000000001', 'customer', 'cust-1', '33333333-3333-4000-a000-000000000001'),
    ('00000000-0000-4000-a000-000000000001', 'customer', 'cust-2', '33333333-3333-4000-a000-000000000002'),
    ('00000000-0000-4000-a000-000000000001', 'customer', 'cust-1787493583207', '33333333-3333-4000-a000-000000000003'),
    ('00000000-0000-4000-a000-000000000001', 'product', 'prod-1', '44444444-4444-4000-a000-000000000001'),
    ('00000000-0000-4000-a000-000000000001', 'product', 'prod-2', '44444444-4444-4000-a000-000000000002'),
    ('00000000-0000-4000-a000-000000000001', 'product', 'prod-3', '44444444-4444-4000-a000-000000000003'),
    ('00000000-0000-4000-a000-000000000001', 'stock_receipt', 'rec-1', '55555555-5555-4000-a000-000000000001'),
    ('00000000-0000-4000-a000-000000000001', 'stock_receipt', 'rec-2', '55555555-5555-4000-a000-000000000002'),
    ('00000000-0000-4000-a000-000000000001', 'stock_receipt', 'rec-3', '55555555-5555-4000-a000-000000000003')
ON CONFLICT (workspace_id, entity_type, legacy_id) DO NOTHING;

-- =============================================================================
-- END OF SEED MIGRATION SCRIPT 003_seed_initial_data.sql
-- =============================================================================

-- ==============================================================================
-- VISTAAR FORENSIC DATA RECONCILIATION & DIAGNOSTIC QUERIES
-- Requirement 29: Compare Counter Sales, Invoice Sales, Accounting Entries,
-- Cashbook Entries, Payments, Stock Movements, Products current_stock, Stock Receipts.
-- ==============================================================================

-- 1. COUNTER SALES VS ACCOUNTING ENTRIES (DAYBOOK)
-- Find any completed counter sale that lacks an accounting entry
SELECT 
    cs.id AS counter_sale_id,
    cs.sale_number,
    cs.sale_date,
    cs.final_total,
    cs.status,
    ae.id AS accounting_entry_id
FROM public.counter_sales cs
LEFT JOIN public.accounting_entries ae
    ON ae.source_type = 'COUNTER_SALE'
    AND ae.source_id = cs.id
    AND ae.entry_type = 'SALE'
WHERE cs.status = 'COMPLETED'
  AND ae.id IS NULL;

-- 2. COUNTER SALES VS CASHBOOK ENTRIES
-- Find counter sales with received payments that lack cashbook entries
SELECT 
    cs.id AS counter_sale_id,
    cs.sale_number,
    cs.payment_method,
    cs.amount_received,
    ce.id AS cashbook_entry_id
FROM public.counter_sales cs
LEFT JOIN public.cashbook_entries ce
    ON ce.source_type = 'COUNTER_SALE'
    AND ce.source_id = cs.id
    AND ce.direction = 'IN'
WHERE cs.status = 'COMPLETED'
  AND COALESCE(cs.amount_received, 0) > 0
  AND COALESCE(cs.payment_method, 'Cash') NOT IN ('Credit', 'Credit / Udhari')
  AND ce.id IS NULL;

-- 3. INVOICE SALES VS ACCOUNTING ENTRIES (DAYBOOK)
-- Find issued/paid invoices that lack accounting entries
SELECT 
    i.id AS invoice_id,
    i.invoice_number,
    i.invoice_date,
    i.grand_total,
    i.status,
    ae.id AS accounting_entry_id
FROM public.invoices i
LEFT JOIN public.accounting_entries ae
    ON ae.source_type = 'INVOICE'
    AND ae.source_id = i.id
    AND ae.entry_type = 'SALE'
WHERE i.status IN ('Issued', 'Partially Paid', 'Paid')
  AND ae.id IS NULL;

-- 4. INVOICE PAYMENTS VS CASHBOOK ENTRIES
-- Find invoice payments that lack corresponding cashbook entries
SELECT 
    p.id AS payment_id,
    p.payment_number,
    p.amount,
    p.payment_method,
    p.status,
    ce.id AS cashbook_entry_id
FROM public.payments p
LEFT JOIN public.cashbook_entries ce
    ON ce.source_type = 'PAYMENT'
    AND ce.source_id = p.id
    AND ce.direction = 'IN'
WHERE p.status = 'Completed'
  AND COALESCE(p.amount, 0) > 0
  AND ce.id IS NULL;

-- 5. STOCK RECONCILIATION: PRODUCTS CURRENT_STOCK VS STOCK MOVEMENTS
-- Compare products.current_stock against net stock movements
WITH movement_summary AS (
    SELECT 
        product_id,
        COALESCE(SUM(
            CASE 
                WHEN movement_type IN ('IN', 'PURCHASE', 'RETURN_IN', 'ADJUSTMENT_ADD') THEN quantity
                WHEN movement_type IN ('OUT', 'SALE', 'RETURN_OUT', 'ADJUSTMENT_SUB') THEN -quantity
                ELSE 0
            END
        ), 0) AS net_movement
    FROM public.stock_movements
    GROUP BY product_id
)
SELECT 
    p.id AS product_id,
    p.name AS product_name,
    p.part_number,
    p.current_stock,
    COALESCE(ms.net_movement, 0) AS calculated_movement_stock,
    (p.current_stock - COALESCE(ms.net_movement, 0)) AS variance
FROM public.products p
LEFT JOIN movement_summary ms ON ms.product_id = p.id
WHERE (p.current_stock - COALESCE(ms.net_movement, 0)) <> 0;

-- 6. STOCK RECEIPTS FIFO INTEGRITY CHECK
-- Check if any stock_receipts have available_quantity < 0 or > quantity
SELECT 
    sr.id AS receipt_id,
    sr.product_id,
    p.name AS product_name,
    sr.quantity,
    sr.available_quantity,
    sr.status
FROM public.stock_receipts sr
JOIN public.products p ON p.id = sr.product_id
WHERE sr.available_quantity < 0 
   OR sr.available_quantity > sr.quantity;

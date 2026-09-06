-- ==============================================================================
-- Migration 030: Reconcile Hardik & Vaishali Invoices, Payments, Udharis, and Daybook
-- ==============================================================================

-- 1. Ensure invoice_id and counter_sale_id exist on udhari_records
ALTER TABLE IF EXISTS public.udhari_records
  ADD COLUMN IF NOT EXISTS invoice_id UUID,
  ADD COLUMN IF NOT EXISTS counter_sale_id UUID;

CREATE INDEX IF NOT EXISTS idx_udhari_records_invoice_id ON public.udhari_records(invoice_id);
CREATE INDEX IF NOT EXISTS idx_udhari_records_counter_sale_id ON public.udhari_records(counter_sale_id);

-- 2. Repair Daybook transactions with missing reference_number or 'Invoice #undefined'
UPDATE public.daybook_transactions
SET
  reference_number = 'INV-2026-0007',
  description = 'Invoice #INV-2026-0007',
  party_name = 'Hardik',
  updated_at = NOW()
WHERE id = '0537a73a-3d96-45f8-97a9-969a4371d5f9'
   OR (reference_id = 'c3e2abd9-5dbd-4fe7-a694-a42d776a5827' AND (description LIKE '%undefined%' OR reference_number IS NULL));

UPDATE public.daybook_transactions
SET
  reference_number = 'INV-2026-0006',
  description = 'Invoice #INV-2026-0006',
  party_name = 'Vaishali',
  updated_at = NOW()
WHERE id = 'fabafdbc-a957-4d74-b3f3-8b733fb83553'
   OR (reference_id = '91d8607f-d0a4-4c71-b762-e04080ab4acc' AND (description LIKE '%undefined%' OR reference_number IS NULL));

-- Generalized cleanup for any daybook transaction with #undefined where reference_id matches an invoice
UPDATE public.daybook_transactions dt
SET
  reference_number = i.invoice_number,
  description = 'Invoice #' || i.invoice_number,
  party_name = COALESCE(dt.party_name, i.customer_name),
  updated_at = NOW()
FROM public.invoices i
WHERE dt.reference_type = 'INVOICE'
  AND dt.reference_id = i.id::text
  AND (dt.reference_number IS NULL OR dt.description LIKE '%undefined%');

-- 3. Link existing udhari_records to their respective invoice IDs
UPDATE public.udhari_records u
SET
  invoice_id = 'c3e2abd9-5dbd-4fe7-a694-a42d776a5827',
  customer_name_snapshot = COALESCE(u.customer_name_snapshot, 'Hardik'),
  original_amount = 5900,
  total_received = 1900,
  outstanding_amount = 4000,
  status = 'PARTIALLY PAID',
  updated_at = NOW()
WHERE u.udhari_code = 'UD-INV-2026-0007'
   OR u.customer_name_snapshot ILIKE '%Hardik%';

UPDATE public.udhari_records u
SET
  invoice_id = '91d8607f-d0a4-4c71-b762-e04080ab4acc',
  customer_name_snapshot = COALESCE(u.customer_name_snapshot, 'Vaishali'),
  original_amount = 2950,
  total_received = 1400,
  outstanding_amount = 1550,
  status = 'PARTIALLY PAID',
  updated_at = NOW()
WHERE u.udhari_code = 'UD-INV-2026-0006'
   OR u.customer_name_snapshot ILIKE '%Vaishali%';

-- 4. Reconcile all invoices and udharis to match actual payments
UPDATE public.invoices i
SET
  paid_amount = 1900,
  balance_amount = 4000,
  status = 'Partially Paid',
  updated_at = NOW()
WHERE i.invoice_number = 'INV-2026-0007';

UPDATE public.invoices i
SET
  paid_amount = 1400,
  balance_amount = 1550,
  status = 'Partially Paid',
  updated_at = NOW()
WHERE i.invoice_number = 'INV-2026-0006';

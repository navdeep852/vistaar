-- ============================================================================
-- VISTAAR MIGRATION 016: Purchase Order Module Schema & RLS Security Policies
-- ============================================================================

-- 1. PURCHASE ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  po_number TEXT NOT NULL,
  po_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  reference_number TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  payment_terms TEXT,
  delivery_location_id UUID,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  terms_conditions TEXT,
  internal_notes TEXT,
  created_by UUID,
  sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_workspace_po_number UNIQUE (workspace_id, po_number)
);

-- 2. PURCHASE ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  description TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'Pcs',
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_type TEXT DEFAULT 'FIXED',
  discount_value NUMERIC(14,2) DEFAULT 0,
  discount_amount NUMERIC(14,2) DEFAULT 0,
  tax_rate NUMERIC(8,3) DEFAULT 0,
  tax_amount NUMERIC(14,2) DEFAULT 0,
  cgst_amount NUMERIC(14,2) DEFAULT 0,
  sgst_amount NUMERIC(14,2) DEFAULT 0,
  igst_amount NUMERIC(14,2) DEFAULT 0,
  line_subtotal NUMERIC(14,2) DEFAULT 0,
  line_total NUMERIC(14,2) DEFAULT 0,
  received_quantity NUMERIC(14,3) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PURCHASE ORDER STATUS HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.purchase_order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. PURCHASE ORDER RECEIPTS TABLE (GRN)
CREATE TABLE IF NOT EXISTS public.purchase_order_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_workspace_receipt_number UNIQUE (workspace_id, receipt_number)
);

-- 5. PURCHASE ORDER RECEIPT ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.purchase_order_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.purchase_order_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id UUID NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  ordered_quantity NUMERIC(14,3) NOT NULL,
  previously_received_quantity NUMERIC(14,3) NOT NULL,
  received_quantity NUMERIC(14,3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_purchase_orders_workspace_id ON public.purchase_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON public.purchase_orders(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_date ON public.purchase_orders(workspace_id, po_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON public.purchase_orders(workspace_id, supplier_id);

CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON public.purchase_order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_po_status_history_po_id ON public.purchase_order_status_history(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_po_receipts_workspace_id ON public.purchase_order_receipts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_po_receipts_po_id ON public.purchase_order_receipts(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_po_receipt_items_receipt_id ON public.purchase_order_receipt_items(receipt_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_receipt_items ENABLE ROW LEVEL SECURITY;

-- 1. purchase_orders RLS
CREATE POLICY "Tenant Isolation for Purchase Orders"
ON public.purchase_orders FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- 2. purchase_order_items RLS
CREATE POLICY "Tenant Isolation for Purchase Order Items"
ON public.purchase_order_items FOR ALL
USING (
  purchase_order_id IN (
    SELECT id FROM public.purchase_orders WHERE workspace_id IN (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  purchase_order_id IN (
    SELECT id FROM public.purchase_orders WHERE workspace_id IN (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  )
);

-- 3. purchase_order_status_history RLS
CREATE POLICY "Tenant Isolation for Purchase Order Status History"
ON public.purchase_order_status_history FOR ALL
USING (
  purchase_order_id IN (
    SELECT id FROM public.purchase_orders WHERE workspace_id IN (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  purchase_order_id IN (
    SELECT id FROM public.purchase_orders WHERE workspace_id IN (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  )
);

-- 4. purchase_order_receipts RLS
CREATE POLICY "Tenant Isolation for Purchase Order Receipts"
ON public.purchase_order_receipts FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- 5. purchase_order_receipt_items RLS
CREATE POLICY "Tenant Isolation for Purchase Order Receipt Items"
ON public.purchase_order_receipt_items FOR ALL
USING (
  receipt_id IN (
    SELECT id FROM public.purchase_order_receipts WHERE workspace_id IN (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  receipt_id IN (
    SELECT id FROM public.purchase_order_receipts WHERE workspace_id IN (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  )
);

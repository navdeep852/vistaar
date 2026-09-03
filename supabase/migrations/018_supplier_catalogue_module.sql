-- ============================================================================
-- VISTAAR MIGRATION 018: Supplier Catalogue / Stock List Import Module Schema & RLS
-- ============================================================================

-- 1. SUPPLIER CATALOGUE FILES TABLE
CREATE TABLE IF NOT EXISTS public.supplier_catalogue_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT,
  import_status TEXT NOT NULL DEFAULT 'UPLOADED',
  total_rows INTEGER DEFAULT 0,
  successful_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_import_status CHECK (import_status IN ('UPLOADED', 'PROCESSING', 'PREVIEW_READY', 'IMPORTED', 'PARTIALLY_IMPORTED', 'FAILED'))
);

-- 2. SUPPLIER CATALOGUE MAPPINGS TABLE (Remembered per-supplier column mappings)
CREATE TABLE IF NOT EXISTS public.supplier_catalogue_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  mapping_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_workspace_supplier_mapping UNIQUE (workspace_id, supplier_id)
);

-- 3. SUPPLIER CATALOGUE ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.supplier_catalogue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  catalogue_file_id UUID REFERENCES public.supplier_catalogue_files(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  supplier_product_code TEXT,
  part_number TEXT,
  product_name TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  category TEXT,
  purchase_price NUMERIC(14,2),
  currency TEXT DEFAULT 'INR',
  uom TEXT DEFAULT 'Pcs',
  gst_rate NUMERIC(8,3) DEFAULT 18.000,
  hsn_sac TEXT,
  mrp NUMERIC(14,2),
  minimum_order_quantity NUMERIC(14,3) DEFAULT 1,
  pack_size TEXT,
  barcode TEXT,
  lead_time_days INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. SUPPLIER CATALOGUE PRICE HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.supplier_catalogue_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  supplier_catalogue_item_id UUID NOT NULL REFERENCES public.supplier_catalogue_items(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_price NUMERIC(14,2) NOT NULL,
  effective_date DATE DEFAULT CURRENT_DATE,
  source_file_id UUID REFERENCES public.supplier_catalogue_files(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. ALTER PURCHASE ORDER ITEMS TABLE TO STORE CATALOGUE ITEM REFERENCE
ALTER TABLE public.purchase_order_items 
ADD COLUMN IF NOT EXISTS supplier_catalogue_item_id UUID REFERENCES public.supplier_catalogue_items(id) ON DELETE SET NULL;

-- 6. INDEXES FOR HIGH-PERFORMANCE SEARCH
CREATE INDEX IF NOT EXISTS idx_cat_files_ws ON public.supplier_catalogue_files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cat_files_sup ON public.supplier_catalogue_files(supplier_id);

CREATE INDEX IF NOT EXISTS idx_cat_items_ws ON public.supplier_catalogue_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cat_items_sup ON public.supplier_catalogue_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_cat_items_prod ON public.supplier_catalogue_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cat_items_name ON public.supplier_catalogue_items(product_name);
CREATE INDEX IF NOT EXISTS idx_cat_items_part ON public.supplier_catalogue_items(part_number);
CREATE INDEX IF NOT EXISTS idx_cat_items_code ON public.supplier_catalogue_items(supplier_product_code);

CREATE INDEX IF NOT EXISTS idx_cat_price_hist_item ON public.supplier_catalogue_price_history(supplier_catalogue_item_id);

-- 7. ENABLE RLS POLICIES FOR TENANT ISOLATION
ALTER TABLE public.supplier_catalogue_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_catalogue_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_catalogue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_catalogue_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_supplier_catalogue_files_policy ON public.supplier_catalogue_files;
CREATE POLICY tenant_supplier_catalogue_files_policy ON public.supplier_catalogue_files
  USING (workspace_id = auth.uid() OR workspace_id IN (
    SELECT company_id FROM public.users WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS tenant_supplier_catalogue_mappings_policy ON public.supplier_catalogue_mappings;
CREATE POLICY tenant_supplier_catalogue_mappings_policy ON public.supplier_catalogue_mappings
  USING (workspace_id = auth.uid() OR workspace_id IN (
    SELECT company_id FROM public.users WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS tenant_supplier_catalogue_items_policy ON public.supplier_catalogue_items;
CREATE POLICY tenant_supplier_catalogue_items_policy ON public.supplier_catalogue_items
  USING (workspace_id = auth.uid() OR workspace_id IN (
    SELECT company_id FROM public.users WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS tenant_supplier_catalogue_price_history_policy ON public.supplier_catalogue_price_history;
CREATE POLICY tenant_supplier_catalogue_price_history_policy ON public.supplier_catalogue_price_history
  USING (workspace_id = auth.uid() OR workspace_id IN (
    SELECT company_id FROM public.users WHERE id = auth.uid()
  ));

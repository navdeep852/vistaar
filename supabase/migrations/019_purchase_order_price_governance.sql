-- Migration 019: Purchase Order Price Governance and Supplier Rate Control

-- 1. Extend purchase_order_items to store catalogue unit rate snapshot and price override audit flags
ALTER TABLE public.purchase_order_items
ADD COLUMN IF NOT EXISTS catalogue_unit_price NUMERIC(15, 2),
ADD COLUMN IF NOT EXISTS is_price_overridden BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS override_reason TEXT,
ADD COLUMN IF NOT EXISTS override_requested_by UUID,
ADD COLUMN IF NOT EXISTS override_approved_by UUID,
ADD COLUMN IF NOT EXISTS override_status VARCHAR(30) DEFAULT 'NONE';

-- 2. Create Audit Log Table for Purchase Order Price Overrides
CREATE TABLE IF NOT EXISTS public.purchase_order_price_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    purchase_order_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
    supplier_catalogue_item_id UUID REFERENCES public.supplier_catalogue_items(id) ON DELETE SET NULL,
    item_name VARCHAR(255) NOT NULL,
    original_rate NUMERIC(15, 2) NOT NULL,
    requested_rate NUMERIC(15, 2) NOT NULL,
    approved_rate NUMERIC(15, 2),
    reason TEXT NOT NULL,
    requested_by UUID,
    approved_by UUID,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for tenant performance
CREATE INDEX IF NOT EXISTS idx_po_price_overrides_workspace ON public.purchase_order_price_overrides(workspace_id);
CREATE INDEX IF NOT EXISTS idx_po_price_overrides_po ON public.purchase_order_price_overrides(purchase_order_id);

-- 3. Enable RLS and create isolation policies
ALTER TABLE public.purchase_order_price_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view price overrides for their workspace" ON public.purchase_order_price_overrides;
CREATE POLICY "Users can view price overrides for their workspace" ON public.purchase_order_price_overrides
    FOR SELECT USING (workspace_id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert price overrides for their workspace" ON public.purchase_order_price_overrides;
CREATE POLICY "Users can insert price overrides for their workspace" ON public.purchase_order_price_overrides
    FOR INSERT WITH CHECK (workspace_id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update price overrides for their workspace" ON public.purchase_order_price_overrides;
CREATE POLICY "Users can update price overrides for their workspace" ON public.purchase_order_price_overrides
    FOR UPDATE USING (workspace_id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid()));

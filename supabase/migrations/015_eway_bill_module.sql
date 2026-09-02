-- =============================================================================
-- VISTAAR BUSINESS OS — E-WAY BILL COMPLIANCE MODULE
-- Migration File: supabase/migrations/015_eway_bill_module.sql
-- Description: Establishes E-Way Bill schema including transporters, vehicles,
--              business dispatch locations, eway_bills, eway_bill_items,
--              and eway_bill_events for full multi-tenant GST compliance.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. TRANSPORTERS MASTER TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transporters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    gstin_transporter_id VARCHAR(50) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    state VARCHAR(100),
    pincode VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. VEHICLES MASTER TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    vehicle_number VARCHAR(50) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL DEFAULT 'REGULAR', -- 'REGULAR', 'OVER_DIMENSIONAL_CARGO'
    transporter_id UUID REFERENCES public.transporters(id) ON DELETE SET NULL,
    owner_name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. BUSINESS DISPATCH LOCATIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    location_type VARCHAR(50) NOT NULL DEFAULT 'WAREHOUSE', -- 'REGISTERED', 'BRANCH', 'WAREHOUSE', 'GODOWN', 'FACTORY', 'OTHER'
    location_name VARCHAR(255) NOT NULL,
    gstin VARCHAR(15),
    trade_name VARCHAR(255),
    address TEXT NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. E-WAY BILLS MAIN COMPLIANCE TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eway_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,

    eway_bill_number VARCHAR(50),
    document_type VARCHAR(50) NOT NULL DEFAULT 'INV', -- 'INV', 'BIL', 'BOE', 'OTH'
    document_number VARCHAR(100) NOT NULL,
    document_date DATE NOT NULL DEFAULT CURRENT_DATE,

    supply_type VARCHAR(20) NOT NULL DEFAULT 'OUTWARD', -- 'OUTWARD', 'INWARD'
    sub_supply_type VARCHAR(50) NOT NULL DEFAULT 'SUPPLY', -- 'SUPPLY', 'IMPORT', 'EXPORT', 'JOB_WORK', 'FOR_OWN_USE', 'OTHERS'
    transaction_type VARCHAR(50) NOT NULL DEFAULT 'REGULAR', -- 'REGULAR', 'BILL_TO_SHIP_TO', 'BILL_FROM_DISPATCH_FROM', 'BOTH'

    -- Origin / Dispatch From
    from_gstin VARCHAR(15),
    from_trade_name VARCHAR(255) NOT NULL,
    from_address TEXT NOT NULL,
    from_place VARCHAR(100),
    from_state VARCHAR(100) NOT NULL,
    from_pincode VARCHAR(20) NOT NULL,

    -- Destination / Bill To & Ship To
    to_gstin VARCHAR(15),
    to_trade_name VARCHAR(255) NOT NULL,
    to_address TEXT NOT NULL,
    to_place VARCHAR(100),
    to_state VARCHAR(100) NOT NULL,
    to_pincode VARCHAR(20) NOT NULL,
    bill_to_gstin VARCHAR(15),
    ship_to_gstin VARCHAR(15),

    -- Financial / GST Breakdown
    total_taxable_value NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    cgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    igst_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    cess_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_invoice_value NUMERIC(14,2) NOT NULL DEFAULT 0.00,

    -- Transportation & Vehicle Details
    transport_mode VARCHAR(20) NOT NULL DEFAULT 'ROAD', -- 'ROAD', 'RAIL', 'AIR', 'SHIP'
    transporter_id UUID REFERENCES public.transporters(id) ON DELETE SET NULL,
    transporter_name VARCHAR(255),
    transporter_gstin VARCHAR(50),
    vehicle_number VARCHAR(50),
    vehicle_type VARCHAR(50) DEFAULT 'REGULAR', -- 'REGULAR', 'OVER_DIMENSIONAL_CARGO'
    transport_document_number VARCHAR(100),
    transport_document_date DATE,
    approx_distance_km NUMERIC(10,2) NOT NULL DEFAULT 0.00,

    -- Official Lifecycle & Government Timestamps
    generated_at TIMESTAMPTZ,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'READY', 'GENERATION_PENDING', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED', 'GENERATION_FAILED'

    cancelled_at TIMESTAMPTZ,
    cancellation_reason VARCHAR(255),
    cancellation_remarks TEXT,

    government_reference VARCHAR(255),
    last_api_status VARCHAR(50),
    last_api_error_code VARCHAR(100),
    last_api_error_message TEXT,

    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5. E-WAY BILL ITEMS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eway_bill_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    eway_bill_id UUID NOT NULL REFERENCES public.eway_bills(id) ON DELETE CASCADE,
    invoice_item_id UUID,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,

    product_name VARCHAR(255) NOT NULL,
    hsn_code VARCHAR(20) NOT NULL,
    quantity NUMERIC(12,3) NOT NULL DEFAULT 1.000,
    unit VARCHAR(50) NOT NULL DEFAULT 'Pcs',

    taxable_value NUMERIC(14,2) NOT NULL DEFAULT 0.00,

    cgst_rate NUMERIC(6,2) DEFAULT 0.00,
    cgst_amount NUMERIC(14,2) DEFAULT 0.00,

    sgst_rate NUMERIC(6,2) DEFAULT 0.00,
    sgst_amount NUMERIC(14,2) DEFAULT 0.00,

    igst_rate NUMERIC(6,2) DEFAULT 0.00,
    igst_amount NUMERIC(14,2) DEFAULT 0.00,

    cess_rate NUMERIC(6,2) DEFAULT 0.00,
    cess_amount NUMERIC(14,2) DEFAULT 0.00,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 6. E-WAY BILL EVENTS & AUDIT LOG TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eway_bill_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    eway_bill_id UUID NOT NULL REFERENCES public.eway_bills(id) ON DELETE CASCADE,

    event_type VARCHAR(50) NOT NULL, -- 'CREATED', 'VALIDATED', 'GENERATION_REQUESTED', 'GENERATED', 'GENERATION_FAILED', 'VEHICLE_UPDATED', 'VALIDITY_EXTENDED', 'CANCEL_REQUESTED', 'CANCELLED', 'EXPIRED'
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    performed_by VARCHAR(255),
    event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    remarks TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- -----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.transporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eway_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eway_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eway_bill_events ENABLE ROW LEVEL SECURITY;

-- Transporters Policies
DROP POLICY IF EXISTS "Workspace isolation for transporters" ON public.transporters;
CREATE POLICY "Workspace isolation for transporters" ON public.transporters
    FOR ALL USING (workspace_id = public.current_user_workspace_id())
    WITH CHECK (workspace_id = public.current_user_workspace_id());

-- Vehicles Policies
DROP POLICY IF EXISTS "Workspace isolation for vehicles" ON public.vehicles;
CREATE POLICY "Workspace isolation for vehicles" ON public.vehicles
    FOR ALL USING (workspace_id = public.current_user_workspace_id())
    WITH CHECK (workspace_id = public.current_user_workspace_id());

-- Business Locations Policies
DROP POLICY IF EXISTS "Workspace isolation for business_locations" ON public.business_locations;
CREATE POLICY "Workspace isolation for business_locations" ON public.business_locations
    FOR ALL USING (workspace_id = public.current_user_workspace_id())
    WITH CHECK (workspace_id = public.current_user_workspace_id());

-- E-Way Bills Policies
DROP POLICY IF EXISTS "Workspace isolation for eway_bills" ON public.eway_bills;
CREATE POLICY "Workspace isolation for eway_bills" ON public.eway_bills
    FOR ALL USING (workspace_id = public.current_user_workspace_id())
    WITH CHECK (workspace_id = public.current_user_workspace_id());

-- E-Way Bill Items Policies
DROP POLICY IF EXISTS "Workspace isolation for eway_bill_items" ON public.eway_bill_items;
CREATE POLICY "Workspace isolation for eway_bill_items" ON public.eway_bill_items
    FOR ALL USING (workspace_id = public.current_user_workspace_id())
    WITH CHECK (workspace_id = public.current_user_workspace_id());

-- E-Way Bill Events Policies
DROP POLICY IF EXISTS "Workspace isolation for eway_bill_events" ON public.eway_bill_events;
CREATE POLICY "Workspace isolation for eway_bill_events" ON public.eway_bill_events
    FOR ALL USING (workspace_id = public.current_user_workspace_id())
    WITH CHECK (workspace_id = public.current_user_workspace_id());

-- -----------------------------------------------------------------------------
-- 8. INDEXES FOR HIGH PERFORMANCE QUERIES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_eway_bills_workspace ON public.eway_bills(workspace_id);
CREATE INDEX IF NOT EXISTS idx_eway_bills_invoice ON public.eway_bills(invoice_id);
CREATE INDEX IF NOT EXISTS idx_eway_bills_number ON public.eway_bills(eway_bill_number);
CREATE INDEX IF NOT EXISTS idx_eway_bills_status ON public.eway_bills(status);
CREATE INDEX IF NOT EXISTS idx_eway_bills_vehicle ON public.eway_bills(vehicle_number);
CREATE INDEX IF NOT EXISTS idx_eway_bills_valid_until ON public.eway_bills(valid_until);

CREATE INDEX IF NOT EXISTS idx_eway_bill_items_ewb ON public.eway_bill_items(eway_bill_id);
CREATE INDEX IF NOT EXISTS idx_eway_bill_events_ewb ON public.eway_bill_events(eway_bill_id);

CREATE INDEX IF NOT EXISTS idx_transporters_workspace ON public.transporters(workspace_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_workspace ON public.vehicles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_business_locations_workspace ON public.business_locations(workspace_id);

COMMIT;

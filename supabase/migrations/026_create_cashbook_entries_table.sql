-- VISTAAR BUSINESS OS — AUTHORITATIVE CASHBOOK ENTRIES TABLE
-- Migration File: supabase/migrations/026_create_cashbook_entries_table.sql
-- Description: Establishes a dedicated, authoritative ledger for physical and digital cash movements
--              with strict idempotency, tenant isolation, and multi-account mapping.

-- 1. Create Cashbook Entries Table
CREATE TABLE IF NOT EXISTS public.cashbook_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_number VARCHAR(100) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('IN', 'OUT', 'NON_CASH')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    account_name VARCHAR(100) NOT NULL DEFAULT 'Cash Account',
    source_type VARCHAR(50) NOT NULL, -- 'INVOICE_PAYMENT', 'COUNTER_SALE', 'EXPENSE', 'TRANSFER', 'MANUAL'
    source_id VARCHAR(255),            -- Originating transaction ID (e.g. payment_id, counter_sale_id)
    reference_number VARCHAR(100),     -- Invoice #, Payment #, UTR, Cheque #
    party_name VARCHAR(255),
    description TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for High-Performance Querying & Tenant Filtering
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_workspace ON public.cashbook_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_date ON public.cashbook_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_method ON public.cashbook_entries(payment_method);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_source ON public.cashbook_entries(source_type, source_id);

-- 3. Idempotency Unique Index
-- Ensures a given source transaction cannot generate duplicate cashbook entries in the same direction
CREATE UNIQUE INDEX IF NOT EXISTS idx_cashbook_entries_unique_source 
    ON public.cashbook_entries(workspace_id, source_type, source_id, direction) 
    WHERE source_id IS NOT NULL;

-- 4. Row Level Security (RLS) & Multi-Tenant Isolation
ALTER TABLE public.cashbook_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace isolation SELECT for cashbook_entries" ON public.cashbook_entries;
DROP POLICY IF EXISTS "Workspace isolation INSERT for cashbook_entries" ON public.cashbook_entries;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for cashbook_entries" ON public.cashbook_entries;
DROP POLICY IF EXISTS "Workspace isolation DELETE for cashbook_entries" ON public.cashbook_entries;

CREATE POLICY "Workspace isolation SELECT for cashbook_entries" ON public.cashbook_entries
    FOR SELECT USING (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation INSERT for cashbook_entries" ON public.cashbook_entries
    FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation UPDATE for cashbook_entries" ON public.cashbook_entries
    FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
               WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation DELETE for cashbook_entries" ON public.cashbook_entries
    FOR DELETE USING (workspace_id = public.current_user_workspace_id());

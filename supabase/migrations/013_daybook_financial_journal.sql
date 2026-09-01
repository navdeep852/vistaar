-- =============================================================================
-- VISTAAR BUSINESS OS — CENTRALIZED DAYBOOK FINANCIAL JOURNAL
-- Migration File: supabase/migrations/013_daybook_financial_journal.sql
-- Description: Establishes public.daybook_transactions for single-source
--              chronological financial journaling, strict database idempotency,
--              multi-tenant RLS isolation, and future Cashbook readiness.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CUSTOM ENUMS FOR DAYBOOK
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.daybook_transaction_type AS ENUM (
        'SALE',
        'CUSTOMER_PAYMENT',
        'SUPPLIER_PAYMENT',
        'EXPENSE',
        'REFUND',
        'OTHER_INCOME',
        'OTHER_PAYMENT',
        'ADJUSTMENT',
        'TRANSFER'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.daybook_direction AS ENUM (
        'IN',
        'OUT',
        'NON_CASH'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- -----------------------------------------------------------------------------
-- 2. DAYBOOK TRANSACTIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daybook_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    transaction_code VARCHAR(100) NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    transaction_time TIME DEFAULT CURRENT_TIME,
    transaction_type public.daybook_transaction_type NOT NULL,
    direction public.daybook_direction NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    payment_mode public.payment_method DEFAULT 'Cash',
    financial_account_id UUID, -- Reserved for future Cashbook / Bank account mapping
    party_type VARCHAR(50), -- 'customer', 'supplier', 'other'
    party_id UUID,
    party_name VARCHAR(255),
    reference_type VARCHAR(50) NOT NULL, -- 'COUNTER_SALE', 'PAYMENT', 'EXPENSE', 'UDHARI_PAYMENT', 'INVOICE', 'MANUAL'
    reference_id VARCHAR(255), -- ID of source transaction record
    reference_number VARCHAR(100), -- Invoice #, Payment #, Receipt #, Expense Ref
    description TEXT,
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED', -- 'COMPLETED', 'VOID', 'REVERSED'
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_daybook_code UNIQUE (workspace_id, transaction_code),
    CONSTRAINT unique_workspace_daybook_reference UNIQUE (workspace_id, reference_type, reference_id)
);

CREATE TRIGGER set_daybook_transactions_updated_at
    BEFORE UPDATE ON public.daybook_transactions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 3. INDEXES FOR FAST CHRONOLOGICAL & WORKSPACE QUERYING
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_daybook_transactions_workspace ON public.daybook_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_daybook_transactions_date ON public.daybook_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_daybook_transactions_type ON public.daybook_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_daybook_transactions_party ON public.daybook_transactions(party_id);
CREATE INDEX IF NOT EXISTS idx_daybook_transactions_ref ON public.daybook_transactions(reference_type, reference_id);

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.daybook_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace isolation SELECT for daybook_transactions" ON public.daybook_transactions;
DROP POLICY IF EXISTS "Workspace isolation INSERT for daybook_transactions" ON public.daybook_transactions;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for daybook_transactions" ON public.daybook_transactions;
DROP POLICY IF EXISTS "Workspace isolation DELETE for daybook_transactions" ON public.daybook_transactions;

CREATE POLICY "Workspace isolation SELECT for daybook_transactions" ON public.daybook_transactions
    FOR SELECT USING (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation INSERT for daybook_transactions" ON public.daybook_transactions
    FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation UPDATE for daybook_transactions" ON public.daybook_transactions
    FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
               WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation DELETE for daybook_transactions" ON public.daybook_transactions
    FOR DELETE USING (workspace_id = public.current_user_workspace_id());

COMMIT;

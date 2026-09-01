-- =============================================================================
-- VISTAAR BUSINESS OS — CASHBOOK FINANCIAL ACCOUNTS & GST EXTENSIONS
-- Migration File: supabase/migrations/014_cashbook_financial_accounts.sql
-- Description: Creates public.financial_accounts for multi-account liquidity management,
--              establishes inter-account transfer support, preserves Indian GST metadata,
--              and sets multi-tenant RLS isolation.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. FINANCIAL ACCOUNTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    account_type VARCHAR(50) NOT NULL DEFAULT 'CASH', -- 'CASH', 'BANK', 'UPI', 'CARD', 'OTHER'
    account_number VARCHAR(100),
    ifsc_code VARCHAR(20),
    opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    opening_balance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_account_name UNIQUE (workspace_id, name)
);

CREATE TRIGGER set_financial_accounts_updated_at
    BEFORE UPDATE ON public.financial_accounts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) POLICIES FOR FINANCIAL ACCOUNTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace isolation SELECT for financial_accounts" ON public.financial_accounts;
DROP POLICY IF EXISTS "Workspace isolation INSERT for financial_accounts" ON public.financial_accounts;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for financial_accounts" ON public.financial_accounts;
DROP POLICY IF EXISTS "Workspace isolation DELETE for financial_accounts" ON public.financial_accounts;

CREATE POLICY "Workspace isolation SELECT for financial_accounts" ON public.financial_accounts
    FOR SELECT USING (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation INSERT for financial_accounts" ON public.financial_accounts
    FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation UPDATE for financial_accounts" ON public.financial_accounts
    FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
               WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation DELETE for financial_accounts" ON public.financial_accounts
    FOR DELETE USING (workspace_id = public.current_user_workspace_id());

-- -----------------------------------------------------------------------------
-- 3. EXTEND DAYBOOK TRANSACTIONS FOR CASHBOOK & GST METADATA
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
    -- Transfer Target Account ID for Account-to-Account Transfers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'transfer_target_account_id') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN transfer_target_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL;
    END IF;

    -- GST & Indian Tax Metadata Preservation Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'gst_applicable') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN gst_applicable BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'gst_registration_status') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN gst_registration_status VARCHAR(50);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'gstin') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN gstin VARCHAR(15);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'place_of_supply') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN place_of_supply VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'taxable_amount') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN taxable_amount NUMERIC(12,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'cgst_amount') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN cgst_amount NUMERIC(12,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'sgst_amount') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN sgst_amount NUMERIC(12,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'igst_amount') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN igst_amount NUMERIC(12,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'utgst_amount') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN utgst_amount NUMERIC(12,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'cess_amount') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN cess_amount NUMERIC(12,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'total_tax_amount') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN total_tax_amount NUMERIC(12,2) DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'hsn_sac_code') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN hsn_sac_code VARCHAR(50);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'is_reverse_charge') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN is_reverse_charge BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'tax_category') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN tax_category VARCHAR(50) DEFAULT 'TAXABLE';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daybook_transactions' AND column_name = 'tds_tcs_amount') THEN
        ALTER TABLE public.daybook_transactions ADD COLUMN tds_tcs_amount NUMERIC(12,2) DEFAULT 0.00;
    END IF;
END $$;

-- Foreign Key Constraint Linking Daybook Transactions to Financial Accounts
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_daybook_financial_account') THEN
        ALTER TABLE public.daybook_transactions ADD CONSTRAINT fk_daybook_financial_account FOREIGN KEY (financial_account_id) REFERENCES public.financial_accounts(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Indexes for Fast Account-Wise & Transfer Queries
CREATE INDEX IF NOT EXISTS idx_daybook_financial_account ON public.daybook_transactions(financial_account_id);
CREATE INDEX IF NOT EXISTS idx_daybook_transfer_target ON public.daybook_transactions(transfer_target_account_id);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_workspace ON public.financial_accounts(workspace_id);

COMMIT;

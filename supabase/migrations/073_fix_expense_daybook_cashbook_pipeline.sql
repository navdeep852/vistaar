-- =============================================================================
-- Migration 073: Fix Expense -> Daybook -> Cashbook -> Dashboard Outflow Pipeline
-- Guarantees:
-- 1. Adds missing schema columns (branch_id, total_amount, remaining_amount, payment_status, payment_mode)
-- 2. Ensures public.cashbook_entries exists with multi-tenant RLS
-- 3. Provides atomic RPCs for record_expense_atomic, delete_expense_atomic, and reconcile_expenses_daybook
-- =============================================================================

-- 1. ADD MISSING COLUMNS TO public.daybook_transactions
ALTER TABLE public.daybook_transactions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.daybook_transactions ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);
ALTER TABLE public.daybook_transactions ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(12,2);
ALTER TABLE public.daybook_transactions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_daybook_transactions_branch ON public.daybook_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_daybook_transactions_direction ON public.daybook_transactions(direction);
CREATE INDEX IF NOT EXISTS idx_daybook_transactions_status ON public.daybook_transactions(status);

-- 2. ADD MISSING COLUMNS TO public.expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PAID';

CREATE INDEX IF NOT EXISTS idx_expenses_branch ON public.expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_workspace_date ON public.expenses(workspace_id, expense_date);

-- 3. ENSURE public.cashbook_entries EXISTS
CREATE TABLE IF NOT EXISTS public.cashbook_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_number VARCHAR(100) NOT NULL,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('IN', 'OUT', 'TRANSFER', 'NON_CASH')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    account_name VARCHAR(100) DEFAULT 'Cash Account',
    source_type VARCHAR(50) NOT NULL,
    source_id VARCHAR(255),
    reference_number VARCHAR(100),
    party_name VARCHAR(255),
    description TEXT,
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deduplication index for cashbook entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_cashbook_source
    ON public.cashbook_entries(workspace_id, source_type, source_id, direction)
    WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cashbook_entries_workspace ON public.cashbook_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_branch ON public.cashbook_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_date ON public.cashbook_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_cashbook_entries_direction ON public.cashbook_entries(direction);

-- Enable RLS on cashbook_entries
ALTER TABLE public.cashbook_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cashbook_entries_workspace_select" ON public.cashbook_entries;
CREATE POLICY "cashbook_entries_workspace_select" ON public.cashbook_entries
    FOR SELECT USING (
        workspace_id IN (
            SELECT workspace_id FROM public.memberships WHERE user_id = auth.uid()
        )
        OR workspace_id = auth.uid()
    );

DROP POLICY IF EXISTS "cashbook_entries_workspace_insert" ON public.cashbook_entries;
CREATE POLICY "cashbook_entries_workspace_insert" ON public.cashbook_entries
    FOR INSERT WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM public.memberships WHERE user_id = auth.uid()
        )
        OR workspace_id = auth.uid()
    );

DROP POLICY IF EXISTS "cashbook_entries_workspace_update" ON public.cashbook_entries;
CREATE POLICY "cashbook_entries_workspace_update" ON public.cashbook_entries
    FOR UPDATE USING (
        workspace_id IN (
            SELECT workspace_id FROM public.memberships WHERE user_id = auth.uid()
        )
        OR workspace_id = auth.uid()
    );

DROP POLICY IF EXISTS "cashbook_entries_workspace_delete" ON public.cashbook_entries;
CREATE POLICY "cashbook_entries_workspace_delete" ON public.cashbook_entries
    FOR DELETE USING (
        workspace_id IN (
            SELECT workspace_id FROM public.memberships WHERE user_id = auth.uid()
        )
        OR workspace_id = auth.uid()
    );

-- 4. ATOMIC EXPENSE RECORDING RPC: record_expense_atomic
CREATE OR REPLACE FUNCTION public.record_expense_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_branch_id UUID;
    v_expense_id UUID;
    v_category VARCHAR(100);
    v_expense_name VARCHAR(255);
    v_amount NUMERIC(12,2);
    v_expense_date DATE;
    v_paid_to VARCHAR(255);
    v_payment_mode VARCHAR(50);
    v_reference_no VARCHAR(100);
    v_notes TEXT;
    v_status VARCHAR(50);
    v_is_edit BOOLEAN := FALSE;
    v_tx_code VARCHAR(100);
    v_description TEXT;
    v_party_name VARCHAR(255);
BEGIN
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        SELECT workspace_id INTO v_workspace_id FROM public.memberships WHERE user_id = auth.uid() LIMIT 1;
    END IF;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := auth.uid();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id is required';
    END IF;

    IF p_payload->>'branch_id' IS NOT NULL AND (p_payload->>'branch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_branch_id := (p_payload->>'branch_id')::UUID;
    END IF;

    v_category := COALESCE(p_payload->>'category', 'Other');
    v_expense_name := p_payload->>'expense_name';
    v_amount := ROUND(COALESCE((p_payload->>'amount')::NUMERIC, 0), 2);
    v_expense_date := COALESCE((p_payload->>'expense_date')::DATE, CURRENT_DATE);
    v_paid_to := p_payload->>'paid_to';
    v_payment_mode := COALESCE(p_payload->>'payment_mode', 'Cash');
    v_reference_no := p_payload->>'reference_no';
    v_notes := p_payload->>'notes';
    v_status := COALESCE(p_payload->>'status', 'PAID');

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'Expense amount must be greater than zero.';
    END IF;

    IF p_payload->>'expense_id' IS NOT NULL AND (p_payload->>'expense_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_expense_id := (p_payload->>'expense_id')::UUID;
        SELECT EXISTS(SELECT 1 FROM public.expenses WHERE id = v_expense_id AND workspace_id = v_workspace_id) INTO v_is_edit;
    ELSE
        v_expense_id := gen_random_uuid();
    END IF;

    IF v_is_edit THEN
        UPDATE public.expenses
        SET branch_id = v_branch_id,
            category = v_category,
            expense_name = v_expense_name,
            amount = v_amount,
            expense_date = v_expense_date,
            paid_to = v_paid_to,
            payment_mode = v_payment_mode,
            reference_no = v_reference_no,
            notes = v_notes,
            status = v_status
        WHERE id = v_expense_id AND workspace_id = v_workspace_id;
    ELSE
        INSERT INTO public.expenses (
            id, workspace_id, branch_id, category, expense_name, amount,
            expense_date, paid_to, payment_mode, reference_no, notes, status, created_at
        ) VALUES (
            v_expense_id, v_workspace_id, v_branch_id, v_category, v_expense_name, v_amount,
            v_expense_date, v_paid_to, v_payment_mode, v_reference_no, v_notes, v_status, NOW()
        );
    END IF;

    v_tx_code := 'EXP-' || TO_CHAR(v_expense_date, 'YYYYMMDD') || '-' || SUBSTRING(v_expense_id::TEXT FROM 1 FOR 6);
    v_description := COALESCE(v_expense_name, v_category || ' Expense');
    v_party_name := COALESCE(v_paid_to, v_category, 'Operational Vendor');

    -- Upsert Daybook transaction
    INSERT INTO public.daybook_transactions (
        id, workspace_id, branch_id, transaction_code, transaction_date,
        transaction_type, direction, amount, total_amount, remaining_amount,
        payment_status, payment_mode, party_type, party_name,
        reference_type, reference_id, reference_number, description, notes,
        status, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_workspace_id, v_branch_id, v_tx_code, v_expense_date,
        'EXPENSE', 'OUT', v_amount, v_amount, 0,
        v_status, v_payment_mode, 'other', v_party_name,
        'EXPENSE', v_expense_id::TEXT, COALESCE(v_reference_no, v_tx_code), v_description, v_notes,
        'COMPLETED', NOW(), NOW()
    )
    ON CONFLICT (workspace_id, reference_type, reference_id) WHERE reference_id IS NOT NULL
    DO UPDATE SET
        branch_id = EXCLUDED.branch_id,
        transaction_date = EXCLUDED.transaction_date,
        amount = EXCLUDED.amount,
        total_amount = EXCLUDED.total_amount,
        payment_status = EXCLUDED.payment_status,
        payment_mode = EXCLUDED.payment_mode,
        party_name = EXCLUDED.party_name,
        description = EXCLUDED.description,
        notes = EXCLUDED.notes,
        status = 'COMPLETED',
        updated_at = NOW();

    -- Upsert Cashbook entry (only if actual money was paid out and not unpaid/credit)
    IF v_status <> 'UNPAID' AND v_payment_mode NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
        INSERT INTO public.cashbook_entries (
            id, workspace_id, branch_id, entry_date, entry_number, direction,
            amount, payment_method, account_name, source_type, source_id,
            reference_number, party_name, description, notes, status, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_branch_id, v_expense_date, 'CB-' || v_tx_code, 'OUT',
            v_amount, v_payment_mode, 'Cash Account', 'EXPENSE', v_expense_id::TEXT,
            COALESCE(v_reference_no, v_tx_code), v_party_name, v_description, v_notes, 'COMPLETED', NOW(), NOW()
        )
        ON CONFLICT (workspace_id, source_type, source_id, direction) WHERE source_id IS NOT NULL
        DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            entry_date = EXCLUDED.entry_date,
            amount = EXCLUDED.amount,
            payment_method = EXCLUDED.payment_method,
            party_name = EXCLUDED.party_name,
            description = EXCLUDED.description,
            notes = EXCLUDED.notes,
            status = 'COMPLETED',
            updated_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'expense_id', v_expense_id,
        'branch_id', v_branch_id,
        'transaction_code', v_tx_code,
        'amount', v_amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_expense_atomic(JSONB) TO authenticated, service_role;

-- 5. ATOMIC EXPENSE DELETION RPC: delete_expense_atomic
CREATE OR REPLACE FUNCTION public.delete_expense_atomic(p_workspace_id UUID, p_expense_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.cashbook_entries
    WHERE workspace_id = p_workspace_id
      AND source_type = 'EXPENSE'
      AND source_id = p_expense_id::TEXT;

    DELETE FROM public.daybook_transactions
    WHERE workspace_id = p_workspace_id
      AND reference_type = 'EXPENSE'
      AND reference_id = p_expense_id::TEXT;

    DELETE FROM public.expenses
    WHERE workspace_id = p_workspace_id
      AND id = p_expense_id;

    RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_expense_atomic(UUID, UUID) TO authenticated, service_role;

-- 6. HISTORICAL RECONCILIATION RPC: reconcile_expenses_daybook
CREATE OR REPLACE FUNCTION public.reconcile_expenses_daybook(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r RECORD;
    v_reconciled INT := 0;
    v_tx_code VARCHAR(100);
    v_desc TEXT;
    v_party VARCHAR(255);
BEGIN
    FOR r IN
        SELECT e.*
        FROM public.expenses e
        WHERE e.workspace_id = p_workspace_id
    LOOP
        v_tx_code := 'EXP-' || TO_CHAR(COALESCE(r.expense_date, CURRENT_DATE), 'YYYYMMDD') || '-' || SUBSTRING(r.id::TEXT FROM 1 FOR 6);
        v_desc := COALESCE(r.expense_name, r.category || ' Expense');
        v_party := COALESCE(r.paid_to, r.category, 'Operational Vendor');

        -- Upsert Daybook transaction
        INSERT INTO public.daybook_transactions (
            id, workspace_id, branch_id, transaction_code, transaction_date,
            transaction_type, direction, amount, total_amount, remaining_amount,
            payment_status, payment_mode, party_type, party_name,
            reference_type, reference_id, reference_number, description, notes,
            status, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), p_workspace_id, r.branch_id, v_tx_code, COALESCE(r.expense_date, CURRENT_DATE),
            'EXPENSE', 'OUT', r.amount, r.amount, 0,
            COALESCE(r.status, 'PAID'), COALESCE(r.payment_mode, 'Cash'), 'other', v_party,
            'EXPENSE', r.id::TEXT, COALESCE(r.reference_no, v_tx_code), v_desc, r.notes,
            'COMPLETED', COALESCE(r.created_at, NOW()), NOW()
        )
        ON CONFLICT (workspace_id, reference_type, reference_id) WHERE reference_id IS NOT NULL
        DO UPDATE SET
            branch_id = EXCLUDED.branch_id,
            transaction_date = EXCLUDED.transaction_date,
            amount = EXCLUDED.amount,
            total_amount = EXCLUDED.total_amount,
            payment_status = EXCLUDED.payment_status,
            payment_mode = EXCLUDED.payment_mode,
            party_name = EXCLUDED.party_name,
            description = EXCLUDED.description,
            updated_at = NOW();

        -- Upsert Cashbook entry
        IF COALESCE(r.status, 'PAID') <> 'UNPAID' AND COALESCE(r.payment_mode, 'Cash') NOT IN ('Credit', 'Credit / Udhari', 'Udhari') THEN
            INSERT INTO public.cashbook_entries (
                id, workspace_id, branch_id, entry_date, entry_number, direction,
                amount, payment_method, account_name, source_type, source_id,
                reference_number, party_name, description, notes, status, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), p_workspace_id, r.branch_id, COALESCE(r.expense_date, CURRENT_DATE), 'CB-' || v_tx_code, 'OUT',
                r.amount, COALESCE(r.payment_mode, 'Cash'), 'Cash Account', 'EXPENSE', r.id::TEXT,
                COALESCE(r.reference_no, v_tx_code), v_party, v_desc, r.notes, 'COMPLETED', COALESCE(r.created_at, NOW()), NOW()
            )
            ON CONFLICT (workspace_id, source_type, source_id, direction) WHERE source_id IS NOT NULL
            DO UPDATE SET
                branch_id = EXCLUDED.branch_id,
                entry_date = EXCLUDED.entry_date,
                amount = EXCLUDED.amount,
                payment_method = EXCLUDED.payment_method,
                party_name = EXCLUDED.party_name,
                description = EXCLUDED.description,
                updated_at = NOW();
        END IF;

        v_reconciled := v_reconciled + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'reconciled_count', v_reconciled
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_expenses_daybook(UUID) TO authenticated, service_role;

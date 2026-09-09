-- =============================================================================
-- VISTAAR BUSINESS OS — EXPENSES ↔ DAYBOOK TRANSACTION PIPELINE
-- Migration File: supabase/migrations/034_expense_daybook_pipeline_and_rpc.sql
-- Description: Establishes authoritative, atomic synchronization between
--              Expenses, Daybook Journal, and Cashbook with strict idempotency,
--              payment mode propagation, and multi-tenant isolation.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ADD PAYMENT_MODE TO PUBLIC.EXPENSES (IF NOT EXISTS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash';

COMMENT ON COLUMN public.expenses.payment_mode IS
    'Method of payment: Cash, UPI, Bank Transfer, Card, Cheque, Other.';

-- -----------------------------------------------------------------------------
-- 2. ATOMIC EXPENSE & DAYBOOK TRANSACTION RPC: record_expense_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_expense_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_expense_id UUID;
    v_category public.expense_category;
    v_expense_name VARCHAR(255);
    v_amount NUMERIC(12,2);
    v_expense_date DATE;
    v_paid_to VARCHAR(255);
    v_payment_mode VARCHAR(50);
    v_reference_no VARCHAR(100);
    v_notes TEXT;
    v_is_edit BOOLEAN := FALSE;

    v_tx_code VARCHAR(100);
    v_daybook_id UUID;
    v_description TEXT;
    v_party_name VARCHAR(255);
    v_cb_table_exists BOOLEAN;
BEGIN
    -- Extract and validate payload parameters
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    v_category := (p_payload->>'category')::public.expense_category;
    v_expense_name := p_payload->>'expense_name';
    v_amount := ROUND(COALESCE((p_payload->>'amount')::NUMERIC, 0), 2);
    v_expense_date := COALESCE((p_payload->>'expense_date')::DATE, CURRENT_DATE);
    v_paid_to := p_payload->>'paid_to';
    v_payment_mode := COALESCE(p_payload->>'payment_mode', 'Cash');
    v_reference_no := p_payload->>'reference_no';
    v_notes := p_payload->>'notes';

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id is required';
    END IF;

    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'Expense amount must be greater than zero';
    END IF;

    IF v_category IS NULL THEN
        RAISE EXCEPTION 'Expense category is required';
    END IF;

    -- Check if editing existing expense
    IF (p_payload->>'expense_id') IS NOT NULL AND (p_payload->>'expense_id') != '' THEN
        v_expense_id := (p_payload->>'expense_id')::UUID;
        v_is_edit := TRUE;
    ELSE
        v_expense_id := gen_random_uuid();
        v_is_edit := FALSE;
    END IF;

    -- Standardize party name and description
    v_party_name := COALESCE(v_paid_to, v_category::TEXT, 'Vendor');
    IF v_expense_name IS NOT NULL AND TRIM(v_expense_name) != '' THEN
        v_description := v_category::TEXT || ': ' || TRIM(v_expense_name);
    ELSE
        v_description := v_category::TEXT || ' Expense';
    END IF;

    v_tx_code := 'EXP-' || TO_CHAR(v_expense_date, 'YYYY') || '-' || SUBSTRING(v_expense_id::TEXT FROM 1 FOR 8);

    -- 1. Insert or Update public.expenses
    IF v_is_edit THEN
        UPDATE public.expenses
        SET 
            category = v_category,
            expense_name = v_expense_name,
            amount = v_amount,
            expense_date = v_expense_date,
            paid_to = v_paid_to,
            payment_mode = v_payment_mode,
            reference_no = v_reference_no,
            notes = v_notes
        WHERE id = v_expense_id AND workspace_id = v_workspace_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Expense with ID % not found in workspace %', v_expense_id, v_workspace_id;
        END IF;
    ELSE
        INSERT INTO public.expenses (
            id,
            workspace_id,
            category,
            expense_name,
            amount,
            expense_date,
            paid_to,
            payment_mode,
            reference_no,
            notes,
            created_at
        ) VALUES (
            v_expense_id,
            v_workspace_id,
            v_category,
            v_expense_name,
            v_amount,
            v_expense_date,
            v_paid_to,
            v_payment_mode,
            v_reference_no,
            v_notes,
            NOW()
        );
    END IF;

    -- 2. Insert or Update public.daybook_transactions with strict idempotency
    v_daybook_id := gen_random_uuid();

    INSERT INTO public.daybook_transactions (
        id,
        workspace_id,
        transaction_code,
        transaction_date,
        transaction_type,
        direction,
        amount,
        payment_mode,
        party_type,
        party_name,
        reference_type,
        reference_id,
        reference_number,
        description,
        notes,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_daybook_id,
        v_workspace_id,
        v_tx_code,
        v_expense_date,
        'EXPENSE',
        'OUT',
        v_amount,
        v_payment_mode::public.payment_method,
        'other',
        v_party_name,
        'EXPENSE',
        v_expense_id::TEXT,
        COALESCE(v_reference_no, v_category::TEXT),
        v_description,
        v_notes,
        'COMPLETED',
        NOW(),
        NOW()
    )
    ON CONFLICT (workspace_id, reference_type, reference_id) DO UPDATE
    SET 
        transaction_date = EXCLUDED.transaction_date,
        amount = EXCLUDED.amount,
        payment_mode = EXCLUDED.payment_mode,
        party_name = EXCLUDED.party_name,
        reference_number = EXCLUDED.reference_number,
        description = EXCLUDED.description,
        notes = EXCLUDED.notes,
        status = 'COMPLETED',
        updated_at = NOW();

    -- 3. Synchronize with public.cashbook_entries if table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'cashbook_entries'
    ) INTO v_cb_table_exists;

    IF v_cb_table_exists THEN
        INSERT INTO public.cashbook_entries (
            id,
            workspace_id,
            entry_date,
            entry_number,
            direction,
            amount,
            payment_method,
            account_name,
            source_type,
            source_id,
            reference_number,
            party_name,
            description,
            notes,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_workspace_id,
            v_expense_date,
            'CB-' || v_tx_code,
            'OUT',
            v_amount,
            v_payment_mode,
            CASE 
                WHEN v_payment_mode ILIKE '%upi%' THEN 'UPI Clearing'
                WHEN v_payment_mode ILIKE '%bank%' OR v_payment_mode ILIKE '%neft%' OR v_payment_mode ILIKE '%rtgs%' THEN 'Bank Account'
                WHEN v_payment_mode ILIKE '%card%' THEN 'Card Settlement'
                WHEN v_payment_mode ILIKE '%cheque%' THEN 'Cheques in Hand'
                ELSE 'Cash Account'
            END,
            'EXPENSE',
            v_expense_id::TEXT,
            v_reference_no,
            v_party_name,
            v_description,
            v_notes,
            NOW(),
            NOW()
        )
        ON CONFLICT (workspace_id, source_type, source_id, direction) WHERE source_id IS NOT NULL DO UPDATE
        SET 
            entry_date = EXCLUDED.entry_date,
            amount = EXCLUDED.amount,
            payment_method = EXCLUDED.payment_method,
            account_name = EXCLUDED.account_name,
            party_name = EXCLUDED.party_name,
            description = EXCLUDED.description,
            notes = EXCLUDED.notes,
            updated_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'expense_id', v_expense_id,
        'transaction_code', v_tx_code,
        'amount', v_amount,
        'expense_date', v_expense_date,
        'payment_mode', v_payment_mode,
        'is_edit', v_is_edit
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. ATOMIC EXPENSE DELETION RPC: delete_expense_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_expense_atomic(p_workspace_id UUID, p_expense_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cb_table_exists BOOLEAN;
BEGIN
    IF p_workspace_id IS NULL OR p_expense_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id and expense_id are required';
    END IF;

    -- 1. Delete linked Daybook journal transaction
    DELETE FROM public.daybook_transactions
    WHERE workspace_id = p_workspace_id
      AND reference_type = 'EXPENSE'
      AND reference_id = p_expense_id::TEXT;

    -- 2. Delete linked Cashbook transaction (if exists)
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'cashbook_entries'
    ) INTO v_cb_table_exists;

    IF v_cb_table_exists THEN
        DELETE FROM public.cashbook_entries
        WHERE workspace_id = p_workspace_id
          AND source_type = 'EXPENSE'
          AND source_id = p_expense_id::TEXT;
    END IF;

    -- 3. Delete expense record
    DELETE FROM public.expenses
    WHERE workspace_id = p_workspace_id
      AND id = p_expense_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'expense_id', p_expense_id
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. BATCH HISTORICAL RECONCILIATION RPC: reconcile_expenses_daybook
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_expenses_daybook(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_exp RECORD;
    v_reconciled_count INT := 0;
    v_tx_code VARCHAR(100);
    v_party_name VARCHAR(255);
    v_description TEXT;
BEGIN
    IF p_workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id is required';
    END IF;

    FOR v_exp IN 
        SELECT * FROM public.expenses 
        WHERE workspace_id = p_workspace_id
    LOOP
        v_tx_code := 'EXP-' || TO_CHAR(v_exp.expense_date, 'YYYY') || '-' || SUBSTRING(v_exp.id::TEXT FROM 1 FOR 8);
        v_party_name := COALESCE(v_exp.paid_to, v_exp.category::TEXT, 'Vendor');
        IF v_exp.expense_name IS NOT NULL AND TRIM(v_exp.expense_name) != '' THEN
            v_description := v_exp.category::TEXT || ': ' || TRIM(v_exp.expense_name);
        ELSE
            v_description := v_exp.category::TEXT || ' Expense';
        END IF;

        INSERT INTO public.daybook_transactions (
            id,
            workspace_id,
            transaction_code,
            transaction_date,
            transaction_type,
            direction,
            amount,
            payment_mode,
            party_type,
            party_name,
            reference_type,
            reference_id,
            reference_number,
            description,
            notes,
            status,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            p_workspace_id,
            v_tx_code,
            v_exp.expense_date,
            'EXPENSE',
            'OUT',
            v_exp.amount,
            COALESCE(v_exp.payment_mode, 'Cash')::public.payment_method,
            'other',
            v_party_name,
            'EXPENSE',
            v_exp.id::TEXT,
            COALESCE(v_exp.reference_no, v_exp.category::TEXT),
            v_description,
            v_exp.notes,
            'COMPLETED',
            v_exp.created_at,
            NOW()
        )
        ON CONFLICT (workspace_id, reference_type, reference_id) DO UPDATE
        SET 
            transaction_date = EXCLUDED.transaction_date,
            amount = EXCLUDED.amount,
            payment_mode = EXCLUDED.payment_mode,
            party_name = EXCLUDED.party_name,
            description = EXCLUDED.description,
            notes = EXCLUDED.notes,
            updated_at = NOW();

        v_reconciled_count := v_reconciled_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'reconciled_count', v_reconciled_count
    );
END;
$$;

COMMIT;

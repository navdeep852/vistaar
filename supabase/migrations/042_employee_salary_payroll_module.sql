-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 042: EMPLOYEE SALARY & PAYROLL MODULE
-- Migration File: supabase/migrations/042_employee_salary_payroll_module.sql
-- Description:
--   1. Adds 'SALARY' to public.daybook_transaction_type enum
--   2. Adds source_type and source_id columns to public.expenses for payroll tracing
--   3. Creates public.salary_structures for employee compensation profiles
--   4. Creates public.salary_payments and public.salary_payment_items
--   5. Implements atomic RPCs: record_salary_payment_atomic and cancel_salary_payment_atomic
--   6. Configures multi-tenant RLS policies for strict workspace isolation & role control
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. EXTEND DAYBOOK TRANSACTION TYPE ENUM (IF NOT PRESENT)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid  
        WHERE t.typname = 'daybook_transaction_type' AND e.enumlabel = 'SALARY'
    ) THEN
        ALTER TYPE public.daybook_transaction_type ADD VALUE 'SALARY';
    END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. ENHANCE PUBLIC.EXPENSES WITH SOURCE TRACKING COLUMNS
-- -----------------------------------------------------------------------------
ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_expenses_source ON public.expenses(workspace_id, source_type, source_id);

-- -----------------------------------------------------------------------------
-- 3. EMPLOYEE SALARY STRUCTURE TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    salary_frequency VARCHAR(30) NOT NULL DEFAULT 'Monthly',
    base_salary NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
    hra_allowance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (hra_allowance >= 0),
    other_allowances NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_allowances >= 0),
    standard_deductions NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (standard_deductions >= 0),
    payment_mode VARCHAR(50) NOT NULL DEFAULT 'Bank Transfer',
    bank_name VARCHAR(100),
    bank_account_no VARCHAR(50),
    bank_ifsc VARCHAR(20),
    upi_id VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_employee_salary_structure UNIQUE (workspace_id, employee_id)
);

CREATE TRIGGER set_salary_structures_updated_at
    BEFORE UPDATE ON public.salary_structures
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_salary_structures_ws_emp ON public.salary_structures(workspace_id, employee_id);

-- -----------------------------------------------------------------------------
-- 4. SALARY PAYMENTS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    employee_name VARCHAR(255) NOT NULL,
    employee_code VARCHAR(50) NOT NULL,
    department VARCHAR(100),
    designation VARCHAR(100),
    salary_period_start DATE NOT NULL,
    salary_period_end DATE NOT NULL,
    salary_period_label VARCHAR(50) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
    deduction_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deduction_amount >= 0),
    addition_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (addition_amount >= 0),
    net_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
    payment_mode VARCHAR(50) NOT NULL DEFAULT 'Bank Transfer',
    reference_no VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PAID' CHECK (status IN ('DRAFT', 'PENDING', 'PAID', 'CANCELLED')),
    transaction_type VARCHAR(50) NOT NULL DEFAULT 'REGULAR' CHECK (transaction_type IN ('REGULAR', 'ADVANCE', 'BONUS', 'ADJUSTMENT', 'ARREARS')),
    notes TEXT,
    expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_salary_reference UNIQUE (workspace_id, reference_no)
);

CREATE TRIGGER set_salary_payments_updated_at
    BEFORE UPDATE ON public.salary_payments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_salary_payments_workspace ON public.salary_payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_employee ON public.salary_payments(workspace_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_payments_period ON public.salary_payments(salary_period_start, salary_period_end);
CREATE INDEX IF NOT EXISTS idx_salary_payments_date ON public.salary_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_salary_payments_status ON public.salary_payments(status);

-- -----------------------------------------------------------------------------
-- 5. SALARY PAYMENT ITEMS TABLE (ITEMIZED EARNINGS & DEDUCTIONS)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_payment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salary_payment_id UUID NOT NULL REFERENCES public.salary_payments(id) ON DELETE CASCADE,
    item_type VARCHAR(30) NOT NULL CHECK (item_type IN ('EARNING', 'DEDUCTION')),
    item_name VARCHAR(100) NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_items_payment ON public.salary_payment_items(salary_payment_id);

-- -----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_payment_items ENABLE ROW LEVEL SECURITY;

-- salary_structures policies
DROP POLICY IF EXISTS "Workspace isolation SELECT for salary_structures" ON public.salary_structures;
DROP POLICY IF EXISTS "Workspace isolation INSERT for salary_structures" ON public.salary_structures;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for salary_structures" ON public.salary_structures;
DROP POLICY IF EXISTS "Workspace isolation DELETE for salary_structures" ON public.salary_structures;

CREATE POLICY "Workspace isolation SELECT for salary_structures" ON public.salary_structures
    FOR SELECT USING (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation INSERT for salary_structures" ON public.salary_structures
    FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation UPDATE for salary_structures" ON public.salary_structures
    FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
               WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation DELETE for salary_structures" ON public.salary_structures
    FOR DELETE USING (workspace_id = public.current_user_workspace_id());

-- salary_payments policies
DROP POLICY IF EXISTS "Workspace isolation SELECT for salary_payments" ON public.salary_payments;
DROP POLICY IF EXISTS "Workspace isolation INSERT for salary_payments" ON public.salary_payments;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for salary_payments" ON public.salary_payments;
DROP POLICY IF EXISTS "Workspace isolation DELETE for salary_payments" ON public.salary_payments;

CREATE POLICY "Workspace isolation SELECT for salary_payments" ON public.salary_payments
    FOR SELECT USING (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation INSERT for salary_payments" ON public.salary_payments
    FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation UPDATE for salary_payments" ON public.salary_payments
    FOR UPDATE USING (workspace_id = public.current_user_workspace_id())
               WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Workspace isolation DELETE for salary_payments" ON public.salary_payments
    FOR DELETE USING (workspace_id = public.current_user_workspace_id());

-- salary_payment_items policies (via parent payment workspace)
DROP POLICY IF EXISTS "Workspace isolation SELECT for salary_payment_items" ON public.salary_payment_items;
DROP POLICY IF EXISTS "Workspace isolation INSERT for salary_payment_items" ON public.salary_payment_items;
DROP POLICY IF EXISTS "Workspace isolation UPDATE for salary_payment_items" ON public.salary_payment_items;
DROP POLICY IF EXISTS "Workspace isolation DELETE for salary_payment_items" ON public.salary_payment_items;

CREATE POLICY "Workspace isolation SELECT for salary_payment_items" ON public.salary_payment_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.salary_payments p
            WHERE p.id = salary_payment_items.salary_payment_id
              AND p.workspace_id = public.current_user_workspace_id()
        )
    );

CREATE POLICY "Workspace isolation INSERT for salary_payment_items" ON public.salary_payment_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.salary_payments p
            WHERE p.id = salary_payment_items.salary_payment_id
              AND p.workspace_id = public.current_user_workspace_id()
        )
    );

CREATE POLICY "Workspace isolation UPDATE for salary_payment_items" ON public.salary_payment_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.salary_payments p
            WHERE p.id = salary_payment_items.salary_payment_id
              AND p.workspace_id = public.current_user_workspace_id()
        )
    );

CREATE POLICY "Workspace isolation DELETE for salary_payment_items" ON public.salary_payment_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.salary_payments p
            WHERE p.id = salary_payment_items.salary_payment_id
              AND p.workspace_id = public.current_user_workspace_id()
        )
    );

-- -----------------------------------------------------------------------------
-- 7. ATOMIC SALARY PAYMENT RPC: record_salary_payment_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_salary_payment_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_payment_id UUID;
    v_employee_id UUID;
    v_employee_name VARCHAR(255);
    v_employee_code VARCHAR(50);
    v_department VARCHAR(100);
    v_designation VARCHAR(100);
    v_period_start DATE;
    v_period_end DATE;
    v_period_label VARCHAR(50);
    v_payment_date DATE;
    v_gross_amount NUMERIC(12,2);
    v_deduction_amount NUMERIC(12,2);
    v_addition_amount NUMERIC(12,2);
    v_net_amount NUMERIC(12,2);
    v_payment_mode VARCHAR(50);
    v_reference_no VARCHAR(100);
    v_status VARCHAR(30);
    v_transaction_type VARCHAR(50);
    v_notes TEXT;
    v_created_by UUID;
    v_items JSONB;
    v_item RECORD;

    v_expense_id UUID;
    v_daybook_id UUID;
    v_cb_table_exists BOOLEAN;
    v_account_name VARCHAR(100);
    v_description TEXT;
BEGIN
    -- Extract payload fields
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    v_employee_id := (p_payload->>'employee_id')::UUID;
    v_employee_name := TRIM(p_payload->>'employee_name');
    v_employee_code := COALESCE(TRIM(p_payload->>'employee_code'), 'VST-EMP');
    v_department := NULLIF(TRIM(p_payload->>'department'), '');
    v_designation := NULLIF(TRIM(p_payload->>'designation'), '');
    v_period_start := (p_payload->>'salary_period_start')::DATE;
    v_period_end := (p_payload->>'salary_period_end')::DATE;
    v_period_label := COALESCE(TRIM(p_payload->>'salary_period_label'), TO_CHAR(v_period_start, 'Month YYYY'));
    v_payment_date := COALESCE((p_payload->>'payment_date')::DATE, CURRENT_DATE);
    v_gross_amount := ROUND(COALESCE((p_payload->>'gross_amount')::NUMERIC, 0), 2);
    v_deduction_amount := ROUND(COALESCE((p_payload->>'deduction_amount')::NUMERIC, 0), 2);
    v_addition_amount := ROUND(COALESCE((p_payload->>'addition_amount')::NUMERIC, 0), 2);
    v_net_amount := ROUND(COALESCE((p_payload->>'net_amount')::NUMERIC, (v_gross_amount - v_deduction_amount)), 2);
    v_payment_mode := COALESCE(NULLIF(TRIM(p_payload->>'payment_mode'), ''), 'Bank Transfer');
    v_reference_no := TRIM(p_payload->>'reference_no');
    v_status := COALESCE(NULLIF(TRIM(p_payload->>'status'), ''), 'PAID');
    v_transaction_type := COALESCE(NULLIF(TRIM(p_payload->>'transaction_type'), ''), 'REGULAR');
    v_notes := NULLIF(TRIM(p_payload->>'notes'), '');
    v_created_by := (p_payload->>'created_by')::UUID;
    v_items := p_payload->'items';

    -- Validations
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id is required';
    END IF;
    IF v_employee_id IS NULL THEN
        RAISE EXCEPTION 'employee_id is required';
    END IF;
    IF v_employee_name IS NULL OR v_employee_name = '' THEN
        RAISE EXCEPTION 'employee_name is required';
    END IF;
    IF v_period_start IS NULL OR v_period_end IS NULL THEN
        RAISE EXCEPTION 'salary_period_start and salary_period_end are required';
    END IF;
    IF v_net_amount < 0 THEN
        RAISE EXCEPTION 'Net salary cannot be negative';
    END IF;

    -- Duplicate check for regular monthly salary
    IF v_transaction_type = 'REGULAR' AND v_status != 'CANCELLED' THEN
        IF EXISTS (
            SELECT 1 FROM public.salary_payments
            WHERE workspace_id = v_workspace_id
              AND employee_id = v_employee_id
              AND salary_period_start = v_period_start
              AND salary_period_end = v_period_end
              AND transaction_type = 'REGULAR'
              AND status != 'CANCELLED'
              AND (p_payload->>'payment_id' IS NULL OR id != (p_payload->>'payment_id')::UUID)
        ) THEN
            RAISE EXCEPTION 'Salary for this employee and period has already been recorded.';
        END IF;
    END IF;

    -- Determine payment ID
    IF (p_payload->>'payment_id') IS NOT NULL AND (p_payload->>'payment_id') != '' THEN
        v_payment_id := (p_payload->>'payment_id')::UUID;
    ELSE
        v_payment_id := gen_random_uuid();
    END IF;

    IF v_reference_no IS NULL OR v_reference_no = '' THEN
        v_reference_no := 'SAL-' || TO_CHAR(v_payment_date, 'YYYY-MM') || '-' || SUBSTRING(v_payment_id::TEXT FROM 1 FOR 6);
    END IF;

    v_expense_id := gen_random_uuid();
    v_description := 'Salary paid — ' || v_employee_name || ' (' || v_period_label || ')';

    -- Determine Cashbook account name based on payment mode
    IF v_payment_mode ILIKE '%upi%' THEN
        v_account_name := 'UPI Clearing';
    ELSIF v_payment_mode ILIKE '%bank%' OR v_payment_mode ILIKE '%neft%' OR v_payment_mode ILIKE '%rtgs%' THEN
        v_account_name := 'Bank Account';
    ELSIF v_payment_mode ILIKE '%card%' THEN
        v_account_name := 'Card Settlement';
    ELSIF v_payment_mode ILIKE '%cheque%' THEN
        v_account_name := 'Cheques in Hand';
    ELSE
        v_account_name := 'Cash Account';
    END IF;

    -- 1. Insert or Update salary_payments
    INSERT INTO public.salary_payments (
        id,
        workspace_id,
        employee_id,
        employee_name,
        employee_code,
        department,
        designation,
        salary_period_start,
        salary_period_end,
        salary_period_label,
        payment_date,
        gross_amount,
        deduction_amount,
        addition_amount,
        net_amount,
        payment_mode,
        reference_no,
        status,
        transaction_type,
        notes,
        expense_id,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_payment_id,
        v_workspace_id,
        v_employee_id,
        v_employee_name,
        v_employee_code,
        v_department,
        v_designation,
        v_period_start,
        v_period_end,
        v_period_label,
        v_payment_date,
        v_gross_amount,
        v_deduction_amount,
        v_addition_amount,
        v_net_amount,
        v_payment_mode,
        v_reference_no,
        v_status,
        v_transaction_type,
        v_notes,
        CASE WHEN v_status = 'PAID' THEN v_expense_id ELSE NULL END,
        v_created_by,
        NOW(),
        NOW()
    ) ON CONFLICT (workspace_id, reference_no) DO UPDATE SET
        gross_amount = EXCLUDED.gross_amount,
        deduction_amount = EXCLUDED.deduction_amount,
        addition_amount = EXCLUDED.addition_amount,
        net_amount = EXCLUDED.net_amount,
        payment_mode = EXCLUDED.payment_mode,
        payment_date = EXCLUDED.payment_date,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        updated_at = NOW();

    -- 2. Insert itemized breakdown if provided
    DELETE FROM public.salary_payment_items WHERE salary_payment_id = v_payment_id;
    IF v_items IS NOT NULL AND jsonb_array_length(v_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_to_recordset(v_items) AS x(item_type TEXT, item_name TEXT, amount NUMERIC, notes TEXT)
        LOOP
            INSERT INTO public.salary_payment_items (
                salary_payment_id,
                item_type,
                item_name,
                amount,
                notes
            ) VALUES (
                v_payment_id,
                v_item.item_type,
                v_item.item_name,
                ROUND(COALESCE(v_item.amount, 0), 2),
                v_item.notes
            );
        END LOOP;
    END IF;

    -- 3. If PAID: Perform atomic linked financial postings
    IF v_status = 'PAID' AND v_net_amount > 0 THEN
        -- A. Create / Update public.expenses
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
            source_type,
            source_id,
            created_at
        ) VALUES (
            v_expense_id,
            v_workspace_id,
            'Salary',
            'Employee Salary — ' || v_employee_name,
            v_net_amount,
            v_payment_date,
            v_employee_name,
            v_payment_mode,
            v_reference_no,
            'Salary Period: ' || v_period_label || COALESCE(' | Ref: ' || v_reference_no, ''),
            'SALARY_PAYMENT',
            v_payment_id::TEXT,
            NOW()
        ) ON CONFLICT (id) DO UPDATE SET
            amount = EXCLUDED.amount,
            expense_date = EXCLUDED.expense_date,
            payment_mode = EXCLUDED.payment_mode,
            paid_to = EXCLUDED.paid_to,
            notes = EXCLUDED.notes;

        -- Update salary_payments expense_id reference
        UPDATE public.salary_payments
        SET expense_id = v_expense_id
        WHERE id = v_payment_id;

        -- B. Create / Update Daybook Journal Outflow
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
            'DAY-' || v_reference_no,
            v_payment_date,
            'SALARY',
            'OUT',
            v_net_amount,
            v_payment_mode::public.payment_method,
            'other',
            v_employee_name,
            'SALARY',
            v_payment_id::TEXT,
            v_reference_no,
            v_description,
            'Salary for ' || v_period_label,
            'COMPLETED',
            NOW(),
            NOW()
        ) ON CONFLICT (workspace_id, reference_type, reference_id) DO UPDATE SET
            transaction_date = EXCLUDED.transaction_date,
            amount = EXCLUDED.amount,
            payment_mode = EXCLUDED.payment_mode,
            party_name = EXCLUDED.party_name,
            reference_number = EXCLUDED.reference_number,
            description = EXCLUDED.description,
            status = 'COMPLETED',
            updated_at = NOW();

        -- C. Create / Update Cashbook Outflow (if cashbook_entries table exists)
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
                v_payment_date,
                'CB-' || v_reference_no,
                'OUT',
                v_net_amount,
                v_payment_mode,
                v_account_name,
                'SALARY',
                v_payment_id::TEXT,
                v_reference_no,
                v_employee_name,
                'Salary Outflow — ' || v_employee_name,
                'Period: ' || v_period_label,
                NOW(),
                NOW()
            ) ON CONFLICT (workspace_id, source_type, source_id, direction) WHERE source_id IS NOT NULL DO UPDATE SET
                entry_date = EXCLUDED.entry_date,
                amount = EXCLUDED.amount,
                payment_method = EXCLUDED.payment_method,
                account_name = EXCLUDED.account_name,
                party_name = EXCLUDED.party_name,
                description = EXCLUDED.description,
                updated_at = NOW();
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'salary_payment_id', v_payment_id,
        'expense_id', v_expense_id,
        'reference_no', v_reference_no,
        'net_amount', v_net_amount,
        'status', v_status
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. ATOMIC SALARY CANCELLATION RPC: cancel_salary_payment_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_salary_payment_atomic(
    p_workspace_id UUID,
    p_salary_payment_id UUID,
    p_reason TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pay RECORD;
    v_cb_table_exists BOOLEAN;
BEGIN
    IF p_workspace_id IS NULL OR p_salary_payment_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id and salary_payment_id are required';
    END IF;

    SELECT * INTO v_pay
    FROM public.salary_payments
    WHERE id = p_salary_payment_id AND workspace_id = p_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Salary payment record not found in workspace';
    END IF;

    -- Mark salary_payments as CANCELLED
    UPDATE public.salary_payments
    SET 
        status = 'CANCELLED',
        cancelled_at = NOW(),
        cancelled_by = p_user_id,
        cancellation_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_salary_payment_id AND workspace_id = p_workspace_id;

    -- Delete linked expense to ensure P&L and Expenses do not double-count or retain cancelled outflow
    DELETE FROM public.expenses
    WHERE workspace_id = p_workspace_id
      AND source_type = 'SALARY_PAYMENT'
      AND source_id = p_salary_payment_id::TEXT;

    -- Mark linked Daybook transaction as VOID (preserving audit record)
    UPDATE public.daybook_transactions
    SET 
        status = 'VOID',
        notes = COALESCE(notes, '') || ' | Voided on ' || CURRENT_DATE || ': ' || COALESCE(p_reason, 'Salary cancelled'),
        updated_at = NOW()
    WHERE workspace_id = p_workspace_id
      AND reference_type = 'SALARY'
      AND reference_id = p_salary_payment_id::TEXT;

    -- Remove Cashbook entry for this cancelled salary
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'cashbook_entries'
    ) INTO v_cb_table_exists;

    IF v_cb_table_exists THEN
        DELETE FROM public.cashbook_entries
        WHERE workspace_id = p_workspace_id
          AND source_type = 'SALARY'
          AND source_id = p_salary_payment_id::TEXT;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'salary_payment_id', p_salary_payment_id,
        'status', 'CANCELLED'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. PERMISSIONS
-- -----------------------------------------------------------------------------
GRANT ALL ON TABLE public.salary_structures TO authenticated, service_role;
GRANT ALL ON TABLE public.salary_payments TO authenticated, service_role;
GRANT ALL ON TABLE public.salary_payment_items TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_salary_payment_atomic(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_salary_payment_atomic(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

COMMIT;

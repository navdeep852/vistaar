-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 043: EMPLOYEE MASTER & SALARY STRUCTURE ENHANCEMENTS
-- Migration File: supabase/migrations/043_employee_master_and_salary_structure_enhancements.sql
-- Description:
--   1. Enhances public.profiles to be the authoritative Employee Master (joining_date,
--      employment_type, employment_status, date_of_birth, gender, address, is_archived, archived_at)
--   2. Enhances public.salary_structures with effective_from, effective_to, is_current, versioning
--   3. Upgrades generate_next_employee_id RPC to support VST-EMP-XXX and VST-XXXXX sequences
--   4. Adds multi-tenant composite indexes for fast search, filter, and audit queries
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ENHANCE PUBLIC.PROFILES FOR EMPLOYEE MASTER
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS joining_date DATE,
    ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50) DEFAULT 'Full Time',
    ADD COLUMN IF NOT EXISTS employment_status VARCHAR(50) DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Allow email and phone to be optional in profiles (for businesses adding staff who lack email)
DO $$
BEGIN
    ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN null;
END $$;

DO $$
BEGIN
    ALTER TABLE public.profiles ALTER COLUMN phone DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- Ensure profiles id can default to gen_random_uuid()
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- -----------------------------------------------------------------------------
-- 2. ENHANCE PUBLIC.SALARY_STRUCTURES FOR REVISIONS & EFFECTIVE DATING
-- -----------------------------------------------------------------------------
ALTER TABLE public.salary_structures
    ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS effective_to DATE,
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Relax single structure constraint to allow versioned salary history per employee
ALTER TABLE public.salary_structures DROP CONSTRAINT IF EXISTS unique_workspace_employee_salary_structure;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_workspace_employee_salary_effective'
    ) THEN
        ALTER TABLE public.salary_structures
            ADD CONSTRAINT unique_workspace_employee_salary_effective UNIQUE (workspace_id, employee_id, effective_from);
    END IF;
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 3. COMPOSITE INDEXES FOR FAST DIRECTORY & AUDIT QUERIES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_ws_archived ON public.profiles(workspace_id, is_archived, status);
CREATE INDEX IF NOT EXISTS idx_profiles_ws_emp_code ON public.profiles(workspace_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_structures_emp_effective ON public.salary_structures(workspace_id, employee_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_salary_payments_ws_emp_period ON public.salary_payments(workspace_id, employee_id, salary_period_start, salary_period_end);

-- -----------------------------------------------------------------------------
-- 4. UPGRADED WORKSPACE-SCOPED SEQUENTIAL EMPLOYEE ID GENERATOR
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_next_employee_id(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_max_num INTEGER := 0;
    v_next_id TEXT;
BEGIN
    IF p_workspace_id IS NULL THEN
        RAISE EXCEPTION 'p_workspace_id cannot be null for employee ID generation';
    END IF;

    -- Look up highest numeric suffix across VST-EMP-XXX and VST-XXXXX patterns
    SELECT COALESCE(
        MAX(
            CASE 
                WHEN employee_id ~ '^VST-EMP-[0-9]+$' 
                THEN SUBSTRING(employee_id FROM 9)::INTEGER 
                WHEN employee_id ~ '^VST-[0-9]+$' 
                THEN SUBSTRING(employee_id FROM 5)::INTEGER 
                ELSE 0 
            END
        ), 0
    ) INTO v_max_num
    FROM public.profiles
    WHERE workspace_id = p_workspace_id;

    -- Return next ID with standard VST-EMP-001 format (3+ digits zero-padded)
    v_next_id := 'VST-EMP-' || LPAD((v_max_num + 1)::TEXT, 3, '0');
    RETURN v_next_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_next_employee_id(UUID) TO authenticated, service_role, anon;

COMMIT;

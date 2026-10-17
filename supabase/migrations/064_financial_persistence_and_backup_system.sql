-- ============================================================================
-- VISTAAR Business OS — Migration 064
-- Financial Data Persistence, Invoice Atomicity, Payment Sync & Backup System
-- ============================================================================

-- 1. Ensure public.branches table exists with full multi-branch schema
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    branch_code VARCHAR(50) NOT NULL,
    branch_name VARCHAR(150) NOT NULL,
    branch_type VARCHAR(50) DEFAULT 'Store',
    status VARCHAR(50) DEFAULT 'Active',
    is_main_branch BOOLEAN DEFAULT false,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    phone VARCHAR(50),
    email VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_workspace_id ON public.branches(workspace_id);
CREATE INDEX IF NOT EXISTS idx_branches_branch_code ON public.branches(workspace_id, branch_code);

-- 2. Add Missing Columns to public.invoices
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS is_stock_finalized BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_snapshot_finalized BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash',
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS payment_notes TEXT,
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'Cash';

CREATE INDEX IF NOT EXISTS idx_invoices_workspace_date ON public.invoices(workspace_id, date);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace_branch ON public.invoices(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_name ON public.invoices(workspace_id, customer_name);

-- 3. Add Missing Columns to public.invoice_items
ALTER TABLE public.invoice_items
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS part_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS price NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS rate NUMERIC(15,2),
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'product',
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);

-- 4. Add Missing Columns to public.payments
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS branch_id UUID,
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50),
    ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS upi_amount NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS counter_sale_id UUID,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Trigger to keep method and payment_method, reference_no and reference_number synchronized
CREATE OR REPLACE FUNCTION public.sync_payment_columns_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
    -- Synchronize payment method aliases
    IF NEW.payment_method IS NOT NULL AND NEW.method IS NULL THEN
        NEW.method := NEW.payment_method;
    ELSIF NEW.method IS NOT NULL AND NEW.payment_method IS NULL THEN
        NEW.payment_method := NEW.method;
    END IF;

    IF NEW.payment_mode IS NULL THEN
        NEW.payment_mode := COALESCE(NEW.payment_method, NEW.method, 'Cash');
    END IF;

    -- Synchronize reference number aliases
    IF NEW.reference_number IS NOT NULL AND NEW.reference_no IS NULL THEN
        NEW.reference_no := NEW.reference_number;
    ELSIF NEW.reference_no IS NOT NULL AND NEW.reference_number IS NULL THEN
        NEW.reference_number := NEW.reference_no;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_payment_columns ON public.payments;
CREATE TRIGGER trg_sync_payment_columns
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_payment_columns_trigger_fn();

CREATE INDEX IF NOT EXISTS idx_payments_workspace_date ON public.payments(workspace_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);

-- 5. Create public.backups Table for Enterprise Backup & Restore System
CREATE TABLE IF NOT EXISTS public.backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    branch_id UUID,
    backup_name VARCHAR(255) NOT NULL,
    backup_type VARCHAR(50) NOT NULL DEFAULT 'MANUAL', -- 'MANUAL', 'SCHEDULED', 'SAFETY_PRE_RESTORE'
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED', -- 'IN_PROGRESS', 'COMPLETED', 'FAILED'
    size_bytes BIGINT DEFAULT 0,
    checksum_sha256 VARCHAR(64) NOT NULL,
    schema_version VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
    record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    backup_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_backups_workspace_created ON public.backups(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_status ON public.backups(workspace_id, status);

-- 6. Create public.financial_audit_logs Table for Auditing Financial Events
CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    branch_id UUID,
    actor_id UUID,
    employee_id VARCHAR(50),
    event_type VARCHAR(50) NOT NULL, -- 'INVOICE_CREATED', 'INVOICE_FINALIZED', 'PAYMENT_RECEIVED', 'PAYMENT_REVERSED', 'INVOICE_RECOVERED', 'BACKUP_CREATED', 'BACKUP_RESTORED'
    record_id VARCHAR(100),
    record_type VARCHAR(50), -- 'INVOICE', 'PAYMENT', 'BACKUP', 'UDHARI'
    amount NUMERIC(15,2),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_workspace_date ON public.financial_audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_audit_event_type ON public.financial_audit_logs(workspace_id, event_type);

-- 7. Atomic Authoritative Invoice Finalization RPC: finalize_invoice_transaction
CREATE OR REPLACE FUNCTION public.finalize_invoice_transaction(p_payload JSONB)
RETURNS JSONB AS $$
DECLARE
    v_workspace_id UUID;
    v_branch_id UUID;
    v_invoice_id UUID;
    v_invoice_number VARCHAR(100);
    v_customer_id UUID;
    v_customer_name VARCHAR(255);
    v_customer_phone VARCHAR(50);
    v_customer_whatsapp VARCHAR(50);
    v_customer_email VARCHAR(255);
    v_customer_address TEXT;
    v_customer_gstin VARCHAR(50);
    v_quotation_id UUID;
    v_date DATE;
    v_due_date DATE;
    v_subtotal NUMERIC(15,2);
    v_discount_total NUMERIC(15,2);
    v_tax_total NUMERIC(15,2);
    v_grand_total NUMERIC(15,2);
    v_paid_amount NUMERIC(15,2);
    v_balance_amount NUMERIC(15,2);
    v_payment_mode VARCHAR(50);
    v_payment_ref VARCHAR(100);
    v_payment_notes TEXT;
    v_payment_date DATE;
    v_status VARCHAR(50);
    v_items JSONB;
    v_item JSONB;
    v_item_idx INT := 0;
    v_product_id UUID;
    v_req_qty NUMERIC(15,2);
    v_current_stock NUMERIC(15,2);
    v_item_rate NUMERIC(15,2);
    v_item_tax_pct NUMERIC(15,2);
    v_item_tax_amt NUMERIC(15,2);
    v_item_disc_amt NUMERIC(15,2);
    v_item_total NUMERIC(15,2);
    v_p_count INT;
    v_payment_id UUID;
    v_payment_number VARCHAR(100);
    v_daybook_status VARCHAR(50);
BEGIN
    -- Extract workspace ID
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'WORKSPACE_ID_REQUIRED: workspace_id is mandatory.';
    END IF;

    -- Extract Branch ID
    IF p_payload->>'branch_id' IS NOT NULL AND p_payload->>'branch_id' <> '' AND p_payload->>'branch_id' <> 'ALL' THEN
        BEGIN
            v_branch_id := (p_payload->>'branch_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_branch_id := NULL;
        END;
    END IF;

    -- Extract Invoice ID (or generate if null/invalid)
    IF p_payload->>'id' IS NOT NULL AND p_payload->>'id' <> '' THEN
        BEGIN
            v_invoice_id := (p_payload->>'id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_invoice_id := gen_random_uuid();
        END;
    ELSIF p_payload->>'invoice_id' IS NOT NULL AND p_payload->>'invoice_id' <> '' THEN
        BEGIN
            v_invoice_id := (p_payload->>'invoice_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_invoice_id := gen_random_uuid();
        END;
    ELSE
        v_invoice_id := gen_random_uuid();
    END IF;

    -- Extract Financial Totals
    v_subtotal := COALESCE((p_payload->>'subtotal')::NUMERIC, 0);
    v_discount_total := COALESCE((p_payload->>'discount_total')::NUMERIC, 0);
    v_tax_total := COALESCE((p_payload->>'tax_total')::NUMERIC, 0);
    v_grand_total := ROUND(COALESCE((p_payload->>'grand_total')::NUMERIC, 0), 2);
    v_paid_amount := ROUND(COALESCE((p_payload->>'paid_amount')::NUMERIC, 0), 2);

    IF v_paid_amount > (v_grand_total + 0.05) THEN
        RAISE EXCEPTION 'OVERPAYMENT_REJECTED: Paid amount (%) cannot exceed grand total (%).', v_paid_amount, v_grand_total;
    END IF;

    IF v_paid_amount >= v_grand_total AND v_grand_total > 0 THEN
        v_paid_amount := v_grand_total;
        v_balance_amount := 0;
        v_status := 'Paid';
    ELSIF v_paid_amount > 0 THEN
        v_balance_amount := ROUND(v_grand_total - v_paid_amount, 2);
        v_status := 'Partially Paid';
    ELSE
        v_paid_amount := 0;
        v_balance_amount := v_grand_total;
        v_status := 'Issued';
    END IF;

    -- Customer & Date metadata
    v_customer_name := COALESCE(p_payload->>'customer_name', 'Customer');
    v_customer_phone := COALESCE(p_payload->>'customer_phone', '');
    v_customer_whatsapp := COALESCE(p_payload->>'customer_whatsapp', '');
    v_customer_email := COALESCE(p_payload->>'customer_email', '');
    v_customer_address := COALESCE(p_payload->>'customer_address', '');
    v_customer_gstin := COALESCE(p_payload->>'customer_gstin', '');
    
    IF p_payload->>'customer_id' IS NOT NULL AND p_payload->>'customer_id' <> '' THEN
        BEGIN
            v_customer_id := (p_payload->>'customer_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_customer_id := NULL;
        END;
    END IF;

    IF p_payload->>'quotation_id' IS NOT NULL AND p_payload->>'quotation_id' <> '' THEN
        BEGIN
            v_quotation_id := (p_payload->>'quotation_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_quotation_id := NULL;
        END;
    END IF;

    v_date := COALESCE((p_payload->>'date')::DATE, CURRENT_DATE);
    v_due_date := COALESCE((p_payload->>'due_date')::DATE, v_date + 15);
    v_payment_mode := COALESCE(p_payload->>'payment_mode', 'Cash');
    v_payment_ref := p_payload->>'payment_reference';
    v_payment_notes := p_payload->>'payment_notes';
    v_payment_date := COALESCE((p_payload->>'payment_date')::DATE, v_date);

    -- Invoice Number Sequence Generation
    v_invoice_number := p_payload->>'invoice_number';
    IF v_invoice_number IS NULL OR v_invoice_number = '' OR v_invoice_number = 'INV-DRAFT' THEN
        SELECT COUNT(*) + 1 INTO v_p_count FROM public.invoices WHERE workspace_id = v_workspace_id;
        v_invoice_number := 'INV-' || TO_CHAR(v_date, 'YYYY') || '-' || LPAD(v_p_count::TEXT, 4, '0');
    END IF;

    -- 1. Validate Stock for Line Items
    v_items := p_payload->'items';
    IF v_items IS NOT NULL AND jsonb_array_length(v_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
            IF v_item->>'productId' IS NOT NULL AND v_item->>'productId' <> '' AND COALESCE(v_item->>'itemType', 'product') = 'product' THEN
                BEGIN
                    v_product_id := (v_item->>'productId')::UUID;
                    v_req_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);

                    SELECT current_stock INTO v_current_stock 
                    FROM public.products 
                    WHERE id = v_product_id AND workspace_id = v_workspace_id
                    FOR UPDATE;

                    IF v_current_stock IS NOT NULL AND v_current_stock < v_req_qty THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for product "%" (Requested: %, Available: %)', 
                            COALESCE(v_item->>'productName', 'Product'), v_req_qty, v_current_stock;
                    END IF;
                EXCEPTION 
                    WHEN SQLSTATE 'P0001' THEN RAISE;
                    WHEN OTHERS THEN NULL;
                END;
            END IF;
        END LOOP;
    END IF;

    -- 2. Insert or Update Parent Invoice
    INSERT INTO public.invoices (
        id, workspace_id, branch_id, quotation_id, customer_id, invoice_number,
        customer_name, customer_phone, customer_whatsapp, customer_email,
        customer_address, customer_gstin, date, due_date, status,
        subtotal, discount_total, tax_total, grand_total, paid_amount, balance_amount,
        payment_mode, payment_reference, payment_notes, payment_method,
        notes, terms, footer_text, template_id, branding, theme, customization, snapshot,
        is_stock_finalized, is_snapshot_finalized, created_at, updated_at
    ) VALUES (
        v_invoice_id, v_workspace_id, v_branch_id, v_quotation_id, v_customer_id, v_invoice_number,
        v_customer_name, v_customer_phone, v_customer_whatsapp, v_customer_email,
        v_customer_address, v_customer_gstin, v_date, v_due_date, v_status,
        v_subtotal, v_discount_total, v_tax_total, v_grand_total, v_paid_amount, v_balance_amount,
        v_payment_mode, v_payment_ref, v_payment_notes, v_payment_mode,
        p_payload->>'notes', p_payload->>'terms', p_payload->>'footer_text',
        COALESCE(p_payload->>'template_id', 'inv-modern-blue'),
        p_payload->'branding', p_payload->'theme', p_payload->'customization', p_payload->'snapshot',
        true, true, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        branch_id = COALESCE(EXCLUDED.branch_id, invoices.branch_id),
        status = EXCLUDED.status,
        subtotal = EXCLUDED.subtotal,
        discount_total = EXCLUDED.discount_total,
        tax_total = EXCLUDED.tax_total,
        grand_total = EXCLUDED.grand_total,
        paid_amount = EXCLUDED.paid_amount,
        balance_amount = EXCLUDED.balance_amount,
        payment_mode = EXCLUDED.payment_mode,
        payment_method = EXCLUDED.payment_method,
        updated_at = NOW();

    -- 3. Insert Child Invoice Items & Deduct Stock
    IF v_items IS NOT NULL AND jsonb_array_length(v_items) > 0 THEN
        -- Clean existing items if this was an update
        DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
            v_item_idx := v_item_idx + 1;
            v_product_id := NULL;
            IF v_item->>'productId' IS NOT NULL AND v_item->>'productId' <> '' THEN
                BEGIN v_product_id := (v_item->>'productId')::UUID; EXCEPTION WHEN OTHERS THEN v_product_id := NULL; END;
            END IF;

            v_req_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);
            v_item_rate := COALESCE((v_item->>'sellingPrice')::NUMERIC, (v_item->>'rate')::NUMERIC, 0);
            v_item_tax_pct := COALESCE((v_item->>'taxPercent')::NUMERIC, 0);
            v_item_tax_amt := COALESCE((v_item->>'taxAmount')::NUMERIC, 0);
            v_item_disc_amt := COALESCE((v_item->>'discountAmount')::NUMERIC, 0);
            v_item_total := COALESCE((v_item->>'total')::NUMERIC, v_req_qty * v_item_rate);

            INSERT INTO public.invoice_items (
                id, workspace_id, branch_id, invoice_id, product_id,
                product_name, sku, part_number, unit, quantity,
                buy_price, selling_price, rate, price,
                discount_amount, tax_percent, tax_amount, total,
                item_type, description, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), v_workspace_id, v_branch_id, v_invoice_id, v_product_id,
                COALESCE(v_item->>'productName', v_item->>'name', 'Product Item'),
                COALESCE(v_item->>'sku', ''),
                v_item->>'partNumber',
                COALESCE(v_item->>'unit', 'Pcs'),
                v_req_qty,
                COALESCE((v_item->>'buyPrice')::NUMERIC, 0),
                v_item_rate, v_item_rate, v_item_rate,
                v_item_disc_amt, v_item_tax_pct, v_item_tax_amt, v_item_total,
                COALESCE(v_item->>'itemType', 'product'),
                v_item->>'description',
                NOW(), NOW()
            );

            -- Deduct stock if linked to a valid catalog product
            IF v_product_id IS NOT NULL THEN
                UPDATE public.products
                SET current_stock = GREATEST(0, current_stock - v_req_qty),
                    updated_at = NOW()
                WHERE id = v_product_id AND workspace_id = v_workspace_id;

                INSERT INTO public.stock_movements (
                    id, workspace_id, branch_id, product_id,
                    type, quantity, unit, reference_type, reference_id,
                    notes, created_at
                ) VALUES (
                    gen_random_uuid(), v_workspace_id, v_branch_id, v_product_id,
                    'OUT', v_req_qty, COALESCE(v_item->>'unit', 'Pcs'), 'INVOICE', v_invoice_id::TEXT,
                    'Authoritative deduction for Invoice #' || v_invoice_number, NOW()
                );
            END IF;
        END LOOP;
    END IF;

    -- 4. Insert Upfront Payment into public.payments (if paid_amount > 0)
    IF v_paid_amount > 0 THEN
        v_payment_id := gen_random_uuid();
        SELECT COUNT(*) + 1 INTO v_p_count FROM public.payments WHERE workspace_id = v_workspace_id;
        v_payment_number := 'PAY-' || TO_CHAR(v_payment_date, 'YYYY') || '-' || LPAD(v_p_count::TEXT, 4, '0');

        INSERT INTO public.payments (
            id, workspace_id, branch_id, invoice_id, invoice_number,
            customer_id, customer_name, amount, cash_amount, upi_amount,
            payment_date, method, payment_method, payment_mode,
            reference_no, reference_number, notes, created_at, updated_at
        ) VALUES (
            v_payment_id, v_workspace_id, v_branch_id, v_invoice_id, v_invoice_number,
            v_customer_id, v_customer_name, v_paid_amount,
            CASE WHEN v_payment_mode ILIKE '%cash%' THEN v_paid_amount ELSE 0 END,
            CASE WHEN v_payment_mode ILIKE '%cash%' THEN 0 ELSE v_paid_amount END,
            v_payment_date, v_payment_mode, v_payment_mode, v_payment_mode,
            v_payment_ref, v_payment_ref,
            COALESCE(v_payment_notes, 'Initial payment recorded at invoice finalization #' || v_invoice_number),
            NOW(), NOW()
        );
    END IF;

    -- 5. Synchronize Udhari Ledger (if balance_amount > 0)
    IF v_balance_amount > 0 THEN
        INSERT INTO public.udhari_records (
            id, workspace_id, branch_id, customer_id, invoice_id,
            original_amount, total_received, outstanding_amount,
            status, due_date, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_branch_id, v_customer_id, v_invoice_id,
            v_grand_total, v_paid_amount, v_balance_amount,
            CASE WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'PENDING' END,
            v_due_date, NOW(), NOW()
        )
        ON CONFLICT (invoice_id) DO UPDATE SET
            original_amount = EXCLUDED.original_amount,
            total_received = EXCLUDED.total_received,
            outstanding_amount = EXCLUDED.outstanding_amount,
            status = EXCLUDED.status,
            updated_at = NOW();
    ELSE
        -- Mark existing udhari as paid if balance is 0
        UPDATE public.udhari_records
        SET total_received = v_grand_total,
            outstanding_amount = 0,
            status = 'PAID',
            updated_at = NOW()
        WHERE invoice_id = v_invoice_id AND workspace_id = v_workspace_id;
    END IF;

    -- 6. Record Daybook Financial Transaction
    v_daybook_status := CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' ELSE (CASE WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END) END;
    INSERT INTO public.daybook_transactions (
        id, workspace_id, branch_id, transaction_type, direction,
        amount, total_amount, remaining_amount, payment_status, payment_mode,
        party_type, party_id, party_name, reference_type, reference_id, reference_number,
        description, transaction_date, status, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_workspace_id, v_branch_id, 'SALE', 'IN',
        v_paid_amount, v_grand_total, v_balance_amount, v_daybook_status, v_payment_mode,
        'customer', v_customer_id, v_customer_name, 'INVOICE', v_invoice_id::TEXT, v_invoice_number,
        'Invoice #' || v_invoice_number || ' - ' || v_customer_name, v_date, 'COMPLETED', NOW(), NOW()
    );

    -- 7. Update Quotation Status if converted
    IF v_quotation_id IS NOT NULL THEN
        UPDATE public.quotations
        SET status = 'Converted',
            converted_invoice_id = v_invoice_id,
            updated_at = NOW()
        WHERE id = v_quotation_id AND workspace_id = v_workspace_id;
    END IF;

    -- 8. Audit Event
    INSERT INTO public.financial_audit_logs (
        workspace_id, branch_id, event_type, record_id, record_type, amount, details
    ) VALUES (
        v_workspace_id, v_branch_id, 'INVOICE_FINALIZED', v_invoice_id::TEXT, 'INVOICE', v_grand_total,
        jsonb_build_object(
            'invoice_number', v_invoice_number,
            'customer_name', v_customer_name,
            'paid_amount', v_paid_amount,
            'balance_amount', v_balance_amount,
            'status', v_status
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'paid_amount', v_paid_amount,
        'balance_amount', v_balance_amount,
        'status', v_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.finalize_invoice_transaction(JSONB) TO authenticated, anon, service_role;

-- 8. RLS Policies for Backups
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view workspace backups" ON public.backups;
CREATE POLICY "Users can view workspace backups" ON public.backups
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Users can insert workspace backups" ON public.backups;
CREATE POLICY "Users can insert workspace backups" ON public.backups
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update workspace backups" ON public.backups;
CREATE POLICY "Users can update workspace backups" ON public.backups
    FOR UPDATE TO authenticated, anon
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete workspace backups" ON public.backups;
CREATE POLICY "Users can delete workspace backups" ON public.backups
    FOR DELETE TO authenticated, anon
    USING (true);

-- 9. RLS Policies for Financial Audit Logs
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view financial audit logs" ON public.financial_audit_logs;
CREATE POLICY "Users can view financial audit logs" ON public.financial_audit_logs
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Users can insert financial audit logs" ON public.financial_audit_logs;
CREATE POLICY "Users can insert financial audit logs" ON public.financial_audit_logs
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

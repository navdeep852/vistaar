-- ============================================================================
-- MIGRATION 035: QUOTATION -> INVOICE -> PAYMENT -> DAYBOOK/CASHBOOK PIPELINE
-- ============================================================================

-- 1. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_quotations_converted_invoice ON public.quotations(converted_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_quotation_id ON public.invoices(quotation_id);

-- 2. Atomic Quotation to Invoice Conversion RPC
CREATE OR REPLACE FUNCTION public.convert_quotation_to_invoice_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_id UUID;
    v_quotation_id UUID;
    v_quotation RECORD;
    v_invoice_id UUID;
    v_invoice_number VARCHAR(100);
    v_invoice_date DATE;
    v_due_date DATE;
    v_payment_status TEXT;
    v_paid_amount NUMERIC(12,2);
    v_balance_amount NUMERIC(12,2);
    v_payment_mode VARCHAR(50);
    v_payment_ref TEXT;
    v_payment_notes TEXT;
    v_payment_date DATE;
    v_inv_status public.invoice_status;
    v_payment_id UUID;
    v_payment_code VARCHAR(100);
    v_daybook_id UUID;
    v_item RECORD;
    v_year_str TEXT;
    v_rand_str TEXT;
    v_inv_count INT;
BEGIN
    -- 1. Resolve Workspace ID
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Workspace ID could not be resolved.';
    END IF;

    -- 2. Fetch and Lock Quotation
    v_quotation_id := (p_payload->>'quotation_id')::UUID;
    IF v_quotation_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: quotation_id is required.';
    END IF;

    SELECT * INTO v_quotation
    FROM public.quotations
    WHERE id = v_quotation_id AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF v_quotation.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Quotation with ID % does not exist in workspace.', v_quotation_id;
    END IF;

    -- Check if already converted
    IF v_quotation.status = 'Converted' OR v_quotation.converted_invoice_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Quotation is already converted.',
            'quotation_id', v_quotation_id,
            'converted_invoice_id', v_quotation.converted_invoice_id
        );
    END IF;

    -- 3. Resolve Financial Values & Payment Status
    v_payment_status := COALESCE(p_payload->>'payment_status', 'Unpaid');
    v_invoice_date := COALESCE((p_payload->>'invoice_date')::DATE, CURRENT_DATE);
    v_due_date := COALESCE((p_payload->>'due_date')::DATE, CURRENT_DATE + INTERVAL '15 days');
    v_payment_date := COALESCE((p_payload->>'payment_date')::DATE, v_invoice_date);
    v_payment_mode := COALESCE(p_payload->>'payment_mode', 'Cash');
    v_payment_ref := p_payload->>'payment_reference';
    v_payment_notes := p_payload->>'payment_notes';

    IF v_payment_status = 'Unpaid' THEN
        v_paid_amount := 0;
        v_balance_amount := v_quotation.grand_total;
        v_inv_status := 'Issued';
    ELSIF v_payment_status = 'Fully Paid' THEN
        v_paid_amount := v_quotation.grand_total;
        v_balance_amount := 0;
        v_inv_status := 'Paid';
    ELSE -- Partially Paid
        v_paid_amount := ROUND(COALESCE((p_payload->>'paid_amount')::NUMERIC, 0), 2);
        IF v_paid_amount <= 0 THEN
            RAISE EXCEPTION 'INVALID_AMOUNT: Partial payment must be greater than zero.';
        END IF;
        IF v_paid_amount > v_quotation.grand_total THEN
            RAISE EXCEPTION 'OVERPAYMENT_REJECTED: Payment amount % exceeds invoice total %.', v_paid_amount, v_quotation.grand_total;
        END IF;
        v_balance_amount := ROUND(v_quotation.grand_total - v_paid_amount, 2);
        IF v_balance_amount <= 0.01 THEN
            v_inv_status := 'Paid';
        ELSE
            v_inv_status := 'Partially Paid';
        END IF;
    END IF;

    -- 4. Generate Invoice ID and Number
    IF (p_payload->>'invoice_id') IS NOT NULL THEN
        v_invoice_id := (p_payload->>'invoice_id')::UUID;
    ELSE
        v_invoice_id := uuid_generate_v4();
    END IF;

    IF (p_payload->>'invoice_number') IS NOT NULL AND trim(p_payload->>'invoice_number') != '' THEN
        v_invoice_number := trim(p_payload->>'invoice_number');
    ELSE
        SELECT COUNT(*) + 1 INTO v_inv_count FROM public.invoices WHERE workspace_id = v_workspace_id;
        v_year_str := TO_CHAR(v_invoice_date, 'YYYY');
        v_invoice_number := 'INV-' || v_year_str || '-' || LPAD(v_inv_count::TEXT, 4, '0');
    END IF;

    -- 5. Insert Invoice
    INSERT INTO public.invoices (
        id,
        workspace_id,
        quotation_id,
        customer_id,
        invoice_number,
        customer_name,
        customer_phone,
        customer_whatsapp,
        customer_email,
        customer_address,
        customer_gstin,
        status,
        date,
        due_date,
        subtotal,
        discount_total,
        tax_total,
        grand_total,
        paid_amount,
        balance_amount,
        notes,
        terms,
        footer_text,
        template_id,
        branding,
        theme,
        customization,
        snapshot,
        is_snapshot_finalized,
        created_at,
        updated_at
    ) VALUES (
        v_invoice_id,
        v_workspace_id,
        v_quotation_id,
        v_quotation.customer_id,
        v_invoice_number,
        v_quotation.customer_name,
        v_quotation.customer_phone,
        v_quotation.customer_whatsapp,
        v_quotation.customer_email,
        v_quotation.customer_address,
        v_quotation.customer_gstin,
        v_inv_status,
        v_invoice_date,
        v_due_date,
        v_quotation.subtotal,
        v_quotation.discount_total,
        v_quotation.tax_total,
        v_quotation.grand_total,
        v_paid_amount,
        v_balance_amount,
        v_quotation.notes,
        v_quotation.terms,
        v_quotation.footer_text,
        REPLACE(v_quotation.template_id, 'qt-', 'inv-'),
        v_quotation.branding,
        v_quotation.theme,
        v_quotation.customization,
        v_quotation.snapshot,
        TRUE,
        NOW(),
        NOW()
    );

    -- 6. Copy Quotation Items to Invoice Items
    FOR v_item IN
        SELECT * FROM public.quotation_items
        WHERE quotation_id = v_quotation_id AND workspace_id = v_workspace_id
    LOOP
        INSERT INTO public.invoice_items (
            id,
            workspace_id,
            invoice_id,
            product_id,
            product_name,
            sku,
            unit,
            quantity,
            buy_price,
            selling_price,
            discount_amount,
            tax_percent,
            tax_amount,
            total
        ) VALUES (
            uuid_generate_v4(),
            v_workspace_id,
            v_invoice_id,
            v_item.product_id,
            v_item.product_name,
            v_item.sku,
            COALESCE(v_item.unit, 'Pcs'),
            v_item.quantity,
            v_item.buy_price,
            v_item.selling_price,
            v_item.discount_amount,
            v_item.tax_percent,
            v_item.tax_amount,
            v_item.total
        );
    END LOOP;

    -- 7. Update Quotation Status to Converted
    UPDATE public.quotations
    SET status = 'Converted',
        converted_invoice_id = v_invoice_id,
        updated_at = NOW()
    WHERE id = v_quotation_id AND workspace_id = v_workspace_id;

    -- 8. Post Daybook Sale Transaction
    v_daybook_id := uuid_generate_v4();
    INSERT INTO public.daybook_transactions (
        id,
        workspace_id,
        transaction_code,
        transaction_date,
        transaction_type,
        direction,
        amount,
        total_amount,
        remaining_amount,
        payment_status,
        payment_mode,
        party_type,
        party_id,
        party_name,
        reference_type,
        reference_id,
        reference_number,
        description,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_daybook_id,
        v_workspace_id,
        'ACC-' || v_invoice_number,
        v_invoice_date,
        'SALE',
        'IN',
        v_paid_amount, -- Inflow = actual cash received
        v_quotation.grand_total, -- Gross Sale Total
        v_balance_amount,
        CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
        CASE WHEN v_paid_amount > 0 THEN v_payment_mode ELSE 'Cash' END,
        'customer',
        v_quotation.customer_id,
        v_quotation.customer_name,
        'INVOICE',
        v_invoice_id::TEXT,
        v_invoice_number,
        'Invoice #' || v_invoice_number || ' (Converted from Quotation #' || v_quotation.quotation_number || ')',
        'COMPLETED',
        NOW(),
        NOW()
    )
    ON CONFLICT (workspace_id, reference_type, reference_id)
    DO UPDATE SET
        amount = EXCLUDED.amount,
        total_amount = EXCLUDED.total_amount,
        remaining_amount = EXCLUDED.remaining_amount,
        payment_status = EXCLUDED.payment_status,
        payment_mode = EXCLUDED.payment_mode,
        updated_at = NOW();

    -- 9. If Payment was Collected Upfront (paid_amount > 0)
    IF v_paid_amount > 0 THEN
        v_payment_id := uuid_generate_v4();
        v_rand_str := LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');
        v_payment_code := 'PAY-' || TO_CHAR(v_payment_date, 'YYYY') || '-' || v_rand_str;

        -- Insert Payment
        INSERT INTO public.payments (
            id,
            workspace_id,
            customer_id,
            customer_name,
            invoice_id,
            invoice_number,
            payment_number,
            amount,
            payment_date,
            method,
            reference_no,
            notes,
            created_at
        ) VALUES (
            v_payment_id,
            v_workspace_id,
            v_quotation.customer_id,
            v_quotation.customer_name,
            v_invoice_id,
            v_invoice_number,
            v_payment_code,
            v_paid_amount,
            v_payment_date,
            v_payment_mode,
            v_payment_ref,
            COALESCE(v_payment_notes, 'Payment collected at quotation conversion'),
            NOW()
        );

        -- Insert Cashbook Inflow (if cashbook_entries table exists)
        BEGIN
            INSERT INTO public.cashbook_entries (
                workspace_id,
                source_type,
                source_id,
                reference_number,
                direction,
                amount,
                payment_method,
                party_name,
                description,
                notes,
                transaction_date,
                created_at
            ) VALUES (
                v_workspace_id,
                'INVOICE_PAYMENT',
                v_payment_id::TEXT,
                v_invoice_number,
                'IN',
                v_paid_amount,
                v_payment_mode,
                v_quotation.customer_name,
                'Payment received for Invoice #' || v_invoice_number || ' (Quotation #' || v_quotation.quotation_number || ')',
                v_payment_notes,
                v_payment_date,
                NOW()
            );
        EXCEPTION WHEN undefined_table THEN
            NULL; -- Safely ignore if table does not exist
        END;
    END IF;

    -- 10. If Balance Remaining (balance_amount > 0), Record Udhari Receivable
    IF v_balance_amount > 0.01 THEN
        BEGIN
            INSERT INTO public.udhari_records (
                id,
                workspace_id,
                invoice_id,
                udhari_code,
                customer_id,
                customer_name_snapshot,
                phone_snapshot,
                original_amount,
                total_received,
                outstanding_amount,
                due_date,
                status,
                notes,
                created_at,
                updated_at
            ) VALUES (
                uuid_generate_v4(),
                v_workspace_id,
                v_invoice_id,
                'UD-' || v_invoice_number,
                v_quotation.customer_id,
                v_quotation.customer_name,
                COALESCE(v_quotation.customer_phone, '9999999999'),
                v_quotation.grand_total,
                v_paid_amount,
                v_balance_amount,
                v_due_date,
                CASE WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
                'Receivable from Invoice #' || v_invoice_number || ' (Quotation #' || v_quotation.quotation_number || ')',
                NOW(),
                NOW()
            )
            ON CONFLICT DO NOTHING;
        EXCEPTION WHEN undefined_table THEN
            NULL;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'quotation_id', v_quotation_id,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'paid_amount', v_paid_amount,
        'balance_amount', v_balance_amount,
        'status', v_inv_status,
        'payment_id', v_payment_id,
        'payment_code', v_payment_code
    );
END;
$$;

-- 3. Batch Reconciliation RPC for Converted Quotations
CREATE OR REPLACE FUNCTION public.reconcile_quotation_conversions(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ws_id UUID := p_workspace_id;
    v_inv RECORD;
    v_fixed_daybook INT := 0;
    v_fixed_cashbook INT := 0;
    v_fixed_udhari INT := 0;
BEGIN
    IF v_ws_id IS NULL THEN
        v_ws_id := public.current_user_workspace_id();
    END IF;

    IF v_ws_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Workspace ID required');
    END IF;

    -- Iterate over all invoices created from quotations
    FOR v_inv IN
        SELECT i.*, q.quotation_number
        FROM public.invoices i
        LEFT JOIN public.quotations q ON q.id = i.quotation_id
        WHERE i.workspace_id = v_ws_id AND i.quotation_id IS NOT NULL
    LOOP
        -- 1. Check if Daybook transaction exists
        IF NOT EXISTS (
            SELECT 1 FROM public.daybook_transactions
            WHERE workspace_id = v_ws_id
              AND reference_type = 'INVOICE'
              AND reference_id = v_inv.id::TEXT
        ) THEN
            INSERT INTO public.daybook_transactions (
                id,
                workspace_id,
                transaction_code,
                transaction_date,
                transaction_type,
                direction,
                amount,
                total_amount,
                remaining_amount,
                payment_status,
                payment_mode,
                party_type,
                party_id,
                party_name,
                reference_type,
                reference_id,
                reference_number,
                description,
                status,
                created_at,
                updated_at
            ) VALUES (
                uuid_generate_v4(),
                v_ws_id,
                'ACC-' || v_inv.invoice_number,
                v_inv.date,
                'SALE',
                'IN',
                COALESCE(v_inv.paid_amount, 0),
                v_inv.grand_total,
                COALESCE(v_inv.balance_amount, v_inv.grand_total - COALESCE(v_inv.paid_amount, 0)),
                CASE WHEN v_inv.balance_amount <= 0.01 THEN 'PAID' WHEN v_inv.paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
                'Cash',
                'customer',
                v_inv.customer_id,
                v_inv.customer_name,
                'INVOICE',
                v_inv.id::TEXT,
                v_inv.invoice_number,
                'Invoice #' || v_inv.invoice_number || ' (Quotation #' || COALESCE(v_inv.quotation_number, '') || ')',
                'COMPLETED',
                NOW(),
                NOW()
            );
            v_fixed_daybook := v_fixed_daybook + 1;
        END IF;

        -- 2. Check if Cashbook entry exists for payments
        IF COALESCE(v_inv.paid_amount, 0) > 0 THEN
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM public.cashbook_entries
                    WHERE workspace_id = v_ws_id
                      AND reference_number = v_inv.invoice_number
                ) THEN
                    INSERT INTO public.cashbook_entries (
                        workspace_id,
                        source_type,
                        source_id,
                        reference_number,
                        direction,
                        amount,
                        payment_method,
                        party_name,
                        description,
                        transaction_date,
                        created_at
                    ) VALUES (
                        v_ws_id,
                        'INVOICE_PAYMENT',
                        v_inv.id::TEXT,
                        v_inv.invoice_number,
                        'IN',
                        v_inv.paid_amount,
                        'Cash',
                        v_inv.customer_name,
                        'Payment received for Invoice #' || v_inv.invoice_number,
                        v_inv.date,
                        NOW()
                    );
                    v_fixed_cashbook := v_fixed_cashbook + 1;
                END IF;
            EXCEPTION WHEN undefined_table THEN
                NULL;
            END;
        END IF;

        -- 3. Check if Udhari exists for outstanding balance
        IF COALESCE(v_inv.balance_amount, 0) > 0.01 THEN
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM public.udhari_records
                    WHERE workspace_id = v_ws_id
                      AND (invoice_id = v_inv.id OR udhari_code = 'UD-' || v_inv.invoice_number)
                ) THEN
                    INSERT INTO public.udhari_records (
                        id,
                        workspace_id,
                        invoice_id,
                        udhari_code,
                        customer_id,
                        customer_name_snapshot,
                        phone_snapshot,
                        original_amount,
                        total_received,
                        outstanding_amount,
                        due_date,
                        status,
                        notes,
                        created_at,
                        updated_at
                    ) VALUES (
                        uuid_generate_v4(),
                        v_ws_id,
                        v_inv.id,
                        'UD-' || v_inv.invoice_number,
                        v_inv.customer_id,
                        v_inv.customer_name,
                        COALESCE(v_inv.customer_phone, '9999999999'),
                        v_inv.grand_total,
                        COALESCE(v_inv.paid_amount, 0),
                        v_inv.balance_amount,
                        v_inv.due_date,
                        CASE WHEN COALESCE(v_inv.paid_amount, 0) > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
                        'Historical receivable for Invoice #' || v_inv.invoice_number,
                        NOW(),
                        NOW()
                    );
                    v_fixed_udhari := v_fixed_udhari + 1;
                END IF;
            EXCEPTION WHEN undefined_table THEN
                NULL;
            END;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'fixed_daybook', v_fixed_daybook,
        'fixed_cashbook', v_fixed_cashbook,
        'fixed_udhari', v_fixed_udhari
    );
END;
$$;

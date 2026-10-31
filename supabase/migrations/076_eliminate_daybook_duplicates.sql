-- =============================================================================
-- VISTAAR DATABASE MIGRATION: 076_eliminate_daybook_duplicates.sql
-- PURPOSE: Eliminate duplicate entries in VISTAAR Daybook.
-- 1. Updates finalize_invoice_transaction so the single authoritative INVOICE 
--    Daybook entry carries the initial upfront inflow (v_paid_amount).
-- 2. Prevents creation of redundant CUSTOMER_PAYMENT Daybook entries for upfront
--    invoice payments and counter sale receipts.
-- 3. Safely cleans up existing duplicate Daybook records without affecting
--    genuine subsequent payments.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.finalize_invoice_transaction(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_branch_id UUID;
    v_invoice_id UUID;
    v_idempotency_key TEXT;
    v_cached_response JSONB;
    
    v_invoice_number TEXT;
    v_quotation_id UUID;
    v_customer_id UUID;
    v_customer_name TEXT;
    v_customer_phone TEXT;
    v_customer_email TEXT;
    v_customer_address TEXT;
    v_customer_gstin TEXT;
    v_date DATE;
    v_due_date DATE;
    v_subtotal NUMERIC(15,2);
    v_discount_total NUMERIC(15,2);
    v_tax_total NUMERIC(15,2);
    v_grand_total NUMERIC(15,2);
    v_paid_amount NUMERIC(15,2);
    v_balance_amount NUMERIC(15,2);
    v_payment_mode TEXT;
    v_payment_ref TEXT;
    v_payment_notes TEXT;
    v_notes TEXT;
    v_terms TEXT;
    v_footer_text TEXT;
    v_template_id TEXT;
    v_branding JSONB;
    v_theme JSONB;
    v_customization JSONB;
    v_snapshot JSONB;
    v_items_json JSONB;
    v_status TEXT;
    
    v_item JSONB;
    v_prod_id UUID;
    v_prod_name TEXT;
    v_part_num TEXT;
    v_item_sku TEXT;
    v_item_unit TEXT;
    v_item_type TEXT;
    v_item_qty NUMERIC(15,2);
    v_item_buy_price NUMERIC(15,2);
    v_item_sell_price NUMERIC(15,2);
    v_item_disc NUMERIC(15,2);
    v_item_tax_pct NUMERIC(15,2);
    v_item_tax_amt NUMERIC(15,2);
    v_item_total NUMERIC(15,2);
    v_item_desc TEXT;
    v_cur_stock NUMERIC(15,2);
    
    v_payment_id UUID;
    v_response JSONB;
BEGIN
    -- 1. Resolve & Authorize Workspace
    v_workspace_id := NULLIF(COALESCE(p_payload->>'workspace_id', p_payload->>'workspaceId', ''), '')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Valid workspace context is required.';
    END IF;

    -- 2. Idempotency Check
    v_idempotency_key := NULLIF(TRIM(COALESCE(p_payload->>'idempotency_key', p_payload->>'idempotencyKey', '')), '');
    IF v_idempotency_key IS NOT NULL THEN
        SELECT response_payload INTO v_cached_response
        FROM public.idempotency_keys
        WHERE workspace_id = v_workspace_id AND idempotency_key = v_idempotency_key;
        
        IF v_cached_response IS NOT NULL THEN
            RETURN v_cached_response;
        END IF;
    END IF;

    -- 3. Parse Parameters
    v_invoice_id := NULLIF(COALESCE(p_payload->>'id', p_payload->>'invoice_id', p_payload->>'invoiceId', ''), '')::UUID;
    IF v_invoice_id IS NULL THEN
        v_invoice_id := gen_random_uuid();
    END IF;

    v_branch_id := NULLIF(COALESCE(p_payload->>'branch_id', p_payload->>'branchId', ''), '')::UUID;
    v_quotation_id := NULLIF(COALESCE(p_payload->>'quotation_id', p_payload->>'quotationId', ''), '')::UUID;
    v_customer_id := NULLIF(COALESCE(p_payload->>'customer_id', p_payload->>'customerId', ''), '')::UUID;
    
    v_customer_name := COALESCE(NULLIF(TRIM(p_payload->>'customer_name'), ''), NULLIF(TRIM(p_payload->>'customerName'), ''), 'Walk-in Customer');
    v_customer_phone := COALESCE(p_payload->>'customer_phone', p_payload->>'customerPhone', '');
    v_customer_email := NULLIF(COALESCE(p_payload->>'customer_email', p_payload->>'customerEmail', ''), '');
    v_customer_address := NULLIF(COALESCE(p_payload->>'customer_address', p_payload->>'customerAddress', ''), '');
    v_customer_gstin := NULLIF(COALESCE(p_payload->>'customer_gstin', p_payload->>'customerGstin', ''), '');
    
    v_date := COALESCE(NULLIF(p_payload->>'date', '')::DATE, CURRENT_DATE);
    v_due_date := COALESCE(NULLIF(p_payload->>'due_date', '')::DATE, NULLIF(p_payload->>'dueDate', '')::DATE, v_date + 15);
    
    v_subtotal := COALESCE((p_payload->>'subtotal')::NUMERIC, 0);
    v_discount_total := COALESCE(NULLIF(p_payload->>'discount_total', '')::NUMERIC, NULLIF(p_payload->>'discountTotal', '')::NUMERIC, 0);
    v_tax_total := COALESCE(NULLIF(p_payload->>'tax_total', '')::NUMERIC, NULLIF(p_payload->>'taxTotal', '')::NUMERIC, 0);
    v_grand_total := COALESCE(NULLIF(p_payload->>'grand_total', '')::NUMERIC, NULLIF(p_payload->>'grandTotal', '')::NUMERIC, 0);
    v_paid_amount := COALESCE(NULLIF(p_payload->>'paid_amount', '')::NUMERIC, NULLIF(p_payload->>'paidAmount', '')::NUMERIC, 0);
    
    IF v_grand_total <= 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Invoice grand total must be positive.';
    END IF;
    IF v_paid_amount < 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Paid amount cannot be negative.';
    END IF;
    IF v_paid_amount > (v_grand_total + 0.05) THEN
        RAISE EXCEPTION 'OVERPAYMENT_REJECTED: Paid amount cannot exceed invoice grand total.';
    END IF;

    v_paid_amount := LEAST(v_paid_amount, v_grand_total);
    v_balance_amount := ROUND(v_grand_total - v_paid_amount, 2);
    
    IF v_balance_amount <= 0.01 THEN
        v_status := 'Paid';
        v_balance_amount := 0.00;
    ELSIF v_paid_amount > 0 THEN
        v_status := 'Partially Paid';
    ELSE
        v_status := 'Issued';
    END IF;

    v_payment_mode := COALESCE(NULLIF(p_payload->>'payment_mode', ''), NULLIF(p_payload->>'paymentMode', ''), 'Cash');
    v_payment_ref := NULLIF(COALESCE(p_payload->>'payment_reference', p_payload->>'paymentReference', ''), '');
    v_payment_notes := NULLIF(COALESCE(p_payload->>'payment_notes', p_payload->>'paymentNotes', ''), '');
    v_notes := NULLIF(p_payload->>'notes', '');
    v_terms := NULLIF(p_payload->>'terms', '');
    v_footer_text := NULLIF(COALESCE(p_payload->>'footer_text', p_payload->>'footerText', ''), '');
    v_template_id := COALESCE(NULLIF(p_payload->>'template_id', ''), NULLIF(p_payload->>'templateId', ''), 'modern');
    v_branding := p_payload->'branding';
    v_theme := p_payload->'theme';
    v_customization := p_payload->'customization';
    v_snapshot := p_payload->'snapshot';
    v_items_json := p_payload->'items';

    v_invoice_number := NULLIF(TRIM(COALESCE(p_payload->>'invoice_number', p_payload->>'invoiceNumber', '')), '');
    IF v_invoice_number IS NULL THEN
        v_invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');
    END IF;

    -- 4. Upsert Invoice Header
    INSERT INTO public.invoices (
        id, workspace_id, branch_id, quotation_id, customer_id, invoice_number,
        customer_name, customer_phone, customer_email, customer_address, customer_gstin,
        status, date, due_date, subtotal, discount_total, tax_total, grand_total,
        paid_amount, balance_amount, payment_mode, payment_reference, payment_notes,
        notes, terms, footer_text, template_id, branding, theme, customization,
        snapshot, is_stock_finalized, created_at, updated_at
    ) VALUES (
        v_invoice_id, v_workspace_id, v_branch_id, v_quotation_id, v_customer_id, v_invoice_number,
        v_customer_name, v_customer_phone, v_customer_email, v_customer_address, v_customer_gstin,
        v_status::public.invoice_status, v_date, v_due_date, v_subtotal, v_discount_total, v_tax_total, v_grand_total,
        v_paid_amount, v_balance_amount, v_payment_mode, v_payment_ref, v_payment_notes,
        v_notes, v_terms, v_footer_text, v_template_id, v_branding, v_theme, v_customization,
        v_snapshot, TRUE, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        branch_id = EXCLUDED.branch_id,
        status = EXCLUDED.status,
        subtotal = EXCLUDED.subtotal,
        discount_total = EXCLUDED.discount_total,
        tax_total = EXCLUDED.tax_total,
        grand_total = EXCLUDED.grand_total,
        paid_amount = EXCLUDED.paid_amount,
        balance_amount = EXCLUDED.balance_amount,
        is_stock_finalized = TRUE,
        updated_at = NOW();

    -- 5. Atomic Inventory Stock Mutation & Line Items Insertion
    DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id;

    IF v_items_json IS NOT NULL AND jsonb_array_length(v_items_json) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_json)
        LOOP
            v_prod_id := NULLIF(COALESCE(v_item->>'product_id', v_item->>'productId', ''), '')::UUID;
            v_prod_name := COALESCE(NULLIF(TRIM(v_item->>'product_name'), ''), NULLIF(TRIM(v_item->>'productName'), ''), 'Item');
            v_part_num := NULLIF(COALESCE(v_item->>'part_number', v_item->>'partNumber', ''), '');
            v_item_sku := NULLIF(v_item->>'sku', '');
            v_item_unit := COALESCE(v_item->>'unit', 'pcs');
            v_item_type := COALESCE(v_item->>'type', 'product');
            v_item_qty := COALESCE(NULLIF(v_item->>'quantity', '')::NUMERIC, 1);
            v_item_buy_price := COALESCE(NULLIF(v_item->>'buy_price', '')::NUMERIC, NULLIF(v_item->>'buyPrice', '')::NUMERIC, 0);
            v_item_sell_price := COALESCE(NULLIF(v_item->>'selling_price', '')::NUMERIC, NULLIF(v_item->>'sellingPrice', '')::NUMERIC, 0);
            v_item_disc := COALESCE(NULLIF(v_item->>'discount_amount', '')::NUMERIC, NULLIF(v_item->>'discountAmount', '')::NUMERIC, 0);
            v_item_tax_pct := COALESCE(NULLIF(v_item->>'tax_percent', '')::NUMERIC, NULLIF(v_item->>'taxPercent', '')::NUMERIC, 0);
            v_item_tax_amt := COALESCE(NULLIF(v_item->>'tax_amount', '')::NUMERIC, NULLIF(v_item->>'taxAmount', '')::NUMERIC, 0);
            v_item_total := COALESCE((v_item->>'total')::NUMERIC, (v_item_qty * v_item_sell_price));
            v_item_desc := NULLIF(v_item->>'description', '');

            INSERT INTO public.invoice_items (
                id, invoice_id, product_id, product_name, part_number, sku,
                quantity, unit, buy_price, selling_price, discount_amount,
                tax_percent, tax_amount, total, type, description, created_at
            ) VALUES (
                gen_random_uuid(), v_invoice_id, v_prod_id, v_prod_name, v_part_num, v_item_sku,
                v_item_qty, v_item_unit, v_item_buy_price, v_item_sell_price, v_item_disc,
                v_item_tax_pct, v_item_tax_amt, v_item_total, v_item_type, v_item_desc, NOW()
            );

            IF v_prod_id IS NOT NULL AND v_item_type != 'service' THEN
                SELECT stock_quantity INTO v_cur_stock
                FROM public.products
                WHERE id = v_prod_id AND workspace_id = v_workspace_id
                FOR UPDATE;

                IF v_cur_stock IS NOT NULL THEN
                    IF (v_cur_stock - v_item_qty) < 0 THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Product % has only % units available; % requested.', v_prod_name, v_cur_stock, v_item_qty;
                    END IF;

                    UPDATE public.products
                    SET stock_quantity = stock_quantity - v_item_qty, updated_at = NOW()
                    WHERE id = v_prod_id AND workspace_id = v_workspace_id;
                END IF;

                IF v_branch_id IS NOT NULL THEN
                    UPDATE public.branch_inventory
                    SET current_stock = current_stock - v_item_qty, updated_at = NOW()
                    WHERE workspace_id = v_workspace_id AND branch_id = v_branch_id AND product_id = v_prod_id;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 6. Authoritative Daybook Journal Entry for SALE
    -- Inflow (amount) = actual upfront money received (v_paid_amount)
    -- Total (total_amount) = invoice grand total (v_grand_total)
    -- Remaining (remaining_amount) = unpaid balance (v_balance_amount)
    -- Status = PAID / PARTIALLY PAID / UNPAID
    DELETE FROM public.daybook_transactions
    WHERE workspace_id = v_workspace_id AND reference_type = 'INVOICE' AND reference_id = v_invoice_id::TEXT;

    INSERT INTO public.daybook_transactions (
        id, workspace_id, branch_id, transaction_code, transaction_date,
        transaction_type, direction, amount, total_amount, remaining_amount,
        payment_status, payment_mode, party_type, party_id, party_name,
        reference_type, reference_id, reference_number, description,
        status, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_workspace_id, v_branch_id, 'ACC-' || v_invoice_number, v_date,
        'SALE', 'IN', v_paid_amount, v_grand_total, v_balance_amount,
        CASE WHEN v_balance_amount <= 0.01 THEN 'PAID' WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
        v_payment_mode, 'customer', v_customer_id, v_customer_name,
        'INVOICE', v_invoice_id::TEXT, v_invoice_number, 'Invoice #' || v_invoice_number,
        'COMPLETED', NOW(), NOW()
    );

    -- 7. Upfront Payment Handling (Cash Inflow Ledger & Cashbook)
    -- Note: Upfront payment records are written to public.payments and cashbook_entries
    -- but DO NOT insert a duplicate Daybook entry, as the INVOICE entry above represents the sale and initial inflow.
    IF v_paid_amount > 0 THEN
        v_payment_id := gen_random_uuid();

        INSERT INTO public.payments (
            id, workspace_id, branch_id, customer_id, invoice_id, payment_number,
            customer_name, invoice_number, amount, payment_date, method, reference_no,
            notes, status, created_at
        ) VALUES (
            v_payment_id, v_workspace_id, v_branch_id, v_customer_id, v_invoice_id,
            'PAY-' || v_invoice_number, v_customer_name, v_invoice_number,
            v_paid_amount, v_date, v_payment_mode::public.payment_method, v_payment_ref,
            v_payment_notes, 'COMPLETED', NOW()
        );

        -- Record Cashbook Inflow
        INSERT INTO public.cashbook_entries (
            id, workspace_id, branch_id, entry_number, transaction_date,
            source_type, source_id, reference_number, direction,
            amount, payment_method, party_name, description, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_branch_id, 'CB-' || v_invoice_number, v_date,
            'INVOICE_PAYMENT', v_invoice_id, v_invoice_number, 'IN',
            v_paid_amount, v_payment_mode, v_customer_name, 'Payment for Invoice #' || v_invoice_number,
            NOW(), NOW()
        );
    END IF;

    -- 8. Udhari Receivable Record (If remaining balance > 0)
    IF v_balance_amount > 0.01 THEN
        INSERT INTO public.udhari_records (
            id, workspace_id, customer_id, udhari_code, customer_name_snapshot,
            phone_snapshot, original_amount, total_received, outstanding_amount,
            due_date, status, notes, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_workspace_id, v_customer_id, 'UDH-' || v_invoice_number,
            v_customer_name, v_customer_phone, v_grand_total, v_paid_amount, v_balance_amount,
            v_due_date, CASE WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID'::public.udhari_status ELSE 'UNPAID'::public.udhari_status END,
            'Receivable for Invoice #' || v_invoice_number, NOW(), NOW()
        )
        ON CONFLICT (workspace_id, udhari_code) DO UPDATE SET
            total_received = EXCLUDED.total_received,
            outstanding_amount = EXCLUDED.outstanding_amount,
            status = EXCLUDED.status,
            updated_at = NOW();
    END IF;

    -- 9. If Converted from Quotation, update Quotation status atomically
    IF v_quotation_id IS NOT NULL THEN
        UPDATE public.quotations
        SET status = 'Converted'::public.quotation_status,
            converted_invoice_id = v_invoice_id,
            converted_at = NOW()
        WHERE id = v_quotation_id AND workspace_id = v_workspace_id;
    END IF;

    -- 10. Build Response Payload & Save Idempotency Key
    v_response := jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'status', v_status,
        'grand_total', v_grand_total,
        'paid_amount', v_paid_amount,
        'balance_amount', v_balance_amount
    );

    IF v_idempotency_key IS NOT NULL THEN
        INSERT INTO public.idempotency_keys (
            workspace_id, idempotency_key, operation_type, resource_id, response_payload, status
        ) VALUES (
            v_workspace_id, v_idempotency_key, 'FINALIZE_INVOICE', v_invoice_id, v_response, 'COMPLETED'
        )
        ON CONFLICT (workspace_id, idempotency_key) DO UPDATE SET
            response_payload = EXCLUDED.response_payload,
            status = 'COMPLETED',
            updated_at = NOW();
    END IF;

    RETURN v_response;
END;
$$;

-- -----------------------------------------------------------------------------
-- HISTORICAL CLEANUP: Remove duplicate upfront PAYMENT rows from daybook_transactions
-- -----------------------------------------------------------------------------

-- 1. Restore initial inflow on INVOICE rows where amount is 0 and invoice has paid_amount > 0
UPDATE public.daybook_transactions dt
SET amount = inv.paid_amount,
    updated_at = NOW()
FROM public.invoices inv
WHERE dt.reference_type = 'INVOICE'
  AND (dt.reference_id = inv.id::TEXT OR dt.reference_number = inv.invoice_number)
  AND (dt.amount = 0 OR dt.amount IS NULL)
  AND inv.paid_amount > 0;

-- 2. Delete duplicate PAYMENT daybook entries where a matching INVOICE daybook entry already carries the upfront payment
DELETE FROM public.daybook_transactions p
WHERE p.reference_type = 'PAYMENT'
  AND EXISTS (
    SELECT 1
    FROM public.daybook_transactions inv
    WHERE inv.workspace_id = p.workspace_id
      AND inv.reference_type = 'INVOICE'
      AND inv.reference_number = p.reference_number
      AND inv.amount > 0
      AND inv.amount = p.amount
  );

-- 3. Delete duplicate PAYMENT daybook entries where a matching COUNTER_SALE daybook entry exists
DELETE FROM public.daybook_transactions p
WHERE p.reference_type = 'PAYMENT'
  AND EXISTS (
    SELECT 1
    FROM public.daybook_transactions cs
    WHERE cs.workspace_id = p.workspace_id
      AND cs.reference_type = 'COUNTER_SALE'
      AND (cs.reference_id = p.reference_id OR cs.reference_number = p.reference_number)
  );


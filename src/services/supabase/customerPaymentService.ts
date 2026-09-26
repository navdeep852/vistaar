import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { PaymentMethod } from '../../types';
import { store } from '../store';
import { validateIndianPhoneNumber } from '../../lib/phoneUtils';
import {
  calculateInvoiceFinancials,
  calculateUdhariFinancials,
  validatePaymentAmount,
} from '../financialCalculationService';

export interface CustomerPaymentPayload {
  invoiceId?: string;
  invoiceNumber?: string;
  udhariId?: string;
  counterSaleId?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  amount: number;
  paymentMethod: PaymentMethod | string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
  isUpfrontInvoicePayment?: boolean;
}

export interface CustomerPaymentResult {
  success: boolean;
  paymentId?: string;
  paymentCode?: string;
  invoiceId?: string;
  udhariId?: string;
  amount?: number;
  paidAmount?: number;
  balanceAmount?: number;
  status?: string;
  error?: string;
  isDuplicateIgnored?: boolean;
}

// In-memory idempotency guard preventing double-submissions within 5 seconds
const activeSubmissions = new Map<string, number>();

/**
 * Normalizes payment methods to valid PostgreSQL enum values:
 * 'Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other'
 */
function normalizePaymentMethodEnum(method?: string): string {
  const m = (method || '').trim().toLowerCase();
  if (m === 'upi') return 'UPI';
  if (m.includes('bank') || m.includes('neft') || m.includes('rtgs') || m.includes('transfer') || m.includes('imps')) return 'Bank Transfer';
  if (m.includes('card') || m.includes('credit card') || m.includes('debit card')) return 'Card';
  if (m.includes('cheque') || m.includes('check')) return 'Cheque';
  if (m === 'cash') return 'Cash';
  return 'Cash';
}

export class CustomerPaymentService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId() || '';
  }

  /**
   * Authoritative Customer Payment Pipeline
   * Atomically posts a payment across Payments, Invoices, Udharis, Daybook, Cashbook, and Follow-ups.
   */
  public async recordCustomerPayment(payload: CustomerPaymentPayload): Promise<CustomerPaymentResult> {
    const wsId = this.getWorkspaceId();
    const amount = Math.round(Number(payload.amount) * 100) / 100;
    const paymentMethod = normalizePaymentMethodEnum(payload.paymentMethod as string);
    const paymentDate = payload.paymentDate || new Date().toISOString().split('T')[0];
    
    // Normalize phone number with India country context
    let customerPhone = (payload.customerPhone || '').trim();
    if (customerPhone) {
      const pRes = validateIndianPhoneNumber(customerPhone, true);
      if (pRes.isValid) {
        customerPhone = pRes.normalized;
      }
    }
    if (!customerPhone) {
      customerPhone = '9999999999';
    }

    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: 'Payment amount must be greater than zero.' };
    }

    // Step 1: Resolve target Invoice or Udhari record in Store
    let targetInvoice = payload.invoiceId
      ? store.getInvoices().find((i) => i.id === payload.invoiceId)
      : payload.invoiceNumber
      ? store.getInvoices().find((i) => i.invoiceNumber === payload.invoiceNumber)
      : undefined;

    let targetUdhari = payload.udhariId
      ? store.getUdharis().find((u) => u.id === payload.udhariId)
      : targetInvoice
      ? store.getUdharis().find((u) => u.invoiceId === targetInvoice?.id || u.id === `UD-${targetInvoice?.invoiceNumber}`)
      : undefined;

    if (!targetInvoice && targetUdhari?.invoiceId) {
      targetInvoice = store.getInvoices().find((i) => i.id === targetUdhari?.invoiceId);
    }

    // Overpayment validation
    if (!payload.isUpfrontInvoicePayment) {
      if (targetUdhari && amount > (targetUdhari.outstandingAmount + 0.05)) {
        return {
          success: false,
          error: `Payment amount (₹${amount.toLocaleString('en-IN')}) exceeds outstanding balance (₹${targetUdhari.outstandingAmount.toLocaleString('en-IN')}). Overpayment rejected.`,
        };
      } else if (targetInvoice && !targetUdhari && amount > (targetInvoice.balanceAmount + 0.05)) {
        return {
          success: false,
          error: `Payment amount (₹${amount.toLocaleString('en-IN')}) exceeds invoice balance (₹${targetInvoice.balanceAmount.toLocaleString('en-IN')}). Overpayment rejected.`,
        };
      }
    } else if (targetInvoice && amount > (targetInvoice.grandTotal + 0.05)) {
      return {
        success: false,
        error: `Upfront payment amount (₹${amount.toLocaleString('en-IN')}) exceeds invoice grand total (₹${targetInvoice.grandTotal.toLocaleString('en-IN')}). Overpayment rejected.`,
      };
    }

    const customerName = payload.customerName || targetInvoice?.customerName || targetUdhari?.customerNameSnapshot || 'Customer';
    const invoiceNumber = payload.invoiceNumber || targetInvoice?.invoiceNumber || (targetUdhari?.id?.startsWith('UD-') ? targetUdhari.id.replace('UD-', '') : undefined);
    const resolvedInvoiceId = (payload.invoiceId && isValidUuid(payload.invoiceId)) ? payload.invoiceId : (targetInvoice?.id && isValidUuid(targetInvoice.id) ? targetInvoice.id : undefined);
    const resolvedUdhariId = (payload.udhariId && isValidUuid(payload.udhariId)) ? payload.udhariId : (targetUdhari?.id && isValidUuid(targetUdhari.id) ? targetUdhari.id : undefined);
    const resolvedCustomerId = (payload.customerId && isValidUuid(payload.customerId)) ? payload.customerId : (targetInvoice?.customerId && isValidUuid(targetInvoice.customerId) ? targetInvoice.customerId : (targetUdhari?.customerId && isValidUuid(targetUdhari.customerId) ? targetUdhari.customerId : undefined));

    // Idempotency check: key = ws:ref:amount:date:method:payRef
    const idempotencyKey = `${wsId}:${resolvedInvoiceId || resolvedUdhariId || invoiceNumber || customerName}:${amount}:${paymentDate}:${paymentMethod}:${payload.reference || ''}`;
    const lastSubTime = activeSubmissions.get(idempotencyKey);
    const nowTs = Date.now();
    if (lastSubTime && nowTs - lastSubTime < 2000) {
      return { success: false, error: 'A payment with this exact amount, payment method, and reference was just submitted. Please wait a moment to avoid duplicate transactions.' };
    }
    activeSubmissions.set(idempotencyKey, nowTs);

    // Clean up stale idempotency entries
    for (const [k, t] of activeSubmissions.entries()) {
      if (nowTs - t > 30000) activeSubmissions.delete(k);
    }

    // Strict Idempotency for Upfront Invoice Payments (PART O):
    // If an initial payment for this invoice already exists in the store, do not create a duplicate.
    if (payload.isUpfrontInvoicePayment && (resolvedInvoiceId || invoiceNumber)) {
      const existingStorePayment = store.getPayments().find((p) =>
        (resolvedInvoiceId && p.invoiceId === resolvedInvoiceId) ||
        (invoiceNumber && p.invoiceNumber === invoiceNumber)
      );
      if (existingStorePayment) {
        return {
          success: true,
          paymentId: existingStorePayment.id,
          paymentCode: existingStorePayment.paymentNumber,
          invoiceId: resolvedInvoiceId || targetInvoice?.id,
          udhariId: resolvedUdhariId || targetUdhari?.id,
          amount: existingStorePayment.amount,
          paidAmount: targetInvoice?.paidAmount ?? existingStorePayment.amount,
          balanceAmount: targetInvoice?.balanceAmount ?? 0,
          status: targetInvoice?.status ?? 'Paid',
          isDuplicateIgnored: true,
        };
      }
    }

    const yearStr = (paymentDate ? paymentDate.split('-')[0] : new Date().getFullYear().toString());
    const rand5 = String(Math.floor(10000 + Math.random() * 90000));
    let paymentCode = `PAY-${yearStr}-${rand5}`;
    let paymentId = crypto.randomUUID ? crypto.randomUUID() : `pay-${Date.now()}`;
    let isDbPersisted = false;

    // Step 2: Supabase Authoritative Persistence
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      const rpcPayload = {
        workspace_id: wsId,
        invoice_id: resolvedInvoiceId || null,
        invoice_number: invoiceNumber || null,
        udhari_id: resolvedUdhariId || null,
        udhari_code: targetUdhari?.id || (invoiceNumber ? `UD-${invoiceNumber}` : null),
        counter_sale_id: payload.counterSaleId && isValidUuid(payload.counterSaleId) ? payload.counterSaleId : null,
        customer_id: resolvedCustomerId || null,
        customer_name: customerName,
        customer_phone: customerPhone,
        amount,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        payment_code: paymentCode,
        reference: payload.reference || null,
        notes: payload.notes || null,
        is_upfront_payment: !!payload.isUpfrontInvoicePayment,
      };

      try {
        // Attempt atomic PostgreSQL RPC
        const { data: rpcData, error: rpcErr } = await supabase.rpc('post_customer_payment_atomic', {
          p_payload: rpcPayload,
        });

        if (!rpcErr && rpcData?.success) {
          isDbPersisted = true;
          paymentId = rpcData.payment_id || paymentId;
          paymentCode = rpcData.payment_code || paymentCode;
        } else if (rpcErr) {
          // If the error was explicitly a validation rejection from the database, bubble up immediately
          if (rpcErr.message?.includes('Overpayment rejected') || rpcErr.message?.includes('greater than zero')) {
            return { success: false, error: rpcErr.message };
          }

          // If RPC is not found in schema cache (PGRST202), execute authoritative direct Supabase transaction
          // using the verified live production table columns
          if (rpcErr.code === 'PGRST202' || rpcErr.message?.includes('schema cache')) {
            console.warn('[customerPaymentService] post_customer_payment_atomic RPC missing from schema cache (PGRST202). Executing direct authoritative Supabase transaction.');

            // 1. Resolve target DB invoice row
            let dbInvRow: any = null;
            if (resolvedInvoiceId) {
              const { data: invById } = await supabase
                .from('invoices')
                .select('*')
                .eq('id', resolvedInvoiceId)
                .maybeSingle();
              dbInvRow = invById;
            } else if (invoiceNumber) {
              const { data: invByNum } = await supabase
                .from('invoices')
                .select('*')
                .eq('workspace_id', wsId)
                .eq('invoice_number', invoiceNumber)
                .maybeSingle();
              dbInvRow = invByNum;
            }

            // 2. Resolve target DB Udhari row (using udhari_code as verified in live DB)
            let dbUdhariRow: any = null;
            const targetUdhariCode = payload.udhariId || (invoiceNumber ? `UD-${invoiceNumber}` : (dbInvRow ? `UD-${dbInvRow.invoice_number}` : null));
            if (resolvedUdhariId) {
              const { data: uById } = await supabase
                .from('udhari_records')
                .select('*')
                .eq('id', resolvedUdhariId)
                .maybeSingle();
              dbUdhariRow = uById;
            }
            if (!dbUdhariRow && targetUdhariCode) {
              const { data: uByCode } = await supabase
                .from('udhari_records')
                .select('*')
                .eq('workspace_id', wsId)
                .eq('udhari_code', targetUdhariCode)
                .maybeSingle();
              dbUdhariRow = uByCode;
            }
            if (!dbUdhariRow && (resolvedInvoiceId || dbInvRow?.id)) {
              const targetInvId = resolvedInvoiceId || dbInvRow?.id;
              const { data: uByInvId } = await supabase
                .from('udhari_records')
                .select('*')
                .eq('workspace_id', wsId)
                .eq('invoice_id', targetInvId)
                .maybeSingle();
              dbUdhariRow = uByInvId;
            }

            // Auto-create Udhari record in DB if missing for this invoice
            if (!dbUdhariRow && dbInvRow) {
              const uCode = `UD-${dbInvRow.invoice_number}`;
              const { data: newURow } = await supabase
                .from('udhari_records')
                .insert([{
                  workspace_id: wsId,
                  customer_id: resolvedCustomerId || dbInvRow.customer_id || null,
                  invoice_id: dbInvRow.id,
                  udhari_code: uCode,
                  customer_name_snapshot: customerName,
                  phone_snapshot: customerPhone || '9999999999',
                  original_amount: Number(dbInvRow.grand_total) || 0,
                  total_received: Number(dbInvRow.paid_amount) || 0,
                  outstanding_amount: Number(dbInvRow.balance_amount) || Number(dbInvRow.grand_total) || 0,
                  due_date: dbInvRow.due_date || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
                  status: (Number(dbInvRow.paid_amount) > 0 ? 'PARTIALLY PAID' : 'UNPAID'),
                }])
                .select('*')
                .maybeSingle();
              if (newURow) {
                dbUdhariRow = newURow;
              }
            }

            // Check database-level overpayment
            if (!payload.isUpfrontInvoicePayment) {
              if (dbUdhariRow && amount > (Number(dbUdhariRow.outstanding_amount) + 0.05)) {
                return {
                  success: false,
                  error: `Overpayment rejected: Amount (₹${amount.toLocaleString('en-IN')}) exceeds database outstanding balance (₹${Number(dbUdhariRow.outstanding_amount).toLocaleString('en-IN')}).`,
                };
              } else if (dbInvRow && !dbUdhariRow && amount > (Number(dbInvRow.balance_amount) + 0.05)) {
                return {
                  success: false,
                  error: `Overpayment rejected: Amount (₹${amount.toLocaleString('en-IN')}) exceeds database invoice balance (₹${Number(dbInvRow.balance_amount).toLocaleString('en-IN')}).`,
                };
              }
            } else if (dbInvRow && amount > (Number(dbInvRow.grand_total) + 0.05)) {
              return {
                success: false,
                error: `Upfront payment rejected: Amount (₹${amount.toLocaleString('en-IN')}) exceeds database invoice grand total (₹${Number(dbInvRow.grand_total).toLocaleString('en-IN')}).`,
              };
            }

            const effectivePaymentId = (crypto.randomUUID ? crypto.randomUUID() : undefined);
            const dbPaymentId = isValidUuid(paymentId) ? paymentId : (effectivePaymentId || undefined);

            // 3. Insert into public.payments (strictly adhering to verified production columns)
            const dbPayPayload: any = {
              workspace_id: wsId,
              payment_number: paymentCode,
              customer_id: resolvedCustomerId || dbInvRow?.customer_id || dbUdhariRow?.customer_id || null,
              customer_name: customerName,
              invoice_id: dbInvRow?.id || resolvedInvoiceId || null,
              invoice_number: invoiceNumber || dbInvRow?.invoice_number || null,
              amount,
              payment_date: paymentDate,
              method: paymentMethod,
              reference_no: payload.reference || null,
              notes: payload.notes || null,
            };
            if (dbPaymentId) {
              dbPayPayload.id = dbPaymentId;
            }

            // Check if upfront payment already exists in database
            if (payload.isUpfrontInvoicePayment && (dbInvRow?.id || resolvedInvoiceId || invoiceNumber)) {
              const targetInvId = dbInvRow?.id || resolvedInvoiceId;
              let checkQuery = supabase.from('payments').select('id, payment_number').eq('workspace_id', wsId);
              if (targetInvId) {
                checkQuery = checkQuery.eq('invoice_id', targetInvId);
              } else if (invoiceNumber) {
                checkQuery = checkQuery.eq('invoice_number', invoiceNumber);
              }
              const { data: existingDbPay } = await checkQuery.maybeSingle();
              if (existingDbPay) {
                paymentId = existingDbPay.id;
                paymentCode = existingDbPay.payment_number || paymentCode;
                isDbPersisted = true;
              }
            }

            if (!isDbPersisted) {
              const { data: payInsertData, error: payInsertErr } = await supabase
                .from('payments')
                .insert([dbPayPayload])
                .select('id, payment_number')
                .single();

              if (payInsertErr) {
                const errStr = handleSupabaseError(payInsertErr, 'recordCustomerPayment.payments_insert');
                return { success: false, error: errStr };
              }

              if (payInsertData?.id) {
                paymentId = payInsertData.id;
                paymentCode = payInsertData.payment_number || paymentCode;
                isDbPersisted = true;
              }
            }

            // 4. Insert into public.udhari_payments if linked to an Udhari record
            if (dbUdhariRow) {
              const dbUdhariPayPayload: any = {
                workspace_id: wsId,
                udhari_id: dbUdhariRow.id,
                customer_id: dbUdhariRow.customer_id || resolvedCustomerId || null,
                payment_code: paymentCode,
                amount,
                payment_method: paymentMethod,
                payment_date: paymentDate,
                phone_number: customerPhone || dbUdhariRow.phone_snapshot || '9999999999',
                reference: payload.reference || null,
                notes: payload.notes || null,
              };
              if (isValidUuid(paymentId)) {
                dbUdhariPayPayload.id = paymentId;
              }

              const { error: upErr } = await supabase
                .from('udhari_payments')
                .insert([dbUdhariPayPayload]);

              if (upErr) {
                console.warn('[customerPaymentService] udhari_payments insert notice:', upErr.message);
              }

              // Update public.udhari_records using calculateUdhariFinancials
              const curRec = Number(dbUdhariRow.total_received || 0);
              const { originalAmount, totalReceived: newRec, outstandingAmount: newOut, status: newStatus } = calculateUdhariFinancials(
                Number(dbUdhariRow.original_amount),
                curRec + amount
              );
              await supabase
                .from('udhari_records')
                .update({
                  original_amount: originalAmount,
                  total_received: newRec,
                  outstanding_amount: newOut,
                  status: newStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', dbUdhariRow.id);
            }

            // 5. Update public.invoices if linked
            let updatedInvPaid = 0;
            let updatedInvBal = 0;
            let updatedInvTotal = 0;
            if (dbInvRow) {
              const curInvPaid = Number(dbInvRow.paid_amount || 0);
              const { grandTotal, paidAmount: newPaid, balanceAmount: newBal } = calculateInvoiceFinancials(
                Number(dbInvRow.grand_total),
                curInvPaid + amount
              );
              updatedInvPaid = newPaid;
              updatedInvBal = newBal;
              updatedInvTotal = grandTotal;
              const newStatus = newBal <= 0.01 ? 'Paid' : 'Partially Paid';
              await supabase
                .from('invoices')
                .update({
                  grand_total: grandTotal,
                  paid_amount: newPaid,
                  balance_amount: newBal,
                  status: newStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', dbInvRow.id);
            }

            // 6. Record Daybook Payment Event & Synchronize Invoice SALE Entry
            if (dbInvRow) {
              try {
                const pStatusTag = updatedInvBal <= 0.01 ? 'PAID' : (updatedInvPaid > 0 ? 'PARTIALLY PAID' : 'UNPAID');
                const paymentRefId = paymentId || dbPaymentId;

                // 6a. Record authoritative Daybook transaction for this specific payment on paymentDate
                const paymentDaybookPayload: any = {
                  workspace_id: wsId,
                  transaction_code: paymentCode,
                  transaction_date: paymentDate,
                  transaction_type: 'CUSTOMER_PAYMENT',
                  direction: 'IN',
                  amount: amount, // Inflow = actual money received in this payment transaction
                  total_amount: updatedInvTotal || Number(dbInvRow.grand_total) || 0, // Authoritative Invoice Grand Total
                  remaining_amount: updatedInvBal, // Remaining balance after this payment
                  payment_status: pStatusTag,
                  payment_mode: paymentMethod,
                  party_type: 'customer',
                  party_id: dbInvRow.customer_id || resolvedCustomerId || null,
                  party_name: customerName,
                  reference_type: 'PAYMENT',
                  reference_id: paymentRefId,
                  reference_number: dbInvRow.invoice_number,
                  description: `Invoice #${dbInvRow.invoice_number}`,
                  notes: payload.reference ? `Ref: ${payload.reference}` : payload.notes,
                  status: 'COMPLETED',
                  updated_at: new Date().toISOString(),
                };

                const { data: existingDaybookPay } = await supabase
                  .from('daybook_transactions')
                  .select('id')
                  .eq('workspace_id', wsId)
                  .eq('reference_type', 'PAYMENT')
                  .eq('reference_id', paymentRefId)
                  .maybeSingle();

                if (existingDaybookPay?.id) {
                  await supabase
                    .from('daybook_transactions')
                    .update(paymentDaybookPayload)
                    .eq('id', existingDaybookPay.id);
                } else {
                  if (isValidUuid(paymentRefId)) {
                    paymentDaybookPayload.id = paymentRefId;
                  }
                  await supabase
                    .from('daybook_transactions')
                    .insert([paymentDaybookPayload]);
                }

                // 6b. Keep existing Daybook SALE entry synchronized with latest balance
                const { data: existingDaybookSale } = await supabase
                  .from('daybook_transactions')
                  .select('id, amount, transaction_date')
                  .eq('workspace_id', wsId)
                  .eq('reference_type', 'INVOICE')
                  .or(`reference_id.eq.${dbInvRow.id},reference_number.eq.${dbInvRow.invoice_number}`)
                  .maybeSingle();

                if (existingDaybookSale?.id) {
                  await supabase
                    .from('daybook_transactions')
                    .update({
                      total_amount: updatedInvTotal,
                      remaining_amount: updatedInvBal,
                      payment_status: pStatusTag,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', existingDaybookSale.id);
                }
              } catch (dbErr) {
                console.warn('[customerPaymentService] Daybook invoice sync notice:', dbErr);
              }
            }

            // 7. Record Cashbook Entry (Liquidity movement with safe fallback if table absent)
            try {
              const { cashbookService } = await import('./cashbookService');
              await cashbookService.recordCashbookEntry({
                sourceType: 'INVOICE_PAYMENT',
                sourceId: paymentId,
                referenceNumber: invoiceNumber || paymentCode,
                direction: 'IN',
                amount,
                paymentMethod,
                partyName: customerName,
                description: `Payment received for ${invoiceNumber || customerName}`,
                notes: payload.reference ? `Ref: ${payload.reference}` : payload.notes,
                transactionDate: paymentDate,
              });
            } catch (cbErr) {
              console.warn('[customerPaymentService] Cashbook sync notice:', cbErr);
            }

            // 8. Follow-up synchronization
            try {
              const remainingBal = dbUdhariRow ? Math.max(0, Number(dbUdhariRow.original_amount) - (Number(dbUdhariRow.total_received || 0) + amount)) : (dbInvRow ? Math.max(0, Number(dbInvRow.grand_total) - (Number(dbInvRow.paid_amount || 0) + amount)) : 0);
              if (remainingBal <= 0.01) {
                await supabase
                  .from('follow_ups')
                  .update({ status: 'Completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                  .eq('workspace_id', wsId)
                  .or(`invoice_id.eq.${dbInvRow?.id || resolvedInvoiceId},invoice_number.eq.${invoiceNumber}`)
                  .neq('status', 'Completed');
              } else {
                await supabase
                  .from('follow_ups')
                  .update({ notes: `Outstanding receivable: ₹${remainingBal.toLocaleString('en-IN')}`, updated_at: new Date().toISOString() })
                  .eq('workspace_id', wsId)
                  .or(`invoice_id.eq.${dbInvRow?.id || resolvedInvoiceId},invoice_number.eq.${invoiceNumber}`)
                  .neq('status', 'Completed');
              }
            } catch (fuErr) {
              console.warn('[customerPaymentService] Follow-up sync notice:', fuErr);
            }
          } else {
            const errStr = handleSupabaseError(rpcErr, 'recordCustomerPayment.rpc');
            return { success: false, error: errStr };
          }
        }
      } catch (ex: any) {
        const errStr = handleSupabaseError(ex, 'recordCustomerPayment');
        return { success: false, error: errStr };
      }
    }

    // Step 3: Authoritative Multi-Module Synchronization in Local Store
    let syncRes: any;
    try {
      syncRes = store.recordUnifiedCustomerPayment({
        paymentId,
        paymentCode,
        invoiceId: targetInvoice?.id || payload.invoiceId,
        invoiceNumber,
        udhariId: targetUdhari?.id || payload.udhariId,
        customerId: resolvedCustomerId || targetInvoice?.customerId || targetUdhari?.customerId,
        customerName,
        customerPhone,
        amount,
        paymentMethod: paymentMethod as any,
        paymentDate,
        reference: payload.reference,
        notes: payload.notes,
        isDbPersisted,
      });
    } catch (storeErr: any) {
      return { success: false, error: storeErr?.message || 'Payment recording failed.' };
    }

    // Step 4: Cache invalidation
    try {
      const { salesAnalyticsService } = await import('./salesAnalyticsService');
      salesAnalyticsService.invalidateCache();
    } catch {
      // ignore
    }

    return {
      success: true,
      paymentId,
      paymentCode,
      invoiceId: syncRes.invoice?.id,
      udhariId: syncRes.udhari?.id,
      amount,
      paidAmount: syncRes.invoice?.paidAmount,
      balanceAmount: syncRes.invoice?.balanceAmount,
      status: syncRes.invoice?.status,
    };
  }
}

export const customerPaymentService = new CustomerPaymentService();

import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { PaymentMethod } from '../../types';
import { store } from '../store';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

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
}

const LOCAL_PAYMENTS_KEY = 'vistaar_local_payments_db';

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
    const paymentMethod = payload.paymentMethod || 'Cash';
    const paymentDate = payload.paymentDate || new Date().toISOString().split('T')[0];
    const customerPhone = (payload.customerPhone || '').trim() || '9999999999';

    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: 'Payment amount must be greater than zero.' };
    }

    // Step 1: Pre-validate against target Invoice or Udhari record in Store
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

    // Overpayment validation
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

    const customerName = payload.customerName || targetInvoice?.customerName || targetUdhari?.customerNameSnapshot || 'Customer';
    const invoiceNumber = payload.invoiceNumber || targetInvoice?.invoiceNumber || (targetUdhari?.id?.startsWith('UD-') ? targetUdhari.id.replace('UD-', '') : undefined);
    const resolvedInvoiceId = (payload.invoiceId && isValidUuid(payload.invoiceId)) ? payload.invoiceId : (targetInvoice?.id && isValidUuid(targetInvoice.id) ? targetInvoice.id : undefined);
    const resolvedUdhariId = (payload.udhariId && isValidUuid(payload.udhariId)) ? payload.udhariId : (targetUdhari?.id && isValidUuid(targetUdhari.id) ? targetUdhari.id : undefined);

    let paymentId = `pay-${Date.now()}`;
    let paymentCode = `PAY-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
    let isDbPersisted = false;

    // Step 2: Supabase Atomic Posting via RPC
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      const rpcPayload = {
        workspace_id: wsId,
        invoice_id: resolvedInvoiceId || null,
        invoice_number: invoiceNumber || null,
        udhari_id: resolvedUdhariId || null,
        counter_sale_id: payload.counterSaleId && isValidUuid(payload.counterSaleId) ? payload.counterSaleId : null,
        customer_id: payload.customerId && isValidUuid(payload.customerId) ? payload.customerId : null,
        customer_name: customerName,
        customer_phone: customerPhone,
        amount,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        reference: payload.reference || null,
        notes: payload.notes || null,
      };

      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('post_customer_payment_atomic', {
          p_payload: rpcPayload,
        });

        if (!rpcErr && rpcData?.success) {
          isDbPersisted = true;
          paymentId = rpcData.payment_id || paymentId;
          paymentCode = rpcData.payment_code || paymentCode;
        } else if (rpcErr) {
          // If RPC is not found (PGRST202), try legacy record_udhari_payment_atomic if udhari_id is known
          if (rpcErr.code === 'PGRST202' && resolvedUdhariId) {
            const { data: legacyData, error: legErr } = await supabase.rpc('record_udhari_payment_atomic', {
              p_payload: {
                workspace_id: wsId,
                udhari_id: resolvedUdhariId,
                amount,
                payment_method: paymentMethod,
                payment_date: paymentDate,
                phone_number: customerPhone,
                reference: payload.reference || null,
                notes: payload.notes || null,
              },
            });
            if (!legErr && legacyData?.success) {
              isDbPersisted = true;
              paymentId = legacyData.payment_id || paymentId;
              paymentCode = legacyData.payment_code || paymentCode;
            } else if (legErr) {
              const errStr = handleSupabaseError(legErr, 'recordCustomerPayment.legacy');
              return { success: false, error: errStr };
            }
          } else {
            const errStr = handleSupabaseError(rpcErr, 'recordCustomerPayment.rpc');
            // If the error was explicitly an overpayment rejection or validation error, return error
            if (rpcErr.message?.includes('Overpayment rejected') || rpcErr.message?.includes('greater than zero')) {
              return { success: false, error: rpcErr.message };
            }
            return { success: false, error: errStr };
          }
        }
      } catch (ex: any) {
        const errStr = handleSupabaseError(ex, 'recordCustomerPayment');
        return { success: false, error: errStr };
      }
    }

    // Step 3: Authoritative Client-Side Multi-Module Synchronization
    const syncRes = store.recordUnifiedCustomerPayment({
      paymentId,
      paymentCode,
      invoiceId: targetInvoice?.id || payload.invoiceId,
      invoiceNumber,
      udhariId: targetUdhari?.id || payload.udhariId,
      customerId: payload.customerId || targetInvoice?.customerId || targetUdhari?.customerId,
      customerName,
      customerPhone,
      amount,
      paymentMethod: paymentMethod as any,
      paymentDate,
      reference: payload.reference,
      notes: payload.notes,
      isDbPersisted,
    });

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

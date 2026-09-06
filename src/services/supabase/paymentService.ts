import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Payment } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_PAYMENTS_KEY = 'vistaar_local_payments_db';

export class PaymentService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getPayments(): Promise<{ data: Payment[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const { data, error } = await supabase
          .from('payments')
          .select('*')
          .eq('workspace_id', wsId)
          .order('created_at', { ascending: false });

        if (error) {
          const errStr = handleSupabaseError(error, 'getPayments');
          const fallback = safeGetTenantStorage<Payment>(LOCAL_PAYMENTS_KEY, []);
          return { data: fallback, error: errStr };
        }

        const mapped: Payment[] = (data || []).map((p: any) => ({
          id: p.id,
          paymentNumber: p.payment_number || `PAY-${p.id.substring(0, 8)}`,
          customerId: p.customer_id,
          customerName: p.customer_name || 'Customer',
          invoiceId: p.invoice_id,
          invoiceNumber: p.invoice_number,
          amount: Number(p.amount) || 0,
          date: p.payment_date || (p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
          method: p.method || 'Cash',
          referenceNo: p.reference_no,
          notes: p.notes,
          createdAt: p.created_at,
        }));

        return { data: mapped };
      }

      const fallback = safeGetTenantStorage<Payment>(LOCAL_PAYMENTS_KEY, []);
      return { data: fallback };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getPayments');
      const fallback = safeGetTenantStorage<Payment>(LOCAL_PAYMENTS_KEY, []);
      return { data: fallback, error: errStr };
    }
  }

  private async syncInvoicePaymentTotals(invoiceId?: string | null, invoiceNumber?: string): Promise<void> {
    const wsId = this.getWorkspaceId();
    if (!invoiceId && !invoiceNumber) return;

    try {
      let query = supabase.from('invoices').select('id, grand_total, paid_amount, balance_amount, status');
      if (invoiceId && isValidUuid(invoiceId)) {
        query = query.eq('id', invoiceId);
      } else if (invoiceNumber) {
        query = query.eq('invoice_number', invoiceNumber);
      }
      if (isValidUuid(wsId)) {
        query = query.eq('workspace_id', wsId);
      }

      const { data: invData, error: invErr } = await query.maybeSingle();
      if (invErr || !invData) return;

      const targetId = invData.id;
      const grandTotal = Number(invData.grand_total) || 0;

      // Ensure any payments linked by invoice_number have invoice_id set
      if (invoiceNumber) {
        try {
          let linkQuery = supabase
            .from('payments')
            .update({ invoice_id: targetId })
            .is('invoice_id', null)
            .eq('invoice_number', invoiceNumber);
          if (isValidUuid(wsId)) {
            linkQuery = linkQuery.eq('workspace_id', wsId);
          }
          await linkQuery;
        } catch (e) {
          // ignore
        }
      }

      let payQuery = supabase.from('payments').select('amount').eq('invoice_id', targetId);
      if (isValidUuid(wsId)) {
        payQuery = payQuery.eq('workspace_id', wsId);
      }

      const { data: payments } = await payQuery;
      const totalPaid = (payments || []).reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0);
      const balanceAmount = Math.max(0, Number((grandTotal - totalPaid).toFixed(2)));

      let newStatus = invData.status || 'Issued';
      if (Math.abs(grandTotal - totalPaid) < 0.01 || totalPaid >= grandTotal) {
        newStatus = 'Paid';
      } else if (totalPaid > 0) {
        newStatus = 'Partially Paid';
      }

      let updateQuery = supabase
        .from('invoices')
        .update({
          paid_amount: totalPaid,
          balance_amount: balanceAmount,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetId);

      if (isValidUuid(wsId)) {
        updateQuery = updateQuery.eq('workspace_id', wsId);
      }
      await updateQuery;
    } catch (e) {
      console.warn('[syncInvoicePaymentTotals] notice:', e);
    }
  }

  public async createPayment(payment: Partial<Payment>): Promise<{ paymentId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    const payNum = payment.paymentNumber || `PAY-${Date.now()}`;
    const amount = Number(payment.amount) || 0;
    const method = payment.method || 'Cash';
    const paymentDate = payment.date || new Date().toISOString().split('T')[0];
    const customerName = payment.customerName || 'Customer';

    // Resolve canonical invoice database UUID if invoiceId or invoiceNumber is provided
    let resolvedInvoiceId: string | null = (payment.invoiceId && isValidUuid(payment.invoiceId)) ? payment.invoiceId : null;
    if (!resolvedInvoiceId && payment.invoiceNumber && isSupabaseConfigured()) {
      try {
        let invQuery = supabase.from('invoices').select('id').eq('invoice_number', payment.invoiceNumber);
        if (isValidUuid(wsId)) invQuery = invQuery.eq('workspace_id', wsId);
        const { data: invRow } = await invQuery.maybeSingle();
        if (invRow) resolvedInvoiceId = invRow.id;
      } catch (e) {
        // ignore
      }
    }

    // Precise PostgreSQL column payload matching public.payments schema
    const payload = {
      workspace_id: wsId,
      customer_id: payment.customerId && isValidUuid(payment.customerId) ? payment.customerId : null,
      invoice_id: resolvedInvoiceId,
      payment_number: payNum,
      customer_name: customerName,
      invoice_number: payment.invoiceNumber || null,
      amount: amount,
      payment_date: paymentDate,
      method: method,
      reference_no: payment.referenceNo || null,
      notes: payment.notes || null,
    };

    let createdId = `pay-${Date.now()}`;
    let isPersistedToDb = false;

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data, error } = await supabase
          .from('payments')
          .insert([payload])
          .select('id')
          .single();

        if (!error && data) {
          createdId = data.id;
          isPersistedToDb = true;
        } else if (error) {
          const errStr = handleSupabaseError(error, 'createPayment');
          console.warn('[PaymentService.createPayment] Supabase error:', errStr);
        }
      } catch (dbEx) {
        console.warn('[PaymentService.createPayment] Exception:', dbEx);
      }
    }

    // Fallback or local mirror for immediate offline reliability
    const localPay = {
      id: createdId,
      ...payload,
      createdAt: new Date().toISOString(),
    };
    const local = safeGetTenantStorage<any>(LOCAL_PAYMENTS_KEY, []);
    local.unshift(localPay);
    safeSaveTenantStorage(LOCAL_PAYMENTS_KEY, local);

    // Sync Supabase invoice paid_amount, balance_amount, status
    if (isPersistedToDb && payload.invoice_id) {
      await this.syncInvoicePaymentTotals(payload.invoice_id, payment.invoiceNumber);
    }

    // Authoritative Accounting Pipeline:
    // Only when actual money is received (amount > 0 and non-credit)
    const isCredit = (method as string) === 'Credit / Udhari' || (method as string) === 'Credit' || (method as string) === 'Udhari';
    if (amount > 0 && !isCredit) {
      // 1. Daybook Entry: CUSTOMER_PAYMENT (actual money received)
      try {
        const { daybookService } = await import('./daybookService');
        await daybookService.recordFinancialTransaction({
          referenceType: 'PAYMENT',
          referenceId: createdId,
          referenceNumber: payNum,
          transactionType: 'CUSTOMER_PAYMENT',
          direction: 'IN',
          amount: amount,
          paymentMode: method as any,
          partyType: 'customer',
          partyId: payload.customer_id || undefined,
          partyName: customerName,
          description: `Payment Received #${payNum} for Invoice #${payment.invoiceNumber || ''}`.trim(),
          notes: payment.referenceNo ? `Ref: ${payment.referenceNo}` : payment.notes || undefined,
          transactionDate: paymentDate,
        });
      } catch (dbErr) {
        console.warn('Failed to record Daybook entry for payment:', dbErr);
      }

      // 2. Cashbook Entry: INVOICE_PAYMENT (actual liquidity receipt)
      try {
        const { cashbookService } = await import('./cashbookService');
        await cashbookService.recordCashbookEntry({
          sourceType: 'INVOICE_PAYMENT',
          sourceId: createdId,
          referenceNumber: payment.invoiceNumber || payNum,
          direction: 'IN',
          amount: amount,
          paymentMethod: method, // Preserves actual method: UPI, Card, Bank Transfer, Cash, etc.
          partyName: customerName,
          description: `Payment received for Invoice #${payment.invoiceNumber || payNum}`,
          notes: payment.referenceNo ? `Ref: ${payment.referenceNo}` : payment.notes || undefined,
          transactionDate: paymentDate,
        });
      } catch (cbErr) {
        console.warn('Failed to record Cashbook entry for payment:', cbErr);
      }
    }

    try {
      const { salesAnalyticsService } = await import('./salesAnalyticsService');
      salesAnalyticsService.invalidateCache();
    } catch (e) {
      // ignore
    }

    return { paymentId: createdId };
  }
}

export const paymentService = new PaymentService();

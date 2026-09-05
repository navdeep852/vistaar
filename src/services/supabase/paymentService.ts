import { supabase } from '../../lib/supabase';
import { Payment } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';

import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_PAYMENTS_KEY = 'vistaar_local_payments_db';

export class PaymentService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getPayments(): Promise<{ data: any[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        const errStr = handleSupabaseError(error, 'getPayments');
        const fallback = safeGetTenantStorage<any>(LOCAL_PAYMENTS_KEY, []);
        return { data: fallback, error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getPayments');
      const fallback = safeGetTenantStorage<any>(LOCAL_PAYMENTS_KEY, []);
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
      console.warn('syncInvoicePaymentTotals error:', e);
    }
  }

  public async createPayment(payment: Partial<Payment>): Promise<{ paymentId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    const payNum = payment.paymentNumber || `PAY-${Date.now()}`;
    const payload = {
      workspace_id: wsId,
      customer_id: payment.customerId || null,
      invoice_id: payment.invoiceId || null,
      payment_number: payNum,
      amount: payment.amount || 0,
      date: payment.date || new Date().toISOString().split('T')[0],
      payment_method: payment.method || 'Cash',
      reference_number: payment.referenceNo || null,
      notes: payment.notes || null,
    };

    try {
      const { data, error } = await supabase
        .from('payments')
        .insert([payload])
        .select('id')
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createPayment');
        if (errStr.startsWith('Network Error')) {
          const newId = `pay-${Date.now()}`;
          const localPay = { id: newId, ...payload, createdAt: new Date().toISOString() };
          const local = safeGetTenantStorage<any>(LOCAL_PAYMENTS_KEY, []);
          local.unshift(localPay);
          safeSaveTenantStorage(LOCAL_PAYMENTS_KEY, local);
          return { paymentId: newId };
        }
        return { error: errStr };
      }
      const createdId = data ? data.id : `pay-${Date.now()}`;

      // Sync Supabase invoice paid_amount, balance_amount, status
      await this.syncInvoicePaymentTotals(payload.invoice_id, payment.invoiceNumber);

      // Record Daybook Financial Transaction
      try {
        const { daybookService } = await import('./daybookService');
        await daybookService.recordFinancialTransaction({
          referenceType: 'PAYMENT',
          referenceId: createdId,
          referenceNumber: payNum,
          transactionType: 'CUSTOMER_PAYMENT',
          direction: 'IN',
          amount: payment.amount || 0,
          paymentMode: (payment.method || 'Cash') as any,
          partyType: 'customer',
          partyId: payment.customerId || undefined,
          partyName: payment.customerName || 'Customer',
          description: `Payment Received #${payNum}`,
          notes: payment.notes || undefined,
          transactionDate: payment.date || new Date().toISOString().split('T')[0],
        });
      } catch (dbErr) {
        console.warn('Failed to record Daybook entry for payment:', dbErr);
      }

      return { paymentId: createdId };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createPayment');
      const newId = `pay-${Date.now()}`;
      const localPay = { id: newId, ...payload, createdAt: new Date().toISOString() };
      const local = safeGetTenantStorage<any>(LOCAL_PAYMENTS_KEY, []);
      local.unshift(localPay);
      safeSaveTenantStorage(LOCAL_PAYMENTS_KEY, local);

      // Record Daybook Financial Transaction (offline)
      try {
        const { daybookService } = await import('./daybookService');
        await daybookService.recordFinancialTransaction({
          referenceType: 'PAYMENT',
          referenceId: newId,
          referenceNumber: payNum,
          transactionType: 'CUSTOMER_PAYMENT',
          direction: 'IN',
          amount: payment.amount || 0,
          paymentMode: (payment.method || 'Cash') as any,
          partyType: 'customer',
          partyId: payment.customerId || undefined,
          partyName: payment.customerName || 'Customer',
          description: `Payment Received #${payNum}`,
          notes: payment.notes || undefined,
          transactionDate: payment.date || new Date().toISOString().split('T')[0],
        });
      } catch (dbErr) {
        // ignore
      }

      return { paymentId: newId };
    }
  }

}

export const paymentService = new PaymentService();

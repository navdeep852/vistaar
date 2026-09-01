import { supabase } from '../../lib/supabase';
import { Payment } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

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

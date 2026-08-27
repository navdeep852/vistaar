import { supabase } from '../../lib/supabase';
import { Payment } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

const LOCAL_PAYMENTS_KEY = 'vistaar_local_payments_db';

const safeStorageGet = (key: string): any[] => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(key);
      if (stored) return JSON.parse(stored);
    }
  } catch (e) {
    // ignore
  }
  return [];
};

const safeStorageSave = (key: string, items: any[]): void => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(items));
    }
  } catch (e) {
    // ignore
  }
};

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
        const fallback = safeStorageGet(LOCAL_PAYMENTS_KEY);
        return { data: fallback, error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getPayments');
      const fallback = safeStorageGet(LOCAL_PAYMENTS_KEY);
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
          const local = safeStorageGet(LOCAL_PAYMENTS_KEY);
          local.unshift(localPay);
          safeStorageSave(LOCAL_PAYMENTS_KEY, local);
          return { paymentId: newId };
        }
        return { error: errStr };
      }
      return { paymentId: data.id };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createPayment');
      const newId = `pay-${Date.now()}`;
      const localPay = { id: newId, ...payload, createdAt: new Date().toISOString() };
      const local = safeStorageGet(LOCAL_PAYMENTS_KEY);
      local.unshift(localPay);
      safeStorageSave(LOCAL_PAYMENTS_KEY, local);
      return { paymentId: newId };
    }
  }
}

export const paymentService = new PaymentService();

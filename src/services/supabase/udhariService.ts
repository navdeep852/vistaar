import { supabase } from '../../lib/supabase';
import { UdhariRecord, UdhariPaymentRecord } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_UDHARI_KEY = 'vistaar_local_udharis_db';

export class UdhariService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getUdhariRecords(): Promise<{ data: any[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('udhari_records')
        .select('*, udhari_payments(*)')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        const errStr = handleSupabaseError(error, 'getUdhariRecords');
        const fallback = safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []);
        return { data: fallback, error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getUdhariRecords');
      const fallback = safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []);
      return { data: fallback, error: errStr };
    }
  }

  public async createUdhari(udhari: Partial<UdhariRecord>): Promise<{ udhariId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    const code = udhari.id || `UD-${Date.now()}`;
    const payload = {
      workspace_id: wsId,
      customer_id: udhari.customerId || null,
      udhari_code: code,
      customer_name_snapshot: udhari.customerNameSnapshot || 'Customer',
      phone_snapshot: udhari.phoneSnapshot || '',
      original_amount: udhari.originalAmount || 0,
      total_received: udhari.totalReceived || 0,
      outstanding_amount: udhari.outstandingAmount || udhari.originalAmount || 0,
      due_date: udhari.dueDate || new Date().toISOString().split('T')[0],
      status: udhari.status || 'UNPAID',
    };

    try {
      const { data, error } = await supabase
        .from('udhari_records')
        .insert([payload])
        .select('id')
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createUdhari');
        if (errStr.startsWith('Network Error')) {
          const newId = `ud-${Date.now()}`;
          const localRec = { id: newId, ...payload, createdAt: new Date().toISOString() };
          const local = safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []);
          local.unshift(localRec);
          safeSaveTenantStorage(LOCAL_UDHARI_KEY, local);
          return { udhariId: newId };
        }
        return { error: errStr };
      }
      return { udhariId: data.id };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createUdhari');
      const newId = `ud-${Date.now()}`;
      const localRec = { id: newId, ...payload, createdAt: new Date().toISOString() };
      const local = safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []);
      local.unshift(localRec);
      safeSaveTenantStorage(LOCAL_UDHARI_KEY, local);
      return { udhariId: newId };
    }
  }

  public async recordUdhariPayment(payment: Partial<UdhariPaymentRecord>): Promise<{ paymentId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    const payload = {
      workspace_id: wsId,
      udhari_id: payment.udhariId,
      customer_id: payment.customerId || null,
      amount: payment.amount || 0,
      payment_method: payment.paymentMethod || 'Cash',
      payment_date: payment.paymentDate || new Date().toISOString().split('T')[0],
      phone_number: payment.phoneNumber || '',
      notes: payment.notes || null,
    };

    try {
      const { data, error } = await supabase
        .from('udhari_payments')
        .insert([payload])
        .select('id')
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'recordUdhariPayment');
        return { paymentId: `pay-${Date.now()}` };
      }
      return { paymentId: data.id };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'recordUdhariPayment');
      return { paymentId: `pay-${Date.now()}` };
    }
  }
}

export const udhariService = new UdhariService();

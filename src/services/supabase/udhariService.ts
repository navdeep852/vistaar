import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { UdhariRecord, UdhariPaymentRecord } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { validateIndianPhoneNumber } from '../../lib/phoneUtils';

const LOCAL_UDHARI_KEY = 'vistaar_local_udharis_db';
const LOCAL_UDHARI_PAYMENTS_KEY = 'vistaar_local_udhari_payments_db';

export class UdhariService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getUdhariRecords(): Promise<{ data: any[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
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

        const mapped = (data || []).map((r: any) => ({
          id: r.udhari_code || r.id,
          dbId: r.id,
          customerId: r.customer_id,
          invoiceId: r.invoice_id,
          counterSaleId: r.counter_sale_id,
          customerNameSnapshot: r.customer_name_snapshot || 'Customer',
          phoneSnapshot: r.phone_snapshot || '',
          originalAmount: Number(r.original_amount) || 0,
          totalReceived: Number(r.total_received) || 0,
          outstandingAmount: Number(r.outstanding_amount) || 0,
          dueDate: r.due_date,
          status: r.status,
          notes: r.notes,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          payments: r.udhari_payments,
        }));

        return { data: mapped };
      }

      const fallback = safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []);
      return { data: fallback };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getUdhariRecords');
      const fallback = safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []);
      return { data: fallback, error: errStr };
    }
  }

  public async createUdhari(udhari: Partial<UdhariRecord>): Promise<{ udhariId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    if (udhari.phoneSnapshot) {
      const pRes = validateIndianPhoneNumber(udhari.phoneSnapshot, true);
      if (!pRes.isValid) {
        return { error: pRes.error || 'Customer phone number must contain exactly 10 digits.' };
      }
      udhari.phoneSnapshot = pRes.normalized;
    } else {
      return { error: 'Customer phone number is required.' };
    }

    const code = udhari.id || `UD-${Date.now()}`;
    const payload: any = {
      workspace_id: wsId,
      customer_id: udhari.customerId || null,
      invoice_id: udhari.invoiceId || null,
      udhari_code: code,
      customer_name_snapshot: udhari.customerNameSnapshot || 'Customer',
      phone_snapshot: udhari.phoneSnapshot,
      original_amount: udhari.originalAmount || 0,
      total_received: udhari.totalReceived || 0,
      outstanding_amount: udhari.outstandingAmount !== undefined ? udhari.outstandingAmount : (udhari.originalAmount || 0),
      due_date: udhari.dueDate || new Date().toISOString().split('T')[0],
      status: udhari.status || 'UNPAID',
    };

    try {
      let { data, error } = await supabase
        .from('udhari_records')
        .insert([payload])
        .select('id')
        .single();

      if (error && (error.code === '42703' || error.message?.includes('invoice_id'))) {
        delete payload.invoice_id;
        const retry = await supabase.from('udhari_records').insert([payload]).select('id').single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        const errStr = handleSupabaseError(error, 'createUdhari');
        return { error: errStr };
      }
      return { udhariId: data.id };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createUdhari');
      return { error: errStr };
    }
  }

  /**
   * Idempotently synchronizes an invoice with the Udhari ledger and Follow-up reminders
   */
  public async syncInvoiceUdhari(params: {
    invoiceId: string;
    invoiceNumber: string;
    customerId?: string;
    customerName: string;
    customerPhone: string;
    grandTotal: number;
    paidAmount: number;
    balanceAmount: number;
    dueDate?: string;
  }): Promise<{ udhariId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    const effectiveDueDate = params.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
    const isCleared = params.balanceAmount <= 0.01;
    const udhariStatus = isCleared ? 'PAID' : (params.paidAmount > 0 ? 'PARTIALLY PAID' : 'UNPAID');

    try {
      if (isValidUuid(wsId) && isValidUuid(params.invoiceId)) {
        // 1. Check if an Udhari record exists for this invoice (graceful check)
        let existingUdhari: any = null;
        try {
          const { data: byCode } = await supabase
            .from('udhari_records')
            .select('*')
            .eq('workspace_id', wsId)
            .eq('udhari_code', `UD-${params.invoiceNumber}`)
            .maybeSingle();
          existingUdhari = byCode;
        } catch (cErr) {
          // ignore
        }

        if (!existingUdhari) {
          try {
            const { data: byInvId } = await supabase
              .from('udhari_records')
              .select('*')
              .eq('workspace_id', wsId)
              .eq('invoice_id', params.invoiceId)
              .maybeSingle();
            existingUdhari = byInvId;
          } catch (invColErr) {
            // invoice_id column might not exist yet
          }
        }

        let udhariId = existingUdhari?.id;

        if (existingUdhari) {
          // Update existing Udhari record
          const updatePayload: any = {
            total_received: params.paidAmount,
            outstanding_amount: Math.max(0, params.balanceAmount),
            status: udhariStatus,
            updated_at: new Date().toISOString(),
          };
          if (!isCleared) {
            updatePayload.original_amount = params.grandTotal;
            updatePayload.due_date = effectiveDueDate;
          }
          await supabase.from('udhari_records').update(updatePayload).eq('id', existingUdhari.id);
        } else if (!isCleared) {
          // Create new Udhari record ONLY if balance > 0 (Rule 8: NEVER CREATE UDHARI FOR FULLY PAID)
          const res = await this.createUdhari({
            id: `UD-${params.invoiceNumber}`,
            customerId: params.customerId,
            invoiceId: params.invoiceId,
            customerNameSnapshot: params.customerName,
            phoneSnapshot: params.customerPhone || '9999999999',
            originalAmount: params.grandTotal,
            totalReceived: params.paidAmount,
            outstandingAmount: params.balanceAmount,
            dueDate: effectiveDueDate,
            status: udhariStatus as any,
          });
          udhariId = res.udhariId;
        }

        // 2. Synchronize Follow-up
        try {
          const { data: existingFollowUp } = await supabase
            .from('follow_ups')
            .select('id, status')
            .eq('workspace_id', wsId)
            .or(`invoice_id.eq.${params.invoiceId},invoice_number.eq.${params.invoiceNumber}`)
            .maybeSingle();

          if (isCleared) {
            if (existingFollowUp && existingFollowUp.status !== 'Completed') {
              await supabase
                .from('follow_ups')
                .update({ status: 'Completed', completed_at: new Date().toISOString() })
                .eq('id', existingFollowUp.id);
            }
          } else {
            if (existingFollowUp) {
              await supabase
                .from('follow_ups')
                .update({
                  status: 'Pending',
                  due_date: effectiveDueDate,
                  notes: `Payment follow-up for Invoice #${params.invoiceNumber}. Outstanding: ₹${params.balanceAmount.toLocaleString('en-IN')}`,
                })
                .eq('id', existingFollowUp.id);
            } else {
              const followUpPayload: any = {
                workspace_id: wsId,
                customer_id: isValidUuid(params.customerId) ? params.customerId : null,
                customer_name: params.customerName || 'Customer',
                customer_phone: params.customerPhone || '9999999999',
                invoice_id: params.invoiceId,
                invoice_number: params.invoiceNumber,
                udhari_id: udhariId && isValidUuid(udhariId) ? udhariId : null,
                title: `Payment follow-up — ${params.invoiceNumber}`,
                notes: `Outstanding receivable: ₹${params.balanceAmount.toLocaleString('en-IN')}`,
                due_date: effectiveDueDate,
                due_time: '10:00',
                priority: 'High',
                status: 'Pending',
                action_type: 'INTERNAL_REMINDER',
              };

              let { error: fuErr } = await supabase.from('follow_ups').insert([followUpPayload]);
              if (fuErr && (fuErr.code === '42703' || fuErr.message?.includes('udhari_id'))) {
                delete followUpPayload.udhari_id;
                await supabase.from('follow_ups').insert([followUpPayload]);
              }
            }
          }
        } catch (fuEx) {
          console.warn('[syncInvoiceUdhari] Follow-up sync notice:', fuEx);
        }

        return { udhariId };
      }
    } catch (e: any) {
      console.warn('[syncInvoiceUdhari] notice:', e);
    }

    return {};
  }

  /**
   * Authoritative Udhari Settlement Pipeline
   */
  public async recordUdhariPayment(payment: Partial<UdhariPaymentRecord>): Promise<{ paymentId?: string; error?: string }> {
    const amount = Number(payment.amount) || 0;
    if (isNaN(amount) || amount <= 0) {
      return { error: 'Payment amount must be greater than ₹0.' };
    }

    try {
      const { customerPaymentService } = await import('./customerPaymentService');
      const res = await customerPaymentService.recordCustomerPayment({
        udhariId: payment.udhariId,
        customerId: payment.customerId,
        amount,
        paymentMethod: payment.paymentMethod || 'Cash',
        paymentDate: payment.paymentDate,
        customerPhone: payment.phoneNumber,
        reference: payment.reference,
        notes: payment.notes,
      });

      if (!res.success) {
        return { error: res.error || 'Payment failed — no financial records were changed.' };
      }

      return { paymentId: res.paymentId };
    } catch (err: any) {
      const errStr = handleSupabaseError(err, 'recordUdhariPayment');
      return { error: errStr || 'Payment transaction failed' };
    }
  }

  /**
   * Authoritative calculation of Outstanding Udhari as of a specific date (toDate).
   * Outstanding Udhari = Opening Outstanding Balance + Credit generated up to To Date - Payments up to To Date.
   * Agrees 100% with the Udhari Ledger.
   */
  public async getAuthoritativeUdhariMetricsAsOf(asOfDateStr?: string): Promise<{
    outstanding: number;
    totalUdhari: number;
    totalReceived: number;
    overdue: number;
    activeCount: number;
    error?: string;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const targetDate = asOfDateStr || today;
    const isHistorical = targetDate < today;

    const res = await this.getUdhariRecords();
    if (res.error && (!res.data || res.data.length === 0)) {
      return {
        outstanding: 0,
        totalUdhari: 0,
        totalReceived: 0,
        overdue: 0,
        activeCount: 0,
        error: res.error,
      };
    }

    const records = res.data || [];
    let totalOutstanding = 0;
    let totalUdhari = 0;
    let totalReceived = 0;
    let overdue = 0;
    let activeCount = 0;

    for (const r of records) {
      const createdDate = (r.createdAt || r.created_at || '').split('T')[0];
      // Exclude udhari records created AFTER targetDate (did not exist yet)
      if (createdDate && createdDate > targetDate) {
        continue;
      }

      const orig = Number(r.originalAmount || r.original_amount || 0);
      const currentOutstanding = Number(r.outstandingAmount || r.outstanding_amount || 0);
      const currentReceived = Number(r.totalReceived || r.total_received || 0);
      const payments = Array.isArray(r.payments) ? r.payments : [];

      let balAsOf = currentOutstanding;
      let recAsOf = currentReceived;

      if (isHistorical) {
        // Payments made AFTER targetDate need to be added back to the outstanding balance
        let paymentsAfterTarget = 0;
        for (const p of payments) {
          const pDate = (p.payment_date || p.paymentDate || p.created_at || p.createdAt || '').split('T')[0];
          if (pDate && pDate > targetDate) {
            paymentsAfterTarget += Number(p.amount || 0);
          }
        }
        balAsOf = Math.min(orig, currentOutstanding + paymentsAfterTarget);
        recAsOf = Math.max(0, currentReceived - paymentsAfterTarget);
      }

      totalUdhari += orig;
      totalReceived += recAsOf;
      totalOutstanding += balAsOf;

      if (balAsOf > 0.01) {
        activeCount += 1;
        const dueDate = r.dueDate || r.due_date;
        if (dueDate && dueDate < targetDate) {
          overdue += balAsOf;
        }
      }
    }

    return {
      outstanding: Math.round(totalOutstanding * 100) / 100,
      totalUdhari: Math.round(totalUdhari * 100) / 100,
      totalReceived: Math.round(totalReceived * 100) / 100,
      overdue: Math.round(overdue * 100) / 100,
      activeCount,
    };
  }
}

export const udhariService = new UdhariService();

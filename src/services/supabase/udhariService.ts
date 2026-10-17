import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { UdhariRecord, UdhariPaymentRecord } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage, safeGetTenantItem } from './safeStorage';
import { validateIndianPhoneNumber } from '../../lib/phoneUtils';
import { calculateUdhariFinancials, calculateAuthoritativeUdhariMetrics } from '../financialCalculationService';
import { getActiveBranchId } from './branchService';
import { isRecordInBranch } from '../../lib/branchUtils';
import { store } from '../store';

const LOCAL_UDHARI_KEY = 'vistaar_local_udharis_db';
const LOCAL_UDHARI_PAYMENTS_KEY = 'vistaar_local_udhari_payments_db';

export class UdhariService {
  private async getWorkspaceId(): Promise<string> {
    if (!isSupabaseConfigured()) {
      return supabaseAuthService.getCurrentCompanyId() || '';
    }
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) return authWsId;
    } catch (e: any) {
      console.warn('Failed to get authoritative workspace ID in udhariService:', e?.message || e);
    }
    const cid = supabaseAuthService.getCurrentCompanyId();
    if (cid && isValidUuid(cid)) return cid;
    return '';
  }

  public async getUdhariRecords(explicitWsId?: string, options?: { branchId?: string }): Promise<{ data: any[]; error?: string }> {
    const wsId = explicitWsId && isValidUuid(explicitWsId) ? explicitWsId : await this.getWorkspaceId();
    const effectiveBId = options?.branchId !== undefined ? options.branchId : getActiveBranchId();
    let remoteRecords: any[] = [];
    let fetchError: string | undefined = undefined;

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        let query = supabase
          .from('udhari_records')
          .select('*, udhari_payments(*)')
          .eq('workspace_id', wsId);

        if (effectiveBId && effectiveBId !== 'ALL' && isValidUuid(effectiveBId)) {
          query = query.or(`branch_id.eq.${effectiveBId},branch_id.is.null,branch_id.eq.${wsId}`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (!error && data) {
          remoteRecords = data;
        } else if (error) {
          if (error.code === '42703' || error.message?.includes('branch_id')) {
            const retryRes = await supabase
              .from('udhari_records')
              .select('*, udhari_payments(*)')
              .eq('workspace_id', wsId)
              .order('created_at', { ascending: false });
            if (!retryRes.error && retryRes.data) {
              remoteRecords = retryRes.data;
            }
          } else {
            fetchError = handleSupabaseError(error, 'getUdhariRecords');
          }
        }
      }
    } catch (e: any) {
      fetchError = handleSupabaseError(e, 'getUdhariRecords');
    }

    const filteredRemote = remoteRecords.filter((r: any) => {
      if (effectiveBId && effectiveBId !== 'ALL') {
        const b = r.branch_id || r.branchId;
        const notes = r.notes || '';
        return isRecordInBranch(effectiveBId, b, notes);
      }
      return true;
    });

    const mappedRemote: any[] = filteredRemote.map((r: any) => ({
      id: r.udhari_code || r.id,
      dbId: r.id,
      branchId: r.branch_id,
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

    // Deduplication across remote, in-memory store, and local tenant storage
    const seenUdhariKeys = new Set<string>();
    mappedRemote.forEach((u) => {
      const k1 = u.id ? String(u.id).toLowerCase() : '';
      const k2 = u.dbId ? String(u.dbId).toLowerCase() : '';
      const k3 = u.invoiceId ? String(u.invoiceId).toLowerCase() : '';
      if (k1) seenUdhariKeys.add(k1);
      if (k2) seenUdhariKeys.add(k2);
      if (k3) seenUdhariKeys.add(k3);
    });

    const localList: any[] = [
      ...store.getUdharis(),
      ...safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []),
    ];

    const allRecords: any[] = [...mappedRemote];

    localList.forEach((u: any) => {
      const w = u.workspaceId || u.workspace_id;
      if (w && w !== wsId) return;
      if (effectiveBId && effectiveBId !== 'ALL') {
        const b = u.branchId || u.branch_id;
        const notes = u.notes || '';
        if (!isRecordInBranch(effectiveBId, b, notes)) return;
      }
      const k1 = u.id ? String(u.id).toLowerCase() : '';
      const k2 = u.dbId ? String(u.dbId).toLowerCase() : '';
      const k3 = u.invoiceId ? String(u.invoiceId).toLowerCase() : '';
      if ((k1 && seenUdhariKeys.has(k1)) || (k2 && seenUdhariKeys.has(k2)) || (k3 && seenUdhariKeys.has(k3))) {
        return;
      }
      if (k1) seenUdhariKeys.add(k1);
      if (k2) seenUdhariKeys.add(k2);
      if (k3) seenUdhariKeys.add(k3);
      allRecords.push(u);
    });

    return { data: allRecords, error: fetchError };
  }

  public async createUdhari(udhari: Partial<UdhariRecord>): Promise<{ udhariId?: string; error?: string }> {
    const wsId = await this.getWorkspaceId();
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
    const branchTag = udhari.branchId ? `[branch: ${udhari.branchId}]` : '';
    const udhariNotes = udhari.notes ? (udhari.notes.includes('[branch:') ? udhari.notes : `${udhari.notes} ${branchTag}`.trim()) : (branchTag || null);

    const payload: any = {
      workspace_id: wsId,
      branch_id: udhari.branchId && isValidUuid(udhari.branchId) ? udhari.branchId : null,
      customer_id: udhari.customerId || null,
      invoice_id: udhari.invoiceId || null,
      udhari_code: code,
      customer_name_snapshot: udhari.customerNameSnapshot || 'Customer',
      phone_snapshot: udhari.phoneSnapshot,
      original_amount: udhari.originalAmount || 0,
      total_received: udhari.totalReceived || 0,
      outstanding_amount: udhari.outstandingAmount !== undefined ? udhari.outstandingAmount : (udhari.originalAmount || 0),
      due_date: udhari.dueDate || new Date().toISOString().split('T')[0],
      notes: udhariNotes,
      status: udhari.status || 'UNPAID',
    };

    let createdDbId: string | undefined = undefined;
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
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

        if (!error && data) {
          createdDbId = data.id;
        }
      } catch (e: any) {
        console.warn('[createUdhari] DB write notice:', e?.message || e);
      }
    }

    // Mirror to local tenant storage for resilience and offline support
    const localRecords = safeGetTenantStorage<any>(LOCAL_UDHARI_KEY, []);
    const localEntry = {
      id: code,
      dbId: createdDbId || code,
      branchId: udhari.branchId,
      customerId: udhari.customerId,
      invoiceId: udhari.invoiceId,
      customerNameSnapshot: udhari.customerNameSnapshot || 'Customer',
      phoneSnapshot: udhari.phoneSnapshot,
      originalAmount: Number(udhari.originalAmount) || 0,
      totalReceived: Number(udhari.totalReceived) || 0,
      outstandingAmount: udhari.outstandingAmount !== undefined ? Number(udhari.outstandingAmount) : (Number(udhari.originalAmount) || 0),
      dueDate: udhari.dueDate || new Date().toISOString().split('T')[0],
      notes: udhariNotes || '',
      status: udhari.status || 'UNPAID',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      payments: [],
    };
    const existIdx = localRecords.findIndex((r: any) => r.id === code || (r.invoiceId && r.invoiceId === udhari.invoiceId));
    if (existIdx >= 0) {
      localRecords[existIdx] = { ...localRecords[existIdx], ...localEntry };
    } else {
      localRecords.unshift(localEntry);
    }
    safeSaveTenantStorage(LOCAL_UDHARI_KEY, localRecords);

    return { udhariId: createdDbId || code };
  }

  /**
   * Idempotently synchronizes an invoice with the Udhari ledger and Follow-up reminders
   */
  public async syncInvoiceUdhari(params: {
    invoiceId: string;
    invoiceNumber: string;
    branchId?: string;
    customerId?: string;
    customerName: string;
    customerPhone: string;
    grandTotal: number;
    paidAmount: number;
    balanceAmount: number;
    dueDate?: string;
  }): Promise<{ udhariId?: string; error?: string }> {
    const wsId = await this.getWorkspaceId();
    const effectiveDueDate = params.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
    const { originalAmount, totalReceived, outstandingAmount, status: udhariStatus } = calculateUdhariFinancials(
      params.grandTotal,
      params.paidAmount
    );
    const isCleared = outstandingAmount <= 0.01;

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
            original_amount: originalAmount,
            total_received: totalReceived,
            outstanding_amount: outstandingAmount,
            status: udhariStatus,
            updated_at: new Date().toISOString(),
          };
          if (!isCleared) {
            updatePayload.due_date = effectiveDueDate;
          }
          await supabase.from('udhari_records').update(updatePayload).eq('id', existingUdhari.id);
        } else if (!isCleared) {
          // Create new Udhari record ONLY if balance > 0 (Rule 8: NEVER CREATE UDHARI FOR FULLY PAID)
          const res = await this.createUdhari({
            id: `UD-${params.invoiceNumber}`,
            customerId: params.customerId,
            invoiceId: params.invoiceId,
            branchId: params.branchId,
            customerNameSnapshot: params.customerName,
            phoneSnapshot: params.customerPhone || '9999999999',
            originalAmount,
            totalReceived,
            outstandingAmount,
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

    if (!isCleared) {
      const res = await this.createUdhari({
        id: `UD-${params.invoiceNumber}`,
        customerId: params.customerId,
        invoiceId: params.invoiceId,
        branchId: params.branchId,
        customerNameSnapshot: params.customerName,
        phoneSnapshot: params.customerPhone || '9999999999',
        originalAmount,
        totalReceived,
        outstandingAmount,
        dueDate: effectiveDueDate,
        status: udhariStatus as any,
      });
      return { udhariId: res.udhariId };
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
  public async getAuthoritativeUdhariMetricsAsOf(asOfDateStr?: string, explicitWsId?: string, branchId?: string): Promise<{
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

    const res = await this.getUdhariRecords(explicitWsId, { branchId });
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
    let mainBranchId = safeGetTenantItem('main_branch_id');
    if (!mainBranchId) {
      try {
        const storedBranches = safeGetTenantStorage<any>('vistaar_local_branches_db', []);
        const mb = storedBranches.find((b: any) => b.isMainBranch || b.branchCode === 'MAIN') || storedBranches[0];
        if (mb?.id) mainBranchId = mb.id;
      } catch {}
    }
    const isMain = !branchId || branchId === 'ALL' || (mainBranchId && branchId === mainBranchId) || String(branchId).toLowerCase().includes('main');

    const metrics = calculateAuthoritativeUdhariMetrics(records, {
      branchId: branchId && branchId !== 'ALL' ? branchId : undefined,
      isMainBranch: isMain,
      asOfDate: targetDate,
    });

    return {
      outstanding: metrics.outstanding,
      totalUdhari: metrics.totalUdhari,
      totalReceived: metrics.totalReceived,
      overdue: metrics.overdue,
      activeCount: metrics.activeCount,
    };
  }
}

export const udhariService = new UdhariService();

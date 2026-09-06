import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { DaybookTransaction, DaybookFilterOptions, DaybookSummaryMetrics } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { fromDbDaybookTransaction } from './types';

const LOCAL_DAYBOOK_KEY = 'vistaar_local_daybook_db';

export class DaybookService {
  private async getWorkspaceId(): Promise<string> {
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) return authWsId;
    } catch (e) {
      console.warn('Failed to get authoritative workspace ID in daybookService:', e);
    }
    return supabaseAuthService.getCurrentCompanyId() || '';
  }

  /**
   * Helper to compute date bounds based on preset range strings
   */
  private getDateBounds(range?: string, customStart?: string, customEnd?: string): { start?: string; end?: string } {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (!range || range === 'all') return { start: customStart, end: customEnd };

    if (range === 'today') {
      return { start: todayStr, end: todayStr };
    }

    if (range === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      return { start: yStr, end: yStr };
    }

    if (range === 'week') {
      const d = new Date(today);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return { start: monday.toISOString().split('T')[0], end: todayStr };
    }

    if (range === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: firstDay.toISOString().split('T')[0], end: todayStr };
    }

    if (range === 'last_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: firstDay.toISOString().split('T')[0], end: lastDay.toISOString().split('T')[0] };
    }

    if (range === 'custom') {
      return { start: customStart, end: customEnd };
    }

    return {};
  }

  /**
   * Fetch Daybook Transactions with server-side filtering, sorting, and synthesis fallback
   */
  public async getTransactions(options?: DaybookFilterOptions): Promise<{ data: DaybookTransaction[]; count: number; error?: string }> {
    const wsId = await this.getWorkspaceId();

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        // 1. Query public.daybook_transactions first (Authoritative unified financial journal)
        try {
          let dtQuery = supabase
            .from('daybook_transactions')
            .select('*', { count: 'exact' })
            .eq('workspace_id', wsId);

          const { start, end } = this.getDateBounds(options?.dateRange, options?.startDate, options?.endDate);
          if (start) dtQuery = dtQuery.gte('transaction_date', start);
          if (end) dtQuery = dtQuery.lte('transaction_date', end);

          if (options?.transactionType && options.transactionType !== 'ALL') {
            dtQuery = dtQuery.eq('transaction_type', options.transactionType);
          }

          if (options?.paymentStatus && options.paymentStatus !== 'ALL') {
            dtQuery = dtQuery.eq('payment_status', options.paymentStatus);
          }

          if (options?.paymentMode && options.paymentMode !== 'ALL') {
            dtQuery = dtQuery.eq('payment_mode', options.paymentMode);
          }

          if (options?.search && options.search.trim()) {
            const s = `%${options.search.trim()}%`;
            dtQuery = dtQuery.or(`transaction_code.ilike.${s},reference_number.ilike.${s},description.ilike.${s},party_name.ilike.${s}`);
          }

          dtQuery = dtQuery.order('transaction_date', { ascending: false }).order('created_at', { ascending: false });

          const { data: dtData, count: dtCount, error: dtErr } = await dtQuery;
          if (!dtErr && dtData && dtData.length > 0) {
            const mapped = dtData.map((row: any) => fromDbDaybookTransaction(row));
            return { data: mapped, count: dtCount || mapped.length };
          }
        } catch (dtEx) {
          // Fall through
        }

        // 2. Fallback: Synthesize from completed counter_sales and issued invoices in Supabase
        const synthesized = await this.synthesizeDaybookFromLiveSales(wsId, options);
        if (synthesized.length > 0) {
          return { data: synthesized, count: synthesized.length };
        }
      }
    } catch (e: any) {
      handleSupabaseError(e, 'getTransactions');
    }

    const fallback = this.getFilteredLocalTransactions(wsId, options);
    return { data: fallback, count: fallback.length };
  }

  /**
   * Resilient synthesis of Daybook records from authoritative Counter Sales and Invoices
   */
  private async synthesizeDaybookFromLiveSales(wsId: string, options?: DaybookFilterOptions): Promise<DaybookTransaction[]> {
    const list: DaybookTransaction[] = [];
    const { start, end } = this.getDateBounds(options?.dateRange, options?.startDate, options?.endDate);

    try {
      // 1. Fetch completed counter sales
      let csQuery = supabase
        .from('counter_sales')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('status', 'COMPLETED');

      if (start) csQuery = csQuery.gte('sale_date', start);
      if (end) csQuery = csQuery.lte('sale_date', end);

      const { data: csList } = await csQuery;
      if (csList) {
        for (const cs of csList) {
          const total = Number(cs.final_total) || 0;
          const received = Number(cs.amount_received !== undefined && cs.amount_received !== null ? cs.amount_received : cs.final_total) || 0;
          const remaining = Number(cs.balance_amount) || Math.max(0, total - received);
          const pStatus = remaining <= 0 ? 'PAID' : (received > 0 ? 'PARTIALLY PAID' : 'UNPAID');

          if (options?.paymentStatus && options.paymentStatus !== 'ALL' && pStatus !== options.paymentStatus) {
            continue;
          }

          list.push({
            id: cs.id,
            workspaceId: cs.workspace_id,
            transactionCode: cs.sale_number || `CS-${cs.id.substring(0, 8)}`,
            transactionDate: cs.sale_date,
            transactionType: 'SALE',
            direction: 'IN',
            amount: received, // Inflow = actual money received
            totalAmount: total, // Gross Total column strictly for sales
            remainingAmount: remaining, // Unpaid remaining
            paymentStatus: pStatus as any,
            paymentMode: (cs.payment_method || 'Cash') as any,
            partyType: 'customer',
            partyId: cs.customer_id,
            partyName: cs.customer_name || 'Walk-in Customer',
            referenceType: 'COUNTER_SALE',
            referenceId: cs.id,
            referenceNumber: cs.invoice_number || cs.sale_number,
            description: `Counter Sale #${cs.invoice_number || cs.sale_number}`,
            status: 'COMPLETED',
            createdAt: cs.created_at,
          });
        }
      }

      // 2. Fetch issued invoices
      let invQuery = supabase
        .from('invoices')
        .select('*')
        .eq('workspace_id', wsId)
        .in('status', ['Issued', 'Partially Paid', 'Paid']);

      if (start) invQuery = invQuery.gte('date', start);
      if (end) invQuery = invQuery.lte('date', end);

      const { data: invList } = await invQuery;
      if (invList) {
        for (const inv of invList) {
          const grandTotal = Number(inv.grand_total) || 0;
          const paid = Number(inv.paid_amount) || 0;
          const remaining = Number(inv.balance_amount) || Math.max(0, grandTotal - paid);
          const pStatus = remaining <= 0 ? 'PAID' : (paid > 0 ? 'PARTIALLY PAID' : 'UNPAID');

          if (options?.paymentStatus && options.paymentStatus !== 'ALL' && pStatus !== options.paymentStatus) {
            continue;
          }

          list.push({
            id: inv.id,
            workspaceId: inv.workspace_id,
            transactionCode: inv.invoice_number || `INV-${inv.id.substring(0, 8)}`,
            transactionDate: inv.date,
            transactionType: 'SALE',
            direction: 'IN',
            amount: paid, // Inflow = actual money received
            totalAmount: grandTotal, // Gross Total column strictly for sales
            remainingAmount: remaining, // Remaining unpaid amount
            paymentStatus: pStatus as any,
            paymentMode: 'Cash' as any,
            partyType: 'customer',
            partyId: inv.customer_id,
            partyName: inv.customer_name || 'Customer',
            referenceType: 'INVOICE',
            referenceId: inv.id,
            referenceNumber: inv.invoice_number,
            description: `Invoice #${inv.invoice_number}`,
            status: 'COMPLETED',
            createdAt: inv.created_at,
          });
        }
      }
    } catch (e) {
      console.warn('[synthesizeDaybookFromLiveSales] notice:', e);
    }

    list.sort((a, b) => (b.transactionDate > a.transactionDate ? 1 : -1));
    return list;
  }

  /**
   * Calculate summary metrics for current filter view
   */
  public async getSummaryMetrics(options?: DaybookFilterOptions): Promise<DaybookSummaryMetrics> {
    const { data } = await this.getTransactions({ ...options, page: undefined, pageSize: undefined });
    const active = (data || []).filter((t) => t.status !== 'VOID' && t.status !== 'REVERSED');

    let totalInflow = 0;
    let totalOutflow = 0;
    const modeBreakdown: Record<string, number> = {};

    for (const tx of active) {
      const mode = tx.paymentMode || 'Cash';
      const amt = Number(tx.amount) || 0;

      if (tx.direction === 'IN') {
        totalInflow += amt;
        modeBreakdown[mode] = (modeBreakdown[mode] || 0) + amt;
      } else if (tx.direction === 'OUT') {
        totalOutflow += amt;
        modeBreakdown[mode] = (modeBreakdown[mode] || 0) - amt;
      }
    }

    return {
      totalInflow,
      totalOutflow,
      netMovement: totalInflow - totalOutflow,
      totalCount: active.length,
      modeBreakdown,
    };
  }

  /**
   * Record a Daybook Financial Transaction
   * Writes to public.accounting_entries with full multi-tenant isolation and idempotency.
   */
  public async recordFinancialTransaction(params: {
    referenceType: 'COUNTER_SALE' | 'PAYMENT' | 'EXPENSE' | 'UDHARI_PAYMENT' | 'INVOICE' | 'MANUAL';
    referenceId: string;
    referenceNumber?: string;
    transactionType: DaybookTransaction['transactionType'];
    direction?: DaybookTransaction['direction'];
    amount: number;
    paymentMode?: string;
    partyType?: 'customer' | 'supplier' | 'other';
    partyId?: string;
    partyName?: string;
    description?: string;
    totalAmount?: number | null;
    remainingAmount?: number | null;
    paymentStatus?: 'PAID' | 'PARTIALLY PAID' | 'UNPAID' | 'CANCELLED';
    notes?: string;
    transactionDate?: string;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    const wsId = await this.getWorkspaceId();
    const entryDate = params.transactionDate || new Date().toISOString().split('T')[0];
    const entryNumber = `ACC-${params.referenceNumber || params.referenceId || Date.now()}`;

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      // 1. Primary write target: daybook_transactions with full idempotency & audit trail
      try {
        const { data: existing } = await supabase
          .from('daybook_transactions')
          .select('id')
          .eq('workspace_id', wsId)
          .eq('reference_type', params.referenceType)
          .eq('reference_id', params.referenceId)
          .maybeSingle();

        const dtPayload: any = {
          workspace_id: wsId,
          transaction_code: entryNumber,
          transaction_date: entryDate,
          transaction_type: params.transactionType,
          direction: params.direction || 'IN',
          amount: Math.abs(Number(params.amount) || 0),
          total_amount: params.totalAmount !== undefined ? params.totalAmount : null,
          remaining_amount: params.remainingAmount !== undefined ? params.remainingAmount : null,
          payment_status: params.paymentStatus || (params.transactionType === 'SALE' ? (params.remainingAmount && params.remainingAmount > 0 ? (params.amount > 0 ? 'PARTIALLY PAID' : 'UNPAID') : 'PAID') : null),
          payment_mode: params.paymentMode || 'Cash',
          party_type: params.partyType || 'customer',
          party_id: isValidUuid(params.partyId) ? params.partyId : null,
          party_name: params.partyName || null,
          reference_type: params.referenceType,
          reference_id: params.referenceId,
          reference_number: params.referenceNumber || null,
          description: params.description,
          notes: params.notes,
          status: params.paymentStatus === 'CANCELLED' ? 'VOID' : 'COMPLETED',
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          // Update existing transaction entry
          let { error: updErr } = await supabase
            .from('daybook_transactions')
            .update(dtPayload)
            .eq('id', existing.id);

          if (updErr && (updErr.code === '42703' || updErr.message?.includes('column'))) {
            delete dtPayload.total_amount;
            delete dtPayload.remaining_amount;
            delete dtPayload.payment_status;
            await supabase.from('daybook_transactions').update(dtPayload).eq('id', existing.id);
          }
          return { success: true, id: existing.id };
        } else {
          // Insert new transaction entry
          let { data: insData, error: insErr } = await supabase
            .from('daybook_transactions')
            .insert([dtPayload])
            .select('id')
            .single();

          if (insErr && (insErr.code === '42703' || insErr.message?.includes('column'))) {
            delete dtPayload.total_amount;
            delete dtPayload.remaining_amount;
            delete dtPayload.payment_status;
            const retry = await supabase.from('daybook_transactions').insert([dtPayload]).select('id').single();
            if (!retry.error && retry.data) {
              return { success: true, id: retry.data.id };
            }
          } else if (!insErr && insData) {
            return { success: true, id: insData.id };
          }
        }
      } catch (dtErr) {
        // Fall through to local fallback
      }
    }

    // Local Storage backup
    const localEntry: DaybookTransaction = {
      id: `db-${Date.now()}`,
      workspaceId: wsId,
      transactionCode: entryNumber,
      transactionDate: entryDate,
      transactionType: params.transactionType,
      direction: params.direction || 'IN',
      amount: Math.abs(Number(params.amount) || 0),
      totalAmount: params.totalAmount,
      remainingAmount: params.remainingAmount,
      paymentStatus: params.paymentStatus || (params.transactionType === 'SALE' ? (params.remainingAmount && params.remainingAmount > 0 ? (params.amount > 0 ? 'PARTIALLY PAID' : 'UNPAID') : 'PAID') : undefined),
      paymentMode: (params.paymentMode || 'Cash') as any,
      partyType: params.partyType,
      partyId: params.partyId,
      partyName: params.partyName,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      referenceNumber: params.referenceNumber,
      description: params.description,
      notes: params.notes,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    };

    const local = safeGetTenantStorage<any>(LOCAL_DAYBOOK_KEY, []);
    const existingIndex = local.findIndex((t: any) => t.referenceType === params.referenceType && t.referenceId === params.referenceId);
    if (existingIndex >= 0) {
      local[existingIndex] = { ...local[existingIndex], ...localEntry, id: local[existingIndex].id };
    } else {
      local.unshift(localEntry);
    }
    safeSaveTenantStorage(LOCAL_DAYBOOK_KEY, local);

    return { success: true, id: localEntry.id };
  }

  /**
   * Record a Financial Reversal Transaction (Never silently delete financial history)
   */
  public async recordReversalTransaction(params: {
    sourceType: string;
    sourceId: string;
    referenceNumber?: string;
    description: string;
    amount?: number;
  }): Promise<{ success: boolean }> {
    return this.recordFinancialTransaction({
      referenceType: params.sourceType as any,
      referenceId: params.sourceId,
      referenceNumber: params.referenceNumber,
      transactionType: 'ADJUSTMENT',
      direction: 'OUT',
      amount: params.amount || 0,
      description: `[REVERSAL]: ${params.description}`,
    });
  }

  /**
   * Create a manually logged Daybook Transaction
   */
  public async createManualTransaction(payload: {
    transactionType: DaybookTransaction['transactionType'];
    direction: DaybookTransaction['direction'];
    amount: number;
    paymentMode?: DaybookTransaction['paymentMode'];
    partyName?: string;
    description: string;
    notes?: string;
    transactionDate?: string;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    return this.recordFinancialTransaction({
      referenceType: 'MANUAL',
      referenceId: `MAN-${Date.now()}`,
      referenceNumber: `MAN-${Date.now()}`,
      transactionType: payload.transactionType,
      direction: payload.direction,
      amount: payload.amount,
      paymentMode: (payload.paymentMode || 'Cash') as any,
      partyType: 'other',
      partyName: payload.partyName || 'Manual Entry',
      description: payload.description,
      notes: payload.notes,
      transactionDate: payload.transactionDate,
    });
  }

  /**
   * Void a financial transaction with audit reason
   */
  public async voidTransaction(id: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    const wsId = await this.getWorkspaceId();

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        await supabase
          .from('accounting_entries')
          .update({
            notes: reason ? `[VOIDED]: ${reason}` : '[VOIDED]',
          })
          .eq('workspace_id', wsId)
          .eq('id', id);

        await supabase
          .from('daybook_transactions')
          .update({
            status: 'VOID',
            notes: reason ? `[VOIDED]: ${reason}` : '[VOIDED]',
          })
          .eq('workspace_id', wsId)
          .eq('id', id);

        return { success: true };
      }
    } catch (e: any) {
      handleSupabaseError(e, 'voidTransaction');
    }

    const local = safeGetTenantStorage<any>(LOCAL_DAYBOOK_KEY, []);
    const target = local.find((t) => t.id === id);
    if (target) {
      target.status = 'VOID';
      target.notes = reason ? `[VOIDED]: ${reason}` : '[VOIDED]';
      safeSaveTenantStorage(LOCAL_DAYBOOK_KEY, local);
    }
    return { success: true };
  }

  /**
   * Idempotently sync historical transactions from Counter Sales and Invoices
   */
  public async syncHistoricalTransactions(): Promise<{ syncedCount: number }> {
    let synced = 0;
    const wsId = await this.getWorkspaceId();

    if (!isSupabaseConfigured() || !isValidUuid(wsId)) return { syncedCount: 0 };

    try {
      const { data: sales } = await supabase
        .from('counter_sales')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('status', 'COMPLETED');

      for (const sale of (sales || [])) {
        await this.recordFinancialTransaction({
          referenceType: 'COUNTER_SALE',
          referenceId: sale.id,
          referenceNumber: sale.invoice_number || sale.sale_number,
          transactionType: 'SALE',
          direction: 'IN',
          amount: Number(sale.final_total) || 0,
          paymentMode: sale.payment_method || 'Cash',
          partyName: sale.customer_name || 'Walk-in Customer',
          description: `Counter Sale #${sale.invoice_number || sale.sale_number}`,
          transactionDate: sale.sale_date,
        });
        synced++;
      }
    } catch (e) {
      console.warn('Sync historical notice:', e);
    }

    return { syncedCount: synced };
  }

  /**
   * Filter local fallback records
   */
  private getFilteredLocalTransactions(wsId: string, options?: DaybookFilterOptions): DaybookTransaction[] {
    const local = safeGetTenantStorage<DaybookTransaction>(LOCAL_DAYBOOK_KEY, []);
    const { start, end } = this.getDateBounds(options?.dateRange, options?.startDate, options?.endDate);

    return local.filter((t) => {
      if (t.workspaceId && wsId && t.workspaceId !== wsId) return false;
      if (start && t.transactionDate < start) return false;
      if (end && t.transactionDate > end) return false;
      if (options?.transactionType && options.transactionType !== 'ALL' && t.transactionType !== options.transactionType) return false;
      if (options?.paymentMode && options.paymentMode !== 'ALL' && t.paymentMode !== options.paymentMode) return false;
      return true;
    });
  }
}

export const daybookService = new DaybookService();

import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { DaybookTransaction, DaybookFilterOptions, DaybookSummaryMetrics } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { fromDbDaybookTransaction } from './types';

const LOCAL_DAYBOOK_KEY = 'vistaar_local_daybook_db';

export class DaybookService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
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
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
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
   * Fetch Daybook Transactions with server-side filtering, sorting, and local fallback
   */
  public async getTransactions(options?: DaybookFilterOptions): Promise<{ data: DaybookTransaction[]; count: number; error?: string }> {
    const wsId = this.getWorkspaceId();

    try {
      if (isSupabaseConfigured()) {
        let query = supabase
          .from('daybook_transactions')
          .select('*', { count: 'exact' })
          .eq('workspace_id', wsId);

        // Apply Date Range
        const { start, end } = this.getDateBounds(options?.dateRange, options?.startDate, options?.endDate);
        if (start) query = query.gte('transaction_date', start);
        if (end) query = query.lte('transaction_date', end);

        // Apply Transaction Type
        if (options?.transactionType && options.transactionType !== 'ALL') {
          query = query.eq('transaction_type', options.transactionType);
        }

        // Apply Payment Mode
        if (options?.paymentMode && options.paymentMode !== 'ALL') {
          query = query.eq('payment_mode', options.paymentMode);
        }

        // Apply Party Type
        if (options?.partyType && options.partyType !== 'ALL') {
          query = query.eq('party_type', options.partyType);
        }

        // Apply Search
        if (options?.search && options.search.trim()) {
          const s = `%${options.search.trim()}%`;
          query = query.or(`party_name.ilike.${s},reference_number.ilike.${s},description.ilike.${s},transaction_code.ilike.${s}`);
        }

        // Pagination
        if (options?.page && options?.pageSize) {
          const from = (options.page - 1) * options.pageSize;
          const to = from + options.pageSize - 1;
          query = query.range(from, to);
        }

        query = query.order('transaction_date', { ascending: false }).order('created_at', { ascending: false });

        const { data, count, error } = await query;

        if (error) {
          const errStr = handleSupabaseError(error, 'getTransactions');
          const fallback = this.getFilteredLocalTransactions(wsId, options);
          return { data: fallback, count: fallback.length, error: errStr };
        }

        const mapped = (data || []).map((row: any) => fromDbDaybookTransaction(row));
        return { data: mapped, count: count || mapped.length };
      }
    } catch (e: any) {
      handleSupabaseError(e, 'getTransactions');
    }

    const fallback = this.getFilteredLocalTransactions(wsId, options);
    return { data: fallback, count: fallback.length };
  }

  /**
   * Calculate summary metrics for current filter view
   */
  public async getSummaryMetrics(options?: DaybookFilterOptions): Promise<DaybookSummaryMetrics> {
    const { data } = await this.getTransactions({ ...options, page: undefined, pageSize: undefined });
    const active = (data || []).filter((t) => t.status !== 'VOID');

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
   * Core Idempotent Financial Transaction Recording Engine
   */
  public async recordFinancialTransaction(txPayload: {
    referenceType: 'COUNTER_SALE' | 'PAYMENT' | 'EXPENSE' | 'UDHARI_PAYMENT' | 'INVOICE' | 'MANUAL';
    referenceId?: string;
    referenceNumber?: string;
    transactionType: DaybookTransaction['transactionType'];
    direction: DaybookTransaction['direction'];
    amount: number;
    paymentMode?: DaybookTransaction['paymentMode'];
    financialAccountId?: string;
    partyType?: 'customer' | 'supplier' | 'other';
    partyId?: string;
    partyName?: string;
    description?: string;
    notes?: string;
    transactionDate?: string;
    transactionTime?: string;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    const txDate = txPayload.transactionDate || new Date().toISOString().split('T')[0];
    const txTime = txPayload.transactionTime || new Date().toTimeString().split(' ')[0];
    const txCode = `DB-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const payload = {
      workspace_id: wsId,
      transaction_code: txCode,
      transaction_date: txDate,
      transaction_time: txTime,
      transaction_type: txPayload.transactionType,
      direction: txPayload.direction,
      amount: Math.abs(Number(txPayload.amount) || 0),
      payment_mode: txPayload.paymentMode || 'Cash',
      financial_account_id: txPayload.financialAccountId || null,
      party_type: txPayload.partyType || null,
      party_id: txPayload.partyId || null,
      party_name: txPayload.partyName || null,
      reference_type: txPayload.referenceType,
      reference_id: txPayload.referenceId || null,
      reference_number: txPayload.referenceNumber || null,
      description: txPayload.description || null,
      notes: txPayload.notes || null,
      status: 'COMPLETED',
    };

    try {
      if (isSupabaseConfigured()) {
        // If referenceId is available, check for duplicate idempotency
        if (txPayload.referenceId) {
          const { data: existing } = await supabase
            .from('daybook_transactions')
            .select('id')
            .eq('workspace_id', wsId)
            .eq('reference_type', txPayload.referenceType)
            .eq('reference_id', txPayload.referenceId)
            .maybeSingle();

          if (existing) {
            // Update existing entry cleanly
            const { error: upErr } = await supabase
              .from('daybook_transactions')
              .update({
                transaction_date: payload.transaction_date,
                transaction_type: payload.transaction_type,
                direction: payload.direction,
                amount: payload.amount,
                payment_mode: payload.payment_mode,
                party_name: payload.party_name,
                reference_number: payload.reference_number,
                description: payload.description,
                notes: payload.notes,
              })
              .eq('workspace_id', wsId)
              .eq('id', existing.id);

            if (!upErr) return { success: true, id: existing.id };
          }
        }

        const { data, error } = await supabase
          .from('daybook_transactions')
          .insert([payload])
          .select('id')
          .single();

        if (error) {
          const errStr = handleSupabaseError(error, 'recordFinancialTransaction');
          this.saveLocalTransaction(wsId, payload);
          return { success: true, id: `db-local-${Date.now()}` };
        }

        return { success: true, id: data.id };
      }
    } catch (e: any) {
      handleSupabaseError(e, 'recordFinancialTransaction');
    }

    this.saveLocalTransaction(wsId, payload);
    return { success: true, id: `db-local-${Date.now()}` };
  }

  /**
   * Create a manually logged Daybook Transaction (Other Income, Other Payment, Expense, Adjustment)
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
      paymentMode: payload.paymentMode || 'Cash',
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
    const wsId = this.getWorkspaceId();

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('daybook_transactions')
          .update({
            status: 'VOID',
            notes: reason ? `[VOIDED]: ${reason}` : '[VOIDED]',
          })
          .eq('workspace_id', wsId)
          .eq('id', id);

        if (error) {
          const errStr = handleSupabaseError(error, 'voidTransaction');
          return { success: false, error: errStr };
        }
        return { success: true };
      }
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'voidTransaction');
      return { success: false, error: errStr };
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
   * Idempotently backfill historical transactions from Counter Sales, Payments, Expenses, and Udhari
   */
  public async syncHistoricalTransactions(): Promise<{ syncedCount: number }> {
    let synced = 0;
    const wsId = this.getWorkspaceId();

    if (!isSupabaseConfigured()) return { syncedCount: 0 };

    try {
      // 1. Backfill Counter Sales
      const { data: sales } = await supabase
        .from('counter_sales')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('status', 'COMPLETED');

      for (const s of sales || []) {
        const res = await this.recordFinancialTransaction({
          referenceType: 'COUNTER_SALE',
          referenceId: s.id,
          referenceNumber: s.invoice_number || s.sale_number,
          transactionType: 'SALE',
          direction: 'IN',
          amount: Number(s.final_total) || 0,
          paymentMode: 'Cash',
          partyType: 'customer',
          partyId: s.customer_id,
          partyName: s.customer_name || 'Walk-in Customer',
          description: `Counter Sale #${s.invoice_number || s.sale_number}`,
          transactionDate: s.sale_date,
        });
        if (res.success) synced++;
      }

      // 2. Backfill Customer Payments
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('workspace_id', wsId);

      for (const p of payments || []) {
        const res = await this.recordFinancialTransaction({
          referenceType: 'PAYMENT',
          referenceId: p.id,
          referenceNumber: p.payment_number || p.invoice_number,
          transactionType: 'CUSTOMER_PAYMENT',
          direction: 'IN',
          amount: Number(p.amount) || 0,
          paymentMode: (p.method || 'Cash') as any,
          partyType: 'customer',
          partyId: p.customer_id,
          partyName: p.customer_name || 'Customer',
          description: `Payment Received #${p.payment_number || p.invoice_number || 'Receipt'}`,
          notes: p.notes,
          transactionDate: p.payment_date,
        });
        if (res.success) synced++;
      }

      // 3. Backfill Expenses
      const { data: expenses } = await supabase
        .from('expenses')
        .select('*')
        .eq('workspace_id', wsId);

      for (const ex of expenses || []) {
        const res = await this.recordFinancialTransaction({
          referenceType: 'EXPENSE',
          referenceId: ex.id,
          referenceNumber: ex.reference_no || ex.category,
          transactionType: 'EXPENSE',
          direction: 'OUT',
          amount: Number(ex.amount) || 0,
          paymentMode: 'Cash',
          partyType: 'other',
          partyName: ex.paid_to || ex.category || 'Vendor',
          description: ex.expense_name || `${ex.category} Expense`,
          notes: ex.notes,
          transactionDate: ex.expense_date,
        });
        if (res.success) synced++;
      }

      // 4. Backfill Udhari Payments
      const { data: udhariPays } = await supabase
        .from('udhari_payments')
        .select('*')
        .eq('workspace_id', wsId);

      for (const up of udhariPays || []) {
        const res = await this.recordFinancialTransaction({
          referenceType: 'UDHARI_PAYMENT',
          referenceId: up.id,
          referenceNumber: up.payment_code,
          transactionType: 'CUSTOMER_PAYMENT',
          direction: 'IN',
          amount: Number(up.amount) || 0,
          paymentMode: (up.payment_method || 'Cash') as any,
          partyType: 'customer',
          partyId: up.customer_id,
          partyName: 'Udhari Customer',
          description: `Udhari Recovery #${up.payment_code}`,
          notes: up.notes,
          transactionDate: up.payment_date,
        });
        if (res.success) synced++;
      }
    } catch (e) {
      console.warn('Daybook historical sync warning:', e);
    }

    return { syncedCount: synced };
  }

  // --- PRIVATE LOCAL STORAGE HELPERS ---
  private saveLocalTransaction(wsId: string, payload: any) {
    const local = safeGetTenantStorage<any>(LOCAL_DAYBOOK_KEY, []);

    const mapped = fromDbDaybookTransaction({ ...payload, id: `db-${Date.now()}` });
    local.unshift(mapped);
    safeSaveTenantStorage(LOCAL_DAYBOOK_KEY, local);
  }

  private getFilteredLocalTransactions(wsId: string, options?: DaybookFilterOptions): DaybookTransaction[] {
    const local = safeGetTenantStorage<any>(LOCAL_DAYBOOK_KEY, []);

    const { start, end } = this.getDateBounds(options?.dateRange, options?.startDate, options?.endDate);

    return local.filter((tx) => {
      if (start && tx.transactionDate < start) return false;
      if (end && tx.transactionDate > end) return false;
      if (options?.transactionType && options.transactionType !== 'ALL' && tx.transactionType !== options.transactionType) return false;
      if (options?.paymentMode && options.paymentMode !== 'ALL' && tx.paymentMode !== options.paymentMode) return false;
      if (options?.partyType && options.partyType !== 'ALL' && tx.partyType !== options.partyType) return false;
      if (options?.search && options.search.trim()) {
        const q = options.search.trim().toLowerCase();
        const party = (tx.partyName || '').toLowerCase();
        const ref = (tx.referenceNumber || '').toLowerCase();
        const desc = (tx.description || '').toLowerCase();
        const code = (tx.transactionCode || '').toLowerCase();
        if (!party.includes(q) && !ref.includes(q) && !desc.includes(q) && !code.includes(q)) return false;
      }
      return true;
    });
  }
}

export const daybookService = new DaybookService();

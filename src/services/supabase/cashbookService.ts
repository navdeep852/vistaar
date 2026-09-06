import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import {
  CashbookFilterOptions,
  CashbookSummaryMetrics,
  AccountBalanceSummary,
  DaybookTransaction,
} from '../../types';

const LOCAL_CASHBOOK_KEY = 'vistaar_local_cashbook_db';

export class CashbookService {
  private async getWorkspaceId(): Promise<string> {
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) return authWsId;
    } catch (e) {
      console.warn('Failed to get authoritative workspace ID in cashbookService:', e);
    }
    return supabaseAuthService.getCurrentCompanyId() || '';
  }

  public getFinancialYearBounds(fyString?: string): { start?: string; end?: string; label: string } {
    const today = new Date();
    const curYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;

    if (!fyString || fyString === 'CURRENT_FY' || fyString === 'FY_2026_27') {
      return {
        start: `${curYear}-04-01`,
        end: `${curYear + 1}-03-31`,
        label: `FY ${curYear}–${String(curYear + 1).substring(2)}`,
      };
    }

    if (fyString === 'PREVIOUS_FY' || fyString === 'FY_2025_26') {
      const prev = curYear - 1;
      return {
        start: `${prev}-04-01`,
        end: `${prev + 1}-03-31`,
        label: `FY ${prev}–${String(prev + 1).substring(2)}`,
      };
    }

    return { label: 'All Time' };
  }

  private getCashbookDateBounds(options?: CashbookFilterOptions): { start?: string; end?: string } {
    if (options?.dateRange === 'fy' || options?.financialYear) {
      const fy = this.getFinancialYearBounds(options.financialYear);
      return { start: fy.start, end: fy.end };
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (options?.dateRange === 'today') return { start: todayStr, end: todayStr };
    if (options?.dateRange === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { start: y.toISOString().split('T')[0], end: y.toISOString().split('T')[0] };
    }
    if (options?.dateRange === 'week') {
      const d = new Date(today);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return { start: monday.toISOString().split('T')[0], end: todayStr };
    }
    if (options?.dateRange === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: firstDay.toISOString().split('T')[0], end: todayStr };
    }
    if (options?.dateRange === 'last_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: firstDay.toISOString().split('T')[0], end: lastDay.toISOString().split('T')[0] };
    }
    if (options?.dateRange === 'custom') {
      return { start: options.startDate, end: options.endDate };
    }

    return {};
  }

  private mapPaymentMethodToAccount(method: string): string {
    const m = (method || '').toLowerCase();
    if (m.includes('cash')) return 'Cash Account';
    if (m.includes('upi')) return 'UPI Clearing';
    if (m.includes('bank')) return 'Bank Account';
    if (m.includes('card')) return 'Card Settlement';
    if (m.includes('cheque')) return 'Cheques in Hand';
    return 'Cash Account';
  }

  /**
   * Record an Authoritative Cashbook Entry.
   * STRICT CASHBOOK RULE:
   * Only created when actual money is received or paid (amount > 0 and non-credit).
   */
  public async recordCashbookEntry(params: {
    sourceType: string;
    sourceId?: string;
    referenceNumber?: string;
    direction: 'IN' | 'OUT';
    amount: number;
    paymentMethod: string;
    partyName?: string;
    description?: string;
    notes?: string;
    transactionDate?: string;
  }): Promise<{ success: boolean; id?: string }> {
    const amount = Number(params.amount) || 0;
    const method = params.paymentMethod || 'Cash';

    // Strictly enforce Cashbook rule: No entries for zero amount or credit/udhari sales
    if (amount <= 0 || method === 'Credit / Udhari' || method === 'Credit' || method === 'Udhari') {
      return { success: true };
    }

    const wsId = await this.getWorkspaceId();
    const entryDate = params.transactionDate || new Date().toISOString().split('T')[0];
    const entryNumber = `CB-${params.referenceNumber || Date.now()}`;
    const accountName = this.mapPaymentMethodToAccount(method);

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const payload: any = {
          workspace_id: wsId,
          entry_date: entryDate,
          entry_number: entryNumber,
          direction: params.direction,
          amount: amount,
          payment_method: method,
          account_name: accountName,
          source_type: params.sourceType,
          source_id: isValidUuid(params.sourceId) ? params.sourceId : null,
          reference_number: params.referenceNumber || null,
          party_name: params.partyName || null,
          description: params.description || `Cash receipt for #${params.referenceNumber || ''}`,
          notes: params.notes || null,
        };

        const { data, error } = await supabase
          .from('cashbook_entries')
          .insert([payload])
          .select('id')
          .single();

        if (!error && data) {
          return { success: true, id: data.id };
        }
      } catch (err) {
        // Fall through to local fallback
      }
    }

    const localEntry = {
      id: `cb-${Date.now()}`,
      workspaceId: wsId,
      entryDate,
      entryNumber,
      direction: params.direction,
      amount,
      paymentMethod: method,
      accountName,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      referenceNumber: params.referenceNumber,
      partyName: params.partyName,
      description: params.description,
      notes: params.notes,
      createdAt: new Date().toISOString(),
    };

    const local = safeGetTenantStorage<any>(LOCAL_CASHBOOK_KEY, []);
    local.unshift(localEntry);
    safeSaveTenantStorage(LOCAL_CASHBOOK_KEY, local);

    return { success: true, id: localEntry.id };
  }

  /**
   * Fetch money-movement Cashbook transactions
   */
  public async getTransactions(options?: CashbookFilterOptions): Promise<{ data: DaybookTransaction[]; count: number; error?: string }> {
    const wsId = await this.getWorkspaceId();
    const { start, end } = this.getCashbookDateBounds(options);

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        // 1. Try querying cashbook_entries
        let query = supabase
          .from('cashbook_entries')
          .select('*', { count: 'exact' })
          .eq('workspace_id', wsId);

        if (start) query = query.gte('entry_date', start);
        if (end) query = query.lte('entry_date', end);

        if (options?.paymentMode && options.paymentMode !== 'ALL') {
          query = query.eq('payment_method', options.paymentMode);
        }

        query = query.order('entry_date', { ascending: false }).order('created_at', { ascending: false });

        const { data, count, error } = await query;

        if (!error && data && data.length > 0) {
          const mapped: DaybookTransaction[] = data.map((row: any) => ({
            id: row.id,
            workspaceId: row.workspace_id,
            transactionCode: row.entry_number,
            transactionDate: row.entry_date,
            transactionType: 'CUSTOMER_PAYMENT' as any,
            direction: (row.direction || 'IN') as any,
            amount: Number(row.amount) || 0,
            paymentMode: row.payment_method as any,
            partyName: row.party_name || 'Customer',
            referenceType: row.source_type as any,
            referenceId: row.source_id,
            referenceNumber: row.reference_number,
            description: row.description,
            notes: row.notes,
            status: 'COMPLETED',
            createdAt: row.created_at,
          }));

          return { data: mapped, count: count || mapped.length };
        }
      } catch (cbEx) {
        // Fall through to synthesis
      }

      // 2. Synthesize actual cash movements from payments and paid counter sales
      const synthesized = await this.synthesizeCashbookFromLiveSources(wsId, options);
      if (synthesized.length > 0) {
        return { data: synthesized, count: synthesized.length };
      }
    }

    // Local Storage fallback
    const local = safeGetTenantStorage<any>(LOCAL_CASHBOOK_KEY, []);
    const filtered = local.filter((t: any) => {
      if (start && t.entryDate < start) return false;
      if (end && t.entryDate > end) return false;
      return true;
    }).map((t: any) => ({
      id: t.id,
      workspaceId: t.workspaceId,
      transactionCode: t.entryNumber,
      transactionDate: t.entryDate,
      transactionType: 'CUSTOMER_PAYMENT' as any,
      direction: t.direction as any,
      amount: Number(t.amount) || 0,
      paymentMode: t.paymentMethod as any,
      partyName: t.partyName,
      referenceType: t.sourceType as any,
      referenceId: t.sourceId,
      referenceNumber: t.referenceNumber,
      description: t.description,
      status: 'COMPLETED' as any,
      createdAt: t.createdAt,
    }));

    return { data: filtered, count: filtered.length };
  }

  /**
   * Resilient synthesis of actual money movements from authoritative live tables
   */
  private async synthesizeCashbookFromLiveSources(wsId: string, options?: CashbookFilterOptions): Promise<DaybookTransaction[]> {
    const list: DaybookTransaction[] = [];
    const { start, end } = this.getCashbookDateBounds(options);

    try {
      // A. Counter Sales where actual money was received (amount_received > 0, non-credit)
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
          const method = cs.payment_method || 'Cash';
          if (method === 'Credit' || method === 'Credit / Udhari' || method === 'Udhari') continue;

          const rec = Number(cs.amount_received !== undefined ? cs.amount_received : cs.final_total) || 0;
          if (rec > 0) {
            list.push({
              id: `cb-cs-${cs.id}`,
              workspaceId: cs.workspace_id,
              transactionCode: `CB-${cs.sale_number}`,
              transactionDate: cs.sale_date,
              transactionType: 'CUSTOMER_PAYMENT',
              direction: 'IN',
              amount: rec,
              paymentMode: method as any,
              partyName: cs.customer_name || 'Walk-in Customer',
              referenceType: 'COUNTER_SALE',
              referenceId: cs.id,
              referenceNumber: cs.invoice_number || cs.sale_number,
              description: `Counter Sale Receipt #${cs.invoice_number || cs.sale_number}`,
              status: 'COMPLETED',
              createdAt: cs.created_at,
            });
          }
        }
      }

      // B. Payments recorded against invoices
      let payQuery = supabase
        .from('payments')
        .select('*')
        .eq('workspace_id', wsId);

      if (start) payQuery = payQuery.gte('date', start);
      if (end) payQuery = payQuery.lte('date', end);

      const { data: payList } = await payQuery;
      if (payList) {
        for (const p of payList) {
          const amt = Number(p.amount) || 0;
          if (amt > 0) {
            list.push({
              id: `cb-pay-${p.id}`,
              workspaceId: p.workspace_id,
              transactionCode: p.payment_number || `PAY-${p.id.substring(0, 8)}`,
              transactionDate: p.date,
              transactionType: 'CUSTOMER_PAYMENT',
              direction: 'IN',
              amount: amt,
              paymentMode: (p.payment_method || 'Cash') as any,
              partyName: 'Customer',
              referenceType: 'PAYMENT',
              referenceId: p.id,
              referenceNumber: p.reference_number || p.payment_number,
              description: `Payment Received #${p.payment_number || ''}`,
              status: 'COMPLETED',
              createdAt: p.created_at,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[synthesizeCashbookFromLiveSources] notice:', e);
    }

    list.sort((a, b) => (b.transactionDate > a.transactionDate ? 1 : -1));
    return list;
  }

  /**
   * Calculate Cashbook liquidity metrics
   */
  public async getSummaryMetrics(options?: CashbookFilterOptions): Promise<CashbookSummaryMetrics> {
    const { data: allTxs } = await this.getTransactions({ ...options, page: undefined, pageSize: undefined });

    let totalReceipts = 0;
    let totalPayments = 0;
    let cashBalance = 0;
    let bankBalance = 0;

    for (const tx of allTxs) {
      const amt = Number(tx.amount) || 0;
      const mode = (tx.paymentMode || 'Cash').toLowerCase();
      const isCash = mode.includes('cash');

      if (tx.direction === 'IN') {
        totalReceipts += amt;
        if (isCash) cashBalance += amt;
        else bankBalance += amt;
      } else if (tx.direction === 'OUT') {
        totalPayments += amt;
        if (isCash) cashBalance -= amt;
        else bankBalance -= amt;
      }
    }

    const now = new Date().toISOString();
    const wsId = await this.getWorkspaceId();

    const defaultAccounts: AccountBalanceSummary[] = [
      {
        account: {
          id: 'acc-cash',
          workspaceId: wsId,
          name: 'Cash In Hand',
          accountType: 'CASH',
          openingBalance: 0,
          openingBalanceDate: new Date().toISOString().split('T')[0],
          isDefault: true,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        openingBalance: 0,
        totalReceipts: cashBalance,
        totalPayments: 0,
        totalTransfersIn: 0,
        totalTransfersOut: 0,
        closingBalance: cashBalance,
      },
      {
        account: {
          id: 'acc-bank',
          workspaceId: wsId,
          name: 'Bank & UPI Accounts',
          accountType: 'BANK',
          openingBalance: 0,
          openingBalanceDate: new Date().toISOString().split('T')[0],
          isDefault: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        openingBalance: 0,
        totalReceipts: bankBalance,
        totalPayments: 0,
        totalTransfersIn: 0,
        totalTransfersOut: 0,
        closingBalance: bankBalance,
      },
    ];

    return {
      totalOpeningBalance: 0,
      totalReceipts,
      totalPayments,
      totalTransfers: 0,
      totalClosingBalance: totalReceipts - totalPayments,
      accountSummaries: defaultAccounts,
    };
  }

  /**
   * Transfer funds between accounts
   */
  public async transferFunds(params: {
    sourceAccountId: string;
    targetAccountId: string;
    amount: number;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const amount = Number(params.amount) || 0;
      if (amount <= 0) return { success: false, error: 'Amount must be greater than zero.' };

      await this.recordCashbookEntry({
        sourceType: 'TRANSFER',
        direction: 'OUT',
        amount,
        paymentMethod: 'Bank Transfer',
        description: `Transfer out: ${params.notes || 'Inter-account transfer'}`,
      });

      await this.recordCashbookEntry({
        sourceType: 'TRANSFER',
        direction: 'IN',
        amount,
        paymentMethod: 'Bank Transfer',
        description: `Transfer in: ${params.notes || 'Inter-account transfer'}`,
      });

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Transfer failed' };
    }
  }
}

export const cashbookService = new CashbookService();

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

  public mapPaymentMethodToAccount(method: string): string {
    const m = (method || '').toLowerCase();
    if (m.includes('upi')) return 'UPI Clearing';
    if (m.includes('bank') || m.includes('neft') || m.includes('rtgs') || m.includes('imps')) return 'Bank Account';
    if (m.includes('card')) return 'Card Settlement';
    if (m.includes('cheque')) return 'Cheques in Hand';
    return 'Cash Account';
  }

  /**
   * Record an Authoritative Cashbook Entry.
   * STRICT ACCOUNTING RULE:
   * Only recorded when actual money is received or paid (amount > 0 and non-credit).
   */
  public async recordCashbookEntry(params: {
    sourceType: string;
    sourceId?: string;
    referenceNumber?: string;
    direction: 'IN' | 'OUT' | 'NON_CASH';
    amount: number;
    paymentMethod: string;
    partyName?: string;
    description?: string;
    notes?: string;
    transactionDate?: string;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
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

    const payload: any = {
      workspace_id: wsId,
      entry_date: entryDate,
      entry_number: entryNumber,
      direction: params.direction,
      amount: amount,
      payment_method: method,
      account_name: accountName,
      source_type: params.sourceType,
      source_id: params.sourceId || null,
      reference_number: params.referenceNumber || null,
      party_name: params.partyName || null,
      description: params.description || `Payment receipt for #${params.referenceNumber || ''}`.trim(),
      notes: params.notes || null,
    };

    let createdId = `cb-${Date.now()}`;
    let isPersistedToDb = false;

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data, error } = await supabase
          .from('cashbook_entries')
          .insert([payload])
          .select('id')
          .single();

        if (!error && data) {
          createdId = data.id;
          isPersistedToDb = true;
        } else if (error) {
          // Check for unique conflict (idempotency)
          if (error.code === '23505') {
            return { success: true };
          }
          console.warn('[recordCashbookEntry] Supabase write notice:', error.message);
        }
      } catch (err) {
        console.warn('[recordCashbookEntry] Exception notice:', err);
      }
    }

    // Local mirror for high resilience & offline support
    const localEntry = {
      id: createdId,
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
    // Deduplicate in local storage
    const exists = local.some((e: any) =>
      params.sourceId && e.sourceType === params.sourceType && e.sourceId === params.sourceId && e.direction === params.direction
    );
    if (!exists) {
      local.unshift(localEntry);
      safeSaveTenantStorage(LOCAL_CASHBOOK_KEY, local);
    }

    return { success: true, id: createdId };
  }

  /**
   * Fetch Authoritative Multi-Source Merged Cashbook Transactions.
   * PHASE 10 COMPLIANCE:
   * Merges cashbook_entries, payments, and completed counter_sales with deterministic deduplication
   * so no payment is omitted even if cashbook_entries is missing records.
   */
  public async getTransactions(options?: CashbookFilterOptions): Promise<{ data: DaybookTransaction[]; count: number; error?: string }> {
    const wsId = await this.getWorkspaceId();
    const { start, end } = this.getCashbookDateBounds(options);

    const mergedList: DaybookTransaction[] = [];
    const seenKeys = new Set<string>();
    const seenPaymentIds = new Set<string>();
    const seenCounterSaleIds = new Set<string>();

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      // 1. Authoritative cashbook_entries from Supabase
      try {
        let cbQuery = supabase
          .from('cashbook_entries')
          .select('*')
          .eq('workspace_id', wsId);

        if (start) cbQuery = cbQuery.gte('entry_date', start);
        if (end) cbQuery = cbQuery.lte('entry_date', end);

        const { data: cbData, error: cbErr } = await cbQuery;
        if (!cbErr && cbData) {
          for (const row of cbData) {
            const key = `${row.source_type || 'MANUAL'}:${row.source_id || row.id}:${row.direction || 'IN'}`;
            seenKeys.add(key);
            if (row.source_type === 'INVOICE_PAYMENT' && row.source_id) {
              seenPaymentIds.add(String(row.source_id));
            }
            if (row.source_type === 'COUNTER_SALE' && row.source_id) {
              seenCounterSaleIds.add(String(row.source_id));
            }

            mergedList.push({
              id: row.id,
              workspaceId: row.workspace_id,
              transactionCode: row.entry_number,
              transactionDate: row.entry_date,
              transactionType: 'CUSTOMER_PAYMENT',
              direction: (row.direction || 'IN') as any,
              amount: Number(row.amount) || 0,
              paymentMode: (row.payment_method || 'Cash') as any,
              partyName: row.party_name || 'Customer',
              referenceType: row.source_type as any,
              referenceId: row.source_id,
              referenceNumber: row.reference_number,
              description: row.description,
              notes: row.notes,
              status: 'COMPLETED',
              createdAt: row.created_at,
            });
          }
        }
      } catch (cbEx) {
        // Fall through to live tables
      }

      // 2. Authoritative Payments table (public.payments)
      try {
        let payQuery = supabase
          .from('payments')
          .select('*')
          .eq('workspace_id', wsId);

        if (start) payQuery = payQuery.gte('payment_date', start);
        if (end) payQuery = payQuery.lte('payment_date', end);

        const { data: payData, error: payErr } = await payQuery;
        if (!payErr && payData) {
          for (const p of payData) {
            const amt = Number(p.amount) || 0;
            const method = p.method || 'Cash';
            if (amt <= 0) continue;
            if (method === 'Credit / Udhari' || method === 'Credit' || method === 'Udhari') continue;

            const key = `INVOICE_PAYMENT:${p.id}:IN`;
            if (seenPaymentIds.has(p.id) || seenKeys.has(key)) {
              continue;
            }

            seenKeys.add(key);
            seenPaymentIds.add(p.id);

            const txDate = p.payment_date || (p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0]);
            mergedList.push({
              id: `cb-pay-${p.id}`,
              workspaceId: p.workspace_id,
              transactionCode: p.payment_number || `PAY-${p.id.substring(0, 8)}`,
              transactionDate: txDate,
              transactionType: 'CUSTOMER_PAYMENT',
              direction: 'IN',
              amount: amt,
              paymentMode: method as any,
              partyName: p.customer_name || 'Customer',
              referenceType: 'INVOICE_PAYMENT' as any,
              referenceId: p.id,
              referenceNumber: p.invoice_number || p.payment_number,
              description: `Payment received for Invoice #${p.invoice_number || ''}`.trim(),
              notes: p.reference_no ? `Ref: ${p.reference_no}` : p.notes || undefined,
              status: 'COMPLETED',
              createdAt: p.created_at,
            });
          }
        }
      } catch (payEx) {
        console.warn('[getTransactions] payments query notice:', payEx);
      }

      // 3. Completed Counter Sales with actual money received
      try {
        let csQuery = supabase
          .from('counter_sales')
          .select('*')
          .eq('workspace_id', wsId)
          .eq('status', 'COMPLETED');

        if (start) csQuery = csQuery.gte('sale_date', start);
        if (end) csQuery = csQuery.lte('sale_date', end);

        const { data: csData, error: csErr } = await csQuery;
        if (!csErr && csData) {
          for (const cs of csData) {
            const method = cs.payment_method || 'Cash';
            if (method === 'Credit' || method === 'Credit / Udhari' || method === 'Udhari') continue;

            const rec = Number(cs.amount_received !== undefined ? cs.amount_received : cs.final_total) || 0;
            if (rec <= 0) continue;

            const key = `COUNTER_SALE:${cs.id}:IN`;
            if (seenCounterSaleIds.has(cs.id) || seenKeys.has(key)) {
              continue;
            }

            seenKeys.add(key);
            seenCounterSaleIds.add(cs.id);

            mergedList.push({
              id: `cb-cs-${cs.id}`,
              workspaceId: cs.workspace_id,
              transactionCode: `CB-${cs.sale_number}`,
              transactionDate: cs.sale_date,
              transactionType: 'CUSTOMER_PAYMENT',
              direction: 'IN',
              amount: rec,
              paymentMode: method as any,
              partyName: cs.customer_name || 'Walk-in Customer',
              referenceType: 'COUNTER_SALE' as any,
              referenceId: cs.id,
              referenceNumber: cs.invoice_number || cs.sale_number,
              description: `Counter Sale Receipt #${cs.invoice_number || cs.sale_number}`,
              status: 'COMPLETED',
              createdAt: cs.created_at,
            });
          }
        }
      } catch (csEx) {
        console.warn('[getTransactions] counter_sales query notice:', csEx);
      }
    }

    // 4. Local Storage fallback / mirror check
    const local = safeGetTenantStorage<any>(LOCAL_CASHBOOK_KEY, []);
    for (const t of local) {
      const key = `${t.sourceType || 'MANUAL'}:${t.sourceId || t.id}:${t.direction || 'IN'}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        mergedList.push({
          id: t.id,
          workspaceId: t.workspaceId,
          transactionCode: t.entryNumber,
          transactionDate: t.entryDate,
          transactionType: 'CUSTOMER_PAYMENT',
          direction: t.direction as any,
          amount: Number(t.amount) || 0,
          paymentMode: t.paymentMethod as any,
          partyName: t.partyName || 'Customer',
          referenceType: t.sourceType as any,
          referenceId: t.sourceId,
          referenceNumber: t.referenceNumber,
          description: t.description,
          notes: t.notes,
          status: 'COMPLETED',
          createdAt: t.createdAt,
        });
      }
    }

    // Filter by Date Range (exact boundary matching)
    let filtered = mergedList.filter((tx) => {
      if (start && tx.transactionDate < start) return false;
      if (end && tx.transactionDate > end) return false;
      return true;
    });

    // Filter by Payment Mode (UPI, Cash, Card, Bank Transfer, etc.)
    if (options?.paymentMode && options.paymentMode !== 'ALL') {
      const targetMode = options.paymentMode.toLowerCase();
      filtered = filtered.filter((tx) => {
        const mode = (tx.paymentMode || '').toLowerCase();
        if (targetMode === 'bank' || targetMode === 'bank transfer') {
          return mode.includes('bank') || mode.includes('neft') || mode.includes('rtgs') || mode.includes('imps');
        }
        return mode === targetMode || mode.includes(targetMode);
      });
    }

    // Filter by Search Query
    if (options?.search && options.search.trim() !== '') {
      const q = options.search.toLowerCase().trim();
      filtered = filtered.filter(
        (tx) =>
          (tx.partyName && tx.partyName.toLowerCase().includes(q)) ||
          (tx.referenceNumber && tx.referenceNumber.toLowerCase().includes(q)) ||
          (tx.transactionCode && tx.transactionCode.toLowerCase().includes(q)) ||
          (tx.description && tx.description.toLowerCase().includes(q)) ||
          (tx.paymentMode && String(tx.paymentMode).toLowerCase().includes(q))
      );
    }

    // Deterministic Sort: Latest transactionDate first, then latest created
    filtered.sort((a, b) => {
      if (b.transactionDate !== a.transactionDate) {
        return b.transactionDate.localeCompare(a.transactionDate);
      }
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    return { data: filtered, count: filtered.length };
  }

  /**
   * Calculate Authoritative Cashbook Liquidity & Account Summaries.
   * PHASE 18 COMPLIANCE:
   * Separates Cash, UPI, Bank, Card, and Cheque accounts without combining UPI into physical cash.
   */
  public async getSummaryMetrics(options?: CashbookFilterOptions): Promise<CashbookSummaryMetrics> {
    const { data: allTxs } = await this.getTransactions({ ...options, paymentMode: undefined });

    let totalReceipts = 0;
    let totalPayments = 0;

    let cashReceipts = 0;
    let upiReceipts = 0;
    let bankReceipts = 0;
    let cardReceipts = 0;
    let chequeReceipts = 0;

    let cashPayments = 0;
    let upiPayments = 0;
    let bankPayments = 0;
    let cardPayments = 0;
    let chequePayments = 0;

    for (const tx of allTxs) {
      const amt = Number(tx.amount) || 0;
      const mode = (tx.paymentMode || 'Cash').toLowerCase();
      const isReceipt = tx.direction === 'IN';

      if (isReceipt) {
        totalReceipts += amt;
        if (mode.includes('upi')) upiReceipts += amt;
        else if (mode.includes('bank') || mode.includes('neft') || mode.includes('rtgs')) bankReceipts += amt;
        else if (mode.includes('card')) cardReceipts += amt;
        else if (mode.includes('cheque')) chequeReceipts += amt;
        else cashReceipts += amt;
      } else {
        totalPayments += amt;
        if (mode.includes('upi')) upiPayments += amt;
        else if (mode.includes('bank') || mode.includes('neft') || mode.includes('rtgs')) bankPayments += amt;
        else if (mode.includes('card')) cardPayments += amt;
        else if (mode.includes('cheque')) chequePayments += amt;
        else cashPayments += amt;
      }
    }

    const now = new Date().toISOString();
    const wsId = await this.getWorkspaceId();

    const accountSummaries: AccountBalanceSummary[] = [
      {
        account: {
          id: 'acc-cash',
          workspaceId: wsId,
          name: 'Cash in Hand',
          accountType: 'CASH',
          openingBalance: 0,
          openingBalanceDate: new Date().toISOString().split('T')[0],
          isDefault: true,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        openingBalance: 0,
        totalReceipts: cashReceipts,
        totalPayments: cashPayments,
        totalTransfersIn: 0,
        totalTransfersOut: 0,
        closingBalance: cashReceipts - cashPayments,
      },
      {
        account: {
          id: 'acc-upi',
          workspaceId: wsId,
          name: 'UPI Clearing',
          accountType: 'UPI',
          openingBalance: 0,
          openingBalanceDate: new Date().toISOString().split('T')[0],
          isDefault: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        openingBalance: 0,
        totalReceipts: upiReceipts,
        totalPayments: upiPayments,
        totalTransfersIn: 0,
        totalTransfersOut: 0,
        closingBalance: upiReceipts - upiPayments,
      },
      {
        account: {
          id: 'acc-bank',
          workspaceId: wsId,
          name: 'Bank Accounts',
          accountType: 'BANK',
          openingBalance: 0,
          openingBalanceDate: new Date().toISOString().split('T')[0],
          isDefault: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        openingBalance: 0,
        totalReceipts: bankReceipts,
        totalPayments: bankPayments,
        totalTransfersIn: 0,
        totalTransfersOut: 0,
        closingBalance: bankReceipts - bankPayments,
      },
      {
        account: {
          id: 'acc-card',
          workspaceId: wsId,
          name: 'Card Settlement',
          accountType: 'CARD',
          openingBalance: 0,
          openingBalanceDate: new Date().toISOString().split('T')[0],
          isDefault: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        openingBalance: 0,
        totalReceipts: cardReceipts,
        totalPayments: cardPayments,
        totalTransfersIn: 0,
        totalTransfersOut: 0,
        closingBalance: cardReceipts - cardPayments,
      },
      {
        account: {
          id: 'acc-cheque',
          workspaceId: wsId,
          name: 'Cheques in Hand',
          accountType: 'OTHER',
          openingBalance: 0,
          openingBalanceDate: new Date().toISOString().split('T')[0],
          isDefault: false,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        openingBalance: 0,
        totalReceipts: chequeReceipts,
        totalPayments: chequePayments,
        totalTransfersIn: 0,
        totalTransfersOut: 0,
        closingBalance: chequeReceipts - chequePayments,
      },
    ];

    return {
      totalOpeningBalance: 0,
      totalReceipts,
      totalPayments,
      totalTransfers: 0,
      totalClosingBalance: totalReceipts - totalPayments,
      accountSummaries,
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

  /**
   * Diagnostic & Historical Reconciliation Tool.
   * PHASE 11 & 22 COMPLIANCE:
   * Reconciles all payments against cashbook entries idempotently without duplicating records.
   */
  public async reconcileInvoicePaymentsWithCashbook(): Promise<{
    totalPayments: number;
    existingCashbookEntries: number;
    reconciledCount: number;
    missingCount: number;
    discrepancyAmount: number;
    details: string[];
  }> {
    const wsId = await this.getWorkspaceId();
    const details: string[] = [];

    let paymentsList: any[] = [];
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data } = await supabase
          .from('payments')
          .select('*')
          .eq('workspace_id', wsId);
        if (data) paymentsList = data;
      } catch (e) {
        // ignore
      }
    }

    if (paymentsList.length === 0) {
      paymentsList = safeGetTenantStorage<any>('vistaar_local_payments_db', []);
    }

    // Fetch existing cashbook entries
    let existingCb: any[] = [];
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data } = await supabase
          .from('cashbook_entries')
          .select('*')
          .eq('workspace_id', wsId);
        if (data) existingCb = data;
      } catch (e) {
        // ignore
      }
    }
    const localCb = safeGetTenantStorage<any>(LOCAL_CASHBOOK_KEY, []);
    const existingIds = new Set<string>();

    for (const cb of [...existingCb, ...localCb]) {
      if (cb.sourceId) existingIds.add(String(cb.sourceId));
      if (cb.source_id) existingIds.add(String(cb.source_id));
    }

    let reconciledCount = 0;
    let missingCount = 0;
    let discrepancyAmount = 0;

    for (const p of paymentsList) {
      const amt = Number(p.amount) || 0;
      const method = p.method || p.payment_method || 'Cash';
      if (amt <= 0) continue;
      if (method === 'Credit / Udhari' || method === 'Credit' || method === 'Udhari') continue;

      if (!existingIds.has(String(p.id))) {
        missingCount++;
        discrepancyAmount += amt;

        // Idempotently create missing cashbook entry
        const res = await this.recordCashbookEntry({
          sourceType: 'INVOICE_PAYMENT',
          sourceId: p.id,
          referenceNumber: p.invoice_number || p.payment_number,
          direction: 'IN',
          amount: amt,
          paymentMethod: method,
          partyName: p.customer_name || 'Customer',
          description: `Payment received for Invoice #${p.invoice_number || p.payment_number}`,
          notes: p.reference_no ? `Ref: ${p.reference_no}` : undefined,
          transactionDate: p.payment_date || (p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
        });

        if (res.success) {
          reconciledCount++;
          existingIds.add(String(p.id));
          details.push(`Backfilled Payment #${p.payment_number || p.id} (₹${amt} via ${method})`);
        }
      }
    }

    return {
      totalPayments: paymentsList.length,
      existingCashbookEntries: existingCb.length + localCb.length,
      reconciledCount,
      missingCount,
      discrepancyAmount,
      details,
    };
  }
}

export const cashbookService = new CashbookService();

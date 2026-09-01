import { daybookService } from './daybookService';
import { financialAccountService } from './financialAccountService';
import {
  DaybookTransaction,
  FinancialAccount,
  CashbookFilterOptions,
  CashbookSummaryMetrics,
  AccountBalanceSummary,
} from '../../types';

export class CashbookService {
  /**
   * Calculate Indian Financial Year date bounds (1 April -> 31 March)
   * Example: FY 2026-27 -> 2026-04-01 to 2027-03-31
   */
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

    if (fyString.startsWith('FY_')) {
      const parts = fyString.replace('FY_', '').split('_');
      if (parts.length === 2) {
        const startYr = parseInt(parts[0], 10);
        const endYr = startYr + 1;
        return {
          start: `${startYr}-04-01`,
          end: `${endYr}-03-31`,
          label: `FY ${startYr}–${String(endYr).substring(2)}`,
        };
      }
    }

    return { label: 'All Time' };
  }

  /**
   * Compute date bounds for Cashbook filtering including FY and presets
   */
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
      const yStr = y.toISOString().split('T')[0];
      return { start: yStr, end: yStr };
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

  /**
   * Fetch money-movement Cashbook transactions with server-side/local filtering
   */
  public async getTransactions(options?: CashbookFilterOptions): Promise<{ data: DaybookTransaction[]; count: number; error?: string }> {
    const { start, end } = this.getCashbookDateBounds(options);

    // Fetch Daybook transactions
    const result = await daybookService.getTransactions({
      dateRange: options?.dateRange === 'fy' ? undefined : (options?.dateRange as any),
      startDate: start,
      endDate: end,
      transactionType: options?.transactionType,
      paymentMode: options?.paymentMode,
      search: options?.search,
      page: options?.page,
      pageSize: options?.pageSize,
    });

    let filtered = (result.data || []).filter((tx) => tx.status !== 'VOID');

    // Filter out credit/non-cash entries if any
    filtered = filtered.filter((tx) => tx.direction === 'IN' || tx.direction === 'OUT' || tx.transactionType === 'TRANSFER');

    // Account Specific Filtering
    if (options?.financialAccountId && options.financialAccountId !== 'ALL') {
      const targetAccId = options.financialAccountId;
      filtered = filtered.filter((tx) => tx.financialAccountId === targetAccId || tx.transferTargetAccountId === targetAccId);
    }

    return { data: filtered, count: filtered.length, error: result.error };
  }

  /**
   * Calculate summary metrics & account-wise running balances
   */
  public async getSummaryMetrics(options?: CashbookFilterOptions): Promise<CashbookSummaryMetrics> {
    const accounts = await financialAccountService.getAccounts();
    const { data: allTxs } = await this.getTransactions({ ...options, page: undefined, pageSize: undefined });

    const accountSummaries: AccountBalanceSummary[] = accounts.map((acc) => {
      const opening = acc.openingBalance || 0;
      let receipts = 0;
      let payments = 0;
      let transfersIn = 0;
      let transfersOut = 0;

      for (const tx of allTxs) {
        const amt = Number(tx.amount) || 0;

        // Is this transaction directly associated with this account or payment mode?
        const isPrimaryAcc = tx.financialAccountId === acc.id || (!tx.financialAccountId && this.mapPaymentModeToType(tx.paymentMode) === acc.accountType);
        const isTransferTarget = tx.transferTargetAccountId === acc.id;

        if (tx.transactionType === 'TRANSFER') {
          if (isPrimaryAcc) transfersOut += amt;
          if (isTransferTarget) transfersIn += amt;
        } else if (isPrimaryAcc) {
          if (tx.direction === 'IN') receipts += amt;
          if (tx.direction === 'OUT') payments += amt;
        }
      }

      const closing = opening + receipts - payments + transfersIn - transfersOut;

      return {
        account: { ...acc, currentBalance: closing },
        openingBalance: opening,
        totalReceipts: receipts,
        totalPayments: payments,
        totalTransfersIn: transfersIn,
        totalTransfersOut: transfersOut,
        closingBalance: closing,
      };
    });

    const totalOpeningBalance = accountSummaries.reduce((acc, s) => acc + s.openingBalance, 0);
    const totalReceipts = accountSummaries.reduce((acc, s) => acc + s.totalReceipts, 0);
    const totalPayments = accountSummaries.reduce((acc, s) => acc + s.totalPayments, 0);
    const totalTransfers = accountSummaries.reduce((acc, s) => acc + s.totalTransfersIn, 0);
    const totalClosingBalance = accountSummaries.reduce((acc, s) => acc + s.closingBalance, 0);

    return {
      totalOpeningBalance,
      totalReceipts,
      totalPayments,
      totalTransfers,
      totalClosingBalance,
      accountSummaries,
    };
  }

  /**
   * Inter-Account Fund Transfer (Bank -> Cash, Cash -> Bank, Bank -> UPI, etc.)
   */
  public async transferFunds(payload: {
    sourceAccountId: string;
    targetAccountId: string;
    amount: number;
    transferDate?: string;
    notes?: string;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    if (payload.sourceAccountId === payload.targetAccountId) {
      return { success: false, error: 'Source and Target financial accounts must be different.' };
    }

    const accounts = await financialAccountService.getAccounts();
    const sourceAcc = accounts.find((a) => a.id === payload.sourceAccountId);
    const targetAcc = accounts.find((a) => a.id === payload.targetAccountId);

    const sourceName = sourceAcc ? sourceAcc.name : 'Source Account';
    const targetName = targetAcc ? targetAcc.name : 'Target Account';

    return daybookService.recordFinancialTransaction({
      referenceType: 'MANUAL',
      referenceId: `TRF-${Date.now()}`,
      referenceNumber: `TRF-${Date.now()}`,
      transactionType: 'TRANSFER',
      direction: 'OUT',
      amount: payload.amount,
      paymentMode: 'Bank Transfer',
      financialAccountId: payload.sourceAccountId,
      transferTargetAccountId: payload.targetAccountId,
      partyType: 'other',
      partyName: `Transfer to ${targetName}`,
      description: `Fund Transfer: ${sourceName} → ${targetName}`,
      notes: payload.notes,
      transactionDate: payload.transferDate,
    });
  }

  /**
   * Inspect Day-level Cash Accountability (Opening Cash, Cash In, Cash Out, Closing Cash)
   */
  public async getDailyCashBalance(dateStr?: string): Promise<{
    date: string;
    openingCash: number;
    cashReceipts: number;
    cashPayments: number;
    closingCash: number;
  }> {
    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    const accounts = await financialAccountService.getAccounts();
    const cashAcc = accounts.find((a) => a.accountType === 'CASH') || accounts[0];

    const { data: allTxs } = await daybookService.getTransactions({ dateRange: 'custom', startDate: '1970-01-01', endDate: '2099-12-31' });


    let openingCash = cashAcc ? cashAcc.openingBalance : 0;
    let cashReceipts = 0;
    let cashPayments = 0;

    for (const tx of allTxs || []) {
      if (tx.status === 'VOID') continue;

      const isCash = tx.financialAccountId === cashAcc?.id || tx.paymentMode === 'Cash';
      const amt = Number(tx.amount) || 0;

      if (!isCash) continue;

      if (tx.transactionDate < targetDate) {
        if (tx.direction === 'IN') openingCash += amt;
        if (tx.direction === 'OUT') openingCash -= amt;
      } else if (tx.transactionDate === targetDate) {
        if (tx.direction === 'IN') cashReceipts += amt;
        if (tx.direction === 'OUT') cashPayments += amt;
      }
    }

    return {
      date: targetDate,
      openingCash,
      cashReceipts,
      cashPayments,
      closingCash: openingCash + cashReceipts - cashPayments,
    };
  }

  /**
   * Helper mapping default Payment Methods to Account Types
   */
  private mapPaymentModeToType(mode?: string): string {
    if (!mode) return 'CASH';
    const m = mode.toLowerCase();
    if (m.includes('upi') || m.includes('gpay') || m.includes('phonepe') || m.includes('paytm')) return 'UPI';
    if (m.includes('bank') || m.includes('cheque') || m.includes('neft') || m.includes('rtgs') || m.includes('imps')) return 'BANK';
    if (m.includes('card') || m.includes('pos')) return 'CARD';
    return 'CASH';
  }
}

export const cashbookService = new CashbookService();

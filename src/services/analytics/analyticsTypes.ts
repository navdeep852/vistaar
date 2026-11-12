/**
 * VISTAAR BUSINESS OS — Authoritative Financial Analytics Types
 * Master Schema for Cross-Platform (Desktop, Web, Mobile) KPI Parity.
 */

export interface PaymentMethodBreakdown {
  cash: number;
  upi: number;
  bankTransfer: number;
  card: number;
  cheque: number;
  other: number;
  total: number;
}

export interface AuthoritativeKPIs {
  totalSales: number;
  invoiceSales: number;
  counterSales: number;
  collections: number;
  cashCollections: number;
  upiCollections: number;
  grossProfit: number;
  profitMarginPercent: number;
  outstandingUdhari: number;
  overdueUdhari: number;
  totalTransactions: number;
  invoiceCount: number;
  counterSaleCount: number;
}

export interface SalesChannelBreakdown {
  invoiceSales: number;
  counterSales: number;
  totalSales: number;
  invoicePercentage: number;
  counterPercentage: number;
  deduplicatedConversions: number;
}

export interface FinancialReconciliationAudit {
  workspaceId: string;
  branchId: string;
  reportingPeriod: {
    startDateStr: string;
    endDateStr: string;
    timezone: string;
    startIso: string;
    nextDayIso: string;
  };
  invoices: {
    fetched: number;
    eligible: number;
    excludedDraftOrCancelled: number;
    totalGrossAmount: number;
    totalPaidAmount: number;
  };
  counterSales: {
    fetched: number;
    eligible: number;
    excludedCancelled: number;
    convertedDuplicatesExcluded: number;
    totalFinalAmount: number;
    totalAmountReceived: number;
  };
  payments: {
    fetched: number;
    eligible: number;
    deduplicatedCount: number;
    methodBreakdown: PaymentMethodBreakdown;
  };
  udhariAudit: {
    totalAccounts: number;
    currentOutstanding: number;
    historicalOutstandingAsOfEnd: number;
    overdueAmount: number;
  };
  grossProfitAudit: {
    netRevenue: number;
    totalCogs: number;
    grossProfit: number;
    marginPercent: number;
    uncostedItemCount: number;
  };
  lastSynchronizedAt: string;
  queryErrors: string[];
}

export interface AuthoritativeAnalyticsResult {
  kpis: AuthoritativeKPIs;
  paymentBreakdown: PaymentMethodBreakdown;
  channelBreakdown: SalesChannelBreakdown;
  audit: FinancialReconciliationAudit;
}


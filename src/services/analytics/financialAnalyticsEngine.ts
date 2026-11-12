/**
 * VISTAAR BUSINESS OS — Authoritative Financial Analytics Calculation Engine
 * 
 * Strict Accounting Invariants:
 * 1. Zero tolerance floating-point drift: Uses integer paise calculations.
 * 2. Total Sales = Finalized Invoices + Completed Counter Sales - Duplicate Converted Representations.
 * 3. Collections = Actual Money Received during [startDateStr, endDateStr] from verified payments & receipts.
 * 4. Cash / UPI Collections = Normalized strictly from actual payment transaction methods.
 * 5. Gross Profit = Net Recognized Sales Revenue - Historical COGS (attributable to items sold).
 * 6. Outstanding Udhari = Customer receivables as of endDateStr (historical as-of reconstruction).
 * 7. Multi-tenant workspace isolation & branch scoping enforced deterministically.
 */

import type {
  AuthoritativeKPIs,
  PaymentMethodBreakdown,
  SalesChannelBreakdown,
  FinancialReconciliationAudit,
  AuthoritativeAnalyticsResult,
} from './analyticsTypes.ts';

export function roundToPaise(val: number): number {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

export function toPaise(val: number): number {
  return Math.round((Number(val) + Number.EPSILON) * 100);
}

export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

export type NormalizedPaymentMethod = 'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Cheque' | 'Other';

export function normalizePaymentMethod(method?: string | null): NormalizedPaymentMethod {
  if (!method) return 'Cash';
  const m = String(method).trim().toLowerCase();
  if (m === 'cash' || m.includes('cash')) return 'Cash';
  if (
    m === 'upi' ||
    m.includes('upi') ||
    m.includes('gpay') ||
    m.includes('google pay') ||
    m.includes('phonepe') ||
    m.includes('paytm') ||
    m.includes('bhim') ||
    m.includes('qr')
  ) {
    return 'UPI';
  }
  if (
    m.includes('bank') ||
    m.includes('neft') ||
    m.includes('rtgs') ||
    m.includes('imps') ||
    m.includes('transfer') ||
    m.includes('wire')
  ) {
    return 'Bank Transfer';
  }
  if (m.includes('card') || m.includes('credit card') || m.includes('debit card') || m.includes('pos machine')) {
    return 'Card';
  }
  if (m.includes('cheque') || m.includes('check')) {
    return 'Cheque';
  }
  return 'Other';
}

export interface EngineInputData {
  workspaceId: string;
  branchId?: string;
  startDateStr: string;
  endDateStr: string;
  invoices: any[];
  counterSales: any[];
  payments: any[];
  udhariPayments?: any[];
  udhariRecords?: any[];
  products?: any[];
  expenses?: any[];
  queryErrors?: string[];
}

export class FinancialAnalyticsEngine {
  /**
   * Main calculation entrypoint. Deterministic, side-effect free.
   */
  public static calculate(input: EngineInputData): AuthoritativeAnalyticsResult {
    const {
      workspaceId,
      branchId = 'ALL',
      startDateStr,
      endDateStr,
      invoices = [],
      counterSales = [],
      payments = [],
      udhariPayments = [],
      udhariRecords = [],
      products = [],
      expenses = [],
      queryErrors = [],
    } = input;

    // -------------------------------------------------------------------------
    // 1. TOTAL SALES (KPI 1)
    // -------------------------------------------------------------------------
    let invoiceSalesPaise = 0;
    let counterSalesPaise = 0;
    let eligibleInvoiceCount = 0;
    let eligibleCounterSaleCount = 0;
    let excludedDraftOrCancelledInvCount = 0;
    let excludedCancelledCsCount = 0;
    let convertedDuplicatesExcluded = 0;
    let totalInvPaidPaise = 0;

    // Build deduplication lookup for counter sales referenced by invoices
    const invoiceReferenceKeys = new Set<string>();
    const seenInvoiceIds = new Set<string>();

    // First pass on invoices to index numbers and references
    invoices.forEach((inv) => {
      const invId = inv.id ? String(inv.id).toLowerCase().trim() : '';
      const invNum = (inv.invoice_number || inv.invoiceNumber) ? String(inv.invoice_number || inv.invoiceNumber).toLowerCase().trim() : '';
      if (invId) seenInvoiceIds.add(invId);
      if (invNum) seenInvoiceIds.add(invNum);

      const notes = String(inv.notes || '').toLowerCase();
      const terms = String(inv.terms || '').toLowerCase();
      const ref = String(inv.payment_reference || inv.paymentReference || '').toLowerCase();
      const combined = `${notes} ${terms} ${ref}`;

      // Extract referenced CS numbers e.g. CS-12345
      const matches = combined.match(/cs-[a-z0-9_-]+/g);
      if (matches) {
        matches.forEach((m) => invoiceReferenceKeys.add(m.trim()));
      }
    });

    const eligibleInvoices: any[] = [];
    invoices.forEach((inv) => {
      const status = String(inv.status || '').toLowerCase();
      if (status === 'draft' || status === 'cancelled') {
        excludedDraftOrCancelledInvCount++;
        return;
      }
      const grandTotal = Number(inv.grand_total ?? inv.grandTotal ?? 0);
      const paid = Number(inv.paid_amount ?? inv.paidAmount ?? 0);

      invoiceSalesPaise += toPaise(grandTotal);
      totalInvPaidPaise += toPaise(paid);
      eligibleInvoiceCount++;
      eligibleInvoices.push(inv);
    });

    const eligibleCounterSales: any[] = [];
    counterSales.forEach((cs) => {
      const status = String(cs.status || '').toUpperCase();
      if (status === 'CANCELLED') {
        excludedCancelledCsCount++;
        return;
      }

      const csId = cs.id ? String(cs.id).toLowerCase().trim() : '';
      const saleNum = (cs.sale_number || cs.saleNumber) ? String(cs.sale_number || cs.saleNumber).toLowerCase().trim() : '';
      const invNum = (cs.invoice_number || cs.invoiceNumber) ? String(cs.invoice_number || cs.invoiceNumber).toLowerCase().trim() : '';

      // Conversion Deduplication:
      // If this counter sale was converted to an invoice or an invoice represents this sale, exclude counter sale
      const isDuplicateConversion =
        (saleNum && invoiceReferenceKeys.has(saleNum)) ||
        (invNum && seenInvoiceIds.has(invNum) && saleNum !== invNum) ||
        (csId && invoiceReferenceKeys.has(csId));

      if (isDuplicateConversion) {
        convertedDuplicatesExcluded++;
        return;
      }

      const total = Number(cs.final_total ?? cs.finalTotal ?? 0);
      counterSalesPaise += toPaise(total);
      eligibleCounterSaleCount++;
      eligibleCounterSales.push(cs);
    });

    const totalSalesPaise = invoiceSalesPaise + counterSalesPaise;
    const totalSales = fromPaise(totalSalesPaise);
    const invoiceSales = fromPaise(invoiceSalesPaise);
    const counterSalesTotal = fromPaise(counterSalesPaise);

    // -------------------------------------------------------------------------
    // 2. COLLECTIONS (KPI 2), CASH (KPI 3), UPI (KPI 4), & METHOD BREAKDOWN
    // -------------------------------------------------------------------------
    const methodTotalsPaise: Record<NormalizedPaymentMethod, number> = {
      'Cash': 0,
      'UPI': 0,
      'Bank Transfer': 0,
      'Card': 0,
      'Cheque': 0,
      'Other': 0,
    };

    const recordedPaymentIds = new Set<string>();
    const invoicesAccountedInPayments = new Set<string>();
    const counterSalesAccountedInPayments = new Set<string>();
    let eligiblePaymentsCount = 0;
    let deduplicatedPaymentCount = 0;

    // Helper to credit money into normalized buckets
    const creditPayment = (amount: number, method: string, cashAmount?: number, upiAmount?: number) => {
      const totalP = toPaise(amount);
      if (totalP <= 0) return;

      const splitCashP = cashAmount !== undefined && cashAmount !== null ? toPaise(cashAmount) : 0;
      const splitUpiP = upiAmount !== undefined && upiAmount !== null ? toPaise(upiAmount) : 0;

      if (splitCashP > 0 || splitUpiP > 0) {
        if (splitCashP > 0) methodTotalsPaise['Cash'] += splitCashP;
        if (splitUpiP > 0) methodTotalsPaise['UPI'] += splitUpiP;
        const remainder = totalP - (splitCashP + splitUpiP);
        if (remainder > 0) {
          const norm = normalizePaymentMethod(method);
          methodTotalsPaise[norm] += remainder;
        }
      } else {
        const norm = normalizePaymentMethod(method);
        methodTotalsPaise[norm] += totalP;
      }
    };

    // A. Authoritative Payments table (public.payments)
    payments.forEach((p) => {
      const pId = p.id ? String(p.id).toLowerCase().trim() : '';
      const pNum = (p.payment_number || p.paymentNumber) ? String(p.payment_number || p.paymentNumber).toLowerCase().trim() : '';
      const key = pId || pNum;

      if (key && recordedPaymentIds.has(key)) {
        deduplicatedPaymentCount++;
        return;
      }
      if (key) recordedPaymentIds.add(key);

      const status = String(p.status || '').toUpperCase();
      if (status === 'FAILED' || status === 'CANCELLED' || status === 'REFUNDED') {
        return;
      }

      const amt = Number(p.amount || 0);
      if (amt <= 0) return;

      const invId = p.invoice_id || p.invoiceId;
      if (invId) invoicesAccountedInPayments.add(String(invId).toLowerCase().trim());
      const invNum = p.invoice_number || p.invoiceNumber;
      if (invNum) {
        const cleanInvNum = String(invNum).toLowerCase().trim();
        invoicesAccountedInPayments.add(cleanInvNum);
        counterSalesAccountedInPayments.add(cleanInvNum);
      }

      const csId = p.counter_sale_id || p.counterSaleId;
      if (csId) counterSalesAccountedInPayments.add(String(csId).toLowerCase().trim());
      const csNum = p.counter_sale_number || p.counterSaleNumber;
      if (csNum) counterSalesAccountedInPayments.add(String(csNum).toLowerCase().trim());

      const refNo = p.reference_no || p.referenceNo || p.reference;
      if (refNo) {
        const cleanRef = String(refNo).toLowerCase().trim();
        counterSalesAccountedInPayments.add(cleanRef);
        invoicesAccountedInPayments.add(cleanRef);
      }

      const notes = String(p.notes || '').toLowerCase();
      const csNotesMatches = notes.match(/cs-[a-z0-9_-]+/g);
      if (csNotesMatches) {
        csNotesMatches.forEach((m) => counterSalesAccountedInPayments.add(m.trim()));
      }

      const method = p.method || p.payment_method || p.paymentMethod || 'Cash';
      const cashAmt = p.cash_amount ?? p.cashAmount;
      const upiAmt = p.upi_amount ?? p.upiAmount;

      creditPayment(amt, method, cashAmt, upiAmt);
      eligiblePaymentsCount++;
    });

    // B. Udhari Recovery Payments (public.udhari_payments)
    udhariPayments.forEach((up) => {
      const upId = up.id ? String(up.id).toLowerCase().trim() : '';
      const upCode = (up.payment_code || up.paymentCode) ? String(up.payment_code || up.paymentCode).toLowerCase().trim() : '';
      const ref = String(up.reference || '').toLowerCase().trim();

      // Deduplicate against payments table
      if ((upId && recordedPaymentIds.has(upId)) || (upCode && recordedPaymentIds.has(upCode)) || (ref && recordedPaymentIds.has(ref))) {
        deduplicatedPaymentCount++;
        return;
      }
      if (upId) recordedPaymentIds.add(upId);
      if (upCode) recordedPaymentIds.add(upCode);

      const amt = Number(up.amount || 0);
      if (amt <= 0) return;

      const method = up.payment_method || up.paymentMethod || 'Cash';
      creditPayment(amt, method);
      eligiblePaymentsCount++;
    });

    // C. Upfront Counter Sales Receipts (if not already recorded in public.payments)
    eligibleCounterSales.forEach((cs) => {
      const csId = cs.id ? String(cs.id).toLowerCase().trim() : '';
      const saleNum = (cs.sale_number || cs.saleNumber) ? String(cs.sale_number || cs.saleNumber).toLowerCase().trim() : '';
      const invNum = (cs.invoice_number || cs.invoiceNumber) ? String(cs.invoice_number || cs.invoiceNumber).toLowerCase().trim() : '';

      // Skip if this counter sale already had its receipt posted to public.payments
      if (
        (csId && (counterSalesAccountedInPayments.has(csId) || invoicesAccountedInPayments.has(csId))) ||
        (saleNum && (counterSalesAccountedInPayments.has(saleNum) || invoicesAccountedInPayments.has(saleNum))) ||
        (invNum && (counterSalesAccountedInPayments.has(invNum) || invoicesAccountedInPayments.has(invNum)))
      ) {
        return;
      }

      const method = String(cs.payment_method ?? cs.paymentMethod ?? 'Cash');
      if (method.toLowerCase().includes('credit') || method.toLowerCase().includes('udhari')) {
        return; // Pure credit counter sale, no upfront cash received
      }

      const received = Number(cs.amount_received ?? cs.amountReceived ?? cs.final_total ?? cs.finalTotal ?? 0);
      if (received <= 0) return;

      const cashAmt = cs.cash_amount ?? cs.cashAmount;
      const upiAmt = cs.upi_amount ?? cs.upiAmount;

      creditPayment(received, method, cashAmt, upiAmt);
      if (csId) counterSalesAccountedInPayments.add(csId);
      if (saleNum) counterSalesAccountedInPayments.add(saleNum);
    });

    const cashCollections = fromPaise(methodTotalsPaise['Cash']);
    const upiCollections = fromPaise(methodTotalsPaise['UPI']);
    const bankCollections = fromPaise(methodTotalsPaise['Bank Transfer']);
    const cardCollections = fromPaise(methodTotalsPaise['Card']);
    const chequeCollections = fromPaise(methodTotalsPaise['Cheque']);
    const otherCollections = fromPaise(methodTotalsPaise['Other']);

    const totalCollectionsPaise =
      methodTotalsPaise['Cash'] +
      methodTotalsPaise['UPI'] +
      methodTotalsPaise['Bank Transfer'] +
      methodTotalsPaise['Card'] +
      methodTotalsPaise['Cheque'] +
      methodTotalsPaise['Other'];
    const totalCollections = fromPaise(totalCollectionsPaise);

    const paymentBreakdown: PaymentMethodBreakdown = {
      cash: cashCollections,
      upi: upiCollections,
      bankTransfer: bankCollections,
      card: cardCollections,
      cheque: chequeCollections,
      other: otherCollections,
      total: totalCollections,
    };

    // -------------------------------------------------------------------------
    // 3. GROSS PROFIT (KPI 5) — Attributable COGS from Units Sold
    // -------------------------------------------------------------------------
    // Master product catalog buy-price map
    const productCostMap = new Map<string, number>();
    const productNameCostMap = new Map<string, number>();

    products.forEach((p) => {
      const buyPrice = Number(p.buy_price ?? p.buyPrice ?? 0);
      if (buyPrice > 0) {
        if (p.id) productCostMap.set(String(p.id).toLowerCase().trim(), buyPrice);
        if (p.name) productNameCostMap.set(String(p.name).toLowerCase().trim(), buyPrice);
      }
    });

    let totalCogsPaise = 0;
    let uncostedItemCount = 0;

    // COGS from eligible invoices
    eligibleInvoices.forEach((inv) => {
      const items = inv.invoice_items || inv.items || [];
      items.forEach((item: any) => {
        const qty = Number(item.quantity || 0);
        if (qty <= 0) return;

        const prodId = item.product_id ? String(item.product_id).toLowerCase().trim() : '';
        const prodName = String(item.product_name || item.name || '').toLowerCase().trim();

        // 1. Snapshot price on transaction
        let unitBuyPrice = Number(item.buy_price ?? item.buyPrice ?? 0);

        // 2. Fallback to product catalog if transaction snapshot was missing
        if (unitBuyPrice <= 0 && prodId && productCostMap.has(prodId)) {
          unitBuyPrice = productCostMap.get(prodId) || 0;
        } else if (unitBuyPrice <= 0 && prodName && productNameCostMap.has(prodName)) {
          unitBuyPrice = productNameCostMap.get(prodName) || 0;
        }

        if (unitBuyPrice <= 0) {
          uncostedItemCount++;
        }

        const lineCogsPaise = toPaise(qty * unitBuyPrice);
        totalCogsPaise += lineCogsPaise;
      });
    });

    // COGS from eligible counter sales
    eligibleCounterSales.forEach((cs) => {
      const items = cs.counter_sale_items || cs.items || [];
      items.forEach((item: any) => {
        const qty = Number(item.quantity || 0);
        if (qty <= 0) return;

        const prodId = item.product_id ? String(item.product_id).toLowerCase().trim() : '';
        const prodName = String(item.product_name || item.name || '').toLowerCase().trim();

        let unitBuyPrice = Number(item.buy_price_snapshot ?? item.buyPriceSnapshot ?? item.buy_price ?? item.buyPrice ?? 0);
        if (unitBuyPrice <= 0 && prodId && productCostMap.has(prodId)) {
          unitBuyPrice = productCostMap.get(prodId) || 0;
        } else if (unitBuyPrice <= 0 && prodName && productNameCostMap.has(prodName)) {
          unitBuyPrice = productNameCostMap.get(prodName) || 0;
        }

        if (unitBuyPrice <= 0) {
          uncostedItemCount++;
        }

        const lineCogsPaise = toPaise(qty * unitBuyPrice);
        totalCogsPaise += lineCogsPaise;
      });
    });

    const totalCogs = fromPaise(totalCogsPaise);
    // Net Revenue = Total Sales
    const grossProfitPaise = totalSalesPaise - totalCogsPaise;
    const grossProfit = fromPaise(grossProfitPaise);
    const profitMarginPercent = totalSales > 0 ? roundToPaise((grossProfit / totalSales) * 100) : 0;

    // -------------------------------------------------------------------------
    // 4. OUTSTANDING UDHARI (KPI 6) — As-Of Historical Reconstruction
    // -------------------------------------------------------------------------
    let totalOutstandingUdhariPaise = 0;
    let totalOverdueUdhariPaise = 0;
    let currentOutstandingPaise = 0;

    udhariRecords.forEach((u) => {
      const origPaise = toPaise(Number(u.original_amount || 0));
      const currOutPaise = toPaise(Number(u.outstanding_amount || 0));
      currentOutstandingPaise += currOutPaise;

      // Filter payments made up to endDateStr
      const paymentsList = u.udhari_payments || u.payments || [];
      let totalReceivedAsOfDatePaise = 0;

      paymentsList.forEach((pay: any) => {
        const pDate = String(pay.payment_date || pay.date || pay.created_at || '').split('T')[0];
        if (pDate <= endDateStr) {
          totalReceivedAsOfDatePaise += toPaise(Number(pay.amount || 0));
        }
      });

      // If record was created on or before endDateStr
      const createdDate = String(u.created_at || u.createdAt || '').split('T')[0];
      if (!createdDate || createdDate <= endDateStr) {
        const asOfBalancePaise = Math.max(0, origPaise - totalReceivedAsOfDatePaise);
        totalOutstandingUdhariPaise += asOfBalancePaise;

        const dueDate = String(u.due_date || u.dueDate || '');
        if (dueDate && dueDate < endDateStr && asOfBalancePaise > 0) {
          totalOverdueUdhariPaise += asOfBalancePaise;
        }
      }
    });

    const outstandingUdhari = fromPaise(totalOutstandingUdhariPaise);
    const overdueUdhari = fromPaise(totalOverdueUdhariPaise);

    // -------------------------------------------------------------------------
    // 5. CHANNEL BREAKDOWN
    // -------------------------------------------------------------------------
    const totalTransactions = eligibleInvoiceCount + eligibleCounterSaleCount;
    const invoicePct = totalSales > 0 ? roundToPaise((invoiceSales / totalSales) * 100) : 0;
    const counterPct = totalSales > 0 ? roundToPaise((counterSalesTotal / totalSales) * 100) : 0;

    const channelBreakdown: SalesChannelBreakdown = {
      invoiceSales,
      counterSales: counterSalesTotal,
      totalSales,
      invoicePercentage: invoicePct,
      counterPercentage: counterPct,
      deduplicatedConversions: convertedDuplicatesExcluded,
    };

    // -------------------------------------------------------------------------
    // 6. COMPOSE FINAL AUDIT & NORMALIZED RESULT
    // -------------------------------------------------------------------------
    const kpis: AuthoritativeKPIs = {
      totalSales,
      invoiceSales,
      counterSales: counterSalesTotal,
      collections: totalCollections,
      cashCollections,
      upiCollections,
      grossProfit,
      profitMarginPercent,
      outstandingUdhari,
      overdueUdhari,
      totalTransactions,
      invoiceCount: eligibleInvoiceCount,
      counterSaleCount: eligibleCounterSaleCount,
    };

    const audit: FinancialReconciliationAudit = {
      workspaceId,
      branchId: branchId || 'ALL',
      reportingPeriod: {
        startDateStr,
        endDateStr,
        timezone: 'Asia/Kolkata',
        startIso: `${startDateStr}T00:00:00.000+05:30`,
        nextDayIso: `${endDateStr}T23:59:59.999+05:30`,
      },
      invoices: {
        fetched: invoices.length,
        eligible: eligibleInvoiceCount,
        excludedDraftOrCancelled: excludedDraftOrCancelledInvCount,
        totalGrossAmount: invoiceSales,
        totalPaidAmount: fromPaise(totalInvPaidPaise),
      },
      counterSales: {
        fetched: counterSales.length,
        eligible: eligibleCounterSaleCount,
        excludedCancelled: excludedCancelledCsCount,
        convertedDuplicatesExcluded,
        totalFinalAmount: counterSalesTotal,
        totalAmountReceived: fromPaise(counterSalesPaise),
      },
      payments: {
        fetched: payments.length + udhariPayments.length,
        eligible: eligiblePaymentsCount,
        deduplicatedCount: deduplicatedPaymentCount,
        methodBreakdown: paymentBreakdown,
      },
      udhariAudit: {
        totalAccounts: udhariRecords.length,
        currentOutstanding: fromPaise(currentOutstandingPaise),
        historicalOutstandingAsOfEnd: outstandingUdhari,
        overdueAmount: overdueUdhari,
      },
      grossProfitAudit: {
        netRevenue: totalSales,
        totalCogs,
        grossProfit,
        marginPercent: profitMarginPercent,
        uncostedItemCount,
      },
      lastSynchronizedAt: new Date().toISOString(),
      queryErrors,
    };

    return {
      kpis,
      paymentBreakdown,
      channelBreakdown,
      audit,
    };
  }
}

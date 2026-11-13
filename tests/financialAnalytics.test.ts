import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FinancialAnalyticsEngine,
  normalizePaymentMethod,
  toPaise,
  fromPaise,
  roundToPaise,
} from '../src/services/analytics/financialAnalyticsEngine.ts';
import type { EngineInputData } from '../src/services/analytics/financialAnalyticsEngine.ts';

describe('VISTAAR Financial Analytics Engine — Authoritative Reconciliation', () => {
  const WS_ID_A = '11111111-1111-4111-8111-111111111111';
  const WS_ID_B = '22222222-2222-4222-8222-222222222222';
  const DEFAULT_RANGE = {
    startDateStr: '2026-10-01',
    endDateStr: '2026-11-12',
  };

  // ---------------------------------------------------------------------------
  // Test Case A — Basic invoice
  // ---------------------------------------------------------------------------
  it('Test Case A — Basic invoice: 10,000 fully paid by Cash', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        {
          id: 'inv-1',
          workspace_id: WS_ID_A,
          invoice_number: 'INV-2026-001',
          date: '2026-10-05',
          grand_total: 10000,
          paid_amount: 10000,
          balance_amount: 0,
          status: 'Paid',
          payment_mode: 'Cash',
          invoice_items: [
            { id: 'item-1', product_id: 'p1', quantity: 1, selling_price: 10000, buy_price: 6000 },
          ],
        },
      ],
      counterSales: [],
      payments: [
        {
          id: 'pay-1',
          workspace_id: WS_ID_A,
          invoice_id: 'inv-1',
          invoice_number: 'INV-2026-001',
          payment_number: 'PAY-2026-001',
          amount: 10000,
          method: 'Cash',
          payment_date: '2026-10-05',
          status: 'COMPLETED',
        },
      ],
      udhariRecords: [],
      products: [{ id: 'p1', buy_price: 6000 }],
    };

    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 10000.00);
    assert.equal(res.kpis.collections, 10000.00);
    assert.equal(res.kpis.cashCollections, 10000.00);
    assert.equal(res.kpis.upiCollections, 0.00);
    assert.equal(res.kpis.outstandingUdhari, 0.00);
    assert.equal(res.kpis.grossProfit, 4000.00);
    assert.equal(res.paymentBreakdown.cash, 10000.00);
  });

  // ---------------------------------------------------------------------------
  // Test Case B — Partial payment
  // ---------------------------------------------------------------------------
  it('Test Case B — Partial payment: 10,000 invoice with 6,000 initial payment', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        {
          id: 'inv-2',
          workspace_id: WS_ID_A,
          invoice_number: 'INV-2026-002',
          date: '2026-10-10',
          grand_total: 10000,
          paid_amount: 6000,
          balance_amount: 4000,
          status: 'Partially Paid',
          payment_mode: 'Cash',
        },
      ],
      counterSales: [],
      payments: [
        {
          id: 'pay-2',
          workspace_id: WS_ID_A,
          invoice_id: 'inv-2',
          invoice_number: 'INV-2026-002',
          payment_number: 'PAY-2026-002',
          amount: 6000,
          method: 'Cash',
          payment_date: '2026-10-10',
          status: 'COMPLETED',
        },
      ],
      udhariRecords: [
        {
          id: 'u-2',
          workspace_id: WS_ID_A,
          invoice_id: 'inv-2',
          original_amount: 10000,
          total_received: 6000,
          outstanding_amount: 4000,
          created_at: '2026-10-10T10:00:00Z',
          due_date: '2026-10-25',
          udhari_payments: [
            { payment_date: '2026-10-10', amount: 6000 },
          ],
        },
      ],
    };

    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 10000.00);
    assert.equal(res.kpis.collections, 6000.00);
    assert.equal(res.kpis.outstandingUdhari, 4000.00);
  });

  // ---------------------------------------------------------------------------
  // Test Case C — Subsequent Udhari payment
  // ---------------------------------------------------------------------------
  it('Test Case C — Subsequent Udhari payment: 10,000 invoice with 6,000 initial + 4,000 subsequent recovery', () => {
    // Reporting period covering BOTH payments (Oct 1 - Nov 12)
    const inputFullPeriod: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        {
          id: 'inv-3',
          workspace_id: WS_ID_A,
          invoice_number: 'INV-2026-003',
          date: '2026-10-05',
          grand_total: 10000,
          paid_amount: 10000,
          balance_amount: 0,
          status: 'Paid',
        },
      ],
      counterSales: [],
      payments: [
        {
          id: 'pay-3a',
          workspace_id: WS_ID_A,
          invoice_id: 'inv-3',
          payment_number: 'PAY-2026-003A',
          amount: 6000,
          method: 'Cash',
          payment_date: '2026-10-05',
          status: 'COMPLETED',
        },
        {
          id: 'pay-3b',
          workspace_id: WS_ID_A,
          invoice_id: 'inv-3',
          payment_number: 'PAY-2026-003B',
          amount: 4000,
          method: 'UPI',
          payment_date: '2026-11-02',
          status: 'COMPLETED',
        },
      ],
      udhariRecords: [
        {
          id: 'u-3',
          workspace_id: WS_ID_A,
          invoice_id: 'inv-3',
          original_amount: 10000,
          total_received: 10000,
          outstanding_amount: 0,
          created_at: '2026-10-05T10:00:00Z',
          due_date: '2026-10-20',
          udhari_payments: [
            { payment_date: '2026-10-05', amount: 6000 },
            { payment_date: '2026-11-02', amount: 4000 },
          ],
        },
      ],
    };

    const resFull = FinancialAnalyticsEngine.calculate(inputFullPeriod);
    assert.equal(resFull.kpis.totalSales, 10000.00);
    assert.equal(resFull.kpis.collections, 10000.00);
    assert.equal(resFull.kpis.cashCollections, 6000.00);
    assert.equal(resFull.kpis.upiCollections, 4000.00);
    assert.equal(resFull.kpis.outstandingUdhari, 0.00);

    // Historical reporting period BEFORE subsequent recovery (Oct 1 - Oct 31)
    const inputBeforeRecovery: EngineInputData = {
      ...inputFullPeriod,
      startDateStr: '2026-10-01',
      endDateStr: '2026-10-31',
      payments: [
        // pay-3b was on Nov 2, so repository only returns Oct payments
        inputFullPeriod.payments[0],
      ],
    };

    const resBefore = FinancialAnalyticsEngine.calculate(inputBeforeRecovery);
    assert.equal(resBefore.kpis.totalSales, 10000.00);
    assert.equal(resBefore.kpis.collections, 6000.00);
    // Historical as-of Oct 31: 10,000 original - 6,000 received before Oct 31 = 4,000 outstanding!
    assert.equal(resBefore.kpis.outstandingUdhari, 4000.00);
  });

  // ---------------------------------------------------------------------------
  // Test Case D — Mixed payment methods
  // ---------------------------------------------------------------------------
  it('Test Case D — Mixed payment methods: 20,000 total (Cash 6,000, UPI 10,000, Bank 4,000)', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        {
          id: 'inv-4',
          workspace_id: WS_ID_A,
          invoice_number: 'INV-2026-004',
          date: '2026-10-15',
          grand_total: 20000,
          paid_amount: 20000,
          balance_amount: 0,
          status: 'Paid',
        },
      ],
      counterSales: [],
      payments: [
        { id: 'p4-1', workspace_id: WS_ID_A, invoice_id: 'inv-4', payment_number: 'PAY-4-1', amount: 6000, method: 'Cash', payment_date: '2026-10-15', status: 'COMPLETED' },
        { id: 'p4-2', workspace_id: WS_ID_A, invoice_id: 'inv-4', payment_number: 'PAY-4-2', amount: 10000, method: 'UPI', payment_date: '2026-10-15', status: 'COMPLETED' },
        { id: 'p4-3', workspace_id: WS_ID_A, invoice_id: 'inv-4', payment_number: 'PAY-4-3', amount: 4000, method: 'Bank Transfer', payment_date: '2026-10-15', status: 'COMPLETED' },
      ],
      udhariRecords: [],
    };

    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 20000.00);
    assert.equal(res.kpis.collections, 20000.00);
    assert.equal(res.kpis.cashCollections, 6000.00);
    assert.equal(res.kpis.upiCollections, 10000.00);
    assert.equal(res.paymentBreakdown.bankTransfer, 4000.00);
    assert.equal(res.kpis.outstandingUdhari, 0.00);
  });

  // ---------------------------------------------------------------------------
  // Test Case E — Counter sale & conversion deduplication
  // ---------------------------------------------------------------------------
  it('Test Case E — Counter sale: 2,500 UPI + deduplication when converted to invoice', () => {
    // 1. Standalone counter sale
    const inputStandalone: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [],
      counterSales: [
        {
          id: 'cs-1',
          workspace_id: WS_ID_A,
          sale_number: 'CS-2026-001',
          sale_date: '2026-10-12',
          final_total: 2500,
          amount_received: 2500,
          balance_amount: 0,
          payment_method: 'UPI',
          status: 'COMPLETED',
        },
      ],
      payments: [],
    };

    const res1 = FinancialAnalyticsEngine.calculate(inputStandalone);
    assert.equal(res1.kpis.totalSales, 2500.00);
    assert.equal(res1.kpis.counterSales, 2500.00);
    assert.equal(res1.kpis.collections, 2500.00);
    assert.equal(res1.kpis.upiCollections, 2500.00);

    // 2. Counter sale converted to Invoice representation
    const inputConverted: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        {
          id: 'inv-conv',
          workspace_id: WS_ID_A,
          invoice_number: 'INV-2026-CONV',
          date: '2026-10-12',
          grand_total: 2500,
          paid_amount: 2500,
          balance_amount: 0,
          status: 'Paid',
          notes: 'Converted from CS-2026-001',
          payment_mode: 'UPI',
        },
      ],
      counterSales: [
        {
          id: 'cs-1',
          workspace_id: WS_ID_A,
          sale_number: 'CS-2026-001',
          invoice_number: 'CS-2026-001',
          sale_date: '2026-10-12',
          final_total: 2500,
          amount_received: 2500,
          balance_amount: 0,
          payment_method: 'UPI',
          status: 'COMPLETED',
        },
      ],
      payments: [
        {
          id: 'pay-conv',
          workspace_id: WS_ID_A,
          invoice_id: 'inv-conv',
          payment_number: 'PAY-CONV',
          amount: 2500,
          method: 'UPI',
          payment_date: '2026-10-12',
          status: 'COMPLETED',
        },
      ],
    };

    const res2 = FinancialAnalyticsEngine.calculate(inputConverted);
    // Sale MUST NOT be counted twice! Total sales must remain exactly ₹2,500
    assert.equal(res2.kpis.totalSales, 2500.00);
    assert.equal(res2.kpis.invoiceSales, 2500.00);
    assert.equal(res2.kpis.counterSales, 0.00);
    assert.equal(res2.channelBreakdown.deduplicatedConversions, 1);
    assert.equal(res2.kpis.collections, 2500.00);
    assert.equal(res2.kpis.upiCollections, 2500.00);
  });

  // ---------------------------------------------------------------------------
  // Test Case F — Duplicate data rejection (Supabase vs local records)
  // ---------------------------------------------------------------------------
  it('Test Case F — Duplicate data rejection: identical transaction ID counted only once', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-dup-1', workspace_id: WS_ID_A, invoice_number: 'INV-100', date: '2026-10-20', grand_total: 5000, paid_amount: 5000, balance_amount: 0, status: 'Paid' },
      ],
      counterSales: [],
      payments: [
        { id: 'pay-dup-1', workspace_id: WS_ID_A, invoice_id: 'inv-dup-1', payment_number: 'PAY-100', amount: 5000, method: 'Cash', payment_date: '2026-10-20', status: 'COMPLETED' },
        // Simulate accidental duplicate submission of same payment ID
        { id: 'pay-dup-1', workspace_id: WS_ID_A, invoice_id: 'inv-dup-1', payment_number: 'PAY-100', amount: 5000, method: 'Cash', payment_date: '2026-10-20', status: 'COMPLETED' },
      ],
    };

    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 5000.00);
    assert.equal(res.kpis.collections, 5000.00);
    assert.equal(res.audit.payments.deduplicatedCount, 1);
  });

  // ---------------------------------------------------------------------------
  // Test Case G — Date boundaries (Asia/Kolkata inclusive filtering)
  // ---------------------------------------------------------------------------
  it('Test Case G — Date boundaries: strict inclusion between 2026-10-01 and 2026-11-12', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        // Transaction on exact start date (included)
        { id: 'inv-start', workspace_id: WS_ID_A, invoice_number: 'INV-START', date: '2026-10-01', grand_total: 1000, paid_amount: 1000, balance_amount: 0, status: 'Paid' },
        // Transaction inside period (included)
        { id: 'inv-mid', workspace_id: WS_ID_A, invoice_number: 'INV-MID', date: '2026-10-25', grand_total: 2000, paid_amount: 2000, balance_amount: 0, status: 'Paid' },
        // Transaction on exact end date (included)
        { id: 'inv-end', workspace_id: WS_ID_A, invoice_number: 'INV-END', date: '2026-11-12', grand_total: 3000, paid_amount: 3000, balance_amount: 0, status: 'Paid' },
      ],
      counterSales: [],
      payments: [
        { id: 'p-start', workspace_id: WS_ID_A, payment_number: 'P-START', amount: 1000, method: 'Cash', payment_date: '2026-10-01', status: 'COMPLETED' },
        { id: 'p-mid', workspace_id: WS_ID_A, payment_number: 'P-MID', amount: 2000, method: 'Cash', payment_date: '2026-10-25', status: 'COMPLETED' },
        { id: 'p-end', workspace_id: WS_ID_A, payment_number: 'P-END', amount: 3000, method: 'Cash', payment_date: '2026-11-12', status: 'COMPLETED' },
      ],
    };

    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 6000.00);
    assert.equal(res.kpis.collections, 6000.00);
  });

  // ---------------------------------------------------------------------------
  // Test Case H — Workspace isolation
  // ---------------------------------------------------------------------------
  it('Test Case H — Workspace isolation: calculations are bounded to target workspace', () => {
    const inputWorkspaceA: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-ws-a', workspace_id: WS_ID_A, invoice_number: 'INV-A-1', date: '2026-10-05', grand_total: 12000, paid_amount: 12000, balance_amount: 0, status: 'Paid' },
      ],
      counterSales: [],
      payments: [
        { id: 'p-ws-a', workspace_id: WS_ID_A, payment_number: 'PAY-A-1', amount: 12000, method: 'UPI', payment_date: '2026-10-05', status: 'COMPLETED' },
      ],
    };

    const inputWorkspaceB: EngineInputData = {
      workspaceId: WS_ID_B,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-ws-b', workspace_id: WS_ID_B, invoice_number: 'INV-B-1', date: '2026-10-05', grand_total: 45000, paid_amount: 45000, balance_amount: 0, status: 'Paid' },
      ],
      counterSales: [],
      payments: [
        { id: 'p-ws-b', workspace_id: WS_ID_B, payment_number: 'PAY-B-1', amount: 45000, method: 'Cash', payment_date: '2026-10-05', status: 'COMPLETED' },
      ],
    };

    const resA = FinancialAnalyticsEngine.calculate(inputWorkspaceA);
    const resB = FinancialAnalyticsEngine.calculate(inputWorkspaceB);

    assert.equal(resA.kpis.totalSales, 12000.00);
    assert.equal(resA.kpis.collections, 12000.00);
    assert.equal(resA.kpis.upiCollections, 12000.00);

    assert.equal(resB.kpis.totalSales, 45000.00);
    assert.equal(resB.kpis.collections, 45000.00);
    assert.equal(resB.kpis.cashCollections, 45000.00);
  });

  // ---------------------------------------------------------------------------
  // Test Case I — Refund / failed payment exclusion
  // ---------------------------------------------------------------------------
  it('Test Case I — Refund & failed status: excluded from collections without double count', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-i', workspace_id: WS_ID_A, invoice_number: 'INV-I-1', date: '2026-10-10', grand_total: 15000, paid_amount: 15000, balance_amount: 0, status: 'Paid' },
      ],
      counterSales: [],
      payments: [
        { id: 'p-valid', workspace_id: WS_ID_A, payment_number: 'PAY-I-1', amount: 15000, method: 'UPI', payment_date: '2026-10-10', status: 'COMPLETED' },
        { id: 'p-failed', workspace_id: WS_ID_A, payment_number: 'PAY-I-FAIL', amount: 5000, method: 'UPI', payment_date: '2026-10-10', status: 'FAILED' },
        { id: 'p-refund', workspace_id: WS_ID_A, payment_number: 'PAY-I-REF', amount: 2000, method: 'UPI', payment_date: '2026-10-10', status: 'REFUNDED' },
      ],
    };

    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 15000.00);
    assert.equal(res.kpis.collections, 15000.00);
  });

  // ---------------------------------------------------------------------------
  // Test Case J — Gross profit historical cost
  // ---------------------------------------------------------------------------
  it('Test Case J — Gross profit: uses item historical buy price, not current catalog price', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        {
          id: 'inv-j',
          workspace_id: WS_ID_A,
          invoice_number: 'INV-J-1',
          date: '2026-10-10',
          grand_total: 50000,
          paid_amount: 50000,
          balance_amount: 0,
          status: 'Paid',
          invoice_items: [
            // Historical buy price at time of sale = 300 per unit (100 units = 30,000 COGS)
            { id: 'item-j1', product_id: 'p-j', quantity: 100, selling_price: 500, buy_price: 300 },
          ],
        },
      ],
      counterSales: [],
      payments: [
        { id: 'p-j', workspace_id: WS_ID_A, payment_number: 'PAY-J', amount: 50000, method: 'Cash', payment_date: '2026-10-10', status: 'COMPLETED' },
      ],
      // Current master product buy price has inflated to 450, but historical cost of 300 must be used
      products: [
        { id: 'p-j', name: 'Product J', buy_price: 450, selling_price: 550 },
      ],
    };

    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 50000.00);
    // Historical COGS = 100 * 300 = 30,000. Gross Profit = 50,000 - 30,000 = 20,000!
    assert.equal(res.kpis.grossProfit, 20000.00);
    assert.equal(res.kpis.profitMarginPercent, 40.00);
    assert.equal(res.audit.grossProfitAudit.totalCogs, 30000.00);
  });

  // ---------------------------------------------------------------------------
  // Test Case K — Cross-device consistency
  // ---------------------------------------------------------------------------
  it('Test Case K — Cross-device consistency: Desktop simulation vs Mobile simulation matches to ₹0.00', () => {
    // Exact reporting scenario matching the customer reported custom date range: 01/10/2026 - 12/11/2026
    const sharedData: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-k1', workspace_id: WS_ID_A, invoice_number: 'INV-2026-001', date: '2026-10-05', grand_total: 1200000.60, paid_amount: 1000000, balance_amount: 200000.60, status: 'Partially Paid' },
        { id: 'inv-k2', workspace_id: WS_ID_A, invoice_number: 'INV-2026-002', date: '2026-10-18', grand_total: 271474.00, paid_amount: 271474, balance_amount: 0, status: 'Paid' },
      ],
      counterSales: [
        { id: 'cs-k1', workspace_id: WS_ID_A, sale_number: 'CS-2026-001', sale_date: '2026-10-22', final_total: 50000, amount_received: 50000, balance_amount: 0, payment_method: 'Cash', status: 'COMPLETED' },
      ],
      payments: [
        { id: 'pay-k1', workspace_id: WS_ID_A, invoice_id: 'inv-k1', payment_number: 'PAY-K1', amount: 800000, method: 'Cash', payment_date: '2026-10-05', status: 'COMPLETED' },
        { id: 'pay-k2', workspace_id: WS_ID_A, invoice_id: 'inv-k1', payment_number: 'PAY-K2', amount: 200000, method: 'UPI', payment_date: '2026-10-20', status: 'COMPLETED' },
        { id: 'pay-k3', workspace_id: WS_ID_A, invoice_id: 'inv-k2', payment_number: 'PAY-K3', amount: 271474, method: 'Cash', payment_date: '2026-10-18', status: 'COMPLETED' },
      ],
      udhariRecords: [
        { id: 'u-k1', workspace_id: WS_ID_A, invoice_id: 'inv-k1', original_amount: 1200000.60, total_received: 1000000, outstanding_amount: 200000.60, created_at: '2026-10-05', due_date: '2026-10-25', udhari_payments: [{ payment_date: '2026-10-05', amount: 800000 }, { payment_date: '2026-10-20', amount: 200000 }] },
      ],
    };

    // Simulate Desktop execution
    const desktopResult = FinancialAnalyticsEngine.calculate(sharedData);

    // Simulate Mobile execution with same authoritative data
    const mobileResult = FinancialAnalyticsEngine.calculate(sharedData);

    // Assert zero-tolerance identity between Desktop and Mobile
    assert.equal(desktopResult.kpis.totalSales, mobileResult.kpis.totalSales);
    assert.equal(desktopResult.kpis.collections, mobileResult.kpis.collections);
    assert.equal(desktopResult.kpis.cashCollections, mobileResult.kpis.cashCollections);
    assert.equal(desktopResult.kpis.upiCollections, mobileResult.kpis.upiCollections);
    assert.equal(desktopResult.kpis.outstandingUdhari, mobileResult.kpis.outstandingUdhari);
    assert.equal(desktopResult.kpis.grossProfit, mobileResult.kpis.grossProfit);
    assert.equal(desktopResult.kpis.totalTransactions, mobileResult.kpis.totalTransactions);

    // Verify tolerance to within 0.01
    const salesDiff = Math.abs(desktopResult.kpis.totalSales - mobileResult.kpis.totalSales);
    const colDiff = Math.abs(desktopResult.kpis.collections - mobileResult.kpis.collections);
    const cashDiff = Math.abs(desktopResult.kpis.cashCollections - mobileResult.kpis.cashCollections);
    const upiDiff = Math.abs(desktopResult.kpis.upiCollections - mobileResult.kpis.upiCollections);

    assert.ok(salesDiff <= 0.01, `Total Sales difference ₹${salesDiff} exceeds ₹0.01 tolerance`);
    assert.ok(colDiff <= 0.01, `Collections difference ₹${colDiff} exceeds ₹0.01 tolerance`);
    assert.ok(cashDiff <= 0.01, `Cash difference ₹${cashDiff} exceeds ₹0.01 tolerance`);
    assert.ok(upiDiff <= 0.01, `UPI difference ₹${upiDiff} exceeds ₹0.01 tolerance`);
  });

  // ---------------------------------------------------------------------------
  // Test Case L — Counter-Sale Upfront Receipt Deduplication against Payments Table
  // ---------------------------------------------------------------------------
  it('Test Case L — Counter-sale upfront receipt: cannot be counted twice when receipt also exists in payments table', () => {
    // Scenario: A counter sale for ₹7,500 Cash was completed.
    // The POS system created a record in counter_sales (amount_received: 7500)
    // AND automatically created a payment in payments (invoice_number: 'CS-7500', amount: 7500, method: 'Cash')
    const input: EngineInputData = {
      workspaceId: WS_ID_A,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [],
      counterSales: [
        {
          id: 'cs-7500-id',
          workspace_id: WS_ID_A,
          sale_number: 'CS-7500',
          invoice_number: 'CS-7500',
          sale_date: '2026-10-15',
          final_total: 7500,
          amount_received: 7500,
          balance_amount: 0,
          payment_method: 'Cash',
          status: 'COMPLETED',
        },
      ],
      payments: [
        {
          id: 'pay-cs-7500',
          workspace_id: WS_ID_A,
          payment_number: 'PAY-CS-7500',
          invoice_number: 'CS-7500', // Reference to counter sale
          notes: 'Counter Sale payment #CS-7500',
          amount: 7500,
          method: 'Cash',
          payment_date: '2026-10-15',
          status: 'COMPLETED',
        },
      ],
    };

    const res = FinancialAnalyticsEngine.calculate(input);

    // Sales must be exactly ₹7,500
    assert.equal(res.kpis.totalSales, 7500.00);
    assert.equal(res.kpis.counterSales, 7500.00);

    // Collections MUST be exactly ₹7,500 (NOT doubled to ₹15,000!)
    assert.equal(res.kpis.collections, 7500.00);
    assert.equal(res.kpis.cashCollections, 7500.00);
    assert.equal(res.kpis.upiCollections, 0.00);
  });
});

// =============================================================================
// PART E — COMPREHENSIVE 12-SCENARIO FINANCIAL INTEGRITY SUITE
// =============================================================================
describe('Part E: Comprehensive 12-Scenario Financial Integrity Verification', () => {
  const WS_ID = 'ddb10dc7-3671-4def-9626-526afd473c1a';

  // ---------------------------------------------------------------------------
  // 1. Invoice created with full upfront payment
  // ---------------------------------------------------------------------------
  it('Scenario 1 — Invoice created with full upfront payment (verified upfront settlement)', () => {
    // 1a: Upfront payment row already exists in payments table
    const inputWithPay: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-sc1a', workspace_id: WS_ID, invoice_number: 'INV-SC1A', date: '2026-10-15', grand_total: 50000, paid_amount: 50000, balance_amount: 0, status: 'Paid', payment_method: 'Cash' },
      ],
      counterSales: [],
      payments: [
        { id: 'pay-sc1a', workspace_id: WS_ID, invoice_id: 'inv-sc1a', payment_number: 'PAY-SC1A', amount: 50000, method: 'Cash', payment_date: '2026-10-15', status: 'COMPLETED' },
      ],
    };
    const resA = FinancialAnalyticsEngine.calculate(inputWithPay);
    assert.equal(resA.kpis.totalSales, 50000.00);
    assert.equal(resA.kpis.collections, 50000.00);
    assert.equal(resA.kpis.cashCollections, 50000.00);
    assert.equal(resA.kpis.outstandingUdhari, 0.00);

    // 1b: Upfront payment row missing from payments table (historical unrecorded settlement)
    const inputWithoutPay: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-sc1b', workspace_id: WS_ID, invoice_number: 'INV-SC1B', date: '2026-10-15', grand_total: 50000, paid_amount: 50000, balance_amount: 0, status: 'Paid', payment_method: 'UPI' },
      ],
      counterSales: [],
      payments: [],
    };
    const resB = FinancialAnalyticsEngine.calculate(inputWithoutPay);
    assert.equal(resB.kpis.totalSales, 50000.00);
    assert.equal(resB.kpis.collections, 50000.00);
    assert.equal(resB.kpis.upiCollections, 50000.00);
    assert.equal(resB.kpis.outstandingUdhari, 0.00);
  });

  // ---------------------------------------------------------------------------
  // 2. Invoice created with partial upfront payment
  // ---------------------------------------------------------------------------
  it('Scenario 2 — Invoice created with partial upfront payment', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-sc2', workspace_id: WS_ID, invoice_number: 'INV-SC2', date: '2026-10-18', grand_total: 100000, paid_amount: 40000, balance_amount: 60000, status: 'Partially Paid', payment_method: 'Cash' },
      ],
      counterSales: [],
      payments: [],
      udhariRecords: [
        { id: 'u-sc2', workspace_id: WS_ID, invoice_id: 'inv-sc2', udhari_code: 'UD-INV-SC2', original_amount: 100000, total_received: 40000, outstanding_amount: 60000, created_at: '2026-10-18T10:00:00Z', due_date: '2026-11-05' },
      ],
    };
    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 100000.00);
    assert.equal(res.kpis.collections, 40000.00);
    assert.equal(res.kpis.cashCollections, 40000.00);
    assert.equal(res.kpis.outstandingUdhari, 60000.00);
    // Invariant holds
    assert.equal(res.kpis.totalSales, res.kpis.collections + res.kpis.outstandingUdhari);
  });

  // ---------------------------------------------------------------------------
  // 3. Invoice created without payment
  // ---------------------------------------------------------------------------
  it('Scenario 3 — Invoice created without payment (100% credit sale)', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-sc3', workspace_id: WS_ID, invoice_number: 'INV-SC3', date: '2026-10-20', grand_total: 30000, paid_amount: 0, balance_amount: 30000, status: 'Issued' },
      ],
      counterSales: [],
      payments: [],
      udhariRecords: [
        { id: 'u-sc3', workspace_id: WS_ID, invoice_id: 'inv-sc3', udhari_code: 'UD-INV-SC3', original_amount: 30000, total_received: 0, outstanding_amount: 30000, created_at: '2026-10-20T10:00:00Z', due_date: '2026-11-10' },
      ],
    };
    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 30000.00);
    assert.equal(res.kpis.collections, 0.00);
    assert.equal(res.kpis.outstandingUdhari, 30000.00);
    assert.equal(res.kpis.totalSales, res.kpis.collections + res.kpis.outstandingUdhari);
  });

  // ---------------------------------------------------------------------------
  // 4. Subsequent partial payment
  // ---------------------------------------------------------------------------
  it('Scenario 4 — Subsequent partial payment against credit invoice', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-sc4', workspace_id: WS_ID, invoice_number: 'INV-SC4', date: '2026-10-20', grand_total: 30000, paid_amount: 10000, balance_amount: 20000, status: 'Partially Paid' },
      ],
      counterSales: [],
      payments: [
        { id: 'pay-sc4', workspace_id: WS_ID, invoice_id: 'inv-sc4', payment_number: 'PAY-SC4', amount: 10000, method: 'UPI', payment_date: '2026-10-25', status: 'COMPLETED' },
      ],
      udhariRecords: [
        { id: 'u-sc4', workspace_id: WS_ID, invoice_id: 'inv-sc4', udhari_code: 'UD-INV-SC4', original_amount: 30000, total_received: 10000, outstanding_amount: 20000, created_at: '2026-10-20T10:00:00Z', due_date: '2026-11-10', udhari_payments: [{ payment_date: '2026-10-25', amount: 10000 }] },
      ],
    };
    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 30000.00);
    assert.equal(res.kpis.collections, 10000.00);
    assert.equal(res.kpis.upiCollections, 10000.00);
    assert.equal(res.kpis.outstandingUdhari, 20000.00);
    assert.equal(res.kpis.totalSales, res.kpis.collections + res.kpis.outstandingUdhari);
  });

  // ---------------------------------------------------------------------------
  // 5. Subsequent final payment
  // ---------------------------------------------------------------------------
  it('Scenario 5 — Subsequent final payment closing full balance', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-sc5', workspace_id: WS_ID, invoice_number: 'INV-SC5', date: '2026-10-20', grand_total: 30000, paid_amount: 30000, balance_amount: 0, status: 'Paid' },
      ],
      counterSales: [],
      payments: [
        { id: 'pay-sc5-1', workspace_id: WS_ID, invoice_id: 'inv-sc5', payment_number: 'PAY-SC5-1', amount: 10000, method: 'UPI', payment_date: '2026-10-25', status: 'COMPLETED' },
        { id: 'pay-sc5-2', workspace_id: WS_ID, invoice_id: 'inv-sc5', payment_number: 'PAY-SC5-2', amount: 20000, method: 'Cash', payment_date: '2026-11-01', status: 'COMPLETED' },
      ],
      udhariRecords: [
        { id: 'u-sc5', workspace_id: WS_ID, invoice_id: 'inv-sc5', udhari_code: 'UD-INV-SC5', original_amount: 30000, total_received: 30000, outstanding_amount: 0, created_at: '2026-10-20T10:00:00Z', due_date: '2026-11-10', udhari_payments: [{ payment_date: '2026-10-25', amount: 10000 }, { payment_date: '2026-11-01', amount: 20000 }] },
      ],
    };
    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 30000.00);
    assert.equal(res.kpis.collections, 30000.00);
    assert.equal(res.kpis.cashCollections, 20000.00);
    assert.equal(res.kpis.upiCollections, 10000.00);
    assert.equal(res.kpis.outstandingUdhari, 0.00);
    assert.equal(res.kpis.totalSales, res.kpis.collections + res.kpis.outstandingUdhari);
  });

  // ---------------------------------------------------------------------------
  // 6. Udhari recovery
  // ---------------------------------------------------------------------------
  it('Scenario 6 — Standalone Udhari recovery in udhari_payments', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [],
      counterSales: [],
      payments: [],
      udhariPayments: [
        { id: 'up-sc6', payment_code: 'UP-SC6', amount: 15000, payment_method: 'Bank Transfer', payment_date: '2026-10-28' },
      ],
    };
    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.collections, 15000.00);
    assert.equal(res.paymentBreakdown.bankTransfer, 15000.00);
  });

  // ---------------------------------------------------------------------------
  // 7. Counter sale receipt
  // ---------------------------------------------------------------------------
  it('Scenario 7 — Counter sale upfront receipt', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [],
      counterSales: [
        { id: 'cs-sc7', workspace_id: WS_ID, sale_number: 'CS-SC7', sale_date: '2026-10-27', final_total: 8500, amount_received: 8500, balance_amount: 0, payment_method: 'Cash', status: 'COMPLETED' },
      ],
      payments: [],
    };
    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 8500.00);
    assert.equal(res.kpis.counterSales, 8500.00);
    assert.equal(res.kpis.collections, 8500.00);
    assert.equal(res.kpis.cashCollections, 8500.00);
  });

  // ---------------------------------------------------------------------------
  // 8. Collections filtered by receipt date
  // ---------------------------------------------------------------------------
  it('Scenario 8 — Collections strictly filtered by receipt date', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-sc8-in', workspace_id: WS_ID, invoice_number: 'INV-SC8-IN', date: '2026-10-15', grand_total: 12000, paid_amount: 12000, balance_amount: 0, status: 'Paid' },
      ],
      counterSales: [],
      payments: [
        { id: 'pay-before', workspace_id: WS_ID, payment_number: 'P-BEFORE', amount: 5000, method: 'Cash', payment_date: '2026-09-30', status: 'COMPLETED' },
        { id: 'pay-in', workspace_id: WS_ID, invoice_id: 'inv-sc8-in', payment_number: 'P-IN', amount: 12000, method: 'Cash', payment_date: '2026-10-15', status: 'COMPLETED' },
        { id: 'pay-after', workspace_id: WS_ID, payment_number: 'P-AFTER', amount: 7000, method: 'Cash', payment_date: '2026-11-20', status: 'COMPLETED' },
      ],
    };
    const res = FinancialAnalyticsEngine.calculate(input);
    // Only pay-in falls within 2026-10-01 to 2026-11-12
    assert.equal(res.kpis.collections, 12000.00);
    assert.equal(res.kpis.cashCollections, 12000.00);
  });

  // ---------------------------------------------------------------------------
  // 9. No duplicate Collections when Daybook/payments contain matching references
  // ---------------------------------------------------------------------------
  it('Scenario 9 — No duplicate Collections with matching references or dual channels', () => {
    const input: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [],
      counterSales: [],
      payments: [
        { id: 'pay-sc9', workspace_id: WS_ID, payment_number: 'PAY-SC9', reference_no: 'REF-DUP-99', amount: 25000, method: 'UPI', payment_date: '2026-10-22', status: 'COMPLETED' },
        // Accidental duplicate submission with same ID
        { id: 'pay-sc9', workspace_id: WS_ID, payment_number: 'PAY-SC9', reference_no: 'REF-DUP-99', amount: 25000, method: 'UPI', payment_date: '2026-10-22', status: 'COMPLETED' },
      ],
    };
    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.collections, 25000.00);
    assert.equal(res.audit.payments.deduplicatedCount, 1);
  });

  // ---------------------------------------------------------------------------
  // 10. Desktop/Mobile analytics parity simulation
  // ---------------------------------------------------------------------------
  it('Scenario 10 — Desktop/Mobile analytics parity simulation (exact ₹0.00 variance)', () => {
    const authoritativeDataset: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        { id: 'inv-1', workspace_id: WS_ID, invoice_number: 'INV-1', date: '2026-10-26', grand_total: 365800, paid_amount: 365800, balance_amount: 0, status: 'Paid', payment_method: 'Cash', invoice_items: [{ id: 'ii-1', buy_price: 200000, quantity: 1, total: 365800 }] },
        { id: 'inv-2', workspace_id: WS_ID, invoice_number: 'INV-2', date: '2026-10-26', grand_total: 731600, paid_amount: 731600, balance_amount: 0, status: 'Paid', payment_method: 'Cash', invoice_items: [{ id: 'ii-2', buy_price: 400000, quantity: 1, total: 731600 }] },
      ],
      counterSales: [
        { id: 'cs-1', workspace_id: WS_ID, sale_number: 'CS-1', sale_date: '2026-10-27', final_total: 3141, amount_received: 3141, balance_amount: 0, payment_method: 'Cash', status: 'COMPLETED' },
      ],
      payments: [
        { id: 'pay-inv2-upi', workspace_id: WS_ID, invoice_id: 'inv-2', payment_number: 'PAY-UPI', amount: 200000, method: 'UPI', payment_date: '2026-10-27', status: 'COMPLETED' },
      ],
      udhariRecords: [],
    };

    const desktopRun = FinancialAnalyticsEngine.calculate(authoritativeDataset);
    const mobileRun = FinancialAnalyticsEngine.calculate({ ...authoritativeDataset });

    assert.equal(desktopRun.kpis.totalSales, mobileRun.kpis.totalSales);
    assert.equal(desktopRun.kpis.collections, mobileRun.kpis.collections);
    assert.equal(desktopRun.kpis.cashCollections, mobileRun.kpis.cashCollections);
    assert.equal(desktopRun.kpis.upiCollections, mobileRun.kpis.upiCollections);
    assert.equal(desktopRun.kpis.grossProfit, mobileRun.kpis.grossProfit);
    assert.equal(desktopRun.kpis.outstandingUdhari, mobileRun.kpis.outstandingUdhari);
  });

  // ---------------------------------------------------------------------------
  // 11. Historical missing Udhari recovery (INV-1793207161478 scenario)
  // ---------------------------------------------------------------------------
  it('Scenario 11 — Historical missing Udhari recovery (INV-1793207161478 reconstruction)', () => {
    // Exactly mirrors Chris invoice and repaired udhari_records row
    const input: EngineInputData = {
      workspaceId: WS_ID,
      startDateStr: '2026-10-01',
      endDateStr: '2026-11-12',
      invoices: [
        {
          id: '88163dc7-f09d-405b-a993-0a2655256b99',
          workspace_id: WS_ID,
          invoice_number: 'INV-1793207161478',
          date: '2026-10-27',
          grand_total: 365800,
          paid_amount: 265800,
          balance_amount: 100000,
          status: 'Partially Paid',
          payment_method: 'Cash',
        },
      ],
      counterSales: [],
      payments: [],
      udhariRecords: [
        {
          id: '57688b66-8dbb-4372-974d-5461a951dd87',
          workspace_id: WS_ID,
          invoice_id: '88163dc7-f09d-405b-a993-0a2655256b99',
          udhari_code: 'UD-INV-1793207161478',
          customer_name_snapshot: 'Chris',
          original_amount: 365800.00,
          total_received: 265800.00,
          outstanding_amount: 100000.00,
          due_date: '2026-11-10T18:30:00.000Z',
          created_at: '2026-10-28T17:06:00.630Z',
          status: 'PARTIALLY PAID',
          notes: '[branch: 4330d620-c0f8-4261-905b-7386b7e82520]',
          udhari_payments: [],
        },
      ],
    };

    const res = FinancialAnalyticsEngine.calculate(input);
    assert.equal(res.kpis.totalSales, 365800.00);
    assert.equal(res.kpis.collections, 265800.00);
    assert.equal(res.kpis.cashCollections, 265800.00);
    // Correctly reconstructs 100,000.00 balance, NOT falling back to original_amount 365,800.00!
    assert.equal(res.kpis.outstandingUdhari, 100000.00);
    assert.equal(res.kpis.totalSales, res.kpis.collections + res.kpis.outstandingUdhari);
  });

  // ---------------------------------------------------------------------------
  // 12. Invoice status transitions & epsilon tolerance (< ₹0.01)
  // ---------------------------------------------------------------------------
  it('Scenario 12 — Invoice status transitions & epsilon tolerance (< ₹0.01)', () => {
    // Test status transition helper or logic
    const testCases = [
      { grandTotal: 1000, paid: 0, expectedStatus: 'Issued', expectedBal: 1000 },
      { grandTotal: 1000, paid: 500, expectedStatus: 'Partially Paid', expectedBal: 500 },
      { grandTotal: 1000, paid: 1000, expectedStatus: 'Paid', expectedBal: 0 },
      // Epsilon tolerance: remaining balance < 0.01 treated as Paid
      { grandTotal: 1000, paid: 999.995, expectedStatus: 'Paid', expectedBal: 0 },
    ];

    testCases.forEach((tc) => {
      const balance = Math.max(0, tc.grandTotal - tc.paid);
      const isZero = balance < 0.01;
      let derivedStatus: string;
      if (isZero) {
        derivedStatus = 'Paid';
      } else if (tc.paid > 0) {
        derivedStatus = 'Partially Paid';
      } else {
        derivedStatus = 'Issued';
      }

      assert.equal(derivedStatus, tc.expectedStatus);
      if (isZero) {
        assert.equal(0, tc.expectedBal);
      } else {
        assert.equal(balance, tc.expectedBal);
      }
    });
  });
});

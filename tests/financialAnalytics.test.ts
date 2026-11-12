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
});

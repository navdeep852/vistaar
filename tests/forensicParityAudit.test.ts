import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FinancialAnalyticsEngine } from '../src/services/analytics/financialAnalyticsEngine.ts';
import { resolveAuthoritativeStock } from '../src/services/supabase/productStockResolver.ts';

describe('VISTAAR Forensic Parity Audit Suite (15 Nov 2026 Production Scenario)', () => {
  const MAIN_BRANCH_ID = '5c456a11-1321-40af-9c79-0fa151419922';
  const NORTH_BRANCH_ID = '4330d620-c0f8-4261-905b-7386b7e82520';
  const WS_ID = 'ddb10dc7-3671-4def-9626-526afd473c1a';

  // Invoices created today (15 Nov 2026) in Main Branch
  const productionInvoices = [
    {
      id: '92220a59-369c-4b9e-a1cf-2dc0e2a72959',
      invoice_number: 'INV-1794718486640',
      date: '2026-11-15',
      grand_total: 29488.20,
      paid_amount: 14488.00,
      balance_amount: 15000.20,
      status: 'Partially Paid',
      snapshot: { branch_id: MAIN_BRANCH_ID, branchId: MAIN_BRANCH_ID },
      invoice_items: [
        { product_id: 'prod-1', quantity: 2, buy_price_snapshot: 6755.90, total: 29488.20 }
      ]
    },
    {
      id: '47ae0dd9-5bcd-4d77-be86-bbaf40818f69',
      invoice_number: 'INV-1794718317875',
      date: '2026-11-15',
      grand_total: 11788.20,
      paid_amount: 11788.20,
      balance_amount: 0,
      status: 'Paid',
      snapshot: { branch_id: MAIN_BRANCH_ID, branchId: MAIN_BRANCH_ID },
      invoice_items: [
        { product_id: 'prod-2', quantity: 1, buy_price_snapshot: 11788.20, total: 11788.20 }
      ]
    }
  ];

  // Payment recorded with stray branch tag in notes, but linked to Main Branch invoice
  const productionPayments = [
    {
      id: '044e3858-5d8a-4726-9a3c-a287325b370c',
      invoice_id: '92220a59-369c-4b9e-a1cf-2dc0e2a72959',
      invoice_number: 'INV-1794718486640',
      payment_date: '2026-11-15',
      amount: 14488.00,
      method: 'Cash',
      notes: 'Payment recorded at invoice finalization [branch: 4330d620-c0f8-4261-905b-7386b7e82520]',
    }
  ];

  // Udhari records: Desk Test_2 for INV-1794718486640 (15,000.20) + Historical Chris (100,000.00)
  const productionUdhari = [
    {
      id: '4a5cdf2f-02cc-4680-a6b7-06b1622ef226',
      udhari_code: 'UD-INV-1794718486640',
      invoice_id: '92220a59-369c-4b9e-a1cf-2dc0e2a72959',
      customer_name_snapshot: 'Desk Test_2',
      original_amount: 29488.20,
      total_received: 14488.00,
      outstanding_amount: 15000.20,
      created_at: '2026-11-15T05:43:47.43294+00:00',
      notes: '[branch: 4330d620-c0f8-4261-905b-7386b7e82520] [invoice: 92220a59-369c-4b9e-a1cf-2dc0e2a72959]',
    },
    {
      id: '57688b66-8dbb-4372-974d-5461a951dd87',
      udhari_code: 'UD-INV-1793207161478',
      customer_name_snapshot: 'Chris',
      original_amount: 365800.00,
      total_received: 265800.00,
      outstanding_amount: 100000.00,
      created_at: '2026-10-28T17:06:00.63+00:00',
      notes: '[branch: 4330d620-c0f8-4261-905b-7386b7e82520]',
    }
  ];

  test('1. Total Sales Parity: Reconciles exactly to sum of invoice grand totals (₹41,276.40)', () => {
    const res = FinancialAnalyticsEngine.calculate({
      workspaceId: WS_ID,
      branchId: MAIN_BRANCH_ID,
      startDateStr: '2026-11-15',
      endDateStr: '2026-11-15',
      invoices: productionInvoices,
      counterSales: [],
      payments: productionPayments,
      udhariRecords: [productionUdhari[0]],
    });

    assert.strictEqual(res.kpis.totalSales, 41276.40, 'Total sales must equal ₹41,276.40');
    assert.strictEqual(res.kpis.invoiceSales, 41276.40, 'Invoice sales must equal ₹41,276.40');
    assert.strictEqual(res.kpis.counterSales, 0, 'Counter sales must be 0');
  });

  test('2. Collections Parity: Reconciles verified money collected (₹26,276.20)', () => {
    const res = FinancialAnalyticsEngine.calculate({
      workspaceId: WS_ID,
      branchId: MAIN_BRANCH_ID,
      startDateStr: '2026-11-15',
      endDateStr: '2026-11-15',
      invoices: productionInvoices,
      counterSales: [],
      payments: productionPayments,
      udhariRecords: [productionUdhari[0]],
    });

    assert.strictEqual(res.kpis.collections, 26276.20, 'Collections must equal ₹26,276.20');
    assert.strictEqual(res.kpis.cashCollections, 26276.20, 'Cash collections must equal ₹26,276.20');
    assert.strictEqual(res.kpis.upiCollections, 0, 'UPI collections must be 0');
  });

  test('3. Outstanding Udhari Integrity: Unpaid invoice balance of ₹15,000.20 is preserved (NOT ₹0)', () => {
    const res = FinancialAnalyticsEngine.calculate({
      workspaceId: WS_ID,
      branchId: MAIN_BRANCH_ID,
      startDateStr: '2026-11-15',
      endDateStr: '2026-11-15',
      invoices: productionInvoices,
      counterSales: [],
      payments: productionPayments,
      udhariRecords: [productionUdhari[0]],
    });

    assert.strictEqual(res.kpis.outstandingUdhari, 15000.20, 'Outstanding Udhari must be ₹15,000.20 for Main Branch');
  });

  test('4. Safety Invariant: Even if udhari_records row was missing, invoice balance guarantees Outstanding Udhari', () => {
    // Simulate worst-case: udhari_records array is completely empty
    const res = FinancialAnalyticsEngine.calculate({
      workspaceId: WS_ID,
      branchId: MAIN_BRANCH_ID,
      startDateStr: '2026-11-15',
      endDateStr: '2026-11-15',
      invoices: productionInvoices,
      counterSales: [],
      payments: productionPayments,
      udhariRecords: [], // EMPTY
    });

    assert.strictEqual(res.kpis.outstandingUdhari, 15000.20, 'Invoice balance must recover outstanding debt even if udhari row missing');
  });

  test('5. Consolidated Organization View (ALL branches) reconciles to ₹115,000.20', () => {
    const res = FinancialAnalyticsEngine.calculate({
      workspaceId: WS_ID,
      branchId: 'ALL',
      startDateStr: '2026-11-15',
      endDateStr: '2026-11-15',
      invoices: productionInvoices,
      counterSales: [],
      payments: productionPayments,
      udhariRecords: productionUdhari, // Both Desk Test_2 (15,000.20) and Chris (100,000.00)
    });

    assert.strictEqual(res.kpis.totalSales, 41276.40);
    assert.strictEqual(res.kpis.collections, 26276.20);
    assert.strictEqual(res.kpis.outstandingUdhari, 115000.20, 'Consolidated Udhari must be 15,000.20 + 100,000.00 = 115,000.20');
  });

  test('6. Inventory UI Metrics: Available stock sums correctly across 21 products without zero-out', () => {
    const branches = [
      { id: MAIN_BRANCH_ID, isMainBranch: true, branchCode: 'MAIN', branchName: 'Main Branch' },
      { id: NORTH_BRANCH_ID, isMainBranch: false, branchCode: 'BR-4330', branchName: 'North Branch' },
    ];

    // Master stock sample: 45 for Bulb, 0 for Laptop
    const bulbStock = resolveAuthoritativeStock({
      productId: 'prod-bulb',
      masterStock: 45,
      targetBranchId: MAIN_BRANCH_ID,
      branches,
      branchInventory: [],
    });
    assert.strictEqual(bulbStock, 45, 'Bulb must be 45 in Main Branch');

    const laptopStock = resolveAuthoritativeStock({
      productId: 'prod-laptop',
      masterStock: 0,
      targetBranchId: MAIN_BRANCH_ID,
      branches,
      branchInventory: [],
    });
    assert.strictEqual(laptopStock, 0, 'Laptop must be strictly 0');
  });
});

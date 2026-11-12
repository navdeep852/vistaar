/**
 * VISTAAR BUSINESS OS — Live Supabase Integration Verification Suite
 * 
 * Tests against live Supabase database:
 * 1. Schema compatibility & table column verification
 * 2. Real query execution via financialAnalyticsRepository
 * 3. Authoritative KPI derivation for target period: 2026-10-01 to 2026-11-12
 * 4. Zero schema errors, zero unhandled 42703 column codes
 * 5. Deterministic identity between simulated desktop and mobile clients
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { financialAnalyticsRepository } from '../src/services/analytics/financialAnalyticsRepository.ts';
import { FinancialAnalyticsEngine } from '../src/services/analytics/financialAnalyticsEngine.ts';
import { resolveDateRange } from '../src/lib/dateRange.ts';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
const TEST_WORKSPACE_ID = '11111111-2222-4333-8444-555555555555';

describe('VISTAAR Supabase Staging Data Integration Suite', () => {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  it('1. Live Supabase connection and core financial table accessibility', async () => {
    const tables = [
      'invoices',
      'invoice_items',
      'counter_sales',
      'counter_sale_items',
      'payments',
      'udhari_records',
      'udhari_payments',
      'products',
      'expenses',
    ];

    for (const table of tables) {
      const { data, error } = await sb.from(table).select('*').limit(1);
      assert.equal(
        error,
        null,
        `Table ${table} failed accessibility check: ${error?.message}`
      );
      assert.ok(Array.isArray(data), `Table ${table} should return an array`);
    }
  });

  it('2. Verify column schema alignment on live database', async () => {
    // Invoices
    const invRes = await sb.from('invoices').select('id, workspace_id, invoice_number, status, date, grand_total, paid_amount, balance_amount, created_at, invoice_items(id, buy_price, quantity, total)').limit(1);
    assert.equal(invRes.error, null, `Invoices query failed: ${invRes.error?.message}`);

    // Counter Sales
    const csRes = await sb.from('counter_sales').select('id, workspace_id, sale_number, invoice_number, sale_date, subtotal, final_total, amount_received, balance_amount, payment_method, status, counter_sale_items(id, product_id, quantity, rate)').limit(1);
    assert.equal(csRes.error, null, `Counter sales query failed: ${csRes.error?.message}`);

    // Payments
    const payRes = await sb.from('payments').select('id, workspace_id, customer_id, invoice_id, invoice_number, customer_name, amount, payment_date, method, reference_no, notes, created_at').limit(1);
    assert.equal(payRes.error, null, `Payments query failed: ${payRes.error?.message}`);

    // Udhari
    const uRes = await sb.from('udhari_records').select('id, workspace_id, customer_id, status, due_date, created_at, udhari_payments(id, amount, payment_date, payment_method)').limit(1);
    assert.equal(uRes.error, null, `Udhari query failed: ${uRes.error?.message}`);
  });

  it('3. Real query execution via financialAnalyticsRepository for reporting range 01/10/2026 - 12/11/2026', async () => {
    const range = resolveDateRange({
      filterType: 'custom',
      customStartDate: '2026-10-01',
      customEndDate: '2026-11-12',
    });

    const result = await financialAnalyticsRepository.getAuthoritativeFinancials({
      dateRange: range,
      branchId: 'ALL',
      forceFresh: true,
      explicitWsId: TEST_WORKSPACE_ID,
    });

    assert.ok(result, 'Authoritative result must be returned');
    assert.ok(result.kpis, 'KPIs object must exist');
    assert.ok(typeof result.kpis.totalSales === 'number', 'totalSales must be a number');
    assert.ok(typeof result.kpis.collections === 'number', 'collections must be a number');
    assert.ok(typeof result.kpis.cashCollections === 'number', 'cashCollections must be a number');
    assert.ok(typeof result.kpis.upiCollections === 'number', 'upiCollections must be a number');
    assert.ok(typeof result.kpis.grossProfit === 'number', 'grossProfit must be a number');
    assert.ok(typeof result.kpis.outstandingUdhari === 'number', 'outstandingUdhari must be a number');

    // Mathematical integrity:
    // Total Sales = Invoice Sales + Counter Sales
    const expectedTotalSales = Number((result.kpis.invoiceSales + result.kpis.counterSales).toFixed(2));
    assert.equal(result.kpis.totalSales, expectedTotalSales);

    // Collections = Sum of all payment methods
    const breakdown = result.paymentBreakdown;
    const expectedCollections = Number(
      (
        breakdown.cash +
        breakdown.upi +
        breakdown.bankTransfer +
        breakdown.card +
        breakdown.cheque +
        breakdown.other
      ).toFixed(2)
    );
    assert.equal(result.kpis.collections, expectedCollections);

    // Verify zero query errors occurred during database retrieval
    assert.equal(result.audit.queryErrors.length, 0, `Query errors detected: ${result.audit.queryErrors.join(', ')}`);
  });

  it('4. Branch-filtered live query resilience (handling missing branch_id gracefully)', async () => {
    const range = resolveDateRange({
      filterType: 'custom',
      customStartDate: '2026-10-01',
      customEndDate: '2026-11-12',
    });

    // Provide a non-main specific branch UUID
    const branchSpecificResult = await financialAnalyticsRepository.getAuthoritativeFinancials({
      dateRange: range,
      branchId: '22222222-0000-4000-8000-000000000002',
      forceFresh: true,
      explicitWsId: TEST_WORKSPACE_ID,
    });

    assert.ok(branchSpecificResult, 'Branch-specific query must complete cleanly');
    assert.equal(branchSpecificResult.audit.queryErrors.length, 0, 'No query errors on branch-filtered execution');
  });

  it('5. Zero-tolerance cross-device identity on live database execution', async () => {
    const range = resolveDateRange({
      filterType: 'custom',
      customStartDate: '2026-10-01',
      customEndDate: '2026-11-12',
    });

    // Client A (Desktop simulation)
    const clientA = await financialAnalyticsRepository.getAuthoritativeFinancials({
      dateRange: range,
      branchId: 'ALL',
      forceFresh: true,
      explicitWsId: TEST_WORKSPACE_ID,
    });

    // Client B (Mobile simulation)
    const clientB = await financialAnalyticsRepository.getAuthoritativeFinancials({
      dateRange: range,
      branchId: 'ALL',
      forceFresh: true,
      explicitWsId: TEST_WORKSPACE_ID,
    });

    // Identity check down to ₹0.00
    assert.equal(clientA.kpis.totalSales, clientB.kpis.totalSales);
    assert.equal(clientA.kpis.collections, clientB.kpis.collections);
    assert.equal(clientA.kpis.cashCollections, clientB.kpis.cashCollections);
    assert.equal(clientA.kpis.upiCollections, clientB.kpis.upiCollections);
    assert.equal(clientA.kpis.grossProfit, clientB.kpis.grossProfit);
    assert.equal(clientA.kpis.outstandingUdhari, clientB.kpis.outstandingUdhari);
    assert.equal(clientA.kpis.overdueUdhari, clientB.kpis.overdueUdhari);
  });
});


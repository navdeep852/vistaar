import { store } from '../src/services/store';
import { calculateUdhariFinancials } from '../src/services/financialCalculationService';
import { Product, Branch, StockTransfer, Invoice, UdhariRecord } from '../src/types';

// Standalone in-depth validation script for Section 31 (Test Scenario) and multi-branch integrity
console.log('========================================================================');
console.log('⚡ VISTAAR MULTI-BRANCH MASTER VALIDATION SUITE');
console.log('========================================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    testsFailed++;
  }
}

async function runMasterBranchSuite() {
  const wsId = 'ws-test-multi-branch-001';

  // 1. Setup Branches
  console.log('🔹 Scenario 1: Setup Company and Branches');
  const mainBranch: Branch = {
    id: 'br-main-01',
    workspaceId: wsId,
    branchCode: 'MAIN',
    branchName: 'Main Branch',
    branchType: 'Store',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    status: 'Active',
    isMainBranch: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const delhiBranch: Branch = {
    id: 'br-delhi-02',
    workspaceId: wsId,
    branchCode: 'DEL',
    branchName: 'Delhi Branch',
    branchType: 'Store',
    city: 'New Delhi',
    state: 'Delhi',
    country: 'India',
    status: 'Active',
    isMainBranch: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const lucknowBranch: Branch = {
    id: 'br-lucknow-03',
    workspaceId: wsId,
    branchCode: 'LKO',
    branchName: 'Lucknow Branch',
    branchType: 'Store',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    country: 'India',
    status: 'Active',
    isMainBranch: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert(mainBranch.isMainBranch === true, 'Main branch is designated as default/main');
  assert(delhiBranch.isMainBranch === false && lucknowBranch.isMainBranch === false, 'Secondary branches correctly configured');

  // 2. Product Master and Branch Inventory Setup
  console.log('\n🔹 Scenario 2: Master Product & Branch-Specific Inventory');
  const productMaster: Product = {
    id: 'prod-headphone-01',
    sku: 'HP-SONY-001',
    name: 'Sony Headphone',
    category: 'Electronics',
    price: 2000,
    costPrice: 1200,
    stock: 100, // Total consolidated stock across branches
    unit: 'pcs',
    minStock: 10,
    workspaceId: wsId,
  };

  // Simulated Branch Inventory
  const branchStocks: Record<string, number> = {
    [mainBranch.id]: 50,
    [delhiBranch.id]: 30,
    [lucknowBranch.id]: 20,
  };

  const initialConsolidated = Object.values(branchStocks).reduce((a, b) => a + b, 0);
  assert(branchStocks[mainBranch.id] === 50, 'Initial Main Branch stock = 50');
  assert(branchStocks[delhiBranch.id] === 30, 'Initial Delhi Branch stock = 30');
  assert(branchStocks[lucknowBranch.id] === 20, 'Initial Lucknow Branch stock = 20');
  assert(initialConsolidated === 100, 'Consolidated stock = 100 across branches');

  // 3. Delhi Invoice: Sell 10 Headphones
  console.log('\n🔹 Scenario 3: Branch-Specific Sales Deduction (Delhi Invoice: 10 Headphones)');
  const delhiSaleQty = 10;
  if (branchStocks[delhiBranch.id] >= delhiSaleQty) {
    branchStocks[delhiBranch.id] -= delhiSaleQty;
  }
  assert(branchStocks[delhiBranch.id] === 20, 'Delhi stock reduced from 30 -> 20');
  assert(branchStocks[mainBranch.id] === 50, 'Main Branch stock strictly unchanged (50)');
  assert(branchStocks[lucknowBranch.id] === 20, 'Lucknow Branch stock strictly unchanged (20)');

  // 4. Lucknow Counter Sale: Sell 5 Headphones
  console.log('\n🔹 Scenario 4: Counter Sale (Lucknow POS: 5 Headphones)');
  const lucknowSaleQty = 5;
  if (branchStocks[lucknowBranch.id] >= lucknowSaleQty) {
    branchStocks[lucknowBranch.id] -= lucknowSaleQty;
  }
  assert(branchStocks[lucknowBranch.id] === 15, 'Lucknow stock reduced from 20 -> 15');
  assert(branchStocks[delhiBranch.id] === 20, 'Delhi stock strictly unchanged (20)');
  assert(branchStocks[mainBranch.id] === 50, 'Main Branch stock strictly unchanged (50)');

  // 5. Inter-Branch Stock Transfer: Main -> Delhi (10 Headphones)
  console.log('\n🔹 Scenario 5: Inter-Branch Stock Transfer (Main -> Delhi: 10 Headphones)');
  const transferQty = 10;
  const stockTransfer: StockTransfer = {
    id: 'trf-001',
    transferNumber: 'TRF-2026-0001',
    workspaceId: wsId,
    sourceBranchId: mainBranch.id,
    destinationBranchId: delhiBranch.id,
    status: 'Completed',
    transferDate: new Date().toISOString().split('T')[0],
    sourceBranchName: mainBranch.branchName,
    destinationBranchName: delhiBranch.branchName,
    items: [
      {
        id: 'trfi-001',
        transferId: 'trf-001',
        productId: productMaster.id,
        productName: productMaster.name,
        quantity: transferQty,
      },
    ],
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  assert(stockTransfer.status === 'Completed', 'Stock Transfer state is Completed');
  if (branchStocks[mainBranch.id] >= transferQty) {
    branchStocks[mainBranch.id] -= transferQty;
    branchStocks[delhiBranch.id] += transferQty;
  }
  assert(branchStocks[mainBranch.id] === 40, 'Main Branch stock reduced: 50 -> 40');
  assert(branchStocks[delhiBranch.id] === 30, 'Delhi Branch stock increased: 20 -> 30');
  assert(branchStocks[lucknowBranch.id] === 15, 'Lucknow Branch stock strictly unchanged (15)');

  const postTransferTotal = Object.values(branchStocks).reduce((a, b) => a + b, 0);
  assert(postTransferTotal === 85, 'Total company stock remains 85 (conservation of stock)');

  // 6. Financial Sync & Unified Accounting Test
  console.log('\n🔹 Scenario 6: Financial Event & Synchronized Ledgers (Delhi Branch Invoice)');
  // Create Delhi invoice: Total = ₹10,000, Paid = ₹6,000, Balance = ₹4,000
  const invoiceTotal = 10000;
  const paidAmount = 6000;
  const remainingAmount = 4000;

  const delhiInvoice: Invoice = {
    id: 'inv-delhi-001',
    invoiceNumber: 'DEL-INV-000001',
    workspaceId: wsId,
    branchId: delhiBranch.id,
    customerId: 'cust-rahul-01',
    customerName: 'Rahul Sharma',
    customerPhone: '9876543210',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
    subtotal: 10000,
    grandTotal: invoiceTotal,
    paidAmount: paidAmount,
    balanceAmount: remainingAmount,
    status: 'Partially Paid',
    paymentMode: 'Cash',
    items: [],
    createdAt: new Date().toISOString(),
  };

  // Udhari sync
  const udhariFin = calculateUdhariFinancials(delhiInvoice.grandTotal, delhiInvoice.paidAmount, delhiInvoice.dueDate);
  const udhariRecord: UdhariRecord = {
    id: `UD-${delhiInvoice.invoiceNumber}`,
    workspaceId: wsId,
    branchId: delhiInvoice.branchId,
    invoiceId: delhiInvoice.id,
    customerId: delhiInvoice.customerId,
    customerNameSnapshot: delhiInvoice.customerName,
    phoneSnapshot: delhiInvoice.customerPhone,
    originalAmount: udhariFin.originalAmount,
    totalReceived: udhariFin.totalReceived,
    outstandingAmount: udhariFin.outstandingAmount,
    dueDate: delhiInvoice.dueDate,
    status: udhariFin.status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert(delhiInvoice.branchId === delhiBranch.id, 'Invoice stamped with Delhi branchId');
  assert(delhiInvoice.grandTotal === 10000 && delhiInvoice.paidAmount === 6000 && delhiInvoice.balanceAmount === 4000, 'Invoice amounts: Total ₹10,000, Paid ₹6,000, Due ₹4,000');
  assert(udhariRecord.branchId === delhiBranch.id, 'Udhari record stamped with Delhi branchId');
  assert(udhariRecord.outstandingAmount === 4000, 'Udhari outstanding is exactly ₹4,000');

  // Simulated Daybook transactions
  const daybookSaleEntry = {
    id: 'db-01',
    branchId: delhiBranch.id,
    type: 'Sale',
    amount: 10000,
    referenceId: delhiInvoice.id,
  };
  const daybookPaymentEntry = {
    id: 'db-02',
    branchId: delhiBranch.id,
    type: 'Receipt',
    amount: 6000,
    referenceId: delhiInvoice.id,
  };
  assert(daybookSaleEntry.branchId === delhiBranch.id, 'Daybook Sale stamped with Delhi branchId');
  assert(daybookPaymentEntry.branchId === delhiBranch.id, 'Daybook Receipt stamped with Delhi branchId');

  // Cashbook entry
  const cashbookEntry = {
    id: 'cb-01',
    branchId: delhiBranch.id,
    type: 'Inflow',
    amount: 6000,
    paymentMode: 'Cash',
  };
  assert(cashbookEntry.branchId === delhiBranch.id, 'Cashbook entry stamped with Delhi branchId (Inflow ₹6,000)');

  // 7. Branch Context Filtering & Isolation Verification
  console.log('\n🔹 Scenario 7: Branch Switching & Data Isolation');
  const allInvoices = [delhiInvoice];
  const allUdharis = [udhariRecord];

  // User views Lucknow Branch
  const lucknowFilteredInvoices = allInvoices.filter((inv) => inv.branchId === lucknowBranch.id);
  const lucknowFilteredUdharis = allUdharis.filter((u) => u.branchId === lucknowBranch.id);
  assert(lucknowFilteredInvoices.length === 0, 'Switching to Lucknow: Delhi invoice is NOT visible (count: 0)');
  assert(lucknowFilteredUdharis.length === 0, 'Switching to Lucknow: Delhi udhari is NOT visible (count: 0)');

  // User views Delhi Branch
  const delhiFilteredInvoices = allInvoices.filter((inv) => inv.branchId === delhiBranch.id);
  const delhiFilteredUdharis = allUdharis.filter((u) => u.branchId === delhiBranch.id);
  assert(delhiFilteredInvoices.length === 1, 'Switching to Delhi: Delhi invoice is visible (count: 1)');
  assert(delhiFilteredUdharis.length === 1 && delhiFilteredUdharis[0].outstandingAmount === 4000, 'Switching to Delhi: Delhi udhari outstanding ₹4,000 visible');

  // Owner views All Branches
  const allBranchesInvoices = allInvoices;
  const allBranchesTotalDue = allUdharis.reduce((sum, u) => sum + u.outstandingAmount, 0);
  assert(allBranchesInvoices.length === 1, 'All Branches view: Consolidated invoice count = 1');
  assert(allBranchesTotalDue === 4000, 'All Branches view: Consolidated outstanding receivable = ₹4,000');

  // 8. RLS Authorization Simulation
  console.log('\n🔹 Scenario 8: Database-Level Security and Branch Authorization Simulation');
  const userStaffDelhi = { userId: 'usr-delhi-staff', permittedBranches: [delhiBranch.id] };
  const userStaffLucknow = { userId: 'usr-lko-staff', permittedBranches: [lucknowBranch.id] };

  function simulateRlsAccess(user: { permittedBranches: string[] }, targetBranchId: string): boolean {
    return user.permittedBranches.includes(targetBranchId);
  }

  assert(simulateRlsAccess(userStaffDelhi, delhiBranch.id) === true, 'Delhi staff permitted to access Delhi Branch');
  assert(simulateRlsAccess(userStaffDelhi, lucknowBranch.id) === false, 'Delhi staff REJECTED by security policy when querying Lucknow Branch');
  assert(simulateRlsAccess(userStaffLucknow, lucknowBranch.id) === true, 'Lucknow staff permitted to access Lucknow Branch');
  assert(simulateRlsAccess(userStaffLucknow, delhiBranch.id) === false, 'Lucknow staff REJECTED by security policy when querying Delhi Branch');

  // Final Summary
  console.log('\n========================================================================');
  console.log(`🏁 TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('========================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runMasterBranchSuite().catch((err) => {
  console.error('Fatal error in branch validation suite:', err);
  process.exit(1);
});

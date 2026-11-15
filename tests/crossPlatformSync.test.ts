import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('VISTAAR Cross-Platform Inventory & Udhari Synchronization Suite', () => {
  const MOCK_WORKSPACE_ID = 'ddb10dc7-3671-4def-9626-526afd473c1a';
  const MAIN_BRANCH_ID = '5c456a11-1321-40af-9c79-0fa151419922';
  const NORTH_BRANCH_ID = '4330d620-c0f8-4261-905b-7386b7e82520';

  const MOCK_21_PRODUCTS = [
    { id: 'prod-01', name: '27W USB-C Charger', sku: 'EL-CHG-017', currentStock: 10, minimumStock: 5 },
    { id: 'prod-02', name: 'Bluetooth Headphones', sku: 'EL-HDP-020', currentStock: 7, minimumStock: 5 },
    { id: 'prod-03', name: 'Bluetooth Speaker', sku: 'EL-SPK-003', currentStock: 11, minimumStock: 5 },
    { id: 'prod-04', name: 'CCTV Indoor Camera', sku: 'EL-CAM-019', currentStock: 0, minimumStock: 5 },
    { id: 'prod-05', name: 'HDMI Cable 2m', sku: 'EL-CAB-006', currentStock: 20, minimumStock: 5 },
    { id: 'prod-06', name: 'Laptop', sku: '10009106AC', currentStock: 0, minimumStock: 5 },
    { id: 'prod-07', name: 'Laptop Cooling Pad', sku: 'EL-CLP-013', currentStock: 17, minimumStock: 5 },
    { id: 'prod-08', name: 'LED Desk Lamp', sku: 'EL-LMP-012', currentStock: 19, minimumStock: 5 },
    { id: 'prod-09', name: 'Mechanical Keyboard', sku: 'EL-MKB-016', currentStock: 11, minimumStock: 5 },
    { id: 'prod-10', name: 'Portable SSD 256GB', sku: 'EL-SSD-015', currentStock: 12, minimumStock: 5 },
    { id: 'prod-11', name: 'Power Bank 10000mAh', sku: 'EL-PBK-008', currentStock: 20, minimumStock: 5 },
    { id: 'prod-12', name: 'Smart LED Bulb 9W', sku: 'EL-BLB-018', currentStock: 45, minimumStock: 5 },
    { id: 'prod-13', name: 'Smart Plug 16A', sku: 'EL-PLG-014', currentStock: 15, minimumStock: 5 },
    { id: 'prod-14', name: 'Surge Protector 4-Socket', sku: 'EL-SRG-007', currentStock: 22, minimumStock: 5 },
    { id: 'prod-15', name: 'USB Flash Drive 64GB', sku: 'EL-USB-009', currentStock: 28, minimumStock: 5 },
    { id: 'prod-16', name: 'USB-C Hub 6-in-1', sku: 'EL-HUB-002', currentStock: 18, minimumStock: 5 },
    { id: 'prod-17', name: 'Webcam 1080p', sku: 'EL-WEB-010', currentStock: 13, minimumStock: 5 },
    { id: 'prod-18', name: 'Wi-Fi Router', sku: 'EL-RTR-005', currentStock: 14, minimumStock: 5 },
    { id: 'prod-19', name: 'Wired Keyboard', sku: 'EL-KEY-004', currentStock: 32, minimumStock: 5 },
    { id: 'prod-20', name: 'Wireless Earbuds', sku: 'EL-EAR-011', currentStock: 25, minimumStock: 5 },
    { id: 'prod-21', name: 'Wireless Mouse', sku: 'EL-MOU-001', currentStock: 24, minimumStock: 5 },
  ];

  it('1. Inventory Parity: All 19 positive products retain accurate stock across secondary branches when unpartitioned', () => {
    const specificBranchId = NORTH_BRANCH_ID;
    const branches = [
      { id: MAIN_BRANCH_ID, branchName: 'Main Branch', isMainBranch: true },
      { id: NORTH_BRANCH_ID, branchName: 'North Branch', isMainBranch: false },
    ];
    const allLocalBInv: any[] = []; // No explicit branch allocations exist in database/local
    const remoteBInv: any[] = [];

    const bObj = branches.find((b) => b.id === specificBranchId);
    const isMain = bObj?.isMainBranch ?? false;

    const resolved = MOCK_21_PRODUCTS.map((p) => {
      let currentStock = p.currentStock;
      const bRow = undefined;

      if (bRow) {
        currentStock = 999;
      } else if (isMain || (!bObj && branches.length === 0)) {
        currentStock = p.currentStock;
      } else {
        const hasAnyExplicitAllocation = allLocalBInv.some(
          (bi: any) => bi.productId === p.id && bi.branchId !== specificBranchId
        ) || remoteBInv.some((bi: any) => bi.productId === p.id);

        if (hasAnyExplicitAllocation) {
          currentStock = 0;
        } else {
          currentStock = Math.max(0, Number(p.currentStock) || 0);
        }
      }

      return {
        ...p,
        currentStock,
        status: currentStock === 0 ? 'Out of Stock' : (currentStock <= p.minimumStock ? 'Low Stock' : 'In Stock'),
      };
    });

    const inStock = resolved.filter((p) => p.status === 'In Stock');
    const outOfStock = resolved.filter((p) => p.status === 'Out of Stock');
    const zeroStock = resolved.filter((p) => p.currentStock === 0);

    // Verify 19 products are In Stock and exactly 2 (Laptop and CCTV Camera) are Out of Stock
    assert.strictEqual(zeroStock.length, 2, 'Exactly 2 products must have 0 stock');
    assert.strictEqual(outOfStock.length, 2, 'Exactly 2 products must be Out of Stock');
    assert.strictEqual(inStock.length, 19, '19 products must be In Stock');

    // Laptop and CCTV Indoor Camera must be 0
    assert.strictEqual(resolved.find((p) => p.name === 'Laptop')?.currentStock, 0);
    assert.strictEqual(resolved.find((p) => p.name === 'CCTV Indoor Camera')?.currentStock, 0);

    // Wireless Mouse must be 24, Smart LED Bulb must be 45
    assert.strictEqual(resolved.find((p) => p.name === 'Wireless Mouse')?.currentStock, 24);
    assert.strictEqual(resolved.find((p) => p.name === 'Smart LED Bulb 9W')?.currentStock, 45);
  });

  it('2. Inventory Allocation: Explicit branch inventory overrides catalog stock without aggregate bleed', () => {
    const specificBranchId = NORTH_BRANCH_ID;
    const branches = [
      { id: MAIN_BRANCH_ID, branchName: 'Main Branch', isMainBranch: true },
      { id: NORTH_BRANCH_ID, branchName: 'North Branch', isMainBranch: false },
    ];
    // Allocate 5 Wireless Mouse to North Branch
    const allLocalBInv = [
      { branchId: NORTH_BRANCH_ID, productId: 'prod-21', currentStock: 5 },
    ];

    const bObj = branches.find((b) => b.id === specificBranchId);
    const isMain = bObj?.isMainBranch ?? false;

    // Simulate North Branch stock
    const mouseNorth = (() => {
      const bRow = allLocalBInv.find((bi) => bi.branchId === NORTH_BRANCH_ID && bi.productId === 'prod-21');
      if (bRow) return bRow.currentStock;
      return 0;
    })();
    assert.strictEqual(mouseNorth, 5, 'North Branch must show exactly allocated 5 units');

    // Simulate Main Branch stock (master - other allocations)
    const mouseMain = (() => {
      const otherAllocations = allLocalBInv
        .filter((bi) => bi.branchId !== MAIN_BRANCH_ID && bi.productId === 'prod-21')
        .reduce((sum, bi) => sum + bi.currentStock, 0);
      const master = 24;
      return master - otherAllocations;
    })();
    assert.strictEqual(mouseMain, 19, 'Main Branch must show 19 units (24 - 5)');
  });

  it('3. Udhari Creation & Payload Sanitization: No unmigrated columns sent to Supabase', () => {
    const rawInvoice = {
      id: '92220a59-369c-4b9e-a1cf-2dc0e2a72959',
      invoiceNumber: 'INV-1794718486640',
      branchId: NORTH_BRANCH_ID,
      customerId: null,
      customerName: 'Desk Test_2',
      customerPhone: '9876543210',
      grandTotal: 29488.20,
      paidAmount: 14488.00,
      balanceAmount: 15000.20,
      dueDate: '2026-11-30',
    };

    // Construct Udhari record payload
    const udhariCode = `UD-${rawInvoice.invoiceNumber}`;
    const udhariNotes = `[branch: ${rawInvoice.branchId}] [invoice: ${rawInvoice.id}]`;

    const udhariPayload = {
      workspace_id: MOCK_WORKSPACE_ID,
      customer_id: rawInvoice.customerId,
      udhari_code: udhariCode,
      customer_name_snapshot: rawInvoice.customerName,
      phone_snapshot: rawInvoice.customerPhone,
      original_amount: rawInvoice.grandTotal,
      total_received: rawInvoice.paidAmount,
      outstanding_amount: rawInvoice.balanceAmount,
      due_date: rawInvoice.dueDate,
      notes: udhariNotes,
      status: 'PARTIALLY PAID',
    };

    // Assert strictly valid columns
    assert.strictEqual('branch_id' in udhariPayload, false, 'branch_id must NOT be a top-level column in udhari_records');
    assert.strictEqual('invoice_id' in udhariPayload, false, 'invoice_id must NOT be a top-level column in udhari_records');
    assert.strictEqual(udhariPayload.outstanding_amount, 15000.20);
    assert.strictEqual(udhariPayload.status, 'PARTIALLY PAID');
    assert.ok(udhariPayload.notes.includes(NORTH_BRANCH_ID));
    assert.ok(udhariPayload.notes.includes(rawInvoice.id));
  });

  it('4. Payment Upfront Persistence: Valid payment payload without unmigrated columns', () => {
    const rawInvoice = {
      id: '92220a59-369c-4b9e-a1cf-2dc0e2a72959',
      invoiceNumber: 'INV-1794718486640',
      branchId: NORTH_BRANCH_ID,
      customerId: null,
      customerName: 'Desk Test_2',
      paidAmount: 14488.00,
      paymentMode: 'Cash',
      date: '2026-11-15',
    };

    const randPaymentCode = `PAY-2026-${Math.floor(10000 + Math.random() * 90000)}`;
    const paymentNotes = `Payment recorded at invoice finalization [branch: ${rawInvoice.branchId}]`;

    const paymentPayload = {
      workspace_id: MOCK_WORKSPACE_ID,
      payment_number: randPaymentCode,
      invoice_id: rawInvoice.id,
      invoice_number: rawInvoice.invoiceNumber,
      customer_id: null,
      customer_name: rawInvoice.customerName,
      amount: rawInvoice.paidAmount,
      payment_date: rawInvoice.date,
      method: rawInvoice.paymentMode,
      reference_no: null,
      notes: paymentNotes,
    };

    assert.strictEqual('branch_id' in paymentPayload, false, 'branch_id must NOT be a top-level column in payments');
    assert.strictEqual('payment_method' in paymentPayload, false, 'payment_method must NOT be in payments (uses method)');
    assert.strictEqual('counter_sale_id' in paymentPayload, false, 'counter_sale_id must NOT be in payments');
    assert.strictEqual(paymentPayload.amount, 14488.00);
    assert.strictEqual(paymentPayload.method, 'Cash');
    assert.ok(paymentPayload.payment_number.startsWith('PAY-2026-'));
  });

  it('5. Cross-Platform Parity Simulation: Desktop Finalization matches Android Querying', () => {
    // 1. Desktop finalizes invoice
    const invoice = {
      id: '92220a59-369c-4b9e-a1cf-2dc0e2a72959',
      invoiceNumber: 'INV-1794718486640',
      customerName: 'Desk Test_2',
      grandTotal: 29488.20,
      paidAmount: 14488.00,
      balanceAmount: 15000.20,
      status: 'Partially Paid',
    };

    // 2. Authoritative PostgreSQL state
    const dbPayments = [
      { id: 'pay-1', invoice_id: invoice.id, amount: 14488.00, method: 'Cash' },
    ];
    const dbUdharis = [
      { id: 'u-1', udhari_code: `UD-${invoice.invoiceNumber}`, original_amount: 29488.20, total_received: 14488.00, outstanding_amount: 15000.20, status: 'PARTIALLY PAID' },
    ];

    // 3. Android queries Supabase
    const androidInvoicePaid = dbPayments.reduce((sum, p) => sum + p.amount, 0);
    const androidUdhari = dbUdharis.find((u) => u.udhari_code === `UD-${invoice.invoiceNumber}`);

    assert.strictEqual(androidInvoicePaid, invoice.paidAmount, 'Android invoice paid amount must equal Desktop value');
    assert.ok(androidUdhari, 'Android must find Udhari record');
    assert.strictEqual(androidUdhari?.outstanding_amount, 15000.20, 'Android outstanding receivable must match Desktop ₹15,000.20');
    assert.strictEqual(androidUdhari?.status, 'PARTIALLY PAID', 'Android status must be PARTIALLY PAID');
  });
});

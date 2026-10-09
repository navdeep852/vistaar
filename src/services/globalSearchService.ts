import {
  productService,
  customerService,
  invoiceService,
  quotationService,
  purchaseOrderService,
  expenseService,
} from './supabase';
import { store } from './store';
import { hasCurrentUserPermission } from '../lib/permissions';
import { Product, Customer, Supplier, UdhariRecord, Expense } from '../types';

export type SearchResultCategory =
  | 'modules'
  | 'products'
  | 'customers'
  | 'invoices'
  | 'quotations'
  | 'suppliers'
  | 'purchase_orders'
  | 'udhari'
  | 'expenses';

export interface GlobalSearchResult {
  id: string;
  category: SearchResultCategory;
  categoryLabel: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: 'blue' | 'emerald' | 'purple' | 'indigo' | 'amber' | 'cyan' | 'rose' | 'orange' | 'slate';
  targetTab: string;
  metadata?: Record<string, any>;
}

export interface GroupedSearchResults {
  modules: GlobalSearchResult[];
  products: GlobalSearchResult[];
  customers: GlobalSearchResult[];
  invoices: GlobalSearchResult[];
  quotations: GlobalSearchResult[];
  suppliers: GlobalSearchResult[];
  purchase_orders: GlobalSearchResult[];
  udhari: GlobalSearchResult[];
  expenses: GlobalSearchResult[];
}

interface NavigationModule {
  id: string;
  title: string;
  desc: string;
  tab: string;
  keywords: string[];
  permission?: any;
}

const ALL_MODULES: NavigationModule[] = [
  { id: 'dashboard', title: 'Dashboard', desc: 'Business summary & live metrics', tab: 'dashboard', keywords: ['dash', 'home', 'overview', 'kpi', 'metrics'] },
  { id: 'analytics', title: 'Analytics', desc: 'Business performance & insights', tab: 'analytics', keywords: ['ana', 'stats', 'growth', 'charts', 'report'], permission: 'analytics.view' },
  { id: 'invoices', title: 'Invoices', desc: 'Billing, tax invoices & payments', tab: 'invoices', keywords: ['inv', 'bill', 'tax', 'sales', 'gst', 'receipt'] },
  { id: 'quotations', title: 'Quotations', desc: 'Create, edit and track estimates', tab: 'quotations', keywords: ['quo', 'estimate', 'proposal', 'quote'] },
  { id: 'customers', title: 'Customers', desc: 'Client directory & credit profiles', tab: 'customers', keywords: ['cust', 'client', 'party', 'buyer'] },
  { id: 'products', title: 'Products & Inventory', desc: 'Inventory catalog & pricing margins', tab: 'products', keywords: ['prod', 'item', 'inventory', 'stock', 'catalog', 'sku'] },
  { id: 'stock', title: 'Stock Movement', desc: 'Inventory adjustments & stock history', tab: 'stock', keywords: ['stock', 'movement', 'adjustment', 'transfer'] },
  { id: 'categories', title: 'Categories', desc: 'Product category taxonomy', tab: 'categories', keywords: ['cat', 'taxonomy', 'classification'] },
  { id: 'counter-sale', title: 'Counter Sale / POS', desc: 'Rapid retail checkout & walk-in billing', tab: 'counter-sale', keywords: ['pos', 'counter', 'retail', 'walkin', 'quick bill'] },
  { id: 'suppliers', title: 'Suppliers', desc: 'Vendor directory & contacts', tab: 'suppliers', keywords: ['sup', 'vendor', 'seller', 'distributor'] },
  { id: 'purchase-orders', title: 'Purchase Orders', desc: 'Procurement & vendor orders', tab: 'purchase-orders', keywords: ['po', 'purchase', 'procurement', 'order'] },
  { id: 'supplier-catalogue', title: 'Supplier Catalogue', desc: 'Vendor pricing & item sheets', tab: 'supplier-catalogue', keywords: ['catalogue', 'vendor items', 'rate list'] },
  { id: 'udhari', title: 'Udhari Ledger', desc: 'Outstanding balances & transaction history', tab: 'udhari', keywords: ['udh', 'credit', 'ledger', 'due', 'balance', 'khata'] },
  { id: 'daybook', title: 'Daybook', desc: 'Daily debit & credit cash transactions', tab: 'daybook', keywords: ['day', 'daily', 'debit', 'credit', 'transactions'] },
  { id: 'cashbook', title: 'Cashbook', desc: 'Cash & bank liquidity ledger', tab: 'cashbook', keywords: ['cash', 'bank', 'liquidity', 'journal'] },
  { id: 'expenses', title: 'Expenses', desc: 'Business operational expenses', tab: 'expenses', keywords: ['exp', 'spending', 'cost', 'bills', 'rent'] },
  { id: 'salary-payroll', title: 'Salary & Payroll', desc: 'Employee compensation & payroll ledger', tab: 'salary-payroll', keywords: ['sal', 'payroll', 'employee', 'wages', 'staff'] },
  { id: 'financial-statements', title: 'Financial Statements', desc: 'Authoritative P&L statement & financials', tab: 'financial-statements', keywords: ['fin', 'pnl', 'profit', 'loss', 'balance sheet', 'statement'], permission: 'financial_statements.view' },
  { id: 'eway', title: 'E-Way Bills', desc: 'Government e-way bill generation', tab: 'eway', keywords: ['eway', 'e-way', 'transport', 'logistics', 'vehicle'] },
  { id: 'follow-ups', title: 'Follow-ups', desc: 'Manage customer task reminders', tab: 'follow-ups', keywords: ['follow', 'reminder', 'task', 'call'] },
  { id: 'feedback', title: 'Customer Feedback', desc: 'Client reviews & star ratings', tab: 'feedback', keywords: ['feedback', 'rating', 'review'] },
  { id: 'offers', title: 'Offers & Campaigns', desc: 'Discounts & promotional campaigns', tab: 'offers', keywords: ['offer', 'discount', 'promo', 'deal'] },
  { id: 'settings', title: 'Settings', desc: 'Business profile & invoice setup', tab: 'settings', keywords: ['sett', 'profile', 'business', 'config', 'setup'] },
];

export class GlobalSearchService {
  /**
   * Search across VISTAAR entities & modules.
   * Scoped to the current tenant / workspace.
   */
  public async search(query: string): Promise<GroupedSearchResults> {
    const q = query.trim().toLowerCase();

    // 1. Filter accessible modules
    const matchedModules = ALL_MODULES.filter((m) => {
      if (m.permission && !hasCurrentUserPermission(m.permission)) {
        return false;
      }
      if (!q) {
        // Default top suggested modules when query is empty
        return ['invoices', 'quotations', 'customers', 'products', 'analytics', 'daybook', 'expenses', 'udhari'].includes(m.id);
      }
      return (
        m.title.toLowerCase().includes(q) ||
        m.desc.toLowerCase().includes(q) ||
        m.tab.toLowerCase().includes(q) ||
        m.keywords.some((kw) => kw.includes(q) || q.includes(kw))
      );
    }).slice(0, 6).map((m) => ({
      id: `module-${m.id}`,
      category: 'modules' as const,
      categoryLabel: 'Navigation',
      title: m.title,
      subtitle: m.desc,
      badge: 'Module',
      badgeColor: 'slate' as const,
      targetTab: m.tab,
    }));

    // If query is empty or 1 char, only return navigation shortcuts
    if (q.length < 2) {
      return {
        modules: matchedModules,
        products: [],
        customers: [],
        invoices: [],
        quotations: [],
        suppliers: [],
        purchase_orders: [],
        udhari: [],
        expenses: [],
      };
    }

    // 2. Resolve active branch context
    const { branchService } = await import('./supabase/branchService');
    const { safeGetTenantItem } = await import('./supabase/safeStorage');
    const activeBranchId = branchService.getActiveBranchId();
    const mainBranchId = safeGetTenantItem('main_branch_id');
    const isMainBranch = !activeBranchId || activeBranchId === 'ALL' || activeBranchId === mainBranchId || String(activeBranchId).toLowerCase().includes('main');

    // 2b. Perform concurrent queries for entities (workspace/tenant and branch scoped)
    const [
      productsRes,
      customersRes,
      invoicesRes,
      quotationsRes,
      suppliersRes,
      purchaseOrdersRes,
      udhariRes,
      expensesRes,
    ] = await Promise.allSettled([
      // A. Products (branch stock aware)
      productService.getProducts({ search: q, pageSize: 4, branchId: activeBranchId }).catch(() => ({ data: [] as Product[] })),

      // B. Customers
      customerService.getCustomers({ search: q, pageSize: 4 }).catch(() => ({ data: [] as Customer[] })),

      // C. Invoices (branch isolated)
      invoiceService.getInvoices({ search: q, pageSize: 4, branchId: activeBranchId }).catch(() => ({ data: [] as any[] })),

      // D. Quotations (branch isolated)
      quotationService.getQuotations(undefined, { branchId: activeBranchId }).then((res) => {
        const list = res.data || [];
        return list
          .filter((quo: any) =>
            (quo.quotationNumber && quo.quotationNumber.toLowerCase().includes(q)) ||
            (quo.customerName && quo.customerName.toLowerCase().includes(q))
          )
          .slice(0, 4);
      }).catch(() => [] as any[]),

      // E. Suppliers
      productService.getSuppliers().then((res) => {
        const list = res.data || store.getSuppliers() || [];
        return list
          .filter((s: Supplier) =>
            (s.name && s.name.toLowerCase().includes(q)) ||
            (s.phone && s.phone.includes(q)) ||
            (s.contactPerson && s.contactPerson.toLowerCase().includes(q))
          )
          .slice(0, 4);
      }).catch(() => [] as Supplier[]),

      // F. Purchase Orders
      purchaseOrderService.getPurchaseOrders({ search: q, pageSize: 4 }).catch(() => ({ data: [] as any[] })),

      // G. Udhari Ledger (branch isolated)
      Promise.resolve(
        (store.getUdharis() || [])
          .filter((u: UdhariRecord) => {
            if (activeBranchId && activeBranchId !== 'ALL') {
              const b = u.branchId || (u as any).branch_id;
              if (b ? b !== activeBranchId : !isMainBranch) return false;
            }
            return (
              (u.customerNameSnapshot && u.customerNameSnapshot.toLowerCase().includes(q)) ||
              (u.id && u.id.toLowerCase().includes(q)) ||
              (u.phoneSnapshot && u.phoneSnapshot.includes(q))
            );
          })
          .slice(0, 4)
      ).catch(() => [] as UdhariRecord[]),

      // H. Expenses (branch isolated)
      expenseService.getExpenses({ branchId: activeBranchId, includeCompanyLevel: isMainBranch }).then((res) => {
        const list = res.data || store.getExpenses() || [];
        return list
          .filter((e: Expense) =>
            (e.expenseName && e.expenseName.toLowerCase().includes(q)) ||
            (e.category && e.category.toLowerCase().includes(q)) ||
            (e.paidTo && e.paidTo.toLowerCase().includes(q))
          )
          .slice(0, 4);
      }).catch(() => [] as Expense[]),
    ]);

    // 3. Format Products
    const products: GlobalSearchResult[] = [];
    if (productsRes.status === 'fulfilled' && productsRes.value?.data) {
      for (const p of productsRes.value.data) {
        const stockQty = p.currentStock ?? 0;
        const price = p.sellingPrice || p.buyPrice || 0;
        products.push({
          id: `product-${p.id}`,
          category: 'products',
          categoryLabel: 'Products & Inventory',
          title: p.name,
          subtitle: `${p.sku ? 'SKU: ' + p.sku + ' • ' : ''}Stock: ${stockQty} ${p.unit || 'Units'} • ₹${Number(price).toLocaleString('en-IN')}`,
          badge: p.category || 'Product',
          badgeColor: 'blue',
          targetTab: 'products',
          metadata: { productId: p.id, productName: p.name },
        });
      }
    }

    // 4. Format Customers
    const customers: GlobalSearchResult[] = [];
    if (customersRes.status === 'fulfilled' && customersRes.value?.data) {
      for (const c of customersRes.value.data) {
        customers.push({
          id: `customer-${c.id}`,
          category: 'customers',
          categoryLabel: 'Customers',
          title: c.name,
          subtitle: `${c.phone || c.email || 'No contact'} ${c.city ? '• ' + c.city : ''}`,
          badge: c.customerType || 'Customer',
          badgeColor: 'emerald',
          targetTab: 'customers',
          metadata: { customerId: c.id, customerName: c.name },
        });
      }
    }

    // 5. Format Invoices
    const invoices: GlobalSearchResult[] = [];
    if (invoicesRes.status === 'fulfilled' && invoicesRes.value?.data) {
      for (const inv of invoicesRes.value.data) {
        const invNo = inv.invoiceNumber || inv.invoice_number || inv.id;
        const custName = inv.customerName || inv.customer_name || 'Customer';
        const total = inv.grandTotal ?? inv.totalAmount ?? inv.total ?? 0;
        invoices.push({
          id: `invoice-${inv.id}`,
          category: 'invoices',
          categoryLabel: 'Invoices',
          title: `Invoice #${invNo}`,
          subtitle: `${custName} • ₹${Number(total).toLocaleString('en-IN')}`,
          badge: inv.status || 'Invoice',
          badgeColor: 'purple',
          targetTab: 'invoices',
          metadata: { invoiceId: inv.id, invoiceNumber: invNo },
        });
      }
    }

    // 6. Format Quotations
    const quotations: GlobalSearchResult[] = [];
    if (quotationsRes.status === 'fulfilled' && Array.isArray(quotationsRes.value)) {
      for (const quo of quotationsRes.value) {
        const quoNo = quo.quotationNumber || quo.quotation_number || quo.id;
        const custName = quo.customerName || quo.customer_name || 'Customer';
        const total = quo.grandTotal ?? quo.totalAmount ?? quo.total ?? 0;
        quotations.push({
          id: `quotation-${quo.id}`,
          category: 'quotations',
          categoryLabel: 'Quotations',
          title: `Quotation #${quoNo}`,
          subtitle: `${custName} • ₹${Number(total).toLocaleString('en-IN')}`,
          badge: quo.status || 'Quotation',
          badgeColor: 'indigo',
          targetTab: 'quotations',
          metadata: { quotationId: quo.id, quotationNumber: quoNo },
        });
      }
    }

    // 7. Format Suppliers
    const suppliers: GlobalSearchResult[] = [];
    if (suppliersRes.status === 'fulfilled' && Array.isArray(suppliersRes.value)) {
      for (const s of suppliersRes.value) {
        suppliers.push({
          id: `supplier-${s.id}`,
          category: 'suppliers',
          categoryLabel: 'Suppliers',
          title: s.name,
          subtitle: `${s.contactPerson ? s.contactPerson + ' • ' : ''}${s.phone || s.email || 'Supplier'}`,
          badge: 'Supplier',
          badgeColor: 'amber',
          targetTab: 'suppliers',
          metadata: { supplierId: s.id, supplierName: s.name },
        });
      }
    }

    // 8. Format Purchase Orders
    const purchase_orders: GlobalSearchResult[] = [];
    if (purchaseOrdersRes.status === 'fulfilled' && purchaseOrdersRes.value?.data) {
      for (const po of purchaseOrdersRes.value.data) {
        const total = po.totalAmount ?? po.total ?? 0;
        purchase_orders.push({
          id: `po-${po.id}`,
          category: 'purchase_orders',
          categoryLabel: 'Purchase Orders',
          title: `PO #${po.poNumber}`,
          subtitle: `${po.supplierName || 'Supplier'} • ₹${Number(total).toLocaleString('en-IN')}`,
          badge: po.status || 'PO',
          badgeColor: 'cyan',
          targetTab: 'purchase-orders',
          metadata: { poId: po.id, poNumber: po.poNumber },
        });
      }
    }

    // 9. Format Udhari Ledger
    const udhari: GlobalSearchResult[] = [];
    if (udhariRes.status === 'fulfilled' && Array.isArray(udhariRes.value)) {
      for (const u of udhariRes.value) {
        udhari.push({
          id: `udhari-${u.id}`,
          category: 'udhari',
          categoryLabel: 'Udhari Ledger',
          title: `Udhari: ${u.customerNameSnapshot || u.id}`,
          subtitle: `Outstanding: ₹${Number(u.outstandingAmount || 0).toLocaleString('en-IN')} (Due: ${u.dueDate || 'N/A'})`,
          badge: u.status || 'Udhari',
          badgeColor: 'rose',
          targetTab: 'udhari',
          metadata: { udhariId: u.id, customerName: u.customerNameSnapshot },
        });
      }
    }

    // 10. Format Expenses
    const expenses: GlobalSearchResult[] = [];
    if (expensesRes.status === 'fulfilled' && Array.isArray(expensesRes.value)) {
      for (const exp of expensesRes.value) {
        expenses.push({
          id: `expense-${exp.id}`,
          category: 'expenses',
          categoryLabel: 'Expenses',
          title: exp.expenseName || `${exp.category} Expense`,
          subtitle: `${exp.category} • ₹${Number(exp.amount || 0).toLocaleString('en-IN')} ${exp.paidTo ? '• ' + exp.paidTo : ''}`,
          badge: 'Expense',
          badgeColor: 'orange',
          targetTab: 'expenses',
          metadata: { expenseId: exp.id },
        });
      }
    }

    return {
      modules: matchedModules,
      products,
      customers,
      invoices,
      quotations,
      suppliers,
      purchase_orders,
      udhari,
      expenses,
    };
  }
}

export const globalSearchService = new GlobalSearchService();

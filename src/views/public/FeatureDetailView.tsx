import React from 'react';
import {
  Receipt,
  Boxes,
  CreditCard,
  BookOpen,
  Truck,
  Wallet,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  Zap,
  HelpCircle,
} from 'lucide-react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';
import { navigateTo } from '../../lib/publicRouter';

export interface FeatureDetailViewProps {
  slug: string;
}

interface FeatureData {
  title: string;
  metaDesc: string;
  eyebrow: string;
  h1: string;
  directAnswer: string;
  targetAudience: string;
  workflowSteps: { title: string; desc: string }[];
  keyCapabilities: { title: string; desc: string }[];
  faqs: { q: string; a: string }[];
  relatedFeatures: { title: string; path: string; desc: string }[];
  icon: any;
  accentColor: string;
}

const FEATURE_MAP: Record<string, FeatureData> = {
  'billing-invoicing': {
    title: 'GST Billing & Invoicing Software for Small Business in India | VISTAAR',
    metaDesc:
      'Fast, reliable GST billing software with automatic HSN codes, multi-format thermal and A4 printing, quotation conversion, and WhatsApp sharing. Start free.',
    eyebrow: 'GST BILLING & INVOICE MANAGEMENT',
    h1: 'Professional GST Billing & Invoicing Software Built for Indian Trade',
    directAnswer:
      'VISTAAR provides an integrated GST billing and invoicing engine for Indian retailers, wholesalers, and service businesses. It calculates CGST, SGST, and IGST automatically, handles composite and non-GST billing, supports thermal and A4 print templates, and decrements inventory in real time upon bill creation.',
    targetAudience:
      'Retail store owners, wholesale traders, distributors, and service providers who need error-free GST invoices and rapid customer billing.',
    workflowSteps: [
      {
        title: 'Select Customer & Items',
        desc: 'Quickly autocomplete registered customers or cash walk-ins. Search items by barcode, SKU, or name with live stock visibility.',
      },
      {
        title: 'Automated Tax & Discount Calculations',
        desc: 'Tax slabs (0%, 5%, 12%, 18%, 28%) and HSN codes apply automatically. Apply item-level or overall invoice discounts with complete clarity.',
      },
      {
        title: 'Instant Multi-Format Print & Share',
        desc: 'Print on 2", 3", or 4" thermal receipt rolls or standard A4 invoice layouts. Send professional PDF copies directly via WhatsApp or email.',
      },
      {
        title: 'Automated Accounting Sync',
        desc: 'Recorded payments update the cashbook immediately. Any credit balance posts directly to the customer udhari ledger.',
      },
    ],
    keyCapabilities: [
      {
        title: 'HSN/SAC Code Directory',
        desc: 'Built-in directory to search standard goods and services tax codes without remembering complex numbers.',
      },
      {
        title: 'Quotation-to-Invoice Conversion',
        desc: 'Create formal estimates and convert them into final tax invoices with a single click, saving hours of retyping.',
      },
      {
        title: 'Multiple Print Layouts',
        desc: 'Choose from clean thermal receipts or customizable GST tax invoice templates with your logo, bank details, and signature.',
      },
      {
        title: 'Non-GST & Estimate Billing',
        desc: 'Fully supports non-registered businesses and composite dealers requiring simplified bill of supply formats.',
      },
    ],
    faqs: [
      {
        q: 'Can I generate both GST and non-GST invoices in VISTAAR?',
        a: 'Yes. You can toggle between full GST tax invoices (with CGST, SGST, and IGST breakdown) and non-GST bills of supply or estimate receipts.',
      },
      {
        q: 'Does billing automatically reduce stock?',
        a: 'Yes. Every finalized bill decrements product quantities from the active branch stock ledger immediately.',
      },
      {
        q: 'Can I print invoices on thermal printers?',
        a: 'Yes. VISTAAR supports standard 2-inch, 3-inch, and 4-inch ESC/POS thermal printers as well as standard desktop A4 printers.',
      },
    ],
    relatedFeatures: [
      { title: 'Real-Time Inventory', path: '/features/inventory-management', desc: 'Automatic stock deductions and batch tracking.' },
      { title: 'Counter Sales POS', path: '/features/point-of-sale', desc: 'Fast keyboard checkout for retail counters.' },
      { title: 'Customer Udhari Khata', path: '/features/udhari-management', desc: 'Track credit balances from unpaid bills.' },
    ],
    icon: Receipt,
    accentColor: 'from-blue-600 to-indigo-600',
  },
  'inventory-management': {
    title: 'Real-Time Inventory & Stock Management Software India | VISTAAR',
    metaDesc:
      'Manage multi-branch inventory, batch numbers, barcodes, stock movements, and low stock alerts. Eliminate stockouts and discrepancies. Start free.',
    eyebrow: 'REAL-TIME STOCK CONTROL',
    h1: 'Real-Time Stock & Inventory Management Software for Growing Businesses',
    directAnswer:
      'VISTAAR provides real-time inventory control designed for Indian retail and wholesale operations. It tracks stock across multiple branches, manages batch numbers, barcode scanning, stock receipts, and triggers automated low-stock warnings before you run out of fast-moving products.',
    targetAudience:
      'Shopkeepers, supermarket managers, hardware merchants, and wholesale distributors seeking to eliminate dead stock and manual stock discrepancies.',
    workflowSteps: [
      {
        title: 'Catalogue Products & Barcodes',
        desc: 'Add items with purchase rate, selling price, MRP, unit (PCS, BOX, KG), and custom or generated barcodes.',
      },
      {
        title: 'Record Stock Inward & Receipts',
        desc: 'Inward goods against purchase orders or supplier bills. Average cost prices and batch quantities update accurately.',
      },
      {
        title: 'Live Deduction on Sales',
        desc: 'Stock automatically deducts whenever an invoice or counter sale is completed, preventing accidental double-selling.',
      },
      {
        title: 'Low Stock Warnings & Reorder Points',
        desc: 'Receive alerts when items fall below minimum thresholds so you can reorder with suppliers before running out.',
      },
    ],
    keyCapabilities: [
      {
        title: 'Multi-Branch Inventory Isolation',
        desc: 'Keep separate stock tallies for each shop or warehouse while providing the owner a consolidated overview.',
      },
      {
        title: 'Barcode Label Generation & Scanning',
        desc: 'Generate scannable barcode labels for unbranded items and scan standard manufacturer UPC/EAN codes.',
      },
      {
        title: 'Stock Movements & Adjustments',
        desc: 'Audit stock discrepancies, record breakage or samples, and transfer stock cleanly between branches with full audit logs.',
      },
      {
        title: 'Margin & Profitability Tracking',
        desc: 'Compare purchase rates against selling prices to monitor gross margins per product line in real time.',
      },
    ],
    faqs: [
      {
        q: 'Does VISTAAR support barcode scanning?',
        a: 'Yes. You can scan barcodes using standard USB/Bluetooth handheld barcode scanners or via your mobile device camera in the VISTAAR app.',
      },
      {
        q: 'Can I manage stock across multiple shop locations?',
        a: 'Yes. VISTAAR offers multi-branch architecture where each branch has its own isolated stock ledger with centralized owner reporting.',
      },
      {
        q: 'How does stock adjust when a sale is returned or cancelled?',
        a: 'When a credit note or return is processed, stock is automatically restored to the inventory ledger with proper audit notes.',
      },
    ],
    relatedFeatures: [
      { title: 'GST Billing', path: '/features/billing-invoicing', desc: 'Sync inventory with tax invoicing.' },
      { title: 'Purchase Orders', path: '/features/purchase-order-management', desc: 'Inward supplier stock directly from POs.' },
      { title: 'Daybook & Cashbook', path: '/features/daybook-cashbook', desc: 'Track inventory purchases against cash flow.' },
    ],
    icon: Boxes,
    accentColor: 'from-indigo-600 to-violet-600',
  },
  'point-of-sale': {
    title: 'Fast Retail Counter Sales & POS Software for Indian Shops | VISTAAR',
    metaDesc:
      'Lightning-fast counter checkout software. Rapid barcode scanning, keyboard shortcuts, split cash/UPI/credit payments, and instant receipt printing.',
    eyebrow: 'RETAIL POINT OF SALE (POS)',
    h1: 'Lightning-Fast Counter Sales POS Software for Busy Retail Counters',
    directAnswer:
      'VISTAAR Counter Sales POS is engineered for speed during rush hours. Built with keyboard-first shortcuts, rapid barcode lookups, split payment recording (Cash, UPI, and Udhari), and instant thermal receipt printing, it eliminates checkout queues and speeds up customer throughput.',
    targetAudience:
      'High-traffic retail counters: grocery stores, apparel outlets, stationery shops, electronics stores, and FMCG retailers in India.',
    workflowSteps: [
      {
        title: 'Quick Scan or Lookup',
        desc: 'Scan barcode or type item initials to instantly add products to the current counter bill with default pricing.',
      },
      {
        title: 'Attach Customer or Walk-in',
        desc: 'Select frequent customers to track loyalty and credit history, or bill anonymously to walk-in shoppers.',
      },
      {
        title: 'Split Payment Settlement',
        desc: 'Accept split tenders: part cash, part UPI QR code, and part credit/udhari with exact change calculation.',
      },
      {
        title: 'High-Speed Thermal Print',
        desc: 'Bills print immediately on your counter thermal printer while the register resets instantly for the next customer.',
      },
    ],
    keyCapabilities: [
      {
        title: 'Keyboard-Driven Hotkeys',
        desc: 'Complete full billing cycles without touching a mouse using familiar POS keyboard shortcuts.',
      },
      {
        title: 'Dynamic UPI QR Code Generation',
        desc: 'Show on-screen payment QR codes for customers to scan and pay via PhonePe, Google Pay, or Paytm.',
      },
      {
        title: 'Cash Drawer Reconciliation',
        desc: 'Track cash tendered and change owed accurately to prevent cashier discrepancies at the end of the shift.',
      },
      {
        title: 'Offline Resilient Counter Workflows',
        desc: 'Keep billing smoothly even during temporary internet fluctuations with local cache resilience.',
      },
    ],
    faqs: [
      {
        q: 'Can cashiers use keyboard shortcuts for fast billing?',
        a: 'Yes. The Counter Sales interface is designed for 100% keyboard operation during busy counter rushes.',
      },
      {
        q: 'Does it support split payments?',
        a: 'Yes. You can accept payments split across Cash, UPI, Card, and Customer Credit (Udhari) in a single bill.',
      },
    ],
    relatedFeatures: [
      { title: 'Customer Udhari Khata', path: '/features/udhari-management', desc: 'Record partial counter credit directly.' },
      { title: 'Daybook & Cashbook', path: '/features/daybook-cashbook', desc: 'Sync register cash with daily totals.' },
      { title: 'Real-Time Inventory', path: '/features/inventory-management', desc: 'Instant item deduction at checkout.' },
    ],
    icon: CreditCard,
    accentColor: 'from-emerald-600 to-teal-600',
  },
  'udhari-management': {
    title: 'Customer Udhari Khata & Outstanding Payment Tracking Software | VISTAAR',
    metaDesc:
      'Digital udhari khata software for Indian businesses. Track outstanding customer balances, payment aging, partial collections, and send automated reminders.',
    eyebrow: 'CREDIT LEDGER & UDHAARI TRACKING',
    h1: 'Customer Udhari Khata & Outstanding Payment Tracking Software',
    directAnswer:
      'VISTAAR Udhari Management replaces physical bahi-khata notebooks with an automated credit ledger. It tracks exact customer receivables, payment aging, partial repayments, and automated reminder statements, helping Indian businesses recover outstanding debts faster with zero friction.',
    targetAudience:
      'Kirana stores, wholesalers, building material dealers, distributors, and traders who extend daily or weekly credit to trusted customers.',
    workflowSteps: [
      {
        title: 'Credit Posted Upon Sale',
        desc: 'When an invoice or counter sale is finalized with an unpaid balance, the credit ledger logs the debt automatically.',
      },
      {
        title: 'Real-Time Balance Ledger',
        desc: 'View every customer’s running balance, transaction history, and aging breakdown (0-30 days, 30-60 days, 60+ days).',
      },
      {
        title: 'Record Partial or Full Payments',
        desc: 'When a customer pays via Cash or UPI, record the settlement. The balance recalculates instantly with an updated receipt.',
      },
      {
        title: 'Send Friendly Payment Reminders',
        desc: 'Share clear digital ledger summaries and payment reminders directly to the customer’s WhatsApp with UPI payment links.',
      },
    ],
    keyCapabilities: [
      {
        title: 'Customer Credit Limits & Warnings',
        desc: 'Set maximum allowable credit per customer to prevent accidental over-extension of business working capital.',
      },
      {
        title: 'Detailed Account Statements (Ledger PDF)',
        desc: 'Generate printable, audit-ready customer statement PDFs showing date, bill number, debit, credit, and net balance.',
      },
      {
        title: 'Aging Analysis & Collection Tracking',
        desc: 'Quickly spot overdue accounts that require immediate follow-up before bad debts accumulate.',
      },
      {
        title: 'Direct WhatsApp Sharing',
        desc: 'Send professional payment reminders in one tap without awkward verbal confrontation.',
      },
    ],
    faqs: [
      {
        q: 'How does VISTAAR update udhari when a customer makes a partial payment?',
        a: 'Enter the received amount (Cash or UPI); VISTAAR deducts it from the oldest outstanding bills and generates an updated receipt.',
      },
      {
        q: 'Can customers view their credit statement?',
        a: 'Yes. You can generate and share a clean digital ledger PDF or WhatsApp statement showing itemized transactions and total due.',
      },
    ],
    relatedFeatures: [
      { title: 'GST Billing', path: '/features/billing-invoicing', desc: 'Create bills with custom credit terms.' },
      { title: 'Counter Sales POS', path: '/features/point-of-sale', desc: 'Attach credit sales at the cash register.' },
      { title: 'Daybook & Cashbook', path: '/features/daybook-cashbook', desc: 'Cash collections log directly to the cashbook.' },
    ],
    icon: BookOpen,
    accentColor: 'from-amber-500 to-orange-600',
  },
  'purchase-order-management': {
    title: 'Purchase Order & Supplier Management Software India | VISTAAR',
    metaDesc:
      'Manage vendor rate lists, formal purchase orders (POs), goods receipts, and supplier payables cleanly in VISTAAR. Eliminate purchasing errors.',
    eyebrow: 'PROCUREMENT & VENDOR HUB',
    h1: 'Streamlined Purchase Orders & Supplier Catalogue Management',
    directAnswer:
      'VISTAAR Purchase Order & Supplier Management empowers Indian businesses to organize vendor rate catalogues, issue formal purchase orders, track inward stock receipts against orders, and manage supplier payment balances with complete financial transparency.',
    targetAudience:
      'Distributors, wholesalers, supermarkets, and growing retailers who purchase inventory from multiple vendors and manufacturers.',
    workflowSteps: [
      {
        title: 'Maintain Supplier Catalogues',
        desc: 'Store supplier rate lists, contact persons, GST numbers, payment terms, and historical pricing per vendor.',
      },
      {
        title: 'Generate Professional Purchase Orders',
        desc: 'Create formal PO documents with requested item quantities, negotiated rates, and delivery deadlines.',
      },
      {
        title: 'Record Stock Inward & Goods Receipts',
        desc: 'Verify incoming deliveries against the issued PO. Adjust stock levels and update purchase cost records cleanly.',
      },
      {
        title: 'Track Vendor Payables',
        desc: 'Keep accurate logs of payments made to suppliers and remaining outstanding payables.',
      },
    ],
    keyCapabilities: [
      {
        title: 'Supplier Price History Tracking',
        desc: 'Track price fluctuations over time so you always negotiate the best rate with your distributors.',
      },
      {
        title: 'Purchase Order Status Tracking',
        desc: 'Monitor orders from Draft to Sent, Partially Received, and Completed with full status visibility.',
      },
      {
        title: 'Automated Stock Inward Sync',
        desc: 'Inward goods directly into inventory without retyping product details or creating manual stock entries.',
      },
    ],
    faqs: [
      {
        q: 'Can I convert a Purchase Order directly into inward stock?',
        a: 'Yes. When goods arrive, a single click converts the approved PO into an inward stock receipt, updating inventory quantities immediately.',
      },
    ],
    relatedFeatures: [
      { title: 'Real-Time Inventory', path: '/features/inventory-management', desc: 'Automatic stock updates on PO inward.' },
      { title: 'Daybook & Cashbook', path: '/features/daybook-cashbook', desc: 'Vendor payments update daily cashflow.' },
      { title: 'GST Billing', path: '/features/billing-invoicing', desc: 'Ensure accurate cost price vs selling price margins.' },
    ],
    icon: Truck,
    accentColor: 'from-purple-600 to-pink-600',
  },
  'daybook-cashbook': {
    title: 'Daily Daybook, Cashbook & Business Expense Software India | VISTAAR',
    metaDesc:
      'Reconcile daily cash in drawer, UPI payments, petty cash, and business expenses. Close your business day with complete peace of mind. Start free.',
    eyebrow: 'DAILY ACCOUNTING & CASH FLOW',
    h1: 'Daily Daybook, Cashbook & Business Expense Management',
    directAnswer:
      'VISTAAR Daybook and Cashbook gives Indian business owners real-time visibility over daily cash flow. It automatically records cash and UPI inflows from sales, reconciles customer credit collections, categorizes operating expenses, and matches physical drawer cash with digital records.',
    targetAudience:
      'Business owners who want accurate daily cash accounting without needing complex traditional chartered accounting software.',
    workflowSteps: [
      {
        title: 'Automatic Sales Logging',
        desc: 'Every counter sale, invoice settlement, and customer payment logs directly to the daily cashbook.',
      },
      {
        title: 'Record Operating Expenses',
        desc: 'Log rent, electricity, tea, staff advances, transport, and supplier payments in categorized expense buckets.',
      },
      {
        title: 'Daily Cash Drawer Reconciliation',
        desc: 'Compare physical drawer cash against calculated opening balance + inflows - outflows to spot shortages instantly.',
      },
      {
        title: 'Daybook Closing Report',
        desc: 'Generate a clean summary report of total revenue, cash in hand, digital UPI collections, and net daily balance.',
      },
    ],
    keyCapabilities: [
      {
        title: 'Cash vs Digital UPI Tracking',
        desc: 'Keep separate, transparent tallies for cash in drawer and bank/UPI accounts to avoid mixing funds.',
      },
      {
        title: 'Expense Categorization',
        desc: 'Group expenses into custom heads (Utilities, Freight, Wages, Maintenance) to identify cost-saving opportunities.',
      },
      {
        title: 'Owner Audit Trail',
        desc: 'Every transaction is time-stamped and linked to the active branch and cashier for complete accountability.',
      },
    ],
    faqs: [
      {
        q: 'Do I need accounting expertise to use the Daybook?',
        a: 'Not at all. VISTAAR Daybook is designed with intuitive, everyday business language (Cash In, Cash Out, Expenses) rather than complex debit/credit jargon.',
      },
    ],
    relatedFeatures: [
      { title: 'Counter Sales POS', path: '/features/point-of-sale', desc: 'Counter transactions sync directly to Daybook.' },
      { title: 'Customer Udhari Khata', path: '/features/udhari-management', desc: 'Credit collections reflect in Cashbook.' },
      { title: 'GST Billing', path: '/features/billing-invoicing', desc: 'Invoice payments auto-categorized.' },
    ],
    icon: Wallet,
    accentColor: 'from-rose-600 to-red-600',
  },
};

export const FeatureDetailView: React.FC<FeatureDetailViewProps> = ({ slug }) => {
  const data = FEATURE_MAP[slug] || FEATURE_MAP['billing-invoicing'];
  const Icon = data.icon;

  const handleNav = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    navigateTo(path);
  };

  const featureSchema = [
    {
      '@type': 'SoftwareApplication',
      name: `VISTAAR — ${data.h1}`,
      operatingSystem: 'Web, Windows, Android, iOS',
      applicationCategory: 'BusinessApplication',
      description: data.directAnswer,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'INR',
        price: '0',
      },
      url: `https://www.vistaarone.com/features/${slug}`,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://www.vistaarone.com/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Features',
          item: 'https://www.vistaarone.com/#workflows',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: data.h1,
          item: `https://www.vistaarone.com/features/${slug}`,
        },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: data.faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a,
        },
      })),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title={data.title}
        description={data.metaDesc}
        canonicalPath={`/features/${slug}`}
        structuredData={featureSchema}
      />

      <PublicHeader />

      <main className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-6" aria-label="Breadcrumb">
              <a href="/" onClick={(e) => handleNav('/', e)} className="hover:text-blue-600 dark:hover:text-blue-400">
                Home
              </a>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-slate-400">Features</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-blue-600 dark:text-blue-400 font-bold truncate">{data.eyebrow}</span>
            </nav>

            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider">
                <Icon className="w-3.5 h-3.5" />
                <span>{data.eyebrow}</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                {data.h1}
              </h1>

              {/* GEO / AEO Direct Answer Block */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm leading-relaxed text-sm sm:text-base text-slate-700 dark:text-slate-300 font-medium">
                <strong className="text-blue-600 dark:text-blue-400 block text-xs uppercase tracking-wider mb-1 font-bold">
                  Quick Answer
                </strong>
                {data.directAnswer}
              </div>

              {/* Target Audience Note */}
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2">
                <strong className="text-slate-700 dark:text-slate-300">Designed for:</strong>
                <span>{data.targetAudience}</span>
              </div>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="/login?mode=signup"
                  onClick={(e) => handleNav('/login?mode=signup', e)}
                  className="inline-flex items-center gap-2 px-6 py-3 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all hover:scale-105 cursor-pointer"
                >
                  <span>Start Free with this Feature</span>
                  <ArrowRight className="w-4 h-4" />
                </a>

                <a
                  href="/pricing"
                  onClick={(e) => handleNav('/pricing', e)}
                  className="inline-flex items-center gap-2 px-5 py-3 text-xs font-bold rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 transition-all cursor-pointer"
                >
                  <span>View Plans</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* WORKFLOW STEPS */}
        <section className="py-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                How It Works
              </h2>
              <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                Practical, Step-by-Step Daily Workflow
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.workflowSteps.map((step, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs">
                    {idx + 1}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{step.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* KEY CAPABILITIES */}
        <section className="py-16 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                Verified Product Capabilities
              </h2>
              <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                Built for High Reliability &amp; Control
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.keyCapabilities.map((cap, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start gap-3.5 shadow-sm"
                >
                  <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">{cap.title}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{cap.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RELATED FEATURES & TOPICAL CLUSTERING */}
        <section className="py-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                Connected Operations
              </h2>
              <p className="text-xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                How this module integrates with other VISTAAR features
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.relatedFeatures.map((rel) => (
                <a
                  key={rel.path}
                  href={rel.path}
                  onClick={(e) => handleNav(rel.path, e)}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 transition-all group block"
                >
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center justify-between">
                    <span>{rel.title}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform" />
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{rel.desc}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* FAQS */}
        <section className="py-16 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                Frequently Asked Questions
              </h2>
              <p className="text-xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                Got questions about {data.eyebrow.toLowerCase()}?
              </p>
            </div>

            <div className="space-y-3">
              {data.faqs.map((f, idx) => (
                <div
                  key={idx}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                >
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">{f.q}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CONVERSION BANNER */}
        <section className="py-16 bg-blue-600 text-white text-center">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
            <h2 className="text-2xl sm:text-3xl font-black">
              Start Streamlining Your Business Today
            </h2>
            <p className="text-xs sm:text-sm text-blue-100 max-w-xl mx-auto">
              Test VISTAAR on our free plan or explore all features risk-free.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <a
                href="/login?mode=signup"
                onClick={(e) => handleNav('/login?mode=signup', e)}
                className="px-6 py-2.5 text-xs font-bold rounded-xl bg-white text-blue-600 hover:bg-blue-50 shadow transition-all cursor-pointer"
              >
                Start Free Account
              </a>
              <a
                href="/pricing"
                onClick={(e) => handleNav('/pricing', e)}
                className="px-6 py-2.5 text-xs font-bold rounded-xl border border-white/30 hover:bg-white/10 text-white transition-all cursor-pointer"
              >
                View All Plans
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

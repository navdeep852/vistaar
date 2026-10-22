import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Receipt,
  Boxes,
  CreditCard,
  BookOpen,
  Truck,
  Wallet,
  Building2,
  Zap,
  Lock,
  ChevronRight,
  TrendingUp,
  RefreshCw,
  BarChart3,
  HelpCircle,
} from 'lucide-react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';
import { navigateTo } from '../../lib/publicRouter';

export const PublicHomeView: React.FC = () => {
  const handleNav = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    navigateTo(path);
  };

  const homeStructuredData = [
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://www.vistaarone.com/#software',
      name: 'VISTAAR',
      operatingSystem: 'Web, Windows, Android, iOS',
      applicationCategory: 'BusinessApplication',
      description:
        'VISTAAR is the Business OS for Growing Businesses in India, providing unified GST billing, inventory management, counter POS, customer udhari khata, and cashbook.',
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'INR',
        lowPrice: '0',
        highPrice: '9999',
        offerCount: '5',
      },
      url: 'https://www.vistaarone.com/',
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is VISTAAR and how does it help Indian businesses?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'VISTAAR is a unified Business Operating System designed for Indian small and growing businesses. It connects GST billing, inventory, POS counter sales, customer udhari tracking, supplier purchases, and daily cashflow in one reliable system.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does VISTAAR connect billing with inventory and udhari?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'When a sale is recorded in VISTAAR, inventory quantities are automatically decremented from stock, any unpaid balance is posted directly to the customer udhari ledger, and received payments update the cashbook and daybook instantly.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does VISTAAR support GST and non-GST businesses?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. VISTAAR supports full GST billing with HSN/SAC codes, CGST, SGST, IGST calculations, as well as non-GST simplified bills for composite dealers and non-registered small businesses.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is there a free plan available to get started?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. VISTAAR offers a ₹0 Free plan for single-user micro-businesses to start immediately without any credit card required.',
          },
        },
      ],
    },
  ];

  const modules = [
    {
      title: 'GST Billing & Quotations',
      desc: 'Generate professional GST tax invoices and quotations with instant HSN search, multi-format printing (thermal and A4), and WhatsApp/PDF sharing.',
      icon: Receipt,
      path: '/features/billing-invoicing',
      color: 'from-blue-600 to-indigo-600',
      badge: 'GST Ready',
    },
    {
      title: 'Real-Time Inventory & Stock',
      desc: 'Track batch numbers, barcode labels, multi-branch stock levels, and automated low-stock reorder warnings with instant quantity updates.',
      icon: Boxes,
      path: '/features/inventory-management',
      color: 'from-indigo-600 to-violet-600',
      badge: 'Auto Stock Sync',
    },
    {
      title: 'Rapid Counter Sales (POS)',
      desc: 'Purpose-built for busy retail checkouts with barcode scanning, lightning-fast keyboard shortcuts, split payments (Cash, UPI, Credit), and quick receipts.',
      icon: CreditCard,
      path: '/features/point-of-sale',
      color: 'from-emerald-600 to-teal-600',
      badge: 'High Speed POS',
    },
    {
      title: 'Customer Udhari & Credit Ledger',
      desc: 'Never lose track of outstanding balances. Maintain accurate customer credit ledgers, balance aging reports, and automated collection reminders.',
      icon: BookOpen,
      path: '/features/udhari-management',
      color: 'from-amber-500 to-orange-600',
      badge: 'Zero Bad Debt',
    },
    {
      title: 'Purchase Orders & Suppliers',
      desc: 'Manage supplier catalogues, issue formal purchase orders (POs), record stock receipts, and track vendor payment history cleanly.',
      icon: Truck,
      path: '/features/purchase-order-management',
      color: 'from-purple-600 to-pink-600',
      badge: 'Vendor Hub',
    },
    {
      title: 'Daybook, Cashbook & Expenses',
      desc: 'Reconcile cash in drawer, bank deposits, and daily operating expenses. Close each business day with accurate accounting and zero discrepancies.',
      icon: Wallet,
      path: '/features/daybook-cashbook',
      color: 'from-rose-600 to-red-600',
      badge: 'Daily Cash Peace',
    },
  ];

  const pricingTiers = [
    {
      name: 'Free',
      price: '₹0',
      period: 'Forever free',
      desc: 'Perfect for micro-shops, independent merchants & initial evaluation.',
      features: ['Single user access', 'Core GST & non-GST billing', 'Basic inventory records', 'Customer udhari tracking', 'Community support'],
      cta: 'Start Free Now',
      highlighted: false,
    },
    {
      name: 'App Plan',
      price: '₹1,999',
      period: 'per year',
      desc: 'Mobile-first operations for owners on the move.',
      features: ['Full mobile app access', 'Unlimited invoices & bills', 'Barcode scanning via camera', 'Customer payment reminders', 'Standard email support'],
      cta: 'Choose App Plan',
      highlighted: false,
    },
    {
      name: 'Desktop Plan',
      price: '₹2,999',
      period: 'per year',
      desc: 'Dedicated high-speed checkout and billing terminal.',
      features: ['High-speed desktop terminal', 'Thermal printer support (2"/3"/4")', 'Keyboard shortcuts POS', 'Offline cache resilience', 'Priority email support'],
      cta: 'Choose Desktop Plan',
      highlighted: false,
    },
    {
      name: 'Business Plan',
      price: '₹5,999',
      period: 'per year',
      desc: 'Multi-user & multi-branch operations for growing trade.',
      features: ['Multi-branch management', 'Role-based access (RBAC)', 'Real-time branch inventory sync', 'Comprehensive financial analytics', 'Dedicated priority assistance'],
      cta: 'Start Business Trial',
      highlighted: true,
      badge: 'Most Popular',
    },
    {
      name: 'Pro Plan',
      price: '₹9,999',
      period: 'per year',
      desc: 'Complete enterprise control, custom templates & top-tier performance.',
      features: ['Unlimited branches & users', 'Custom invoice template designer', 'Advanced audit logs & security', 'Automated data backups to cloud', 'Personal account manager'],
      cta: 'Contact for Pro',
      highlighted: false,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title="VISTAAR — Run Better. Grow Wider. | The Business OS for Growing Businesses"
        description="Run your business smarter with VISTAAR. Manage billing, inventory, purchases, suppliers, expenses, and customer payments in one connected Business OS for Indian businesses."
        canonicalPath="/"
        structuredData={homeStructuredData}
      />

      <PublicHeader />

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28 border-b border-slate-200 dark:border-slate-800">
          {/* Subtle Ambient Background Gradients */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-transparent blur-3xl pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="text-center max-w-4xl mx-auto space-y-6">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-widest animate-fade-in shadow-sm">
                <SparklesIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>BUSINESS MANAGEMENT SOFTWARE FOR GROWING BUSINESSES</span>
              </div>

              {/* H1 */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.12]">
                Run Your Business Smarter with <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">VISTAAR</span>
              </h1>

              {/* Supporting Copy */}
              <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto font-medium leading-relaxed">
                Manage billing, inventory, purchases, suppliers, expenses, and customer payments in one connected business management platform.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-4">
                <a
                  href="/login?mode=signup"
                  onClick={(e) => handleNav('/login?mode=signup', e)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-bold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-xl shadow-blue-500/25 transition-all hover:scale-105 cursor-pointer"
                >
                  <span>Start Free</span>
                  <ArrowRight className="w-4 h-4" />
                </a>

                <a
                  href="#workflows"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:scale-105 cursor-pointer"
                >
                  <span>Explore Features</span>
                </a>

                <a
                  href="/pricing"
                  onClick={(e) => handleNav('/pricing', e)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  <span>View Pricing &rarr;</span>
                </a>
              </div>

              {/* Trust Indicators */}
              <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>GST &amp; Non-GST Ready</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Zero Setup Fee</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Desktop &amp; Mobile Workflows</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>PostgreSQL Tenant Isolated</span>
                </div>
              </div>
            </div>

            {/* Visual Hero Dashboard Card Preview */}
            <div className="mt-12 max-w-5xl mx-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-6 overflow-hidden">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="ml-2 font-bold text-slate-600 dark:text-slate-300">
                    VISTAAR Business Operations Hub
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  Live System Connected
                </span>
              </div>

              {/* Operational Snapshot Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[11px] font-medium text-slate-500">Today's Total Sales</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">₹48,250</div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    <span>Real-time POS sync</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[11px] font-medium text-slate-500">Active Stock Items</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">1,420 Items</div>
                  <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-1">
                    Multi-branch tracked
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[11px] font-medium text-slate-500">Customer Udhari</div>
                  <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">₹32,180</div>
                  <div className="text-[10px] text-slate-500 font-semibold mt-1">
                    Due balance ledger
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                  <div className="text-[11px] font-medium text-slate-500">Cash in Hand</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">₹16,400</div>
                  <div className="text-[10px] text-emerald-600 font-semibold mt-1">
                    Daybook balanced
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: WHO WE SERVE */}
        <section className="py-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                Targeted Business Solutions
              </h2>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                Built Specifically for Indian Trade &amp; Commerce
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                Whether you run a high-traffic retail shop in Indore, a wholesale depot in Surat, or a multi-branch distributorship in Patna, VISTAAR adapts to your daily counter reality.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <CreditCard className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Retail Shops &amp; Counter Sales
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Fast barcode checkout, thermal receipt printing, quick customer search, split UPI/Cash payments, and instant stock deduction.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <Boxes className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Wholesalers &amp; Distributors
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Manage bulk purchase orders, supplier rate catalogues, goods receipts, customer credit limits, and delivery challans effortlessly.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Multi-Branch Enterprises
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Centralize visibility across branches. Control employee roles, transfer stock between warehouses, and view consolidated profit &amp; loss.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: HOW WORKFLOWS CONNECT */}
        <section id="workflows" className="py-20 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-14">
              <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                Integrated Architecture
              </h2>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                How VISTAAR Connects Daily Workflows
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                Disconnected software creates stock discrepancies and missing cash. Here is how a single transaction synchronizes your entire business in VISTAAR:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs mb-3">
                  1
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Sale Recorded at Counter
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Cashier bills an item via Counter Sale POS or GST invoice with customer details.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-black text-xs mb-3">
                  2
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Inventory Decremented
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Stock records decrement automatically in real time across the specific branch.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative">
                <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-black text-xs mb-3">
                  3
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Udhari Ledger Updated
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  If unpaid or partial, the balance is instantly added to the customer's credit ledger.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-xs mb-3">
                  4
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Daybook &amp; KPIs Sync
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Cash in hand, UPI logs, and dashboard metrics update for owner oversight.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: CORE MODULES GRID */}
        <section className="py-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-14">
              <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                Comprehensive Modules
              </h2>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                Everything You Need to Run Your Business
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                Stop juggling five different apps. VISTAAR equips you with battle-tested modules designed for everyday Indian business operations.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {modules.map((mod) => {
                const Icon = mod.icon;
                return (
                  <div
                    key={mod.path}
                    className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-3 rounded-xl bg-gradient-to-tr ${mod.color} text-white shadow-md`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider bg-white dark:bg-slate-900 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800">
                          {mod.badge}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {mod.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                        {mod.desc}
                      </p>
                    </div>

                    <div className="pt-6">
                      <a
                        href={mod.path}
                        onClick={(e) => handleNav(mod.path, e)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 group-hover:translate-x-1 transition-all cursor-pointer"
                      >
                        <span>Learn more</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 5: PRICING SNAPSHOT */}
        <section className="py-20 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-14">
              <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                Clear &amp; Transparent Plans
              </h2>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                Fair Pricing. No Hidden Charges.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                Start with our ₹0 Free tier and upgrade as your volume grows. Simple annual plans in Indian Rupees.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {pricingTiers.map((tier) => (
                <div
                  key={tier.name}
                  className={`rounded-2xl p-5 flex flex-col justify-between transition-all ${
                    tier.highlighted
                      ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/25 ring-2 ring-blue-600 relative'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {tier.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow">
                      {tier.badge}
                    </div>
                  )}

                  <div>
                    <h3 className={`text-sm font-bold ${tier.highlighted ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                      {tier.name}
                    </h3>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-2xl font-black tracking-tight">{tier.price}</span>
                      <span className={`text-[11px] ${tier.highlighted ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        /{tier.period}
                      </span>
                    </div>
                    <p className={`text-[11px] mt-2 leading-relaxed ${tier.highlighted ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {tier.desc}
                    </p>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 space-y-2">
                      {tier.features.map((feat, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 text-[11px]">
                          <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${tier.highlighted ? 'text-blue-200' : 'text-emerald-500'}`} />
                          <span className={tier.highlighted ? 'text-white' : 'text-slate-700 dark:text-slate-300'}>
                            {feat}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6">
                    <a
                      href="/pricing"
                      onClick={(e) => handleNav('/pricing', e)}
                      className={`w-full block text-center py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        tier.highlighted
                          ? 'bg-white text-blue-600 hover:bg-blue-50 shadow'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {tier.cta}
                    </a>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center">
              <a
                href="/pricing"
                onClick={(e) => handleNav('/pricing', e)}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                View full feature comparison matrix &rarr;
              </a>
            </div>
          </div>
        </section>

        {/* SECTION 6: SECURITY & TRUST */}
        <section className="py-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-12">
              <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                Enterprise Reliability
              </h2>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                Your Data Belongs to You. Completely.
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                We believe your business financials, margins, and customer data must never be shared, sold, or exposed.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">PostgreSQL RLS Tenant Isolation</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Strict cryptographic database separation ensures no user can ever access another company's records.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Auto Screen Lock Security</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Built-in inactivity lock protects billing terminals when cashiers or owners step away from the counter.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 mx-auto flex items-center justify-center">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">SHA-256 Checksum Backups</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Export complete data backups anytime. Cryptographic checksums ensure zero data tampering or loss.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 7: FAQ SECTION */}
        <section className="py-20 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                Common Questions
              </h2>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                Frequently Asked Questions
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  What makes VISTAAR different from typical billing software?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Most Indian software only prints bills or only records stock. VISTAAR is an integrated Business OS. When you make a sale, your stock updates automatically, your customer's udhari balance is calculated, and your daily cashbook reconciles instantly.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Can I use VISTAAR if my business does not have a GSTIN?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Yes, absolutely. VISTAAR accommodates both GST registered businesses (with CGST, SGST, IGST tax breakdown) and non-GST businesses requiring clean estimate bills, cash memos, or counter receipts.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Can I use my existing barcode scanner and thermal printer?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  Yes. VISTAAR supports standard USB and Bluetooth barcode scanners as well as 2-inch, 3-inch, and 4-inch ESC/POS thermal receipt printers alongside standard A4 desktop laser/inkjet printers.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  How does the ₹0 Free tier work?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                  You can register a free account without providing any credit card or payment information. It gives you immediate access to basic invoicing, stock records, and udhari tracking so you can evaluate VISTAAR risk-free.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 8: FINAL CONVERSION CTA */}
        <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-700 text-white text-center">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              Ready to Run Better and Grow Wider?
            </h2>
            <p className="text-sm sm:text-base text-blue-100 max-w-xl mx-auto font-medium">
              Join thousands of forward-thinking Indian businesses streamlining daily operations with VISTAAR.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/login?mode=signup"
                onClick={(e) => handleNav('/login?mode=signup', e)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-bold rounded-xl bg-white text-blue-600 hover:bg-blue-50 shadow-lg shadow-black/10 transition-all hover:scale-105 cursor-pointer"
              >
                <span>Create Free Account</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="/pricing"
                onClick={(e) => handleNav('/pricing', e)}
                className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 text-sm font-bold text-white border border-white/30 rounded-xl hover:bg-white/10 transition-all cursor-pointer"
              >
                Compare Plans
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

const SparklesIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/>
    <path d="M19 17v4"/>
    <path d="M3 5h4"/>
    <path d="M17 19h4"/>
  </svg>
);

import React from 'react';
import { Check, X, ArrowRight, CheckCircle2, ChevronRight, Zap } from 'lucide-react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';
import { navigateTo } from '../../lib/publicRouter';

export const PublicComparisonView: React.FC = () => {
  const handleNav = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    navigateTo(path);
  };

  const comparisonSchema = [
    {
      '@type': 'Article',
      headline: 'Billing Software vs. Inventory Management Software: What Does Your Business Actually Need?',
      description:
        'A comprehensive guide for Indian retail and wholesale businesses comparing standalone billing apps, standalone inventory spreadsheets, and integrated Business OS platforms.',
      author: {
        '@type': 'Organization',
        name: 'VISTAAR Product Engineering',
        url: 'https://www.vistaarone.com/',
      },
      publisher: {
        '@type': 'Organization',
        name: 'VISTAAR',
        logo: {
          '@type': 'ImageObject',
          url: 'https://www.vistaarone.com/Vistaar_Icon_logo.png',
        },
      },
      mainEntityOfPage: 'https://www.vistaarone.com/compare/billing-vs-inventory-software',
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
          name: 'Compare',
          item: 'https://www.vistaarone.com/compare/billing-vs-inventory-software',
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title="Billing Software vs Inventory Software: What Indian Businesses Need | VISTAAR"
        description="Understand the difference between standalone billing tools and inventory software. Learn why integrated Business OS platforms eliminate double-entry errors."
        canonicalPath="/compare/billing-vs-inventory-software"
        structuredData={comparisonSchema}
      />

      <PublicHeader />

      <main className="flex-1 py-16 md:py-24">
        <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs font-semibold text-slate-500" aria-label="Breadcrumb">
            <a href="/" onClick={(e) => handleNav('/', e)} className="hover:text-blue-600">
              Home
            </a>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-400">Guides &amp; Comparisons</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-blue-600 font-bold truncate">Billing vs Inventory</span>
          </nav>

          {/* Heading Section */}
          <header className="space-y-4">
            <div className="inline-block px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider">
              IN-DEPTH BUSINESS COMPARISON GUIDE
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              Billing Software vs. Inventory Software: What Does Your Business Actually Need?
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Published by VISTAAR Product Strategy &bull; Last updated October 2026 &bull; 6 min read
            </p>
          </header>

          {/* Direct Answer Summary Box for AEO / GEO */}
          <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm leading-relaxed text-sm text-slate-700 dark:text-slate-300 space-y-2">
            <h2 className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Summary for Busy Business Owners
            </h2>
            <p>
              <strong>Standalone billing software</strong> only prints invoices, receipts, and calculates GST taxes. It does not know if you actually have items in stock.
            </p>
            <p>
              <strong>Standalone inventory software</strong> records warehouse quantities, batch numbers, and stock receipts, but cannot rapidly checkout customers or maintain daily cash registers.
            </p>
            <p>
              When used separately, staff must re-enter every sale into the inventory software manually, leading to double-entry fatigue, stockout surprises, and unrecorded customer udhaari. An <strong>integrated Business OS like VISTAAR</strong> bridges both into a single real-time workflow.
            </p>
          </section>

          {/* Section: The Problem with Disconnected Tools */}
          <section className="space-y-4 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              The Real Cost of Disconnected Tools in Indian Retail &amp; Wholesale
            </h2>
            <p>
              In many Indian shops and warehouses, owners maintain one billing app on the desktop counter and separate Excel sheets or paper registers for stock. This creates four major operational bottlenecks:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-white">1. Accidental Double-Selling</h3>
                <p className="text-xs text-slate-500">
                  Billing an item that physical stock does not actually have, leading to disappointed customers and emergency supplier orders.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-white">2. Unrecorded Customer Credit (Udhaari)</h3>
                <p className="text-xs text-slate-500">
                  When a bill is generated without immediate payment, informal paper chits get lost, causing unrecoverable bad debts.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-white">3. Double-Entry Waste</h3>
                <p className="text-xs text-slate-500">
                  Cashiers or accountants spend hours each evening typing invoice data into inventory spreadsheets.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                <h3 className="font-bold text-slate-900 dark:text-white">4. Cash Drawer Discrepancies</h3>
                <p className="text-xs text-slate-500">
                  Without an integrated Daybook, cash in drawer never matches the theoretical sales sum due to unrecorded tea or freight expenses.
                </p>
              </div>
            </div>
          </section>

          {/* Comparison Matrix Table */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Feature-by-Feature Comparison
            </h2>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                      <th className="py-3 px-4">Capability</th>
                      <th className="py-3 px-3 text-center">Standalone Billing</th>
                      <th className="py-3 px-3 text-center">Standalone Inventory</th>
                      <th className="py-3 px-3 text-center bg-blue-50/50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-black">VISTAAR Business OS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">GST Invoice &amp; Thermal Printing</td>
                      <td className="py-3 px-3 text-center"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                      <td className="py-3 px-3 text-center"><X className="w-4 h-4 text-slate-300 mx-auto" /></td>
                      <td className="py-3 px-3 text-center bg-blue-50/20 font-bold text-blue-600"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">Real-Time Stock Decrement on Sale</td>
                      <td className="py-3 px-3 text-center"><X className="w-4 h-4 text-slate-300 mx-auto" /></td>
                      <td className="py-3 px-3 text-center"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                      <td className="py-3 px-3 text-center bg-blue-50/20 font-bold text-blue-600"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">Customer Udhari &amp; Credit Ledger</td>
                      <td className="py-3 px-3 text-center"><X className="w-4 h-4 text-slate-300 mx-auto" /></td>
                      <td className="py-3 px-3 text-center"><X className="w-4 h-4 text-slate-300 mx-auto" /></td>
                      <td className="py-3 px-3 text-center bg-blue-50/20 font-bold text-blue-600"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">Purchase Orders &amp; Supplier Inward</td>
                      <td className="py-3 px-3 text-center"><X className="w-4 h-4 text-slate-300 mx-auto" /></td>
                      <td className="py-3 px-3 text-center"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                      <td className="py-3 px-3 text-center bg-blue-50/20 font-bold text-blue-600"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">Daybook &amp; Drawer Cash Reconciliation</td>
                      <td className="py-3 px-3 text-center"><X className="w-4 h-4 text-slate-300 mx-auto" /></td>
                      <td className="py-3 px-3 text-center"><X className="w-4 h-4 text-slate-300 mx-auto" /></td>
                      <td className="py-3 px-3 text-center bg-blue-50/20 font-bold text-blue-600"><Check className="w-4 h-4 text-emerald-500 mx-auto" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Decision Guide */}
          <section className="p-6 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-900/60 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Which One Should You Choose?
            </h2>
            <ul className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>If your business only writes 2-3 consulting bills per month with zero physical inventory, simple billing software is enough.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>If you run a retail shop, supermarket, hardware depot, apparel store, or wholesale business, an integrated platform like VISTAAR prevents double-entry, stops inventory shrinkage, and protects your cash flow.</span>
              </li>
            </ul>

            <div className="pt-2 flex flex-wrap gap-3">
              <a
                href="/login?mode=signup"
                onClick={(e) => handleNav('/login?mode=signup', e)}
                className="px-6 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow transition-all cursor-pointer"
              >
                Start Free with VISTAAR
              </a>
              <a
                href="/pricing"
                onClick={(e) => handleNav('/pricing', e)}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 transition-all cursor-pointer"
              >
                Compare VISTAAR Plans
              </a>
            </div>
          </section>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
};

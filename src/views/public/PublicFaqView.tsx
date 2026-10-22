import React, { useState } from 'react';
import { 
  HelpCircle, 
  ChevronDown, 
  Sparkles, 
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Monitor,
  Globe,
  Receipt,
  Boxes
} from 'lucide-react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';
import { navigateTo } from '../../lib/publicRouter';

export const PublicFaqView: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const handleNav = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    navigateTo(path);
  };

  const faqCategories = [
    {
      category: 'Plans, Pricing & Device Access',
      items: [
        {
          q: 'Which devices can I use with VISTAAR?',
          a: 'VISTAAR supports three platforms depending on your plan: (1) Web Browser on PC/Mac/Chromebook, (2) Native Windows Desktop software (.exe) with high-speed POS hotkeys and thermal printing, and (3) Native Android APK for phone-based barcode scanning and mobile checkout. The 14-day Free Trial and Growth plan include all three platforms.',
        },
        {
          q: 'How does the 14-Day Free Trial work?',
          a: 'When you create a workspace, you receive immediate full access across Web, Windows Desktop, and Android for 14 days. No credit card or upfront payment is required. All invoices, customer accounts, and stock counts created during your trial remain preserved when you upgrade to a paid plan.',
        },
        {
          q: 'What is the Starter Mobile Add-on?',
          a: 'The Mobile Add-on is an optional monthly (₹199) or annual (₹1,999) entitlement that layers onto the Starter plan, allowing floor staff to install the official Android APK for camera barcode scanning and mobile billing while preserving Starter’s affordable base rate.',
        },
        {
          q: 'Are taxes included in the subscription pricing?',
          a: 'Subscription rates are in Indian Rupees (INR) excluding statutory GST. A formal GST Tax Invoice is generated for every payment, allowing registered businesses to claim full Input Tax Credit (ITC).',
        },
      ],
    },
    {
      category: 'Invoicing, Billing & POS',
      items: [
        {
          q: 'Does VISTAAR support GST and Non-GST billing?',
          a: 'Yes. VISTAAR fully supports both GST-compliant B2B/B2C tax invoices (with automatic CGST, SGST, IGST bifurcation, HSN/SAC codes, and reverse charge options) as well as Non-GST retail estimates and cash memos.',
        },
        {
          q: 'Can I print to standard thermal receipt printers?',
          a: 'Yes. VISTAAR supports 2-inch (58mm) and 3-inch (80mm) ESC/POS thermal printers via USB, Bluetooth, and network LAN, as well as full A4/A5 laser and inkjet printers.',
        },
        {
          q: 'How does high-speed Counter POS work?',
          a: 'Our counter sales interface is keyboard-driven with hotkeys (F1 for instant cash bill, F2 for card, F4 for product lookup), allowing cashiers to finalize and print a customer receipt in under 3 seconds.',
        },
      ],
    },
    {
      category: 'Inventory, Stock & Multi-Branch',
      items: [
        {
          q: 'How does stock update during billing and receipts?',
          a: 'Stock levels update authoritatively in real time. Finalizing a sale reduces inventory immediately. Cancelling or returning an invoice restocks the items, and receiving a Purchase Order adds verified batches automatically.',
        },
        {
          q: 'Can I manage multiple godowns or branch outlets?',
          a: 'Yes. On Business and Growth plans, you can configure multiple branches, initiate stock transfer requests with digital dispatch notes, and view consolidated multi-branch inventory.',
        },
      ],
    },
    {
      category: 'Security, Privacy & Backups',
      items: [
        {
          q: 'How is my business financial data kept private?',
          a: 'We enforce PostgreSQL Row-Level Security (RLS) on every table. All database queries are cryptographically restricted to your authenticated workspace ID. No tenant can ever access another business’s records.',
        },
        {
          q: 'Can I export my data and keep offline backups?',
          a: 'Yes. You can generate and download complete encrypted backup archives stamped with SHA-256 verification checksums at any time from your Business Settings.',
        },
      ],
    },
  ];

  const faqSchema = [
    {
      '@type': 'FAQPage',
      mainEntity: faqCategories.flatMap(c => c.items.map(i => ({
        '@type': 'Question',
        name: i.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: i.a,
        },
      }))),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.vistaarone.com/' },
        { '@type': 'ListItem', position: 2, name: 'Frequently Asked Questions', item: 'https://www.vistaarone.com/faq' },
      ],
    },
  ];

  let itemCounter = 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title="Frequently Asked Questions (FAQ) | VISTAAR Business OS"
        description="Find answers to common questions about VISTAAR Business OS: subscriptions, 14-day free trial, device permissions, GST billing, and data security."
        canonicalPath="/faq"
        structuredData={faqSchema}
      />

      <PublicHeader />

      <main className="flex-1 py-14 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto space-y-4 mb-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Got Questions?</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
              Frequently Asked Questions
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
              Clear, transparent answers about our business software, device access, billing, and security.
            </p>
          </div>

          {/* FAQ Categories & Accordions */}
          <div className="space-y-12 mb-16">
            {faqCategories.map((cat, cIdx) => (
              <div key={cIdx} className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
                  {cat.category}
                </h2>
                <div className="space-y-3">
                  {cat.items.map((item) => {
                    const currIndex = itemCounter++;
                    const isOpen = openIndex === currIndex;
                    return (
                      <div
                        key={currIndex}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
                      >
                        <button
                          onClick={() => setOpenIndex(isOpen ? null : currIndex)}
                          className="w-full py-4 px-5 text-left flex items-center justify-between text-xs sm:text-sm font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                        >
                          <span>{item.q}</span>
                          <ChevronDown className={`w-4 h-4 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isOpen && (
                          <div className="px-5 pb-5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800/60 pt-3">
                            {item.a}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* CTA Box */}
          <div className="rounded-3xl bg-slate-900 text-white p-8 sm:p-12 text-center border border-slate-800">
            <h2 className="text-2xl font-black mb-2">Have a question not listed here?</h2>
            <p className="text-xs sm:text-sm text-slate-400 mb-6 max-w-md mx-auto">
              Our support team is based in India and ready to help you configure VISTAAR for your specific trade.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/contact"
                onClick={(e) => handleNav('/contact', e)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                Contact Support
              </a>
              <a
                href="/pricing"
                onClick={(e) => handleNav('/pricing', e)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition-all cursor-pointer"
              >
                View Plans &amp; Pricing
              </a>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

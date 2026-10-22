import React from 'react';
import { Check, X, ShieldCheck, HelpCircle, ArrowRight, Sparkles } from 'lucide-react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';
import { navigateTo } from '../../lib/publicRouter';

export const PublicPricingView: React.FC = () => {
  const handleNav = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    navigateTo(path);
  };

  const pricingSchema = [
    {
      '@type': 'Product',
      name: 'VISTAAR Business OS Plans',
      description: 'Annual pricing tiers for VISTAAR business management software in India: Free, App, Desktop, Business, and Pro.',
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'INR',
        lowPrice: '0',
        highPrice: '9999',
        offerCount: '5',
        offers: [
          {
            '@type': 'Offer',
            name: 'Free Plan',
            price: '0',
            priceCurrency: 'INR',
            availability: 'https://schema.org/InStock',
            url: 'https://www.vistaarone.com/pricing',
          },
          {
            '@type': 'Offer',
            name: 'App Plan',
            price: '1999',
            priceCurrency: 'INR',
            availability: 'https://schema.org/InStock',
            url: 'https://www.vistaarone.com/pricing',
          },
          {
            '@type': 'Offer',
            name: 'Desktop Plan',
            price: '2999',
            priceCurrency: 'INR',
            availability: 'https://schema.org/InStock',
            url: 'https://www.vistaarone.com/pricing',
          },
          {
            '@type': 'Offer',
            name: 'Business Plan',
            price: '5999',
            priceCurrency: 'INR',
            availability: 'https://schema.org/InStock',
            url: 'https://www.vistaarone.com/pricing',
          },
          {
            '@type': 'Offer',
            name: 'Pro Plan',
            price: '9999',
            priceCurrency: 'INR',
            availability: 'https://schema.org/InStock',
            url: 'https://www.vistaarone.com/pricing',
          },
        ],
      },
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
          name: 'Pricing & Plans',
          item: 'https://www.vistaarone.com/pricing',
        },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Can I start using VISTAAR for free?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. The VISTAAR Free plan is ₹0 forever for single-user micro businesses, allowing you to create bills and manage basic stock without any payment details.',
          },
        },
        {
          '@type': 'Question',
          name: 'Are taxes included in the annual pricing?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Statutory taxes (such as GST) apply as per prevailing Indian regulations. A tax invoice with full input tax credit (ITC) is provided for all paid business subscriptions.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I switch between plans as my business grows?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, you can upgrade your plan at any time. Your existing company data, invoices, products, and customer records remain completely intact during upgrades.',
          },
        },
      ],
    },
  ];

  const plans = [
    {
      name: 'Free',
      price: '₹0',
      period: 'Forever Free',
      tagline: 'Ideal for micro-shops, independent merchants & evaluation.',
      cta: 'Get Started Free',
      planKey: 'free',
      popular: false,
    },
    {
      name: 'App',
      price: '₹1,999',
      period: 'per year',
      tagline: 'Mobile-first workflows on phone and tablet.',
      cta: 'Choose App Plan',
      planKey: 'app',
      popular: false,
    },
    {
      name: 'Desktop',
      price: '₹2,999',
      period: 'per year',
      tagline: 'Single high-speed desktop terminal with thermal printing.',
      cta: 'Choose Desktop',
      planKey: 'desktop',
      popular: false,
    },
    {
      name: 'Business',
      price: '₹5,999',
      period: 'per year',
      tagline: 'Multi-branch, multi-user operations for growing stores.',
      cta: 'Choose Business',
      planKey: 'business',
      popular: true,
    },
    {
      name: 'Pro',
      price: '₹9,999',
      period: 'per year',
      tagline: 'Enterprise scale, custom templates & dedicated support.',
      cta: 'Choose Pro',
      planKey: 'pro',
      popular: false,
    },
  ];

  const comparisonFeatures = [
    { name: 'Users & Roles', free: '1 User', app: '1 User', desktop: '2 Users', business: '5 Users', pro: 'Unlimited' },
    { name: 'Branch Locations', free: '1 Branch', app: '1 Branch', desktop: '1 Branch', business: 'Up to 3 Branches', pro: 'Unlimited' },
    { name: 'GST & Non-GST Billing', free: true, app: true, desktop: true, business: true, pro: true },
    { name: 'Thermal Receipt Printing', free: false, app: false, desktop: true, business: true, pro: true },
    { name: 'Counter Sales POS Hotkeys', free: false, app: false, desktop: true, business: true, pro: true },
    { name: 'Customer Udhari & Reminders', free: true, app: true, desktop: true, business: true, pro: true },
    { name: 'Daybook & Cashbook', free: true, app: true, desktop: true, business: true, pro: true },
    { name: 'Purchase Orders & Suppliers', free: false, app: true, desktop: true, business: true, pro: true },
    { name: 'Multi-Branch Stock Transfers', free: false, app: false, desktop: false, business: true, pro: true },
    { name: 'Custom Template Designer', free: false, app: false, desktop: false, business: true, pro: true },
    { name: 'Auto Screen Lock Security', free: true, app: true, desktop: true, business: true, pro: true },
    { name: 'SHA-256 Checksum Backups', free: true, app: true, desktop: true, business: true, pro: true },
    { name: 'Support Channel', free: 'Community', app: 'Email', desktop: 'Email & WhatsApp', business: 'Priority Support', pro: 'Dedicated Manager' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title="VISTAAR Pricing & Plans | Transparent Business Management Software India"
        description="Transparent annual pricing for Indian businesses: Free ₹0, App ₹1,999, Desktop ₹2,999, Business ₹5,999, Pro ₹9,999. No hidden charges. Compare all plans."
        canonicalPath="/pricing"
        structuredData={pricingSchema}
      />

      <PublicHeader />

      <main className="flex-1 py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header Section */}
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Transparent &amp; Predictable Pricing</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
              Fair Pricing for Indian Businesses of Every Size
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Start with our ₹0 Free tier to manage your counter. Upgrade to dedicated desktop terminals or multi-branch operations as your trade expands.
            </p>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-20">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl p-5 flex flex-col justify-between transition-all ${
                  p.popular
                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/25 ring-2 ring-blue-600 relative'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow">
                    Most Popular
                  </div>
                )}

                <div>
                  <h3 className={`text-base font-bold ${p.popular ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                    {p.name}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-black tracking-tight">{p.price}</span>
                    <span className={`text-xs ${p.popular ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      /{p.period}
                    </span>
                  </div>
                  <p className={`text-xs mt-2 leading-relaxed ${p.popular ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {p.tagline}
                  </p>
                </div>

                <div className="pt-6">
                  <a
                    href={`/login?mode=signup&plan=${p.planKey}`}
                    onClick={(e) => handleNav(`/login?mode=signup&plan=${p.planKey}`, e)}
                    className={`w-full block text-center py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      p.popular
                        ? 'bg-white text-blue-600 hover:bg-blue-50 shadow-md'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {p.cta}
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Feature Comparison Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-20">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Detailed Plan Feature Matrix
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Compare features across all VISTAAR tiers to find the exact match for your operations.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                    <th className="py-3 px-4 w-1/3">Capability</th>
                    <th className="py-3 px-3 text-center">Free (₹0)</th>
                    <th className="py-3 px-3 text-center">App (₹1,999)</th>
                    <th className="py-3 px-3 text-center">Desktop (₹2,999)</th>
                    <th className="py-3 px-3 text-center bg-blue-50/50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400">Business (₹5,999)</th>
                    <th className="py-3 px-3 text-center">Pro (₹9,999)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {comparisonFeatures.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                        {row.name}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {renderValue(row.free)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {renderValue(row.app)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {renderValue(row.desktop)}
                      </td>
                      <td className="py-3 px-3 text-center bg-blue-50/30 dark:bg-blue-950/20 font-semibold">
                        {renderValue(row.business)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {renderValue(row.pro)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pricing FAQs */}
          <div className="max-w-3xl mx-auto space-y-4">
            <h2 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-6">
              Pricing &amp; Subscription Questions
            </h2>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                How does billing work? Can I get a GST input credit invoice?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Yes. All paid subscriptions generate a formal B2B GST tax invoice with our company details and your GSTIN, allowing you to claim full 18% Input Tax Credit (ITC).
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                Is my data locked if I use the Free plan?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Never. VISTAAR includes full data export tools with cryptographic SHA-256 backup verification across all tiers, including the Free plan. You own your data 100%.
              </p>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

function renderValue(val: string | boolean) {
  if (typeof val === 'boolean') {
    return val ? (
      <Check className="w-4 h-4 text-emerald-500 mx-auto" />
    ) : (
      <X className="w-4 h-4 text-slate-300 dark:text-slate-600 mx-auto" />
    );
  }
  return <span className="text-slate-600 dark:text-slate-400">{val}</span>;
}

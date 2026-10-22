import React, { useState } from 'react';
import { 
  Check, 
  X, 
  ShieldCheck, 
  HelpCircle, 
  ArrowRight, 
  Sparkles,
  Smartphone,
  Monitor,
  Globe,
  Layers,
  ChevronDown
} from 'lucide-react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';
import { navigateTo } from '../../lib/publicRouter';
import { 
  CANONICAL_PLANS, 
  MOBILE_POS_ADDON, 
  PlanId, 
  getPlatformAccessDisplay 
} from '../../config/plans';

export const PublicPricingView: React.FC = () => {
  const [billingInterval, setBillingInterval] = useState<'annual' | 'monthly'>('annual');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleNav = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    navigateTo(path);
  };

  const planList = [
    CANONICAL_PLANS.free_trial,
    CANONICAL_PLANS.starter,
    CANONICAL_PLANS.starter_mobile,
    CANONICAL_PLANS.business,
    CANONICAL_PLANS.growth,
  ];

  const deviceMatrix = [
    {
      plan: '14-Day Free Trial',
      web: true,
      desktop: true,
      android: true,
      notes: 'Full access to all devices for 14 days',
    },
    {
      plan: 'Starter',
      web: true,
      desktop: false,
      android: false,
      notes: 'Browser access on PC / Mac / Tablet',
    },
    {
      plan: 'Starter + Mobile Add-on',
      web: true,
      desktop: false,
      android: true,
      notes: 'Web browser + native Android APK',
    },
    {
      plan: 'Business',
      web: true,
      desktop: true,
      android: false,
      notes: 'Web browser + native Windows Desktop (.exe)',
    },
    {
      plan: 'Growth',
      web: true,
      desktop: true,
      android: true,
      notes: 'All platforms (Web, Windows Desktop, Android)',
    },
  ];

  const comparisonFeatures = [
    { 
      name: 'Supported Devices', 
      free: 'Web, Desktop, Android', 
      starter: 'Web Only', 
      starterMobile: 'Web + Android', 
      business: 'Web + Desktop', 
      growth: 'Web, Desktop, Android' 
    },
    { 
      name: 'User Logins', 
      free: '2 Users', 
      starter: '1 User', 
      starterMobile: '2 Users', 
      business: '5 Users', 
      growth: 'Unlimited' 
    },
    { 
      name: 'Branch Locations', 
      free: '1 Branch', 
      starter: '1 Branch', 
      starterMobile: '1 Branch', 
      business: 'Up to 3 Branches', 
      growth: 'Unlimited' 
    },
    { 
      name: 'GST & Non-GST Billing', 
      free: true, 
      starter: true, 
      starterMobile: true, 
      business: true, 
      growth: true 
    },
    { 
      name: 'Thermal Receipt Printing', 
      free: true, 
      starter: true, 
      starterMobile: true, 
      business: true, 
      growth: true 
    },
    { 
      name: 'Counter Sales POS Hotkeys (F1-F12)', 
      free: true, 
      starter: false, 
      starterMobile: false, 
      business: true, 
      growth: true 
    },
    { 
      name: 'Camera Barcode Scanning', 
      free: true, 
      starter: false, 
      starterMobile: true, 
      business: false, 
      growth: true 
    },
    { 
      name: 'Customer Udhari & WhatsApp Reminders', 
      free: true, 
      starter: true, 
      starterMobile: true, 
      business: true, 
      growth: true 
    },
    { 
      name: 'Daybook & Cashbook Reconciliations', 
      free: true, 
      starter: true, 
      starterMobile: true, 
      business: true, 
      growth: true 
    },
    { 
      name: 'Multi-Branch Inventory Transfers', 
      free: false, 
      starter: false, 
      starterMobile: false, 
      business: true, 
      growth: true 
    },
    { 
      name: 'Automated Cloud Backups (SHA-256)', 
      free: true, 
      starter: true, 
      starterMobile: true, 
      business: true, 
      growth: true 
    },
    { 
      name: 'Support SLA', 
      free: 'Community', 
      starter: 'Standard Email', 
      starterMobile: 'Email & WhatsApp', 
      business: 'Priority WhatsApp & Phone', 
      growth: 'Dedicated Account Manager' 
    },
  ];

  const pricingFaqs = [
    {
      q: 'What happens when my 14-day Free Trial expires?',
      a: 'Your company data, products, invoices, and customer ledgers remain 100% intact and safe. When your trial ends, simply choose any paid plan (Starter, Business, or Growth) to continue operations without interruption.',
    },
    {
      q: 'How does the Starter Mobile Add-on work?',
      a: 'The Mobile Add-on is a standalone monthly or annual entitlement that layers onto the Starter plan. It unlocks the official Android APK for phone-based billing and barcode scanning without requiring an upgrade to Business or Growth. Cancelling the add-on returns your account to Web-only access without affecting your base Starter plan.',
    },
    {
      q: 'Can I switch or upgrade my plan later?',
      a: 'Yes, you can upgrade at any time. When you upgrade, your existing subscription balance is prorated toward your new plan, and enhanced device access is unlocked immediately.',
    },
    {
      q: 'Are taxes included in the subscription prices?',
      a: 'Subscription prices are in Indian Rupees (INR) excluding statutory GST. A formal B2B GST tax invoice is issued for every payment, allowing registered businesses to claim full Input Tax Credit (ITC).',
    },
  ];

  const pricingSchema = [
    {
      '@type': 'Product',
      name: 'VISTAAR Business OS Plans',
      description: 'Subscription plans for VISTAAR business management software: Free Trial, Starter, Starter + Mobile Add-on, Business, and Growth.',
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'INR',
        lowPrice: '0',
        highPrice: '9999',
        offerCount: '5',
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.vistaarone.com/' },
        { '@type': 'ListItem', position: 2, name: 'Pricing & Plans', item: 'https://www.vistaarone.com/pricing' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title="VISTAAR Pricing & Plans | Transparent Business OS for India"
        description="Transparent subscription pricing for VISTAAR Business OS: 14-Day Free Trial, Starter (Web), Starter + Mobile Add-on (Android), Business (Desktop), and Growth (All Platforms)."
        canonicalPath="/pricing"
        structuredData={pricingSchema}
      />

      <PublicHeader />

      <main className="flex-1 py-14 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Transparent &amp; Predictable Pricing</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
              Fair Pricing for Indian Businesses of Every Size
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Start with a full 14-day trial on all devices. Upgrade to web, high-speed desktop terminals, or mobile add-ons as your operations grow.
            </p>

            {/* Billing Interval Toggle */}
            <div className="pt-4 flex items-center justify-center">
              <div className="bg-slate-200/70 dark:bg-slate-800/80 p-1 rounded-2xl flex items-center gap-1 border border-slate-300/60 dark:border-slate-700/60">
                <button
                  onClick={() => setBillingInterval('annual')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    billingInterval === 'annual'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Annual Billing (Save ~20%)
                </button>
                <button
                  onClick={() => setBillingInterval('monthly')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    billingInterval === 'monthly'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Monthly Billing
                </button>
              </div>
            </div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-20">
            {planList.map((p) => {
              const price = billingInterval === 'monthly' ? p.priceMonthlyInr : p.priceAnnualInr;
              const periodLabel = p.id === 'free_trial' ? '14 Days Free' : billingInterval === 'monthly' ? '/month' : '/year';

              return (
                <div
                  key={p.id}
                  className={`rounded-3xl p-5 flex flex-col justify-between transition-all ${
                    p.popular
                      ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/25 ring-2 ring-blue-600 relative'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {p.badge && (
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow ${
                      p.popular ? 'bg-amber-400 text-slate-950' : 'bg-blue-600 text-white'
                    }`}>
                      {p.badge}
                    </div>
                  )}

                  <div>
                    <h3 className={`text-base font-bold ${p.popular ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                      {p.name}
                    </h3>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-3xl font-black tracking-tight">
                        {p.id === 'free_trial' ? '₹0' : `₹${price.toLocaleString('en-IN')}`}
                      </span>
                      <span className={`text-xs ${p.popular ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        {periodLabel}
                      </span>
                    </div>

                    {/* Platform availability pills */}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {p.allowedPlatforms.includes('web') && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                          p.popular ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          <Globe className="w-2.5 h-2.5" /> Web
                        </span>
                      )}
                      {p.allowedPlatforms.includes('desktop') && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                          p.popular ? 'bg-white/20 text-white' : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                        }`}>
                          <Monitor className="w-2.5 h-2.5" /> Desktop
                        </span>
                      )}
                      {p.allowedPlatforms.includes('android') && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                          p.popular ? 'bg-white/20 text-white' : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          <Smartphone className="w-2.5 h-2.5" /> Android
                        </span>
                      )}
                    </div>

                    <p className={`text-xs mt-3 leading-relaxed ${p.popular ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {p.tagline}
                    </p>

                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                      {p.features.slice(0, 4).map((f, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px]">
                          <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${p.popular ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
                          <span className={p.popular ? 'text-blue-50' : 'text-slate-600 dark:text-slate-300'}>
                            {f}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6">
                    <a
                      href={p.ctaPath}
                      onClick={(e) => handleNav(p.ctaPath, e)}
                      className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        p.popular
                          ? 'bg-white text-blue-600 hover:bg-blue-50 shadow-md'
                          : 'bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 border border-slate-800'
                      }`}
                    >
                      <span>{p.ctaText}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Canonical Device-Access Comparison Matrix */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-10 mb-20 shadow-sm">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Canonical Platform &amp; Device Access Matrix
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Strict multi-platform access rules across Web, Windows Desktop, and Android.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 font-bold">Plan Tier</th>
                    <th className="py-3 px-4 font-bold text-center">Web Browser</th>
                    <th className="py-3 px-4 font-bold text-center">Windows Desktop</th>
                    <th className="py-3 px-4 font-bold text-center">Android Mobile (APK)</th>
                    <th className="py-3 px-4 font-bold">Access Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {deviceMatrix.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">{row.plan}</td>
                      <td className="py-3.5 px-4 text-center">
                        {row.web ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-slate-300 dark:text-slate-700 mx-auto" />}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {row.desktop ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-slate-300 dark:text-slate-700 mx-auto" />}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {row.android ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-slate-300 dark:text-slate-700 mx-auto" />}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-[11px]">{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Starter Mobile Add-on Detail Box */}
          <div className="rounded-3xl border-2 border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/20 p-6 md:p-8 mb-20 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider">
                  Configurable Add-On
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {MOBILE_POS_ADDON.name}
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
                Need on-the-floor billing or camera barcode scanning without paying for high-volume desktop software? Add Android Mobile APK entitlement to your Starter plan for ₹1,999/year (or ₹199/month).
              </p>
            </div>
            <a
              href="/signup?plan=starter_mobile"
              onClick={(e) => handleNav('/signup?plan=starter_mobile', e)}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md whitespace-nowrap transition-all cursor-pointer"
            >
              Get Starter + Mobile
            </a>
          </div>

          {/* Full Feature Comparison Table */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-10 mb-20 shadow-sm">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mb-6 text-center">
              Comprehensive Feature Comparison
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 font-bold">Feature</th>
                    <th className="py-3 px-2 font-bold text-center">Free Trial</th>
                    <th className="py-3 px-2 font-bold text-center">Starter</th>
                    <th className="py-3 px-2 font-bold text-center">Starter + Mobile</th>
                    <th className="py-3 px-2 font-bold text-center">Business</th>
                    <th className="py-3 px-2 font-bold text-center">Growth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {comparisonFeatures.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">{row.name}</td>
                      <td className="py-3 px-2 text-center text-slate-600 dark:text-slate-300">
                        {typeof row.free === 'boolean' ? (row.free ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-slate-300 dark:text-slate-700 mx-auto" />) : row.free}
                      </td>
                      <td className="py-3 px-2 text-center text-slate-600 dark:text-slate-300">
                        {typeof row.starter === 'boolean' ? (row.starter ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-slate-300 dark:text-slate-700 mx-auto" />) : row.starter}
                      </td>
                      <td className="py-3 px-2 text-center text-slate-600 dark:text-slate-300">
                        {typeof row.starterMobile === 'boolean' ? (row.starterMobile ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-slate-300 dark:text-slate-700 mx-auto" />) : row.starterMobile}
                      </td>
                      <td className="py-3 px-2 text-center text-slate-600 dark:text-slate-300">
                        {typeof row.business === 'boolean' ? (row.business ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-slate-300 dark:text-slate-700 mx-auto" />) : row.business}
                      </td>
                      <td className="py-3 px-2 text-center text-slate-600 dark:text-slate-300">
                        {typeof row.growth === 'boolean' ? (row.growth ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-slate-300 dark:text-slate-700 mx-auto" />) : row.growth}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* FAQs */}
          <div className="max-w-3xl mx-auto space-y-4 mb-16">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-6">
              Frequently Asked Questions About Subscriptions &amp; Billing
            </h2>
            {pricingFaqs.map((f, i) => (
              <div 
                key={i}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full py-4 px-5 text-left flex items-center justify-between text-xs sm:text-sm font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <span>{f.q}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 shrink-0 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800/60 pt-3">
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

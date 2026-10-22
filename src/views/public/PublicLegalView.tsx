import React from 'react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';

export interface PublicLegalViewProps {
  type: 'privacy' | 'terms' | 'refund';
}

export const PublicLegalView: React.FC<PublicLegalViewProps> = ({ type }) => {
  const isPrivacy = type === 'privacy';
  const isRefund = type === 'refund';

  const getDocTitle = () => {
    if (isPrivacy) return 'Privacy Policy | VISTAAR';
    if (isRefund) return 'Refund & Cancellation Policy | VISTAAR';
    return 'Terms of Service | VISTAAR';
  };

  const getDocDesc = () => {
    if (isPrivacy) {
      return 'Read the VISTAAR Privacy Policy. We guarantee complete tenant data privacy, strict database isolation, and zero third-party data selling.';
    }
    if (isRefund) {
      return 'Read the VISTAAR Refund and Cancellation Policy. Understand 14-day free trial terms, annual plan renewals, and payment disputes.';
    }
    return 'Read the VISTAAR Terms of Service governing your use of our business operating system, subscriptions, and services.';
  };

  const getCanonicalPath = () => {
    if (isPrivacy) return '/privacy-policy';
    if (isRefund) return '/refund-policy';
    return '/terms';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title={getDocTitle()}
        description={getDocDesc()}
        canonicalPath={getCanonicalPath()}
      />

      <PublicHeader />

      <main className="flex-1 py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <header className="border-b border-slate-200 dark:border-slate-800 pb-6 space-y-2">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
              LEGAL DOCUMENTATION
            </span>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {isPrivacy ? 'Privacy Policy' : isRefund ? 'Refund & Cancellation Policy' : 'Terms of Service'}
            </h1>
            <p className="text-xs text-slate-500">Last updated: October 2026 &bull; Effective for all Indian accounts</p>
          </header>


          <article className="prose dark:prose-invert max-w-none text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-6">
            {isPrivacy ? (
              <>
                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">1. Our Commitment to Your Business Privacy</h2>
                  <p>
                    VISTAAR Technologies ("VISTAAR", "we", "us") values your privacy. We understand that your business records—including customer names, contact numbers, inventory rates, purchase invoices, and daily profits—are highly confidential. We never sell, rent, or distribute your private commercial data to third-party advertisers or data brokers.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">2. What Information We Store</h2>
                  <p>
                    To operate the VISTAAR Business OS, we process: (a) Account registration data (owner name, business name, verified email, phone number); (b) Operational business data inputted by you (products, stock counts, customer ledger balances, invoices, expenses); and (c) Technical security audit records (timestamped login history, IP access logs) used strictly for authentication and fraud prevention.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">3. Multi-Tenant Cryptographic Isolation</h2>
                  <p>
                    All customer records are compartmentalized using PostgreSQL Row-Level Security (RLS). Every database query is cryptographically bound to your authoritative workspace ID. No tenant or user can view another business’s records under any circumstances.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">4. Data Ownership &amp; Export Rights</h2>
                  <p>
                    You retain 100% intellectual property and ownership over your business data. You may download complete offline backup archives stamped with SHA-256 integrity checksums at any time from your settings panel.
                  </p>
                </section>
              </>
            ) : isRefund ? (
              <>
                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">1. 14-Day Full Free Trial</h2>
                  <p>
                    Every new VISTAAR business account begins with a complimentary 14-day free trial on all supported devices (Web, Windows Desktop, and Android). We encourage all customers to evaluate our invoicing, inventory management, and printing capabilities during this trial period before committing to a paid plan. No payment information is collected during the trial.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">2. Subscription Payments &amp; Invoicing</h2>
                  <p>
                    Subscriptions are billed in advance on an annual or monthly basis in Indian Rupees (INR). Upon successful payment, a valid GST Tax Invoice with our company GSTIN is issued to your registered email address, allowing registered Indian enterprises to claim applicable Input Tax Credit (ITC).
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">3. Cancellation &amp; Non-Renewal Policy</h2>
                  <p>
                    You may cancel your subscription renewal or add-on at any time through your Account Settings. Upon cancellation, your access remains fully operational until the end of your prepaid billing period. We do not automatically charge renewal fees without prior email and dashboard notice.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">4. Refund Requests &amp; Billing Disputes</h2>
                  <p>
                    Because we provide a 14-day full free trial prior to any commercial charge, annual and monthly subscription fees are generally non-refundable once activated. However, if you experience technical failure or duplicate payment deductions caused by gateway processing errors, our billing team will issue a 100% refund upon verification within 7 business days. To request a payment review, contact support@vistaarone.com with your transaction reference.
                  </p>
                </section>
              </>
            ) : (
              <>
                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">1. Terms of Use &amp; Account Responsibility</h2>
                  <p>
                    By registering for or using VISTAAR, you agree to these Terms. You are responsible for maintaining the confidentiality of your account credentials, managing branch user permissions, and ensuring accuracy in your tax invoices and customer ledgers.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">2. Free Trial &amp; Canonical Paid Subscriptions</h2>
                  <p>
                    VISTAAR provides a 14-Day Free Trial alongside canonical subscription tiers (Starter, Starter + Mobile Add-on, Business, and Growth). Each tier defines authoritative device access permissions (Web, Windows Desktop, Android) and capacity limits. Subscription fees are billed in Indian Rupees (INR) and include applicable statutory taxes with valid tax invoices.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">3. Service Reliability &amp; Backups</h2>
                  <p>
                    While we maintain industry-leading uptime and automated cloud replication, you are strongly advised to regularly download local offline backup archives through our built-in backup tools to ensure maximum business resilience.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">4. Statutory &amp; Tax Compliance</h2>
                  <p>
                    VISTAAR provides software calculation tools to assist with GST billing and accounting records. The business owner remains solely responsible for filing accurate tax returns with Indian revenue authorities.
                  </p>
                </section>
              </>
            )}
          </article>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

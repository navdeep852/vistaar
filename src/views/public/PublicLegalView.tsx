import React from 'react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';

export interface PublicLegalViewProps {
  type: 'privacy' | 'terms';
}

export const PublicLegalView: React.FC<PublicLegalViewProps> = ({ type }) => {
  const isPrivacy = type === 'privacy';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title={isPrivacy ? 'Privacy Policy | VISTAAR' : 'Terms of Service | VISTAAR'}
        description={
          isPrivacy
            ? 'Read the VISTAAR Privacy Policy. We guarantee complete tenant data privacy, strict database isolation, and zero third-party data selling.'
            : 'Read the VISTAAR Terms of Service governing your use of our business operating system, subscriptions, and services.'
        }
        canonicalPath={isPrivacy ? '/privacy-policy' : '/terms'}
      />

      <PublicHeader />

      <main className="flex-1 py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <header className="border-b border-slate-200 dark:border-slate-800 pb-6 space-y-2">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
              LEGAL DOCUMENTATION
            </span>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {isPrivacy ? 'Privacy Policy' : 'Terms of Service'}
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
            ) : (
              <>
                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">1. Terms of Use &amp; Account Responsibility</h2>
                  <p>
                    By registering for or using VISTAAR, you agree to these Terms. You are responsible for maintaining the confidentiality of your account credentials, managing branch user permissions, and ensuring accuracy in your tax invoices and customer ledgers.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">2. Free Plan &amp; Paid Subscriptions</h2>
                  <p>
                    VISTAAR provides a ₹0 Free plan for single-user micro businesses. Paid annual subscriptions (App, Desktop, Business, and Pro) provide enhanced multi-branch, terminal, and user capacity. Subscription fees are billed annually in Indian Rupees (INR) and include applicable statutory taxes with valid tax invoices.
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

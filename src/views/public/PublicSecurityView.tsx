import React from 'react';
import { ShieldCheck, Lock, Database, KeyRound, RefreshCw, EyeOff, CheckCircle2 } from 'lucide-react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';

export const PublicSecurityView: React.FC = () => {
  const securitySchema = {
    '@type': 'WebPage',
    name: 'Security Architecture & Data Privacy | VISTAAR',
    description: 'Learn how VISTAAR protects Indian business data with PostgreSQL Row-Level Security, SHA-256 backup verification, and auto screen lock.',
    url: 'https://www.vistaarone.com/security',
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title="Security Architecture & Data Protection | VISTAAR"
        description="Enterprise-grade security for Indian businesses. Learn how VISTAAR guarantees tenant isolation, cryptographic backup checksums, and local screen lock security."
        canonicalPath="/security"
        structuredData={securitySchema}
      />

      <PublicHeader />

      <main className="flex-1 py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>DATA PROTECTION WHITE PAPER</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Enterprise-Grade Security for Every Growing Business
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Your business margins, customer udhaari ledgers, and vendor prices are your most valuable secrets. VISTAAR is engineered from first principles to ensure your data stays exclusively yours.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                <Database className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                PostgreSQL Row-Level Security (RLS)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Every query to our cloud database is protected by PostgreSQL tenant isolation policies. A user authenticated under Company A cannot read, write, or query any records belonging to Company B.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <KeyRound className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Auto Screen Lock Protection
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Billing terminals often sit on open retail counters. VISTAAR automatically locks after periods of inactivity, requiring your secure PIN or password before sensitive margins or customer records can be viewed.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                <RefreshCw className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Cryptographic SHA-256 Backups
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Export complete snapshots of your business records anytime. Every backup file is stamped with a SHA-256 cryptographic hash, ensuring zero data corruption during restore operations.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <EyeOff className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Zero Third-Party Advertising Trackers
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                We never monetize your business data. VISTAAR contains zero ad trackers, zero telemetry reselling, and zero unauthorized third-party SDKs. Your transactions remain 100% private.
              </p>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

import React from 'react';
import { Target, Heart, Award, Shield, CheckCircle2, ArrowRight } from 'lucide-react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';
import { navigateTo } from '../../lib/publicRouter';

export const PublicAboutView: React.FC = () => {
  const handleNav = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    navigateTo(path);
  };

  const aboutSchema = {
    '@type': 'AboutPage',
    name: 'About VISTAAR Technologies',
    description: 'Learn about VISTAAR mission to empower Indian retailers, wholesalers, and MSMEs with modern business operating software.',
    url: 'https://www.vistaarone.com/about',
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title="About VISTAAR | Run Better. Grow Wider. | The Business OS"
        description="Learn about VISTAAR's mission to empower Indian MSMEs, retailers, and wholesalers with an integrated, high-reliability Business Operating System."
        canonicalPath="/about"
        structuredData={aboutSchema}
      />

      <PublicHeader />

      <main className="flex-1 py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Header */}
          <div className="text-center space-y-4">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
              OUR MISSION &amp; VALUES
            </span>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Empowering Indian Businesses to Run Better and Grow Wider
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
              India's millions of small and medium business owners are the engine of our economy. Yet most still battle fragmented paper registers, unreliable software, and disconnected accounting tools.
            </p>
          </div>

          {/* Narrative */}
          <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Why We Built VISTAAR
            </h2>
            <p>
              We watched shopkeepers and traders across Tier 1, Tier 2, and Tier 3 cities lose thousands of rupees every month to simple operational cracks: a bill written without stock verification, customer udhari forgotten on a paper slip, or cash in the drawer failing to match evening totals.
            </p>
            <p>
              Big enterprise ERP systems are far too expensive and complicated for everyday Indian counters. Generic billing apps only solve printing paper without managing real stock or supplier relationships.
            </p>
            <p>
              <strong>VISTAAR</strong> was engineered to be the missing link: an intuitive, high-speed, and deeply connected <strong>Business OS</strong> that unites billing, inventory, customer udhari, and cash flow into one reliable system that works as smoothly on a phone as it does on a desktop terminal.
            </p>
          </div>

          {/* Core Principles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                <Target className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Counter Speed First</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Software must never keep a customer waiting at the counter. Every interface is designed for rapid keyboard and barcode execution.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                <Shield className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Absolute Data Privacy</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your customer accounts, supplier margins, and financial records belong to you alone. We never monetize or sell your data.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                <Heart className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Real Indian Realities</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Native INR ₹ support, udhaari credit tracking, split payments, thermal printers, and offline tolerance built in from day one.
              </p>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

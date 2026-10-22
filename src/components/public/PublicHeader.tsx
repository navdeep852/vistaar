import React, { useState } from 'react';
import { 
  Menu, 
  X, 
  ChevronDown, 
  Receipt, 
  Boxes, 
  CreditCard, 
  BookOpen, 
  Truck, 
  Wallet,
  ShieldCheck,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { navigateTo } from '../../lib/publicRouter';
import { ThemeToggle } from '../ThemeToggle';
import { supabaseAuthService } from '../../services/supabaseAuth';

export const PublicHeader: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const isAuthed = supabaseAuthService.isAuthenticated();

  const handleNav = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setMobileMenuOpen(false);
    setFeaturesOpen(false);
    navigateTo(path);
  };

  const featureLinks = [
    {
      title: 'GST Billing & Invoicing',
      desc: 'Tax invoices, quotations, thermal receipts & WhatsApp sharing',
      icon: Receipt,
      path: '/features/billing-invoicing',
      color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40',
    },
    {
      title: 'Real-Time Inventory',
      desc: 'Stock tracking, batch numbers, barcodes & low-stock alerts',
      icon: Boxes,
      path: '/features/inventory-management',
      color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40',
    },
    {
      title: 'Counter Sales POS',
      desc: 'High-speed retail counter checkout with keyboard shortcuts',
      icon: CreditCard,
      path: '/features/point-of-sale',
      color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40',
    },
    {
      title: 'Customer Udhari Khata',
      desc: 'Track receivables, credit aging & automatic payment reminders',
      icon: BookOpen,
      path: '/features/udhari-management',
      color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40',
    },
    {
      title: 'Purchase Orders & Suppliers',
      desc: 'Vendor rate catalogues, POs & goods receipts',
      icon: Truck,
      path: '/features/purchase-order-management',
      color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40',
    },
    {
      title: 'Daybook, Cashbook & Expenses',
      desc: 'Daily cashflow reconciliation & expense categorisation',
      icon: Wallet,
      path: '/features/daybook-cashbook',
      color: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40',
    },
  ];

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-white/95 dark:bg-slate-950/95 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <a 
          href="/" 
          onClick={(e) => handleNav('/', e)} 
          className="flex items-center gap-2.5 group cursor-pointer focus:outline-none"
          aria-label="VISTAAR Home"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center p-1.5 shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <img 
              src="/Vistaar_Icon_logo.png" 
              alt="VISTAAR Logo" 
              className="w-full h-full object-contain filter brightness-0 invert" 
              width="36" 
              height="36" 
            />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white leading-none">
              VISTAAR
            </span>
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 tracking-wider uppercase mt-0.5">
              The Business OS
            </span>
          </div>
        </a>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-7">
          {/* Features Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setFeaturesOpen(true)}
            onMouseLeave={() => setFeaturesOpen(false)}
          >
            <button 
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 py-2 transition-colors cursor-pointer"
              onClick={() => setFeaturesOpen(!featuresOpen)}
              aria-expanded={featuresOpen}
            >
              Features
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${featuresOpen ? 'rotate-180' : ''}`} />
            </button>

            {featuresOpen && (
              <div className="absolute top-full -left-28 w-[580px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 grid grid-cols-2 gap-2 animate-fade-in z-50">
                {featureLinks.map((feat) => {
                  const Icon = feat.icon;
                  return (
                    <a
                      key={feat.path}
                      href={feat.path}
                      onClick={(e) => handleNav(feat.path, e)}
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group"
                    >
                      <div className={`p-2 rounded-lg ${feat.color} shrink-0 group-hover:scale-110 transition-transform`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {feat.title}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                          {feat.desc}
                        </p>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          <a 
            href="/pricing" 
            onClick={(e) => handleNav('/pricing', e)}
            className="text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            Pricing
          </a>

          <a 
            href="/compare/billing-vs-inventory-software" 
            onClick={(e) => handleNav('/compare/billing-vs-inventory-software', e)}
            className="text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            Compare
          </a>

          <a 
            href="/security" 
            onClick={(e) => handleNav('/security', e)}
            className="text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            Security
          </a>

          <a 
            href="/about" 
            onClick={(e) => handleNav('/about', e)}
            className="text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            About
          </a>

          <a 
            href="/contact" 
            onClick={(e) => handleNav('/contact', e)}
            className="text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            Contact
          </a>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <ThemeToggle />

          {isAuthed ? (
            <a
              href="/dashboard"
              onClick={(e) => {
                e.preventDefault();
                window.location.href = '/';
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/25 transition-all cursor-pointer"
            >
              <span>Go to Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          ) : (
            <>
              <a
                href="/login"
                onClick={(e) => handleNav('/login', e)}
                className="hidden sm:inline-flex px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                Sign In
              </a>

              <a
                href="/login?mode=signup"
                onClick={(e) => handleNav('/login?mode=signup', e)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/25 transition-all hover:shadow-lg hover:shadow-blue-500/35 hover:-translate-y-0.5 cursor-pointer"
              >
                <span>Start Free</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </>
          )}

          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg focus:outline-none"
            aria-label="Toggle mobile menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 pt-3 pb-6 space-y-3 animate-fade-in">
          <div className="font-bold text-[11px] text-slate-400 uppercase tracking-wider px-2">
            Features
          </div>
          <div className="grid grid-cols-1 gap-1">
            {featureLinks.map((feat) => {
              const Icon = feat.icon;
              return (
                <a
                  key={feat.path}
                  href={feat.path}
                  onClick={(e) => handleNav(feat.path, e)}
                  className="flex items-center gap-2.5 p-2 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>{feat.title}</span>
                </a>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
            <a
              href="/pricing"
              onClick={(e) => handleNav('/pricing', e)}
              className="block p-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
            >
              Pricing &amp; Plans
            </a>
            <a
              href="/compare/billing-vs-inventory-software"
              onClick={(e) => handleNav('/compare/billing-vs-inventory-software', e)}
              className="block p-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
            >
              Comparison Guide
            </a>
            <a
              href="/security"
              onClick={(e) => handleNav('/security', e)}
              className="block p-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
            >
              Security
            </a>
            <a
              href="/about"
              onClick={(e) => handleNav('/about', e)}
              className="block p-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
            >
              About VISTAAR
            </a>
            <a
              href="/contact"
              onClick={(e) => handleNav('/contact', e)}
              className="block p-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
            >
              Contact Support
            </a>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            <a
              href="/login"
              onClick={(e) => handleNav('/login', e)}
              className="flex-1 text-center py-2 text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl"
            >
              Sign In
            </a>
            <a
              href="/login?mode=signup"
              onClick={(e) => handleNav('/login?mode=signup', e)}
              className="flex-1 text-center py-2 text-xs font-bold text-white bg-blue-600 rounded-xl shadow"
            >
              Start Free
            </a>
          </div>
        </div>
      )}
    </header>
  );
};

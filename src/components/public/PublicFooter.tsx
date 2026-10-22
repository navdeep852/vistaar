import { ShieldCheck, MapPin, Mail, ArrowUpRight } from 'lucide-react';
import { navigateTo } from '../../lib/publicRouter';

export const PublicFooter: React.FC = () => {
  const handleNav = (path: string, e: React.MouseEvent) => {
    e.preventDefault();
    navigateTo(path);
  };

  return (
    <footer className="w-full bg-slate-900 text-slate-300 border-t border-slate-800 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand Info & Mission */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center p-1.5 shadow-md shadow-blue-500/20">
                <img 
                  src="/Vistaar_Icon_logo.png" 
                  alt="VISTAAR" 
                  className="w-full h-full object-contain filter brightness-0 invert" 
                />
              </div>
              <span className="text-xl font-black text-white tracking-tight">VISTAAR</span>
            </div>

            <p className="text-sm font-semibold text-blue-400">
              Run Better. Grow Wider.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              The connected Business OS purpose-built for Indian retail, wholesale, and trade. Unify billing, inventory, customer udhari, and cash flow in one high-reliability system.
            </p>

            <div className="pt-2 flex flex-col gap-1.5 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Engineered for businesses across India (Tier 1, Tier 2 &amp; Tier 3 cities)</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <a href="mailto:support@vistaarone.com" className="hover:text-white transition-colors">
                  support@vistaarone.com
                </a>
              </div>
            </div>
          </div>

          {/* Column 1: Core Modules */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Features</h4>
            <ul className="space-y-2">
              <li>
                <a href="/features/billing-invoicing" onClick={(e) => handleNav('/features/billing-invoicing', e)} className="hover:text-white transition-colors">
                  GST Billing &amp; Invoices
                </a>
              </li>
              <li>
                <a href="/features/inventory-management" onClick={(e) => handleNav('/features/inventory-management', e)} className="hover:text-white transition-colors">
                  Real-Time Inventory
                </a>
              </li>
              <li>
                <a href="/features/point-of-sale" onClick={(e) => handleNav('/features/point-of-sale', e)} className="hover:text-white transition-colors">
                  Counter Sales POS
                </a>
              </li>
              <li>
                <a href="/features/udhari-management" onClick={(e) => handleNav('/features/udhari-management', e)} className="hover:text-white transition-colors">
                  Customer Udhari Khata
                </a>
              </li>
              <li>
                <a href="/features/purchase-order-management" onClick={(e) => handleNav('/features/purchase-order-management', e)} className="hover:text-white transition-colors">
                  Purchase Orders &amp; Suppliers
                </a>
              </li>
              <li>
                <a href="/features/daybook-cashbook" onClick={(e) => handleNav('/features/daybook-cashbook', e)} className="hover:text-white transition-colors">
                  Daybook &amp; Cashbook
                </a>
              </li>
            </ul>
          </div>

          {/* Column 2: Commercial & Platform */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Solutions &amp; Platform</h4>
            <ul className="space-y-2">
              <li>
                <a href="/pricing" onClick={(e) => handleNav('/pricing', e)} className="hover:text-white transition-colors">
                  Pricing &amp; Plans
                </a>
              </li>
              <li>
                <a href="/download" onClick={(e) => handleNav('/download', e)} className="hover:text-white transition-colors">
                  Download Center (Web, APK, Desktop)
                </a>
              </li>
              <li>
                <a href="/blog" onClick={(e) => handleNav('/blog', e)} className="hover:text-white transition-colors">
                  Blog &amp; Knowledge Base
                </a>
              </li>
              <li>
                <a href="/faq" onClick={(e) => handleNav('/faq', e)} className="hover:text-white transition-colors">
                  Frequently Asked Questions
                </a>
              </li>
              <li>
                <a href="/compare/billing-vs-inventory-software" onClick={(e) => handleNav('/compare/billing-vs-inventory-software', e)} className="hover:text-white transition-colors">
                  Billing vs Inventory Guide
                </a>
              </li>
              <li>
                <a href="/security" onClick={(e) => handleNav('/security', e)} className="hover:text-white transition-colors">
                  Security Architecture
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Trust & Company */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Company &amp; Legal</h4>
            <ul className="space-y-2">
              <li>
                <a href="/about" onClick={(e) => handleNav('/about', e)} className="hover:text-white transition-colors">
                  About VISTAAR
                </a>
              </li>
              <li>
                <a href="/contact" onClick={(e) => handleNav('/contact', e)} className="hover:text-white transition-colors">
                  Contact Us
                </a>
              </li>
              <li>
                <a href="/privacy-policy" onClick={(e) => handleNav('/privacy-policy', e)} className="hover:text-white transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="/terms" onClick={(e) => handleNav('/terms', e)} className="hover:text-white transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="/refund-policy" onClick={(e) => handleNav('/refund-policy', e)} className="hover:text-white transition-colors">
                  Refund &amp; Cancellation Policy
                </a>
              </li>
              <li>
                <a href="/llms.txt" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors">
                  <span>AI Index (llms.txt)</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>
            &copy; {new Date().getFullYear()} VISTAAR Technologies. All rights reserved. Built with pride for Indian businesses.
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              100% Tenant Isolated &amp; Encrypted
            </span>
            <span>&bull;</span>
            <span>GST &amp; Non-GST Supported</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

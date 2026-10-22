import React, { useState } from 'react';
import { 
  Globe, 
  Smartphone, 
  Monitor, 
  Download, 
  CheckCircle2, 
  ExternalLink, 
  ShieldCheck, 
  FileCode, 
  ChevronDown, 
  AlertCircle,
  Sparkles,
  ArrowRight,
  Terminal,
  Cpu
} from 'lucide-react';
import { SEOHead } from '../../components/public/SEOHead';
import { PublicHeader } from '../../components/public/PublicHeader';
import { PublicFooter } from '../../components/public/PublicFooter';
import { navigateTo } from '../../lib/publicRouter';
import { RELEASE_MANIFEST } from '../../config/releases';

export const PublicDownloadView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'android' | 'windows' | 'web'>('all');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleNav = (path: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    navigateTo(path);
  };

  const downloadSchema = [
    {
      '@type': 'SoftwareApplication',
      name: 'VISTAAR Business OS',
      operatingSystem: 'Web, Android 8.0+, Windows 10/11',
      applicationCategory: 'BusinessApplication',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'INR',
      },
      softwareVersion: '1.0.0',
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.vistaarone.com/' },
        { '@type': 'ListItem', position: 2, name: 'Download Center', item: 'https://www.vistaarone.com/download' },
      ],
    },
  ];

  const faqs = [
    {
      q: 'Do I need separate accounts for Web, Android, and Windows?',
      a: 'No. Your VISTAAR account, business details, inventory, invoices, and customer ledgers synchronize seamlessly across all your devices in real time under one company profile.',
    },
    {
      q: 'How do I install the Android APK on my phone?',
      a: 'After downloading the APK file, tap on it in your Downloads folder. If your phone displays a security prompt, go to Settings and enable "Install unknown apps" for your browser or file manager, then confirm the installation.',
    },
    {
      q: 'Which subscription plans allow Android and Desktop access?',
      a: 'The 14-Day Free Trial and Growth plan provide access to all three platforms (Web, Windows Desktop, and Android). The Starter plan includes Web, with an optional Mobile Add-on for Android. The Business plan includes Web and Windows Desktop.',
    },
    {
      q: 'Can I use VISTAAR directly in the browser without installing anything?',
      a: 'Yes! The VISTAAR Web Cloud OS runs natively in Google Chrome, Microsoft Edge, Mozilla Firefox, and Apple Safari on any laptop, PC, Mac, or tablet with zero installation required.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-blue-600 selection:text-white">
      <SEOHead
        title="Download VISTAAR Business OS | Web, Android APK & Windows Desktop"
        description="Download official VISTAAR software for Android APK and Windows Desktop, or launch the Web Cloud OS instantly. Unified billing, inventory, and accounting across all platforms."
        canonicalPath="/download"
        structuredData={downloadSchema}
      />

      <PublicHeader />

      <main className="flex-1 py-14 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header Hero */}
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider">
              <Download className="w-3.5 h-3.5" />
              <span>Official Download Center</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
              One Business OS. Every Platform You Rely On.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Launch directly in your web browser, install the native Android APK on your phone or mobile terminal, or run high-speed Windows desktop software for fast thermal printing.
            </p>
          </div>

          {/* Download Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            {/* 1. Web Cloud OS */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-7 flex flex-col justify-between shadow-sm hover:shadow-xl hover:border-blue-500/40 transition-all group">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                    <Globe className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                    Instant Access
                  </span>
                </div>

                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {RELEASE_MANIFEST.web.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Zero setup. Run your retail counter, stock transfers, and accounting directly from any browser on PC, Mac, or tablet.
                </p>

                <div className="my-5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-[11px] space-y-1.5 text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Version:</span>
                    <span className="font-semibold">{RELEASE_MANIFEST.web.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Download Size:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{RELEASE_MANIFEST.web.fileSize}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Compatibility:</span>
                    <span className="font-semibold">Chrome, Edge, Safari, Firefox</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Highlights</div>
                  {RELEASE_MANIFEST.web.changelog.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-8">
                <a
                  href="/login"
                  onClick={(e) => handleNav('/login', e)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Launch Web App</span>
                </a>
              </div>
            </div>

            {/* 2. Android Mobile APK */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-emerald-500/50 dark:border-emerald-500/40 p-7 flex flex-col justify-between shadow-lg shadow-emerald-500/5 hover:shadow-2xl transition-all relative group">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider shadow">
                Mobile POS Ready
              </div>

              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                    Official Release
                  </span>
                </div>

                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {RELEASE_MANIFEST.android.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Optimized for Android smartphones and handheld mobile billing terminals. Camera barcode scanning and Bluetooth printing.
                </p>

                <div className="my-5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-[11px] space-y-1.5 text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Version:</span>
                    <span className="font-semibold">{RELEASE_MANIFEST.android.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">File Size:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{RELEASE_MANIFEST.android.fileSize}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Required OS:</span>
                    <span className="font-semibold">Android 8.0+ (Oreo)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Package ID:</span>
                    <span className="font-mono text-[10px]">com.grovyx.vistaar</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Highlights</div>
                  {RELEASE_MANIFEST.android.changelog.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-8 space-y-2">
                <a
                  href={RELEASE_MANIFEST.android.downloadUrl}
                  download="vistaar-v1.0.0.apk"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Android APK</span>
                </a>
                <div className="text-center text-[10px] text-slate-500 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>SHA-256 Verified Safe Binary</span>
                </div>
              </div>
            </div>

            {/* 3. Windows Desktop Software */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-7 flex flex-col justify-between shadow-sm hover:shadow-xl hover:border-indigo-500/40 transition-all group">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform">
                    <Monitor className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                    Release Candidate
                  </span>
                </div>

                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {RELEASE_MANIFEST.windows.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  High-throughput desktop terminal software with USB ESC/POS thermal printing, F1-F12 counter hotkeys, and local offline cache.
                </p>

                <div className="my-5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-[11px] space-y-1.5 text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Version:</span>
                    <span className="font-semibold">{RELEASE_MANIFEST.windows.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Package Format:</span>
                    <span className="font-semibold">NSIS Windows Setup (.exe)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Supported OS:</span>
                    <span className="font-semibold">Windows 10 / 11 (64-bit)</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Highlights</div>
                  {RELEASE_MANIFEST.windows.changelog.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-8 space-y-2">
                <a
                  href="/login"
                  onClick={(e) => handleNav('/login', e)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition-all cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Launch Web (Desktop Ready)</span>
                </a>
                <div className="text-center text-[10px] text-slate-500">
                  Windows NSIS standalone installer entering distribution
                </div>
              </div>
            </div>
          </div>

          {/* Installation Guide & Troubleshooting */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 md:p-12 mb-16 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Android APK Step-by-Step Installation Guide
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-2xl">
              Installing the official VISTAAR Android APK takes under 60 seconds. Follow these 4 simple steps:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {RELEASE_MANIFEST.android.installSteps.map((step, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center mb-3">
                    {idx + 1}
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* FAQs */}
          <div className="max-w-3xl mx-auto space-y-4 mb-16">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-6">
              Frequently Asked Questions About Downloads &amp; Device Access
            </h2>
            {faqs.map((f, i) => (
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

          {/* Pricing CTA Banner */}
          <div className="rounded-3xl bg-gradient-to-tr from-slate-900 via-indigo-950 to-blue-900 text-white p-8 md:p-12 text-center relative overflow-hidden shadow-xl">
            <div className="max-w-2xl mx-auto space-y-4 relative z-10">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                Evaluate Every Device with our 14-Day Free Trial
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Experience seamless multi-platform business operations on Web, Android, and Desktop with full feature access and zero payment details required.
              </p>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href="/signup"
                  onClick={(e) => handleNav('/signup', e)}
                  className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
                >
                  Start 14-Day Free Trial
                </a>
                <a
                  href="/pricing"
                  onClick={(e) => handleNav('/pricing', e)}
                  className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs backdrop-blur-sm transition-all cursor-pointer"
                >
                  View Plan Pricing &amp; Comparison
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

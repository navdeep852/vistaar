import React from 'react';
import { 
  Smartphone, 
  Monitor, 
  Globe, 
  LogOut, 
  Sparkles,
  CheckCircle2,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { WorkspaceEntitlements } from '../services/subscriptionService';
import { CANONICAL_PLANS, PlatformType } from '../config/plans';
import { supabaseAuthService } from '../services/supabaseAuth';
import { navigateTo } from '../lib/publicRouter';

interface PlatformUpgradeRequiredScreenProps {
  platform: PlatformType;
  entitlements: WorkspaceEntitlements;
  onRetry: () => void;
}

export const PlatformUpgradeRequiredScreen: React.FC<PlatformUpgradeRequiredScreenProps> = ({
  platform,
  entitlements,
  onRetry,
}) => {
  const plan = CANONICAL_PLANS[entitlements.planId] || CANONICAL_PLANS.starter;
  const isAndroid = platform === 'android';
  const isDesktop = platform === 'desktop';

  const requiredPlanName = isAndroid 
    ? 'Starter + Mobile Add-on or Growth' 
    : 'Business or Growth';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl text-center space-y-6">
        {/* Device Icon Badge */}
        <div className="w-16 h-16 rounded-3xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400 mx-auto shadow-sm">
          {isAndroid ? <Smartphone className="w-8 h-8" /> : isDesktop ? <Monitor className="w-8 h-8" /> : <Globe className="w-8 h-8" />}
        </div>

        {/* Headline */}
        <div className="space-y-2">
          <span className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-bold uppercase tracking-wider">
            Device Entitlement Notice
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {isAndroid ? 'Android Access Not Permitted' : isDesktop ? 'Desktop Terminal Not Permitted' : 'Subscription Expired'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
            Your workspace is currently on the <strong>{plan.name}</strong> plan, which does not include access to the native {isAndroid ? 'Android mobile application' : 'Windows desktop software'}.
          </p>
        </div>

        {/* Canonical Matrix Summary */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-left text-xs space-y-2.5">
          <div className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">
            Canonical Device Access Rules
          </div>
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-blue-500" /> Web Browser:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Allowed
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5 text-indigo-500" /> Windows Desktop:</span>
            <span className={`font-bold flex items-center gap-1 ${
              entitlements.allowedPlatforms.includes('desktop') ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
            }`}>
              {entitlements.allowedPlatforms.includes('desktop') ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 text-rose-500" />}
              {entitlements.allowedPlatforms.includes('desktop') ? 'Allowed' : 'Requires Business / Growth'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5 text-emerald-500" /> Android Mobile APK:</span>
            <span className={`font-bold flex items-center gap-1 ${
              entitlements.allowedPlatforms.includes('android') ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
            }`}>
              {entitlements.allowedPlatforms.includes('android') ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 text-rose-500" />}
              {entitlements.allowedPlatforms.includes('android') ? 'Allowed' : 'Requires Mobile Add-on / Growth'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <a
            href="/pricing"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('/pricing');
            }}
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Upgrade Plan ({requiredPlanName})</span>
          </a>

          <button
            onClick={onRetry}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Recheck Authorization</span>
          </button>

          <button
            onClick={() => supabaseAuthService.logout()}
            className="w-full py-2 px-4 rounded-xl text-slate-500 hover:text-rose-600 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};

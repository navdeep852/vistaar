import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Calendar, 
  ShieldCheck, 
  Smartphone, 
  Monitor, 
  Globe, 
  ArrowRight, 
  CreditCard, 
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Layers,
  ChevronRight
} from 'lucide-react';
import { subscriptionService, WorkspaceEntitlements } from '../services/subscriptionService';
import { subscriptionPaymentService } from '../services/subscriptionPaymentService';
import { CANONICAL_PLANS, MOBILE_POS_ADDON, PlanId } from '../config/plans';
import { currentPlatform } from '../platform/platformDetection';
import { showToast } from '../components/Toast';

export const SubscriptionManagementView: React.FC = () => {
  const [entitlements, setEntitlements] = useState<WorkspaceEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingInterval, setBillingInterval] = useState<'annual' | 'monthly'>('annual');
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  const loadEntitlements = async (force = false) => {
    setLoading(true);
    try {
      const data = await subscriptionService.getEntitlements(force);
      setEntitlements(data);
    } catch (err) {
      console.error('Failed to load subscription entitlements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntitlements();
  }, []);

  const handleSelectUpgrade = async (planId: PlanId, includeMobileAddon = false) => {
    setProcessingPlan(planId);
    try {
      const result = await subscriptionPaymentService.initiatePlanCheckout(
        planId,
        billingInterval,
        includeMobileAddon
      );

      if (result.success) {
        if (planId === 'free_trial') {
          showToast('14-Day Free Trial is already active on this workspace.', 'info');
        } else {
          showToast(`Checkout initiated for ${CANONICAL_PLANS[planId].name}. (Order Ref: ${result.orderId})`, 'success');
        }
      } else {
        showToast(result.error || 'Failed to initiate checkout', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Payment initiation error', 'error');
    } finally {
      setProcessingPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-500 font-medium">Loading authoritative subscription entitlements...</p>
      </div>
    );
  }

  const planDef = entitlements ? CANONICAL_PLANS[entitlements.planId] || CANONICAL_PLANS.free_trial : CANONICAL_PLANS.free_trial;
  const isTrial = entitlements?.status === 'trialing';

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Active Subscription Summary Card */}
      <div className="bg-gradient-to-tr from-slate-900 via-indigo-950 to-blue-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-blue-500/30 border border-blue-400/30 text-blue-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{planDef.name}</span>
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                entitlements?.isValid ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}>
                {entitlements?.status || 'Active'}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              {planDef.name} Plan
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
              {planDef.description}
            </p>

            {/* Trial or Period End Notification */}
            <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-300">
              {isTrial ? (
                <div className="flex items-center gap-1.5 text-amber-300 font-semibold bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20">
                  <Clock className="w-4 h-4" />
                  <span>{entitlements?.trialRemainingDays} days remaining in your 14-day free trial</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <span>Renews on: {entitlements?.currentPeriodEnd ? new Date(entitlements.currentPeriodEnd).toLocaleDateString('en-IN') : 'Active'}</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => loadEntitlements(true)}
            className="self-start md:self-center flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer border border-white/20"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Status</span>
          </button>
        </div>

        {/* Canonical Device Entitlements Bar */}
        <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-300">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold">Web Cloud OS</div>
              <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Included
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold">Windows Desktop</div>
              <div className={`text-[11px] flex items-center gap-1 ${
                entitlements?.allowedPlatforms.includes('desktop') ? 'text-emerald-400' : 'text-slate-400'
              }`}>
                {entitlements?.allowedPlatforms.includes('desktop') ? (
                  <><CheckCircle2 className="w-3 h-3" /> Included</>
                ) : (
                  <><XCircle className="w-3 h-3 text-slate-400" /> Business / Growth Plan</>
                )}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold">Android Mobile APK</div>
              <div className={`text-[11px] flex items-center gap-1 ${
                entitlements?.allowedPlatforms.includes('android') ? 'text-emerald-400' : 'text-slate-400'
              }`}>
                {entitlements?.allowedPlatforms.includes('android') ? (
                  <><CheckCircle2 className="w-3 h-3" /> Included</>
                ) : (
                  <><XCircle className="w-3 h-3 text-slate-400" /> Mobile Add-on or Growth</>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Device Platform Notice for Currently Running Hardware */}
      <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-center justify-between text-xs text-blue-900 dark:text-blue-200">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span>
            Current Active Device: <strong className="capitalize">{currentPlatform.platform}</strong> &bull; Authorization: <strong>Verified by Supabase Backend</strong>
          </span>
        </div>
        <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hidden sm:inline">
          Workspace ID: {entitlements?.workspaceId.substring(0, 8)}...
        </span>
      </div>

      {/* Available Plans & Upgrades */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Upgrade or Change Subscription
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select an annual or monthly plan. All business records remain completely intact during upgrades.
            </p>
          </div>

          {/* Billing Interval Toggle */}
          <div className="bg-slate-200/70 dark:bg-slate-800/80 p-1 rounded-2xl flex items-center gap-1 border border-slate-300/60 dark:border-slate-700/60">
            <button
              onClick={() => setBillingInterval('annual')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                billingInterval === 'annual'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Annual (~20% off)
            </button>
            <button
              onClick={() => setBillingInterval('monthly')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                billingInterval === 'monthly'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        {/* Upgrade Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(['starter', 'starter_mobile', 'business', 'growth'] as PlanId[]).map((pid) => {
            const plan = CANONICAL_PLANS[pid];
            const isCurrent = entitlements?.planId === pid;
            const price = billingInterval === 'monthly' ? plan.priceMonthlyInr : plan.priceAnnualInr;

            return (
              <div
                key={pid}
                className={`p-5 rounded-3xl border flex flex-col justify-between transition-all ${
                  isCurrent
                    ? 'border-blue-600 bg-blue-50/20 dark:bg-blue-950/20 ring-1 ring-blue-600'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-lg'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{plan.name}</h4>
                    {plan.badge && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1 my-2">
                    <span className="text-2xl font-black text-slate-900 dark:text-white">
                      ₹{price.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs text-slate-500">
                      /{billingInterval === 'monthly' ? 'mo' : 'yr'}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                    {plan.tagline}
                  </p>

                  <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                    {plan.features.slice(0, 3).map((f, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-slate-600 dark:text-slate-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6">
                  {isCurrent ? (
                    <div className="w-full py-2 text-center text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-100/60 dark:bg-blue-950/60 rounded-xl">
                      Current Plan
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelectUpgrade(pid, pid === 'starter_mobile')}
                      disabled={processingPlan === pid}
                      className="w-full py-2 px-3 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {processingPlan === pid ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <span>Select {plan.name}</span>
                          <ArrowRight className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

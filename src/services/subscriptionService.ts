/**
 * VISTAAR BUSINESS OS — SUBSCRIPTION & ENTITLEMENT SERVICE
 * 
 * Authoritative client-side interface for subscription status, canonical plan enforcement,
 * and device access verification (Web, Windows Desktop, Android).
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { supabaseAuthService } from './supabaseAuth';
import { 
  CANONICAL_PLANS, 
  MOBILE_POS_ADDON,
  PlanId, 
  PlatformType, 
  SubscriptionStatus, 
  isPlatformPermitted,
  getPlatformAccessDisplay 
} from '../config/plans';

export interface WorkspaceEntitlements {
  workspaceId: string;
  planId: PlanId;
  planName: string;
  status: SubscriptionStatus;
  isValid: boolean;
  trialRemainingDays: number;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  billingInterval: 'annual' | 'monthly' | 'trial';
  cancelAtPeriodEnd: boolean;
  allowedPlatforms: PlatformType[];
  activeAddons: string[];
  maxUsers: number;
  maxBranches: number;
}

class SubscriptionService {
  private cachedEntitlements: WorkspaceEntitlements | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute local cache

  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  /**
   * Fetches authoritative workspace entitlements.
   * Leverages Supabase RPC get_workspace_entitlements() with local fallback.
   */
  public async getEntitlements(forceRefresh = false): Promise<WorkspaceEntitlements> {
    const wsId = this.getWorkspaceId();
    const now = Date.now();

    if (!forceRefresh && this.cachedEntitlements && (now - this.lastFetchTime < this.CACHE_TTL_MS)) {
      if (this.cachedEntitlements.workspaceId === wsId) {
        return this.cachedEntitlements;
      }
    }

    // Default fallback: 14-day free trial based on workspace creation timestamp or default
    const fallbackEntitlements: WorkspaceEntitlements = {
      workspaceId: wsId || 'local-workspace',
      planId: 'free_trial',
      planName: CANONICAL_PLANS.free_trial.name,
      status: 'trialing',
      isValid: true,
      trialRemainingDays: 14,
      trialEnd: new Date(Date.now() + 14 * 86400000).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 14 * 86400000).toISOString(),
      billingInterval: 'trial',
      cancelAtPeriodEnd: false,
      allowedPlatforms: ['web', 'desktop', 'android'],
      activeAddons: [],
      maxUsers: CANONICAL_PLANS.free_trial.maxUsers,
      maxBranches: CANONICAL_PLANS.free_trial.maxBranches,
    };

    if (!isSupabaseConfigured() || !wsId) {
      this.cachedEntitlements = fallbackEntitlements;
      this.lastFetchTime = now;
      return fallbackEntitlements;
    }

    try {
      // 1. Try authoritative RPC
      const { data, error } = await supabase.rpc('get_workspace_entitlements', {
        target_workspace_id: wsId,
      });

      if (!error && data) {
        const ent: WorkspaceEntitlements = {
          workspaceId: data.workspace_id,
          planId: (data.plan_id as PlanId) || 'free_trial',
          planName: data.plan_name || CANONICAL_PLANS[data.plan_id as PlanId]?.name || 'VISTAAR Plan',
          status: data.status as SubscriptionStatus,
          isValid: Boolean(data.is_valid),
          trialRemainingDays: Number(data.trial_remaining_days ?? 0),
          trialEnd: data.trial_end,
          currentPeriodEnd: data.current_period_end,
          billingInterval: data.billing_interval || 'annual',
          cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
          allowedPlatforms: (data.allowed_platforms || ['web']) as PlatformType[],
          activeAddons: data.active_addons || [],
          maxUsers: Number(data.max_users ?? 1),
          maxBranches: Number(data.max_branches ?? 1),
        };

        this.cachedEntitlements = ent;
        this.lastFetchTime = now;
        return ent;
      }

      // 2. Fallback: Query workspace_subscriptions table directly
      const { data: subData, error: subError } = await supabase
        .from('workspace_subscriptions')
        .select('*')
        .eq('workspace_id', wsId)
        .maybeSingle();

      if (!subError && subData) {
        const planId = (subData.plan_id as PlanId) || 'free_trial';
        const planDef = CANONICAL_PLANS[planId] || CANONICAL_PLANS.starter;
        const isTrial = subData.status === 'trialing';
        const trialEnd = subData.trial_end ? new Date(subData.trial_end).getTime() : now;
        const currentPeriodEnd = subData.current_period_end ? new Date(subData.current_period_end).getTime() : now;
        
        let isValid = false;
        let trialDays = 0;

        if (isTrial) {
          isValid = trialEnd >= now;
          trialDays = Math.max(0, Math.ceil((trialEnd - now) / 86400000));
        } else if (subData.status === 'active') {
          isValid = currentPeriodEnd >= now;
        }

        // Query active addons
        const { data: addonsData } = await supabase
          .from('subscription_addons')
          .select('addon_key')
          .eq('workspace_id', wsId)
          .eq('status', 'active')
          .gt('valid_until', new Date().toISOString());

        const activeAddons = (addonsData || []).map((a: any) => a.addon_key);
        const allowedPlatforms = [...planDef.allowedPlatforms];
        if (planId === 'starter' && activeAddons.includes('mobile_pos_addon') && !allowedPlatforms.includes('android')) {
          allowedPlatforms.push('android');
        }

        const ent: WorkspaceEntitlements = {
          workspaceId: wsId,
          planId,
          planName: planDef.name,
          status: subData.status,
          isValid,
          trialRemainingDays: trialDays,
          trialEnd: subData.trial_end,
          currentPeriodEnd: subData.current_period_end,
          billingInterval: subData.billing_interval,
          cancelAtPeriodEnd: subData.cancel_at_period_end,
          allowedPlatforms: isValid ? allowedPlatforms : ['web'],
          activeAddons,
          maxUsers: planDef.maxUsers,
          maxBranches: planDef.maxBranches,
        };

        this.cachedEntitlements = ent;
        this.lastFetchTime = now;
        return ent;
      }
    } catch (err) {
      console.warn('[SUBSCRIPTION] Failed to retrieve server entitlements, using secure baseline:', err);
    }

    this.cachedEntitlements = fallbackEntitlements;
    this.lastFetchTime = now;
    return fallbackEntitlements;
  }

  /**
   * Verifies if a specific device platform (web, desktop, android) is allowed
   * under the current workspace's subscription.
   */
  public async canAccessPlatform(platform: PlatformType): Promise<boolean> {
    const entitlements = await this.getEntitlements();
    if (!entitlements.isValid && platform !== 'web') {
      return false;
    }
    return isPlatformPermitted(platform, entitlements.planId, entitlements.activeAddons);
  }

  /**
   * Synchronous check against currently cached entitlements.
   */
  public canAccessPlatformSync(platform: PlatformType): boolean {
    if (platform === 'web') return true;
    if (!this.cachedEntitlements) return true; // optimistic until resolved
    if (!this.cachedEntitlements.isValid) return false;
    return isPlatformPermitted(
      platform, 
      this.cachedEntitlements.planId, 
      this.cachedEntitlements.activeAddons
    );
  }

  public getPlatformDisplay(planId: PlanId, hasMobileAddon = false) {
    return getPlatformAccessDisplay(planId, hasMobileAddon);
  }

  public getCanonicalPlan(planId: PlanId) {
    return CANONICAL_PLANS[planId] || CANONICAL_PLANS.free_trial;
  }

  public getAllCanonicalPlans() {
    return Object.values(CANONICAL_PLANS);
  }

  public getMobileAddon() {
    return MOBILE_POS_ADDON;
  }

  public clearCache() {
    this.cachedEntitlements = null;
    this.lastFetchTime = 0;
  }
}

export const subscriptionService = new SubscriptionService();

/**
 * VISTAAR BUSINESS OS — CANONICAL SUBSCRIPTION PLANS & ENTITLEMENT MATRIX
 * 
 * Central authoritative configuration for all subscription plans, add-ons,
 * device permissions, and commercial limits.
 * 
 * CANONICAL DEVICE ACCESS MATRIX:
 * | Plan                  | Web | Windows Desktop | Android |
 * |-----------------------|-----|-----------------|---------|
 * | Free Trial (14 days)  | Yes | Yes             | Yes     |
 * | Starter               | Yes | No              | No      |
 * | Starter + Mobile Addon| Yes | No              | Yes     |
 * | Business              | Yes | Yes             | No      |
 * | Growth                | Yes | Yes             | Yes     |
 * 
 * NOTE: ₹1 prices were temporary gateway testing prices and MUST NOT be used in production.
 * All prices below are configurable commercial base rates in INR (excluding statutory GST).
 */

export type PlatformType = 'web' | 'desktop' | 'android';

export type PlanId = 'free_trial' | 'starter' | 'starter_mobile' | 'business' | 'growth';

export type SubscriptionStatus = 
  | 'trialing'
  | 'active'
  | 'payment_pending'
  | 'past_due'
  | 'cancelled'
  | 'expired';

export interface PlanFeatureItem {
  name: string;
  included: boolean;
  limit?: string;
  tooltip?: string;
}

export interface SubscriptionPlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  description: string;
  badge?: string;
  popular?: boolean;
  trialDays?: number;
  priceAnnualInr: number;
  priceMonthlyInr: number;
  billingInterval: 'annual' | 'monthly' | 'trial';
  allowedPlatforms: PlatformType[];
  maxUsers: number; // 0 = unlimited
  maxBranches: number; // 0 = unlimited
  maxInvoicesPerMonth: number; // 0 = unlimited
  features: string[];
  supportsMobileAddon: boolean;
  ctaText: string;
  ctaPath: string;
}

export interface SubscriptionAddonDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  priceAnnualInr: number;
  priceMonthlyInr: number;
  grantsPlatforms: PlatformType[];
  eligibleBasePlans: PlanId[];
  features: string[];
}

export const CANONICAL_PLANS: Record<PlanId, SubscriptionPlanDefinition> = {
  free_trial: {
    id: 'free_trial',
    name: '14-Day Full Free Trial',
    tagline: 'Complete access to evaluate all VISTAAR capabilities on every device.',
    description: '14 days of unrestricted access across Web, Windows Desktop, and Android. No credit card required.',
    badge: '14 Days Free',
    popular: false,
    trialDays: 14,
    priceAnnualInr: 0,
    priceMonthlyInr: 0,
    billingInterval: 'trial',
    allowedPlatforms: ['web', 'desktop', 'android'],
    maxUsers: 2,
    maxBranches: 1,
    maxInvoicesPerMonth: 0, // unlimited during trial
    features: [
      'Full access to Web, Windows Desktop & Android',
      'GST & Non-GST Billing with thermal printing',
      'Real-time inventory & low-stock alerts',
      'Counter Sales POS with keyboard shortcuts',
      'Customer Udhari & payment reminders',
      'Daybook, Cashbook & Expense tracking',
      'Data encryption & automatic screen lock',
    ],
    supportsMobileAddon: false,
    ctaText: 'Start 14-Day Free Trial',
    ctaPath: '/signup',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'High-speed cloud billing & counter operations for single-outlet retail.',
    description: 'Designed for single-terminal stores, grocers, electronics, and boutique shops using the cloud web application.',
    popular: false,
    priceAnnualInr: 2499,
    priceMonthlyInr: 299,
    billingInterval: 'annual',
    allowedPlatforms: ['web'], // Web ONLY (No Desktop, No Android)
    maxUsers: 1,
    maxBranches: 1,
    maxInvoicesPerMonth: 0,
    features: [
      'Web browser access on any PC / Mac / Chromebook',
      'Unlimited GST & Non-GST tax invoices',
      'Inventory catalog & batch tracking',
      'Customer Udhari & WhatsApp payment reminders',
      'Daybook, Cashbook & basic financial ledger',
      'Standard email & community support',
    ],
    supportsMobileAddon: true,
    ctaText: 'Choose Starter',
    ctaPath: '/signup?plan=starter',
  },
  starter_mobile: {
    id: 'starter_mobile',
    name: 'Starter + Mobile Add-on',
    tagline: 'Web counter plus native Android APK for floor staff & barcode scanning.',
    description: 'Base Starter subscription bundled with the official Android mobile app for fast floor billing and inventory checks.',
    badge: 'Mobile + Web',
    popular: false,
    priceAnnualInr: 4498, // ₹2,499 base + ₹1,999 mobile add-on
    priceMonthlyInr: 498, // ₹299 base + ₹199 mobile add-on
    billingInterval: 'annual',
    allowedPlatforms: ['web', 'android'], // Web + Android (No Windows Desktop)
    maxUsers: 2,
    maxBranches: 1,
    maxInvoicesPerMonth: 0,
    features: [
      'Full Web browser access on PC/Mac',
      'Official Android Mobile APK with camera barcode scanner',
      'On-the-floor counter sales & stock verification',
      'Instant WhatsApp invoice dispatch from phone',
      'Customer Khata lookup on the go',
      'Priority email & WhatsApp ticketing',
    ],
    supportsMobileAddon: true,
    ctaText: 'Choose Starter + Mobile',
    ctaPath: '/signup?plan=starter_mobile',
  },
  business: {
    id: 'business',
    name: 'Business',
    tagline: 'High-throughput desktop terminal software with multi-branch control.',
    description: 'Engineered for busy retail counters and wholesale distributors requiring dedicated Windows Desktop software and multi-branch management.',
    badge: 'Most Popular',
    popular: true,
    priceAnnualInr: 5999,
    priceMonthlyInr: 699,
    billingInterval: 'annual',
    allowedPlatforms: ['web', 'desktop'], // Web + Desktop (No Android)
    maxUsers: 5,
    maxBranches: 3,
    maxInvoicesPerMonth: 0,
    features: [
      'Web access + Native Windows Desktop software (.exe)',
      'High-speed ESC/POS thermal receipt printing & cash drawer trigger',
      'POS keyboard hotkeys (F1-F12) for lightning-fast billing',
      'Multi-branch inventory transfers & centralized stock view',
      'Supplier purchase orders & goods receipt reconciliation',
      'Custom invoice template designer & tax settings',
      'Priority phone & WhatsApp onboarding assistance',
    ],
    supportsMobileAddon: false,
    ctaText: 'Choose Business',
    ctaPath: '/signup?plan=business',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    tagline: 'All-platform enterprise suite: Web, Windows Desktop, and Android.',
    description: 'Unrestricted enterprise operating system for growing distribution networks, chain stores, and high-volume multi-branch enterprises.',
    badge: 'All Platforms Included',
    popular: false,
    priceAnnualInr: 9999,
    priceMonthlyInr: 1199,
    billingInterval: 'annual',
    allowedPlatforms: ['web', 'desktop', 'android'], // Web + Desktop + Android
    maxUsers: 0, // unlimited
    maxBranches: 0, // unlimited
    maxInvoicesPerMonth: 0,
    features: [
      'Full all-platform license: Web + Windows Desktop + Android',
      'Unlimited users, custom RBAC permissions & branch locations',
      'Inter-branch stock requisitions & automated FIFO batches',
      'Enterprise sales analytics, margin insights & audit trail',
      'Full automated cloud backups with SHA-256 verification',
      'Custom domain & dedicated account manager',
      'SLA-backed 24/7 priority emergency support',
    ],
    supportsMobileAddon: false,
    ctaText: 'Choose Growth',
    ctaPath: '/signup?plan=growth',
  },
};

export const MOBILE_POS_ADDON: SubscriptionAddonDefinition = {
  id: 'addon_mobile_pos',
  key: 'mobile_pos_addon',
  name: 'Mobile POS & Barcode Scanner Add-on',
  description: 'Unlocks the native Android APK for floor sales, camera barcode scanning, and mobile invoice generation.',
  priceAnnualInr: 1999,
  priceMonthlyInr: 199,
  grantsPlatforms: ['android'],
  eligibleBasePlans: ['starter'],
  features: [
    'Native Android APK installation and updates',
    'High-speed camera barcode scanning for rapid item lookup',
    'On-floor mobile billing & direct thermal Bluetooth printing',
    'Mobile collection receipts with customer signature capture',
  ],
};

/**
 * Validates whether a platform is authorized based on canonical plan & addons.
 */
export function isPlatformPermitted(
  platform: PlatformType,
  planId: PlanId,
  activeAddons: string[] = []
): boolean {
  // Web is always permitted for any valid active plan or trial
  if (platform === 'web') return true;

  const plan = CANONICAL_PLANS[planId];
  if (!plan) return false;

  // If plan natively includes platform, permit
  if (plan.allowedPlatforms.includes(platform)) {
    return true;
  }

  // Check if Mobile Add-on is active and grants Android
  if (
    platform === 'android' &&
    planId === 'starter' &&
    activeAddons.includes('mobile_pos_addon')
  ) {
    return true;
  }

  return false;
}

/**
 * Returns human-readable platform availability badge for display.
 */
export function getPlatformAccessDisplay(planId: PlanId, hasMobileAddon = false) {
  if (planId === 'free_trial') {
    return {
      web: true,
      desktop: true,
      android: true,
      summary: 'Web, Windows Desktop & Android (14-day trial)',
    };
  }
  if (planId === 'starter') {
    if (hasMobileAddon) {
      return {
        web: true,
        desktop: false,
        android: true,
        summary: 'Web & Android Mobile',
      };
    }
    return {
      web: true,
      desktop: false,
      android: false,
      summary: 'Web Browser Only',
    };
  }
  if (planId === 'starter_mobile') {
    return {
      web: true,
      desktop: false,
      android: true,
      summary: 'Web & Android Mobile',
    };
  }
  if (planId === 'business') {
    return {
      web: true,
      desktop: true,
      android: false,
      summary: 'Web & Windows Desktop',
    };
  }
  if (planId === 'growth') {
    return {
      web: true,
      desktop: true,
      android: true,
      summary: 'All Platforms (Web, Windows Desktop, Android)',
    };
  }
  return { web: true, desktop: false, android: false, summary: 'Web Only' };
}

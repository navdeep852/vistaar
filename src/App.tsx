import React, { useState, useEffect } from 'react';
import { Loader2, AlertOctagon, RefreshCw, LogOut } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { Header } from './components/Header';
import { ToastContainer, showToast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabaseAuthService, AuthResolutionState } from './services/supabaseAuth';
import { productService, followUpService, notificationService, businessSettingsService } from './services/supabase';
import { store } from './services/store';
import { hasCurrentUserPermission } from './lib/permissions';
import { auditLogService } from './services/supabase/auditLogService';

// Views
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';

import { lazyWithRetry } from './lib/lazyWithRetry';

// Code-split secondary views with auto-recovery against deployment chunk skew
const AnalyticsView = lazyWithRetry(() => import('./views/AnalyticsView').then((m) => ({ default: m.AnalyticsView })), 'Analytics');
const AllBranchesAnalysisView = lazyWithRetry(() => import('./views/AllBranchesAnalysisView').then((m) => ({ default: m.AllBranchesAnalysisView })), 'All Branches Analysis');
const QuotationsView = lazyWithRetry(() => import('./views/QuotationsView').then((m) => ({ default: m.QuotationsView })), 'Quotations');
const InvoicesView = lazyWithRetry(() => import('./views/InvoicesView').then((m) => ({ default: m.InvoicesView })), 'Invoices');
const CustomersView = lazyWithRetry(() => import('./views/CustomersView').then((m) => ({ default: m.CustomersView })), 'Customers');
const UdhariView = lazyWithRetry(() => import('./views/UdhariView').then((m) => ({ default: m.UdhariView })), 'Udhari');
const ProductsView = lazyWithRetry(() => import('./views/ProductsView').then((m) => ({ default: m.ProductsView })), 'Products');
const StockView = lazyWithRetry(() => import('./views/StockView').then((m) => ({ default: m.StockView })), 'Stock');
const CounterSaleView = lazyWithRetry(() => import('./views/CounterSaleView').then((m) => ({ default: m.CounterSaleView })), 'Counter Sale');
const ExpensesView = lazyWithRetry(() => import('./views/ExpensesView').then((m) => ({ default: m.ExpensesView })), 'Expenses');
const DaybookView = lazyWithRetry(() => import('./views/DaybookView').then((m) => ({ default: m.DaybookView })), 'Daybook');
const CashbookView = lazyWithRetry(() => import('./views/CashbookView').then((m) => ({ default: m.CashbookView })), 'Cashbook');
const EwayBillsView = lazyWithRetry(() => import('./views/EwayBillsView').then((m) => ({ default: m.EwayBillsView })), 'E-way Bills');
const PurchaseOrdersView = lazyWithRetry(() => import('./views/PurchaseOrdersView').then((m) => ({ default: m.PurchaseOrdersView })), 'Purchase Orders');
const SupplierCatalogueView = lazyWithRetry(() => import('./views/SupplierCatalogueView').then((m) => ({ default: m.SupplierCatalogueView })), 'Supplier Catalogue');
const CategoriesView = lazyWithRetry(() => import('./views/CategoriesView').then((m) => ({ default: m.CategoriesView })), 'Categories');
const SuppliersView = lazyWithRetry(() => import('./views/SuppliersView').then((m) => ({ default: m.SuppliersView })), 'Suppliers');
const FinancialStatementsView = lazyWithRetry(() => import('./views/FinancialStatementsView').then((m) => ({ default: m.FinancialStatementsView })), 'Financial Statements');
const ProfitLossView = lazyWithRetry(() => import('./views/ProfitLossView').then((m) => ({ default: m.ProfitLossView })), 'Profit & Loss');
const FollowUpsView = lazyWithRetry(() => import('./views/FollowUpsView').then((m) => ({ default: m.FollowUpsView })), 'Follow-ups');
const FeedbackView = lazyWithRetry(() => import('./views/FeedbackView').then((m) => ({ default: m.FeedbackView })), 'Feedback');
const OffersView = lazyWithRetry(() => import('./views/OffersView').then((m) => ({ default: m.OffersView })), 'Offers');
const ReportsView = lazyWithRetry(() => import('./views/ReportsView').then((m) => ({ default: m.ReportsView })), 'Reports');
const SettingsView = lazyWithRetry(() => import('./views/SettingsView').then((m) => ({ default: m.SettingsView })), 'Settings');
const SalaryPayrollView = lazyWithRetry(() => import('./views/SalaryPayrollView').then((m) => ({ default: m.SalaryPayrollView })), 'Payroll');

// Public Marketing & Solutions Views
const PublicHomeView = lazyWithRetry(() => import('./views/public/PublicHomeView').then((m) => ({ default: m.PublicHomeView })), 'Public Home');
const FeatureDetailView = lazyWithRetry(() => import('./views/public/FeatureDetailView').then((m) => ({ default: m.FeatureDetailView })), 'Feature Details');
const PublicPricingView = lazyWithRetry(() => import('./views/public/PublicPricingView').then((m) => ({ default: m.PublicPricingView })), 'Public Pricing');
const PublicDownloadView = lazyWithRetry(() => import('./views/public/PublicDownloadView').then((m) => ({ default: m.PublicDownloadView })), 'Public Download');
const PublicBlogView = lazyWithRetry(() => import('./views/public/PublicBlogView').then((m) => ({ default: m.PublicBlogView })), 'Public Blog');
const PublicBlogPostView = lazyWithRetry(() => import('./views/public/PublicBlogPostView').then((m) => ({ default: m.PublicBlogPostView })), 'Public Blog Post');
const PublicFaqView = lazyWithRetry(() => import('./views/public/PublicFaqView').then((m) => ({ default: m.PublicFaqView })), 'Public FAQ');
const PublicComparisonView = lazyWithRetry(() => import('./views/public/PublicComparisonView').then((m) => ({ default: m.PublicComparisonView })), 'Public Comparison');
const PublicSecurityView = lazyWithRetry(() => import('./views/public/PublicSecurityView').then((m) => ({ default: m.PublicSecurityView })), 'Public Security');
const PublicAboutView = lazyWithRetry(() => import('./views/public/PublicAboutView').then((m) => ({ default: m.PublicAboutView })), 'Public About');
const PublicContactView = lazyWithRetry(() => import('./views/public/PublicContactView').then((m) => ({ default: m.PublicContactView })), 'Public Contact');
const PublicLegalView = lazyWithRetry(() => import('./views/public/PublicLegalView').then((m) => ({ default: m.PublicLegalView })), 'Public Legal');
const SubscriptionManagementView = lazyWithRetry(() => import('./views/SubscriptionManagementView').then((m) => ({ default: m.SubscriptionManagementView })), 'Subscription');

import { usePublicPath, navigateTo } from './lib/publicRouter';
import { subscriptionService, WorkspaceEntitlements } from './services/subscriptionService';
import { currentPlatform } from './platform/platformDetection';
import { PlatformUpgradeRequiredScreen } from './components/PlatformUpgradeRequiredScreen';

import { ThemeProvider } from './context/ThemeContext';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { BranchProvider } from './context/BranchContext';
import { ScreenLockProvider, useScreenLock } from './context/ScreenLockContext';
import { ScreenLockOverlay } from './components/ScreenLockOverlay';


// Helper to resolve activeTab from path
const resolveTabFromPath = (path: string): string => {
  if (path === '/app' || path === '/app/' || path === '/app/dashboard') return 'dashboard';
  if (path.startsWith('/app/')) {
    const sub = path.replace(/^\/app\//, '').replace(/\/$/, '');
    if (sub === 'inventory') return 'stock';
    if (sub === 'invoicing' || sub === 'billing') return 'invoices';
    if (sub === 'payroll') return 'salary-payroll';
    return sub;
  }
  return 'dashboard';
};

const LoadingFallback: React.FC = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in font-sans">
    <div className="relative flex items-center justify-center mb-6">
      <img
        src="/Vistaar_Icon_logo.png"
        alt="VISTAAR"
        className="w-16 h-16 object-contain drop-shadow-md animate-pulse"
      />
    </div>
    <div className="flex items-center gap-2 mb-2">
      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
        Loading VISTAAR...
      </h2>
    </div>
  </div>
);

function MainAppContent() {
  const { isLocked } = useScreenLock();
  const currentPublicPath = usePublicPath();
  const [authStatus, setAuthStatus] = useState<AuthResolutionState>(supabaseAuthService.getAuthResolutionState());
  const [resolutionError, setResolutionError] = useState<string | null>(supabaseAuthService.getResolutionError());
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('code') && params.has('state')) {
        return 'settings';
      }
      const path = window.location.pathname;
      if (path.startsWith('/app')) {
        return resolveTabFromPath(path);
      }
    }
    return 'dashboard';
  });

  // Sync activeTab when navigating via back/forward or route changes to /app/...
  useEffect(() => {
    if (currentPublicPath.startsWith('/app')) {
      const newTab = resolveTabFromPath(currentPublicPath);
      setActiveTab(newTab);
    }
  }, [currentPublicPath]);
  const [modalToOpen, setModalToOpen] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | undefined>(undefined);

  const [lowStockCount, setLowStockCount] = useState(0);
  const [pendingFollowupsCount, setPendingFollowupsCount] = useState(0);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  const [entitlements, setEntitlements] = useState<WorkspaceEntitlements | null>(null);
  const [entitlementsLoaded, setEntitlementsLoaded] = useState(false);


  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('vistaar_desktop_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vistaar_desktop_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  const { isWorkspaceActive } = useWorkspace();

  useEffect(() => {
    supabaseAuthService.handleAuthRedirect();
    const unsubscribeAuth = supabaseAuthService.subscribe(() => {
      setAuthStatus(supabaseAuthService.getAuthResolutionState());
      setResolutionError(supabaseAuthService.getResolutionError());
    });
    supabaseAuthService.initializeAuth();
    return unsubscribeAuth;
  }, []);

  // Native mobile hardware back button & app lifecycle handling (iOS/Android)
  useEffect(() => {
    const win = typeof window !== 'undefined' ? (window as any) : null;
    let removeBackListener: (() => void) | null = null;
    let removeStateListener: (() => void) | null = null;

    if (win?.Capacitor?.isNativePlatform()) {
      import('@capacitor/app').then(({ App: CapApp }) => {
        // Android hardware back button
        CapApp.addListener('backButton', () => {
          if (modalToOpen) {
            setModalToOpen(null);
          } else if (activeTab !== 'dashboard') {
            setActiveTab('dashboard');
          } else {
            CapApp.minimizeApp();
          }
        }).then((handle) => {
          removeBackListener = () => handle.remove();
        });

        // iOS & Android lifecycle: foreground / background transitions
        CapApp.addListener('appStateChange', (state) => {
          if (state.isActive) {
            // App brought to foreground from background or lock screen
            window.dispatchEvent(new CustomEvent('vistaar:app_resumed'));
          }
        }).then((handle) => {
          removeStateListener = () => handle.remove();
        });
      }).catch(() => {});
    }

    return () => {
      if (removeBackListener) removeBackListener();
      if (removeStateListener) removeStateListener();
    };
  }, [modalToOpen, activeTab]);

  useEffect(() => {
    const fetchMetrics = async () => {
      if (authStatus !== 'ready' || !supabaseAuthService.isAuthenticated()) return;
      try {
        const { data: products } = await productService.getProducts();
        const lowStock = (products || []).filter((p: any) => (p.current_stock ?? p.currentStock ?? 0) <= (p.minimum_stock ?? p.minimumStock ?? 0)).length;
        setLowStockCount(lowStock);

        const { data: followUps } = await followUpService.getFollowUps({ status: 'Pending' });
        setPendingFollowupsCount((followUps || []).length);

        const { count: unread } = await notificationService.getUnreadCount();
        setUnreadNotifsCount(unread || 0);
      } catch (err) {
        console.error('Failed to load metrics from Supabase:', err);
      }
    };

    fetchMetrics();
    window.addEventListener('vistaar:app_resumed', fetchMetrics);
    const interval = setInterval(fetchMetrics, 30000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('vistaar:app_resumed', fetchMetrics);
    };
  }, [authStatus]);

  // Proactively hydrate business settings into store and auth profile for the active workspace
  useEffect(() => {
    if (authStatus === 'ready' && supabaseAuthService.isAuthenticated()) {
      businessSettingsService.getSettings().then(({ success, data }) => {
        if (success && data) {
          store.updateSettings(data);
          if (data.businessName) {
            supabaseAuthService.setBusinessName(data.businessName);
          }
        }
      }).catch((err) => {
        console.warn('[APP] Background business settings hydration notice:', err);
      });
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus === 'ready' && supabaseAuthService.isAuthenticated()) {
      const preloadSecondaryViews = () => {
        // Pre-warm high frequency views in background during idle periods
        import('./views/InvoicesView').catch(() => {});
        import('./views/ProductsView').catch(() => {});
        import('./views/UdhariView').catch(() => {});
      };

      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        const handle = (window as any).requestIdleCallback(preloadSecondaryViews, { timeout: 3500 });
        return () => (window as any).cancelIdleCallback(handle);
      } else {
        const timer = setTimeout(preloadSecondaryViews, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [authStatus]);

  // Hydrate subscription entitlements
  useEffect(() => {
    if (authStatus === 'ready' && supabaseAuthService.isAuthenticated()) {
      subscriptionService.getEntitlements().then((ent) => {
        setEntitlements(ent);
        setEntitlementsLoaded(true);
      }).catch((err) => {
        console.warn('[SUBSCRIPTION] Notice on initial load:', err);
        setEntitlementsLoaded(true);
      });
    }
  }, [authStatus]);

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in font-sans">
        <div className="relative flex items-center justify-center mb-6">
          <img
            src="/Vistaar_Icon_logo.png"
            alt="VISTAAR"
            className="w-16 h-16 object-contain drop-shadow-md animate-pulse"
          />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            Initializing VISTAAR
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
          Verifying authenticated session and authoritative workspace authorization...
        </p>
      </div>
    );
  }

  if (authStatus === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-6 shadow-sm">
          <AlertOctagon className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-2">
          Workspace Authorization Failed
        </h2>
        <p className="text-xs text-rose-700 dark:text-rose-300 max-w-md bg-rose-50 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-200 dark:border-rose-900/50 mb-6 break-words">
          {resolutionError || '[WORKSPACE RESOLUTION FAILED] Authoritative workspace ID could not be determined.'}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => supabaseAuthService.initializeAuth()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Resolution
          </button>
          <button
            onClick={() => supabaseAuthService.logout()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const renderPublicRoute = (path: string) => {
    if (path === '/login' || path === '/signup') {
      return <LoginView onSuccess={() => supabaseAuthService.initializeAuth()} />;
    }
    if (path === '/pricing') {
      return <PublicPricingView />;
    }
    if (path === '/download') {
      return <PublicDownloadView />;
    }
    if (path === '/blog') {
      return <PublicBlogView />;
    }
    if (path.startsWith('/blog/')) {
      const slug = path.replace(/^\/blog\//, '').replace(/\/$/, '');
      return <PublicBlogPostView slug={slug} />;
    }
    if (path === '/faq') {
      return <PublicFaqView />;
    }
    if (path === '/compare/billing-vs-inventory-software' || path.startsWith('/compare')) {
      return <PublicComparisonView />;
    }
    if (path.startsWith('/features')) {
      const slug = path.replace(/^\/features\/?/, '').replace(/\/$/, '') || 'billing-invoicing';
      return <FeatureDetailView slug={slug} />;
    }
    if (path === '/security') {
      return <PublicSecurityView />;
    }
    if (path === '/about') {
      return <PublicAboutView />;
    }
    if (path === '/contact') {
      return <PublicContactView />;
    }
    if (path === '/privacy' || path === '/privacy-policy') {
      return <PublicLegalView type="privacy" />;
    }
    if (path === '/terms') {
      return <PublicLegalView type="terms" />;
    }
    if (path === '/refund-policy') {
      return <PublicLegalView type="refund" />;
    }
    return null;
  };

  if (authStatus === 'unauthenticated' || supabaseAuthService.isRecoverySession()) {
    const isNativePlatform = typeof window !== 'undefined' && (window as any)?.Capacitor?.isNativePlatform();

    // If an unauthenticated user attempts to access /app or /app/..., direct to login
    if (currentPublicPath === '/app' || currentPublicPath.startsWith('/app/')) {
      return (
        <React.Suspense fallback={<LoadingFallback />}>
          <LoginView
            onSuccess={() => {
              supabaseAuthService.initializeAuth();
              navigateTo(currentPublicPath);
            }}
          />
        </React.Suspense>
      );
    }

    const publicView = renderPublicRoute(currentPublicPath);
    if (publicView) {
      return (
        <React.Suspense fallback={<LoadingFallback />}>
          {publicView}
        </React.Suspense>
      );
    }

    // Default route: Native mobile app opens to Login; web browser opens to PublicHomeView
    if (isNativePlatform) {
      return (
        <React.Suspense fallback={<LoadingFallback />}>
          <LoginView onSuccess={() => supabaseAuthService.initializeAuth()} />
        </React.Suspense>
      );
    }

    return (
      <React.Suspense fallback={<LoadingFallback />}>
        <PublicHomeView />
      </React.Suspense>
    );
  }

  // Dedicated subscription & billing management routes
  if (currentPublicPath === '/account/subscription' || currentPublicPath === '/account/billing') {
    return (
      <React.Suspense fallback={<LoadingFallback />}>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-10 font-sans">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  navigateTo('/app');
                  setActiveTab('settings');
                }}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                &larr; Back to Business OS
              </button>
            </div>
            <SubscriptionManagementView />
          </div>
        </div>
      </React.Suspense>
    );
  }

  // Marketing homepage passthrough for authenticated users explicitly viewing marketing home
  const isNativePlatform = typeof window !== 'undefined' && (window as any)?.Capacitor?.isNativePlatform();
  if (!isNativePlatform && (currentPublicPath === '/' || currentPublicPath === '')) {
    return (
      <React.Suspense fallback={<LoadingFallback />}>
        <PublicHomeView />
      </React.Suspense>
    );
  }

  // Marketing view passthrough for authenticated users explicitly viewing public landing pages
  const authedPublicView = renderPublicRoute(currentPublicPath);
  if (authedPublicView) {
    // If authenticated and visiting login/signup, redirect to app workspace
    if (currentPublicPath === '/login' || currentPublicPath === '/signup') {
      navigateTo('/app');
      return null;
    }
    return (
      <React.Suspense fallback={<LoadingFallback />}>
        {authedPublicView}
      </React.Suspense>
    );
  }

  // Native device access entitlement guard (Android APK & Windows Desktop)
  if (entitlementsLoaded && entitlements) {
    const platform = currentPlatform.platform;
    if ((platform === 'android' || platform === 'desktop') && !subscriptionService.canAccessPlatformSync(platform)) {
      return (
        <PlatformUpgradeRequiredScreen
          platform={platform}
          entitlements={entitlements}
          onRetry={() => {
            subscriptionService.getEntitlements(true).then((ent) => setEntitlements(ent));
          }}
        />
      );
    }
  }

  const handleSafeSetActiveTab = (tab: string) => {
    setModalToOpen(null);

    // Route guard for Analytics & All Branches Analysis
    if ((tab === 'analytics' || tab === 'all-branches-analysis') && !hasCurrentUserPermission('analytics.view')) {
      showToast('Access Denied: Analytics is restricted to Workspace Owners.', 'error');
      auditLogService.logSecurityEvent(
        'UNAUTHORIZED_ANALYTICS_ATTEMPT',
        'Unauthorized navigation to Analytics',
        'DENIED',
        { attemptedTab: tab }
      );
      setActiveTab('dashboard');
      return;
    }

    // Route guard for Financial Statements
    if (
      (tab === 'financial-statements' || tab === 'profit-loss' || tab === 'reports') &&
      !hasCurrentUserPermission('financial_statements.view')
    ) {
      showToast('Access Denied: Financial statements are restricted to Workspace Owners.', 'error');
      auditLogService.logSecurityEvent(
        'UNAUTHORIZED_FINANCIAL_STATEMENTS_ATTEMPT',
        'Unauthorized navigation to Financial Statements',
        'DENIED',
        { attemptedTab: tab }
      );
      setActiveTab('dashboard');
      return;
    }

    setActiveTab(tab);

    // Keep browser URL aligned with /app or /app/[tab]
    if (typeof window !== 'undefined') {
      const targetPath = tab === 'dashboard' ? '/app' : `/app/${tab}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath);
      }
    }
  };

  const handleOpenQuickModal = (modalType: string) => {
    if (modalType === 'quotation') {
      handleSafeSetActiveTab('quotations');
      setModalToOpen('quotation');
    } else if (modalType === 'invoice') {
      handleSafeSetActiveTab('invoices');
      setModalToOpen('invoice');
    } else if (modalType === 'customer') {
      handleSafeSetActiveTab('customers');
      setModalToOpen('customer');
    } else if (modalType === 'product') {
      handleSafeSetActiveTab('products');
      setModalToOpen('product');
    } else if (modalType === 'payment') {
      handleSafeSetActiveTab('invoices');
    }
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView setActiveTab={handleSafeSetActiveTab} openModal={handleOpenQuickModal} />;
      case 'analytics':
        if (!hasCurrentUserPermission('analytics.view')) {
          return <DashboardView setActiveTab={handleSafeSetActiveTab} openModal={handleOpenQuickModal} />;
        }
        return <AnalyticsView onNavigateTab={handleSafeSetActiveTab} />;
      case 'all-branches-analysis':
        if (!hasCurrentUserPermission('analytics.view')) {
          return <DashboardView setActiveTab={handleSafeSetActiveTab} openModal={handleOpenQuickModal} />;
        }
        return <AllBranchesAnalysisView onNavigateTab={handleSafeSetActiveTab} />;
      case 'quotations':
        return (
          <QuotationsView
            initialOpenCreate={modalToOpen === 'quotation'}
            onNavigateTab={handleSafeSetActiveTab}
            activeTab={activeTab}
          />
        );
      case 'invoices':
        return (
          <InvoicesView
            initialOpenCreate={modalToOpen === 'invoice'}
            onNavigateTab={handleSafeSetActiveTab}
            activeTab={activeTab}
          />
        );
      case 'eway':
        return <EwayBillsView />;
      case 'purchase-orders':
        return <PurchaseOrdersView />;
      case 'supplier-catalogue':
        return <SupplierCatalogueView />;

      case 'customers':
        return (
          <CustomersView
            initialOpenCreate={modalToOpen === 'customer'}
            onNavigateTab={handleSafeSetActiveTab}
            activeTab={activeTab}
          />
        );
      case 'udhari':
        return <UdhariView />;
      case 'payments':
        return <InvoicesView onNavigateTab={handleSafeSetActiveTab} activeTab={activeTab} />;
      case 'products':
        return (
          <ProductsView
            initialOpenCreate={modalToOpen === 'product'}
            onNavigateTab={handleSafeSetActiveTab}
            activeTab={activeTab}
            initialCategoryFilter={selectedCategoryFilter}
          />
        );
      case 'categories':
        return (
          <CategoriesView
            onNavigateTab={(tab, catId) => {
              setSelectedCategoryFilter(catId);
              handleSafeSetActiveTab(tab);
            }}
          />
        );
      case 'suppliers':
        return (
          <SuppliersView
            onNavigateTab={(tab) => {
              handleSafeSetActiveTab(tab);
            }}
          />
        );
      case 'stock':
        return <StockView onNavigateTab={handleSafeSetActiveTab} activeTab={activeTab} />;
      case 'counter-sale':
        return <CounterSaleView onNavigateTab={handleSafeSetActiveTab} activeTab={activeTab} />;
      case 'expenses':
        return <ExpensesView onNavigateTab={handleSafeSetActiveTab} activeTab={activeTab} />;
      case 'daybook':
        return <DaybookView />;
      case 'cashbook':
        return <CashbookView />;
      case 'financial-statements':
      case 'profit-loss':
      case 'reports':
        if (!hasCurrentUserPermission('financial_statements.view')) {
          return <DashboardView setActiveTab={handleSafeSetActiveTab} openModal={handleOpenQuickModal} />;
        }
        return <FinancialStatementsView onNavigateTab={handleSafeSetActiveTab} />;
      case 'salary-payroll':
      case 'payroll':
        return <SalaryPayrollView onNavigateTab={handleSafeSetActiveTab} activeTab={activeTab} />;
      case 'follow-ups':
        return <FollowUpsView />;
      case 'feedback':
        return <FeedbackView />;
      case 'offers':
        return <OffersView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView setActiveTab={handleSafeSetActiveTab} openModal={handleOpenQuickModal} />;
    }
  };

  return (
    <div className={`min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200 ${isLocked ? 'overflow-hidden' : ''}`}>
      {/* Protected Business OS Surface (Shielded and blurred while screen is locked) */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${
          isLocked ? 'filter blur-md pointer-events-none select-none opacity-20 transition-all duration-300' : ''
        }`}
        aria-hidden={isLocked ? 'true' : undefined}
      >
        {/* Desktop Sidebar — Hidden when Workspace Mode is Active */}
        {!isWorkspaceActive && (
          <Sidebar
            activeTab={activeTab}
            setActiveTab={handleSafeSetActiveTab}
            lowStockCount={lowStockCount}
            pendingFollowupsCount={pendingFollowupsCount}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={handleToggleSidebar}
          />
        )}

        {/* Mobile Top Header & Bottom Nav — Hidden in Workspace Mode */}
        {!isWorkspaceActive && (
          <MobileNav
            activeTab={activeTab}
            setActiveTab={handleSafeSetActiveTab}
            unreadNotifsCount={unreadNotifsCount}
          />
        )}

        {/* Main Content Area — Full viewport width when Workspace Mode is active */}
        <div className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ${
          isWorkspaceActive
            ? 'w-full pl-0 pt-0'
            : `${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'} pt-[calc(3.75rem+env(safe-area-inset-top))] lg:pt-0`
        }`}>
          {!isWorkspaceActive && (
            <Header
              activeTab={activeTab}
              setActiveTab={handleSafeSetActiveTab}
              openModal={handleOpenQuickModal}
              isSidebarCollapsed={isSidebarCollapsed}
              onToggleSidebar={handleToggleSidebar}
            />
          )}

          <main className={`flex-1 ${isWorkspaceActive ? 'p-0 w-full max-w-full' : 'p-3 sm:p-6 lg:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8 max-w-7xl w-full mx-auto'}`}>
            <ErrorBoundary
              key={activeTab}
              moduleName={activeTab.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              onReset={() => setActiveTab('dashboard')}
            >
              <React.Suspense
                fallback={
                  <div className="flex flex-col items-center justify-center min-h-[360px] w-full text-slate-400 dark:text-slate-500 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    <span className="text-xs font-medium tracking-wide">Loading module...</span>
                  </div>
                }
              >
                {renderActiveView()}
              </React.Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      {/* Global Toast Container */}
      <ToastContainer />

      {/* Automatic Screen Lock Security Overlay */}
      <ScreenLockOverlay />
    </div>

  );
}

export function App() {
  return (
    <ThemeProvider>
      <WorkspaceProvider>
        <BranchProvider>
          <ScreenLockProvider>
            <MainAppContent />
          </ScreenLockProvider>
        </BranchProvider>
      </WorkspaceProvider>
    </ThemeProvider>
  );
}

export default App;

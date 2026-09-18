import React, { useState, useEffect } from 'react';
import { Loader2, AlertOctagon, RefreshCw, LogOut } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { Header } from './components/Header';
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabaseAuthService, AuthResolutionState } from './services/supabaseAuth';
import { productService, followUpService, notificationService } from './services/supabase';

// Views
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { AnalyticsView } from './views/AnalyticsView';
import { QuotationsView } from './views/QuotationsView';
import { InvoicesView } from './views/InvoicesView';
import { CustomersView } from './views/CustomersView';
import { UdhariView } from './views/UdhariView';
import { ProductsView } from './views/ProductsView';
import { StockView } from './views/StockView';
import { CounterSaleView } from './views/CounterSaleView';
import { ExpensesView } from './views/ExpensesView';
import { DaybookView } from './views/DaybookView';
import { CashbookView } from './views/CashbookView';
import { EwayBillsView } from './views/EwayBillsView';
import { PurchaseOrdersView } from './views/PurchaseOrdersView';
import { SupplierCatalogueView } from './views/SupplierCatalogueView';





import { CategoriesView } from './views/CategoriesView';
import { SuppliersView } from './views/SuppliersView';
import { ProfitLossView } from './views/ProfitLossView';
import { FollowUpsView } from './views/FollowUpsView';
import { FeedbackView } from './views/FeedbackView';
import { OffersView } from './views/OffersView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';

import { ThemeProvider } from './context/ThemeContext';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';

function MainAppContent() {
  const [authStatus, setAuthStatus] = useState<AuthResolutionState>(supabaseAuthService.getAuthResolutionState());
  const [resolutionError, setResolutionError] = useState<string | null>(supabaseAuthService.getResolutionError());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [modalToOpen, setModalToOpen] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | undefined>(undefined);

  const [lowStockCount, setLowStockCount] = useState(0);
  const [pendingFollowupsCount, setPendingFollowupsCount] = useState(0);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

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
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [authStatus]);

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
        <div className="relative flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-500/25 animate-pulse">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-1">
          Initializing VISTAAR
        </h2>
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

  if (authStatus === 'unauthenticated' || supabaseAuthService.isRecoverySession()) {
    return <LoginView onSuccess={() => supabaseAuthService.initializeAuth()} />;
  }

  const handleOpenQuickModal = (modalType: string) => {
    if (modalType === 'quotation') {
      setActiveTab('quotations');
      setModalToOpen('quotation');
    } else if (modalType === 'invoice') {
      setActiveTab('invoices');
      setModalToOpen('invoice');
    } else if (modalType === 'customer') {
      setActiveTab('customers');
      setModalToOpen('customer');
    } else if (modalType === 'product') {
      setActiveTab('products');
      setModalToOpen('product');
    } else if (modalType === 'payment') {
      setActiveTab('invoices');
    }
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView setActiveTab={setActiveTab} openModal={handleOpenQuickModal} />;
      case 'analytics':
        return <AnalyticsView onNavigateTab={setActiveTab} />;
      case 'quotations':
        return (
          <QuotationsView
            initialOpenCreate={modalToOpen === 'quotation'}
            onNavigateTab={setActiveTab}
            activeTab={activeTab}
          />
        );
      case 'invoices':
        return (
          <InvoicesView
            initialOpenCreate={modalToOpen === 'invoice'}
            onNavigateTab={setActiveTab}
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
            onNavigateTab={setActiveTab}
            activeTab={activeTab}
          />
        );
      case 'udhari':
        return <UdhariView />;
      case 'payments':
        return <InvoicesView onNavigateTab={setActiveTab} activeTab={activeTab} />;
      case 'products':
        return (
          <ProductsView
            initialOpenCreate={modalToOpen === 'product'}
            onNavigateTab={setActiveTab}
            activeTab={activeTab}
            initialCategoryFilter={selectedCategoryFilter}
          />
        );
      case 'categories':
        return (
          <CategoriesView
            onNavigateTab={(tab, catId) => {
              setSelectedCategoryFilter(catId);
              setActiveTab(tab);
            }}
          />
        );
      case 'suppliers':
        return (
          <SuppliersView
            onNavigateTab={(tab) => {
              setActiveTab(tab);
            }}
          />
        );
      case 'stock':
        return <StockView onNavigateTab={setActiveTab} activeTab={activeTab} />;
      case 'counter-sale':
        return <CounterSaleView onNavigateTab={setActiveTab} activeTab={activeTab} />;
      case 'expenses':
        return <ExpensesView onNavigateTab={setActiveTab} activeTab={activeTab} />;
      case 'daybook':
        return <DaybookView />;
      case 'cashbook':
        return <CashbookView />;
      case 'profit-loss':


        return <ProfitLossView />;
      case 'follow-ups':
        return <FollowUpsView />;
      case 'feedback':
        return <FeedbackView />;
      case 'offers':
        return <OffersView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView setActiveTab={setActiveTab} openModal={handleOpenQuickModal} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Desktop Sidebar — Hidden when Workspace Mode is Active */}
      {!isWorkspaceActive && (
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setModalToOpen(null);
            setActiveTab(tab);
          }}
          lowStockCount={lowStockCount}
          pendingFollowupsCount={pendingFollowupsCount}
        />
      )}

      {/* Mobile Top Header & Bottom Nav — Hidden in Workspace Mode */}
      {!isWorkspaceActive && (
        <MobileNav
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setModalToOpen(null);
            setActiveTab(tab);
          }}
          unreadNotifsCount={unreadNotifsCount}
        />
      )}

      {/* Main Content Area — Full viewport width when Workspace Mode is active */}
      <div className={`flex-1 flex flex-col min-w-0 ${isWorkspaceActive ? 'w-full pl-0 pt-0' : 'lg:pl-64 pt-14 lg:pt-0'}`}>
        {!isWorkspaceActive && (
          <Header
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setModalToOpen(null);
              setActiveTab(tab);
            }}
            openModal={handleOpenQuickModal}
          />
        )}

        <main className={`flex-1 ${isWorkspaceActive ? 'p-0 w-full max-w-full' : 'p-4 sm:p-8 max-w-7xl w-full mx-auto'}`}>
          <ErrorBoundary
            key={activeTab}
            moduleName={activeTab.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            onReset={() => setActiveTab('dashboard')}
          >
            {renderActiveView()}
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Toast Container */}
      <ToastContainer />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <WorkspaceProvider>
        <MainAppContent />
      </WorkspaceProvider>
    </ThemeProvider>
  );
}

export default App;

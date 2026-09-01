import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { Header } from './components/Header';
import { ToastContainer } from './components/Toast';
import { supabaseAuthService } from './services/supabaseAuth';
import { productService, followUpService, notificationService } from './services/supabase';

// Views
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
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
  const [isAuthenticated, setIsAuthenticated] = useState(supabaseAuthService.isAuthenticated());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [modalToOpen, setModalToOpen] = useState<string | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | undefined>(undefined);

  const [lowStockCount, setLowStockCount] = useState(0);
  const [pendingFollowupsCount, setPendingFollowupsCount] = useState(0);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  const { isWorkspaceActive } = useWorkspace();

  useEffect(() => {
    const unsubscribeAuth = supabaseAuthService.subscribe(() => {
      setIsAuthenticated(supabaseAuthService.isAuthenticated());
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!supabaseAuthService.isAuthenticated()) return;
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
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <LoginView onSuccess={() => setIsAuthenticated(true)} />;
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
          {renderActiveView()}
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

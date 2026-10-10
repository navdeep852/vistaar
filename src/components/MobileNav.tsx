import React, { useState, useEffect } from 'react';
import {
  Menu,
  X,
  Search,
  LayoutDashboard,
  FileText,
  Users,
  Package,
  MoreHorizontal,
  Receipt,
  CreditCard,
  Boxes,
  ShoppingBag,
  TrendingDown,
  PieChart,
  CalendarCheck,
  Star,
  Tag,
  Settings,
  Scale,
  LogOut,
  BookOpen,
  Wallet,
  Truck,
  ShoppingCart,
  BarChart3,
  Banknote,
  ArrowLeft,
  Globe2,
} from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  analytics: 'Analytics',
  'all-branches-analysis': 'All Branches Analysis',
  quotations: 'Quotations',
  invoices: 'Invoices',
  eway: 'E-Way Bills',
  customers: 'Customers',
  udhari: 'Udhari Ledger',
  payments: 'Payments',
  'purchase-orders': 'Purchase Orders',
  'supplier-catalogue': 'Supplier Catalogue',
  suppliers: 'Suppliers',
  products: 'Inventory',
  stock: 'Stock Movement',
  'counter-sale': 'Counter Sale',
  'profit-loss': 'Financial Statements',
  'financial-statements': 'Financial Statements',
  'salary-payroll': 'Salary & Payroll',
  expenses: 'Expenses',
  daybook: 'Daybook Journal',
  cashbook: 'Cashbook',
  'follow-ups': 'Follow-ups',
  feedback: 'Customer Feedback',
  offers: 'Offers',
  settings: 'Settings',
};




import { supabaseAuthService } from '../services/supabaseAuth';
const logoDarkText = '/Vistaar_Logo_With_Name.png';
const logoLightText = '/Vistaar_Logo_With_Name_Light.png';
const logoIcon = '/Vistaar_Icon_logo.png';

import { ThemeToggle } from './ThemeToggle';
import { UserAvatar } from './UserAvatar';
import { BranchSwitcher } from './BranchSwitcher';
import { useTheme } from '../context/ThemeContext';
import { hasCurrentUserPermission } from '../lib/permissions';

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  unreadNotifsCount?: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  setActiveTab,
  unreadNotifsCount = 0,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [user, setUser] = useState(supabaseAuthService.getUser());
  const { theme } = useTheme();

  useEffect(() => {
    const updateAuth = () => setUser(supabaseAuthService.getUser());
    updateAuth();
    return supabaseAuthService.subscribe(updateAuth);
  }, []);

  const logoFullName = theme === 'dark' ? logoLightText : logoDarkText;

  const bottomTabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'invoices', label: 'Invoices', icon: Receipt },
    { id: 'products', label: 'Inventory', icon: Package },
    { id: 'udhari', label: 'Udhari', icon: Scale },
  ];

  const rawDrawerItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'all-branches-analysis', label: 'All Branches Analysis', icon: Globe2 },
    { id: 'follow-ups', label: 'Follow-ups', icon: CalendarCheck },
    { id: 'quotations', label: 'Quotations', icon: FileText },
    { id: 'invoices', label: 'Invoices', icon: Receipt },
    { id: 'eway', label: 'E-Way Bills', icon: Truck },
    { id: 'customers', label: 'Customers', icon: Users },

    { id: 'udhari', label: 'Udhari Ledger', icon: Scale },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart },
    { id: 'supplier-catalogue', label: 'Supplier Catalogue', icon: BookOpen },
    { id: 'suppliers', label: 'Suppliers', icon: Truck },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'stock', label: 'Stock Movement', icon: Boxes },
    { id: 'counter-sale', label: 'Counter Sale', icon: ShoppingBag },
    { id: 'profit-loss', label: 'Financial Statements', icon: PieChart },
    { id: 'salary-payroll', label: 'Salary & Payroll', icon: Banknote },
    { id: 'expenses', label: 'Expenses', icon: TrendingDown },
    { id: 'daybook', label: 'Daybook Journal', icon: BookOpen },
    { id: 'cashbook', label: 'Cashbook', icon: Wallet },

    { id: 'feedback', label: 'Customer Feedback', icon: Star },
    { id: 'offers', label: 'Offers', icon: Tag },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const allDrawerItems = rawDrawerItems.filter((item) => {
    if (item.id === 'analytics' || item.id === 'all-branches-analysis') return hasCurrentUserPermission('analytics.view');
    if (item.id === 'profit-loss' || item.id === 'financial-statements') {
      return hasCurrentUserPermission('financial_statements.view');
    }
    return true;
  });

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    setDrawerOpen(false);
  };

  return (
    <>
      {/* Mobile Top Header */}
      <header className="lg:hidden min-h-[3.75rem] h-[calc(3.75rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] bg-white dark:bg-slate-900 text-slate-900 dark:text-white flex items-center justify-between px-[max(env(safe-area-inset-left),0.875rem)] pr-[max(env(safe-area-inset-right),0.875rem)] fixed top-0 left-0 right-0 z-40 border-b border-slate-200 dark:border-slate-800 no-print transition-colors duration-200 box-border">
        {activeTab === 'dashboard' ? (
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <button
              onClick={() => setDrawerOpen(true)}
              className="touch-target p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <img src={logoIcon} alt="VISTAAR" className="h-7 w-7 sm:h-8 sm:w-8 object-contain shrink-0" />
              <div className="flex flex-col justify-center min-w-0">
                <span className="text-sm sm:text-base font-black tracking-widest text-slate-900 dark:text-white uppercase leading-none font-sans">
                  VISTAAR
                </span>
                <span className="text-[8px] font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase leading-tight mt-0.5 hidden xs:block">
                  Run Better. Grow Wider.
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 mr-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className="touch-target p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              aria-label="Back to Dashboard"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                {TAB_LABELS[activeTab] || activeTab}
              </h1>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">VISTAAR Business OS</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <BranchSwitcher variant="mobile" onManageBranches={() => handleTabClick('settings')} />
          <button
            onClick={() => setMobileSearchOpen(true)}
            className="touch-target p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Search VISTAAR"
            title="Search (Ctrl+K)"
          >
            <Search className="w-5 h-5" />
          </button>
          <ThemeToggle variant="compact" />
          {activeTab !== 'dashboard' && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="touch-target p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="All Modules"
              title="All Modules"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          {unreadNotifsCount > 0 && activeTab === 'dashboard' && (
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse ml-1 shrink-0" />
          )}
        </div>
      </header>

      {/* Mobile Search Modal Overlay */}
      {mobileSearchOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex flex-col p-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)] animate-fade-in no-print">
          <div className="w-full flex items-center justify-between pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Global Search</span>
            <button
              onClick={() => setMobileSearchOpen(false)}
              className="touch-target p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close search"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="w-full">
            <GlobalSearch
              setActiveTab={(tab) => {
                setActiveTab(tab);
                setMobileSearchOpen(false);
              }}
              placeholder="Search products, invoices, customers..."
            />
          </div>
        </div>
      )}

      {/* Slide-out Mobile Drawer Backdrop */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 transition-opacity no-print"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Slide-out Drawer */}
      <div
        className={`lg:hidden fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 text-slate-900 dark:text-white z-50 transform transition-transform duration-300 ease-in-out flex flex-col no-print border-r border-slate-200 dark:border-slate-800 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 pt-[max(env(safe-area-inset-top),1rem)] flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{user?.name || 'Workspace User'}</p>
              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono font-semibold truncate flex items-center gap-1">
                <span>{user?.employeeId || 'VST-EMP-001'}</span>
                <span>•</span>
                <span className="capitalize">{user?.role || 'Owner'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="touch-target p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {allDrawerItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id || (item.id === 'profit-loss' && activeTab === 'financial-statements');
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer touch-manipulation ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-xs shadow-blue-600/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 pb-[max(env(safe-area-inset-bottom),1rem)] border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 space-y-2 shrink-0">
          <ThemeToggle variant="button" />
          <button
            onClick={() => supabaseAuthService.logout()}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors cursor-pointer touch-manipulation"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] pt-1 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-40 grid grid-cols-4 px-1 shadow-lg no-print transition-colors duration-200 box-border">
        {bottomTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`flex flex-col items-center justify-center w-full h-full min-h-[44px] py-1 cursor-pointer transition-colors select-none touch-manipulation ${
                isActive ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <div className={`px-3 py-1 rounded-full transition-all duration-200 flex items-center justify-center ${isActive ? 'bg-blue-50 dark:bg-blue-950/80 shadow-xs' : ''}`}>
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'text-blue-600 dark:text-blue-400 scale-105' : 'text-slate-400 dark:text-slate-500'}`} />
              </div>
              <span className={`text-[11px] leading-tight mt-0.5 tracking-tight ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

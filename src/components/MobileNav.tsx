import React, { useState, useEffect } from 'react';
import {
  Menu,
  X,
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
} from 'lucide-react';



import { supabaseAuthService } from '../services/supabaseAuth';
import logoDarkText from '../assets/Vistaar_Logo_With_Name.png';
import logoLightText from '../assets/Vistaar_Logo_With_Name_Light.png';
import logoIcon from '../assets/Vistaar_Icon_logo.png';

import { ThemeToggle } from './ThemeToggle';
import { UserAvatar } from './UserAvatar';
import { useTheme } from '../context/ThemeContext';

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
    { id: 'quotations', label: 'Sales', icon: FileText },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'more', label: 'More', icon: MoreHorizontal },
  ];

  const allDrawerItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'follow-ups', label: 'Follow-ups', icon: CalendarCheck },
    { id: 'quotations', label: 'Quotations', icon: FileText },
    { id: 'invoices', label: 'Invoices', icon: Receipt },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'udhari', label: 'Udhari Ledger', icon: Scale },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'stock', label: 'Stock Movement', icon: Boxes },
    { id: 'counter-sale', label: 'Counter Sale', icon: ShoppingBag },
    { id: 'expenses', label: 'Expenses', icon: TrendingDown },
    { id: 'daybook', label: 'Daybook Journal', icon: BookOpen },
    { id: 'cashbook', label: 'Cashbook', icon: Wallet },
    { id: 'profit-loss', label: 'Profit & Loss', icon: PieChart },


    { id: 'feedback', label: 'Customer Feedback', icon: Star },
    { id: 'offers', label: 'Offers', icon: Tag },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleTabClick = (tabId: string) => {
    if (tabId === 'more') {
      setDrawerOpen(true);
    } else {
      setActiveTab(tabId);
      setDrawerOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Top Header */}
      <header className="lg:hidden h-16 bg-white dark:bg-slate-900 text-slate-900 dark:text-white flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-40 border-b border-slate-200 dark:border-slate-800 no-print transition-colors duration-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-2.5">
            <img src={logoIcon} alt="VISTAAR" className="h-9 w-9 object-contain" />
            <img src={logoFullName} alt="VISTAAR" className="h-8 w-auto max-w-[160px] object-contain" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle variant="compact" />
          {unreadNotifsCount > 0 && (
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          )}
        </div>
      </header>

      {/* Slide-out Mobile Drawer Backdrop */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 transition-opacity no-print"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Slide-out Drawer */}
      <div
        className={`lg:hidden fixed inset-y-0 left-0 w-72 bg-white dark:bg-slate-900 text-slate-900 dark:text-white z-50 transform transition-transform duration-300 ease-in-out flex flex-col no-print border-r border-slate-200 dark:border-slate-800 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{user?.name || 'Owner'}</p>
              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono font-semibold truncate">{user?.employeeId || 'VST-00001'}</p>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {allDrawerItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 space-y-2">
          <ThemeToggle variant="button" />
          <button
            onClick={() => supabaseAuthService.logout()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-40 flex items-center justify-around px-2 shadow-lg no-print transition-colors duration-200">
        {bottomTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id || (tab.id === 'more' && drawerOpen);
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 cursor-pointer ${
                isActive ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 font-medium'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`} />
              <span className="text-[11px] mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};

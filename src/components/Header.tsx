import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Bell,
  Plus,
  User as UserIcon,
  LogOut,
  FileText,
  Receipt,
  UserPlus,
  PackagePlus,
  CreditCard,
  CheckCheck,
} from 'lucide-react';
import { supabaseAuthService } from '../services/supabaseAuth';
import { notificationService } from '../services/supabase';
import { AppNotification } from '../types';
import logoIcon from '../assets/Vistaar_Icon_logo.png';
import { ThemeToggle } from './ThemeToggle';
import { UserAvatar } from './UserAvatar';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  openModal?: (modalType: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  openModal,
}) => {
  const [user, setUser] = useState(supabaseAuthService.getUser());
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateAuth = () => setUser(supabaseAuthService.getUser());
    updateAuth();
    return supabaseAuthService.subscribe(updateAuth);
  }, []);

  const loadNotifs = async () => {
    const { data } = await notificationService.getNotifications();
    setNotifications(data || []);
  };

  useEffect(() => {
    loadNotifs();
    const interval = setInterval(loadNotifs, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) setQuickCreateOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    for (const n of notifications) {
      if (!n.read) await notificationService.markAsRead(n.id);
    }
    loadNotifs();
  };

  const handleNotificationClick = async (n: AppNotification) => {
    if (!n.read) {
      await notificationService.markAsRead(n.id);
      loadNotifs();
    }
    if (n.linkRoute) {
      const tab = n.linkRoute.replace('/', '');
      setActiveTab(tab);
    }
    setNotifOpen(false);
  };

  const tabTitles: Record<string, { title: string; desc: string }> = {
    dashboard: { title: 'Dashboard', desc: 'Business summary & live metrics' },
    'follow-ups': { title: 'Follow-ups', desc: 'Manage customer task reminders' },
    quotations: { title: 'Quotations', desc: 'Create, edit and track estimates' },
    invoices: { title: 'Invoices', desc: 'Billing, tax invoices & payments' },
    customers: { title: 'Customers', desc: 'Client directory & credit profiles' },
    udhari: { title: 'Udhari Ledger', desc: 'Outstanding balances & transaction history' },
    payments: { title: 'Payments', desc: 'Recorded payments & receipt entries' },
    products: { title: 'Products', desc: 'Inventory catalog & pricing margins' },
    stock: { title: 'Stock Movement', desc: 'Inventory transactions & stock adjustments' },
    categories: { title: 'Categories', desc: 'Product category taxonomy' },
    suppliers: { title: 'Suppliers', desc: 'Vendor directory & contacts' },
    expenses: { title: 'Expenses', desc: 'Business operational expenses' },
    'profit-loss': { title: 'Profit & Loss', desc: 'Financial revenue & profit breakdown' },
    feedback: { title: 'Customer Feedback', desc: 'Client reviews & star ratings' },
    offers: { title: 'Offers', desc: 'Discounts & promotional campaigns' },
    reports: { title: 'Reports', desc: 'Detailed business analytics' },
    settings: { title: 'Settings', desc: 'Business profile & invoice setup' },
  };

  const currentTabInfo = tabTitles[activeTab] || { title: 'Overview', desc: 'VISTAAR — Run Better. Grow Wider.' };

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-20 shadow-xs no-print transition-colors duration-200">
      {/* Page Title & Breadcrumb */}
      <div className="flex items-center gap-3">
        <img src={logoIcon} alt="VISTAAR" className="h-8 w-8 object-contain shrink-0" />
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">{currentTabInfo.title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">{currentTabInfo.desc}</p>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Dark/Light Theme Control */}
        <ThemeToggle variant="segmented" className="hidden md:inline-flex" />
        <ThemeToggle variant="compact" className="md:hidden" />

        {/* Quick Create Dropdown */}
        <div className="relative" ref={quickRef}>
          <button
            onClick={() => setQuickCreateOpen(!quickCreateOpen)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-md shadow-blue-600/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create New</span>
          </button>

          {quickCreateOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-2 z-30 animate-fade-in">
              <button
                onClick={() => {
                  setQuickCreateOpen(false);
                  openModal?.('quotation');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>New Quotation</span>
              </button>
              <button
                onClick={() => {
                  setQuickCreateOpen(false);
                  openModal?.('invoice');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>New Invoice</span>
              </button>
              <button
                onClick={() => {
                  setQuickCreateOpen(false);
                  openModal?.('payment');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-purple-50 dark:hover:bg-slate-800 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              >
                <CreditCard className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Record Payment</span>
              </button>
              <button
                onClick={() => {
                  setQuickCreateOpen(false);
                  openModal?.('customer');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-slate-800 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
              >
                <UserPlus className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Add Customer</span>
              </button>
              <button
                onClick={() => {
                  setQuickCreateOpen(false);
                  openModal?.('product');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                <PackagePlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Add Product</span>
              </button>
            </div>
          )}
        </div>

        {/* Notifications Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-4 z-30 animate-fade-in max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Notifications</h4>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">No notifications yet</p>
              ) : (
                <div className="space-y-2">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                        n.read
                          ? 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                          : 'bg-blue-50/60 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/50 text-slate-900 dark:text-slate-100 font-medium'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{n.title}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {new Date(n.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 mt-1">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Profile Menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} size="sm" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 hidden md:block">{user?.name || 'Owner'}</span>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-2 z-30 animate-fade-in space-y-1">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 mb-1">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{user?.name}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="px-2 py-0.5 text-[9px] font-extrabold rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 uppercase">
                    {user?.role || 'Owner'}
                  </span>
                  {user?.employeeId && (
                    <span className="px-2 py-0.5 text-[9px] font-mono font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {user.employeeId}
                    </span>
                  )}
                </div>
              </div>

              <div className="px-1 py-1">
                <ThemeToggle variant="button" />
              </div>

              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  setActiveTab('settings');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <UserIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Profile & Business Settings</span>
              </button>

              <button
                onClick={() => supabaseAuthService.logout()}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors mt-1"
              >
                <LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

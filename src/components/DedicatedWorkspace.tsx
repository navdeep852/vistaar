import React, { useState, useEffect } from 'react';
import {
  MoreVertical,
  X,
  LayoutDashboard,
  FileText,
  Users,
  CreditCard,
  Package,
  Boxes,
  ShoppingBag,
  TrendingDown,
  FileSpreadsheet,
  Settings,
  CalendarCheck,
  Star,
  Tag,
  BarChart3,
  Scale,
  FolderTree,
  Truck,
  PieChart,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import logoFullName from '../assets/Vistaar_Logo_With_Name_Light.png';

export interface DedicatedWorkspaceProps {
  title: string;
  subtitle?: string;
  badgeText?: string;
  icon?: React.ElementType;
  onClose: () => void;
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

export const DedicatedWorkspace: React.FC<DedicatedWorkspaceProps> = ({
  title,
  subtitle,
  badgeText,
  icon: Icon,
  onClose,
  onNavigateTab,
  activeTab,
  headerActions,
  children,
}) => {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const { setIsWorkspaceActive, setActiveWorkspaceTitle } = useWorkspace();

  useEffect(() => {
    setIsWorkspaceActive(true);
    setActiveWorkspaceTitle(title);
    return () => {
      setIsWorkspaceActive(false);
      setActiveWorkspaceTitle('');
    };
  }, [title, setIsWorkspaceActive, setActiveWorkspaceTitle]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isNavOpen) {
        setIsNavOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNavOpen]);

  const navGroups = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'follow-ups', label: 'Follow-ups', icon: CalendarCheck },
      ],
    },
    {
      title: 'SALES & CUSTOMERS',
      items: [
        { id: 'quotations', label: 'Quotations', icon: FileText },
        { id: 'invoices', label: 'Invoices', icon: FileSpreadsheet },
        { id: 'customers', label: 'Customers', icon: Users },
        { id: 'udhari', label: 'Udhari Ledger', icon: Scale },
        { id: 'payments', label: 'Payments', icon: CreditCard },
      ],
    },
    {
      title: 'INVENTORY',
      items: [
        { id: 'counter-sale', label: 'Counter Sale (POS)', icon: ShoppingBag, badge: 'POS' },
        { id: 'products', label: 'Products', icon: Package },
        { id: 'stock', label: 'Stock Movement', icon: Boxes },
        { id: 'categories', label: 'Categories', icon: FolderTree },
        { id: 'suppliers', label: 'Suppliers', icon: Truck },
      ],
    },
    {
      title: 'FINANCE & ANALYTICS',
      items: [
        { id: 'expenses', label: 'Expenses', icon: TrendingDown },
        { id: 'profit-loss', label: 'Profit & Loss', icon: PieChart },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
      ],
    },
    {
      title: 'MARKETING & SETTINGS',
      items: [
        { id: 'offers', label: 'Offers', icon: Tag },
        { id: 'feedback', label: 'Feedback', icon: Star },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const handleNavClick = (tabId: string) => {
    setIsNavOpen(false);
    if (onNavigateTab) {
      onNavigateTab(tabId);
    }
  };

  return (
    <div className="dedicated-workspace fixed inset-0 z-50 bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans overflow-hidden w-full h-full min-h-screen transition-colors duration-200 no-print">
      {/* DEDICATED WORKSPACE HEADER */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-lg px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 w-full">
        {/* Left Section: Three-Dot Menu Button & Title */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Three-Dot Navigation Button (⋮) */}
          <button
            type="button"
            onClick={() => setIsNavOpen(!isNavOpen)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-colors shrink-0 cursor-pointer flex items-center justify-center shadow-xs"
            title="Open Navigation Menu (⋮)"
            aria-label="Open Navigation Menu"
          >
            <MoreVertical className="w-5 h-5 text-amber-400" />
          </button>

          {/* Workspace Title & Badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && <Icon className="w-5 h-5 text-amber-400 shrink-0" />}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-xl font-black text-white tracking-tight truncate">
                  {title}
                </h1>
                {badgeText && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-bold uppercase tracking-wider whitespace-nowrap">
                    {badgeText}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-xs text-slate-400 hidden sm:block truncate">{subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Section: Custom Actions & Close */}
        <div className="flex items-center gap-2.5 shrink-0">
          {headerActions}

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600/20 hover:text-rose-400 border border-slate-700 text-slate-300 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Close Workspace"
          >
            <X className="w-5 h-5" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </header>

      {/* THREE-DOT NAVIGATION DRAWER / OVERLAY */}
      {isNavOpen && (
        <div className="fixed inset-0 z-50 flex animate-fade-in">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={() => setIsNavOpen(false)}
          />

          {/* Slide-Over Drawer */}
          <div className="relative w-80 max-w-[85vw] bg-slate-900 text-white h-full shadow-2xl flex flex-col z-10 border-r border-slate-800">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2">
                <img src={logoFullName} alt="VISTAAR" className="h-8 w-auto object-contain" />
              </div>
              <button
                type="button"
                onClick={() => setIsNavOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav Groups List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-5">
              {navGroups.map((group, idx) => (
                <div key={idx}>
                  <p className="px-2 text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-1.5">
                    {group.title}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleNavClick(item.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-md'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <ItemIcon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                            <span>{item.label}</span>
                          </div>
                          {item.badge && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 text-xs text-slate-400 flex items-center justify-between">
              <span>Vistaar ERP</span>
              <span className="text-emerald-400 font-bold">Online</span>
            </div>
          </div>
        </div>
      )}

      {/* WORKSPACE CONTENT BODY */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 w-full max-w-full mx-auto min-w-0 box-border">
        {children}
      </div>
    </div>
  );
};

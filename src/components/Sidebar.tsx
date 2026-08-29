import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  CreditCard,
  Package,
  Boxes,
  ShoppingBag,
  TrendingDown,
  PieChart,
  CalendarCheck,
  Star,
  Tag,
  BarChart3,
  Settings,
  Truck,
  FolderTree,
  Scale,
} from 'lucide-react';

import logoDarkText from '../assets/Vistaar_Logo_With_Name.png';
import logoLightText from '../assets/Vistaar_Logo_With_Name_Light.png';
import logoIcon from '../assets/Vistaar_Icon_logo.png';
import { supabaseAuthService } from '../services/supabaseAuth';
import { UserAvatar } from './UserAvatar';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  lowStockCount?: number;
  pendingFollowupsCount?: number;
  isCollapsed?: boolean;
}

interface NavItem {
  id: string;
  label: string;
  icon: any;
  badge?: number;
  badgeColor?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  lowStockCount = 0,
  pendingFollowupsCount = 0,
  isCollapsed = false,
}) => {
  const [user, setUser] = useState(supabaseAuthService.getUser());
  const { theme } = useTheme();

  useEffect(() => {
    const updateAuth = () => setUser(supabaseAuthService.getUser());
    updateAuth();
    return supabaseAuthService.subscribe(updateAuth);
  }, []);

  const logoFullName = theme === 'dark' ? logoLightText : logoDarkText;

  const navGroups: NavGroup[] = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'follow-ups', label: 'Follow-ups', icon: CalendarCheck, badge: pendingFollowupsCount },
      ],
    },
    {
      title: 'SALES & CUSTOMERS',
      items: [
        { id: 'quotations', label: 'Quotations', icon: FileText },
        { id: 'invoices', label: 'Invoices', icon: Receipt },
        { id: 'customers', label: 'Customers', icon: Users },
        { id: 'udhari', label: 'Udhari Ledger', icon: Scale },
        { id: 'payments', label: 'Payments', icon: CreditCard },
      ],
    },
    {
      title: 'INVENTORY',
      items: [
        { id: 'products', label: 'Products', icon: Package },
        { id: 'stock', label: 'Stock Movement', icon: Boxes, badge: lowStockCount, badgeColor: 'bg-amber-500' },
        { id: 'counter-sale', label: 'Counter Sale', icon: ShoppingBag },
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
      title: 'MARKETING & MORE',
      items: [
        { id: 'offers', label: 'Offers', icon: Tag },
        { id: 'feedback', label: 'Feedback', icon: Star },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-400 flex flex-col h-screen fixed left-0 top-0 z-30 border-r border-slate-200 dark:border-slate-900 hidden lg:flex no-print transition-colors duration-200`}>
      {/* Brand Header */}
      <div className="h-20 px-5 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/50 bg-slate-50/80 dark:bg-slate-950/80 transition-colors duration-200">
        {isCollapsed ? (
          <div className="w-full flex items-center justify-center py-2" title="VISTAAR — Run Better. Grow Wider.">
            <img src={logoIcon} alt="VISTAAR" className="h-10 w-10 object-contain hover:scale-105 transition-transform" />
          </div>
        ) : (
          <div className="flex flex-col justify-center min-w-0 py-1">
            <img src={logoFullName} alt="VISTAAR" className="h-11 w-auto max-w-[200px] object-contain drop-shadow-xs" />
            <span className="text-[9px] text-blue-600 dark:text-blue-400 font-bold tracking-widest block uppercase pl-0.5 mt-0.5">
              Run Better. Grow Wider.
            </span>
          </div>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {navGroups.map((group, idx) => (
          <div key={idx}>
            <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase mb-2">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full text-white ${
                          item.badgeColor || 'bg-blue-500'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Workspace & Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-900 bg-slate-50/60 dark:bg-slate-950/40 transition-colors duration-200">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-xs">
          <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{user?.businessName || 'Main Workspace'}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 font-mono">
              <span>{user?.employeeId || 'VST-00001'}</span>
              <span>•</span>
              <span className="capitalize">{user?.role || 'Owner'}</span>
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};

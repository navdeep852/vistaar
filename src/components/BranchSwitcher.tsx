import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  ChevronDown,
  Check,
  Store,
  Warehouse,
  Factory,
  Globe2,
  Plus,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { Branch, BranchType } from '../types';
import { hasCurrentUserPermission } from '../lib/permissions';

interface BranchSwitcherProps {
  className?: string;
  variant?: 'header' | 'compact' | 'mobile';
  onManageBranches?: () => void;
}

const getBranchIcon = (type?: BranchType) => {
  switch (type) {
    case 'Warehouse':
      return Warehouse;
    case 'Factory':
      return Factory;
    case 'Store':
      return Store;
    default:
      return Building2;
  }
};

export const BranchSwitcher: React.FC<BranchSwitcherProps> = ({
  className = '',
  variant = 'header',
  onManageBranches,
}) => {
  const {
    currentBranch,
    branches,
    isLoadingBranches,
    isAllBranchesSelected,
    canAccessAllBranches,
    switchBranch,
  } = useBranch();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectBranch = async (branchId: string | 'ALL') => {
    setIsOpen(false);
    await switchBranch(branchId);
  };

  const CurrentIcon = currentBranch ? getBranchIcon(currentBranch.branchType) : Globe2;

  // If there are no branches or only 1 branch and user cannot switch, show subtle indicator
  if (branches.length === 0 && !isLoadingBranches) {
    return null;
  }

  // Mobile compact layout
  if (variant === 'mobile') {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-semibold cursor-pointer max-w-[140px] truncate"
          title="Active Branch / Location"
        >
          <CurrentIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="truncate">
            {isAllBranchesSelected ? 'All Branches' : currentBranch?.branchName || 'Branch'}
          </span>
          {branches.length > 1 && <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />}
        </button>

        {isOpen && branches.length > 1 && (
          <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 animate-fade-in text-xs">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 mb-1">
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                Operating Location
              </span>
            </div>

            {canAccessAllBranches && (
              <button
                type="button"
                onClick={() => handleSelectBranch('ALL')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  isAllBranchesSelected
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Globe2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <div className="font-semibold">All Branches</div>
                    <div className="text-[10px] text-slate-400 font-normal">Consolidated Workspace Data</div>
                  </div>
                </div>
                {isAllBranchesSelected && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            )}

            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

            <div className="max-h-60 overflow-y-auto space-y-1">
              {branches.map((b) => {
                const Icon = getBranchIcon(b.branchType);
                const isSelected = currentBranch?.id === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectBranch(b.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-1.5">
                          {b.branchName}
                          {b.isMainBranch && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold uppercase">
                              Main
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {b.branchCode} {b.city ? `• ${b.city}` : ''}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop Header variant
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-xs font-semibold shadow-2xs cursor-pointer group"
        title="Switch Operating Branch"
      >
        <div className="w-6 h-6 rounded-lg bg-blue-100/80 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <CurrentIcon className="w-3.5 h-3.5" />
        </div>

        <div className="flex flex-col text-left">
          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider leading-none">
            Branch / Location
          </span>
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight truncate max-w-[150px]">
            {isAllBranchesSelected ? 'All Branches' : currentBranch?.branchName || 'Select Branch'}
          </span>
        </div>

        {branches.length > 1 && (
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 animate-fade-in text-xs backdrop-blur-md">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 mb-1 flex items-center justify-between">
            <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">
              Active Branch Filter
            </span>
            {currentBranch && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium">
                {currentBranch.branchCode}
              </span>
            )}
          </div>

          {canAccessAllBranches && (
            <button
              type="button"
              onClick={() => handleSelectBranch('ALL')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all cursor-pointer text-left ${
                isAllBranchesSelected
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold shadow-2xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Globe2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">All Branches</div>
                  <div className="text-[10px] text-slate-400">Consolidated Workspace Reports</div>
                </div>
              </div>
              {isAllBranchesSelected && <Check className="w-4 h-4 text-blue-600" />}
            </button>
          )}

          <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />

          <div className="max-h-64 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {branches.map((b) => {
              const Icon = getBranchIcon(b.branchType);
              const isSelected = currentBranch?.id === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSelectBranch(b.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold shadow-2xs'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                        <span className="truncate">{b.branchName}</span>
                        {b.isMainBranch && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold uppercase shrink-0">
                            Main
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {b.branchCode} {b.city ? `• ${b.city}` : ''}
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                </button>
              );
            })}
          </div>

          {hasCurrentUserPermission('branches.manage') && onManageBranches && (
            <>
              <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onManageBranches();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 font-medium transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Manage Branches & Locations</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

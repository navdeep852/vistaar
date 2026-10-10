import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  ChevronDown,
  Lock,
  Store,
  Warehouse,
  Factory,
  Globe2,
  Settings,
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { BranchType, Branch } from '../types';
import { SwitchBranchModal } from './SwitchBranchModal';

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
    allWorkspaceBranches,
    isLoadingBranches,
    isAllBranchesSelected,
    isOwner,
    requestSwitchBranch,
    switchBranch,
    isSwitchModalOpen,
    closeSwitchModal,
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

  const CurrentIcon = currentBranch ? getBranchIcon(currentBranch.branchType) : Globe2;

  // CRITICAL RULE (Section 8 & 9): Normal employees are permanently locked to their assigned operating branch.
  // The branch selector shows ONLY their assigned branch as a locked/non-switchable badge.
  if (!isOwner) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs font-semibold select-none ${className}`}
        title="Assigned Operating Location (Locked to your assigned branch)"
      >
        <CurrentIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="truncate max-w-[130px]">{currentBranch?.branchName || 'Assigned Branch'}</span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
          {currentBranch?.branchCode}
        </span>
        <Lock className="w-3 h-3 text-slate-400 shrink-0 ml-0.5" />
      </div>
    );
  }

  // Owner flow: can switch branches via branch access password
  const handleSelectBranch = (target: Branch) => {
    setIsOpen(false);
    if (target.id === currentBranch?.id) return;
    requestSwitchBranch(target);
  };

  const handleSelectAll = () => {
    setIsOpen(false);
    switchBranch('ALL');
  };

  // Mobile compact layout for owner
  if (variant === 'mobile') {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => requestSwitchBranch()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-semibold cursor-pointer max-w-[140px] truncate"
          title="Switch Location"
        >
          <CurrentIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="truncate">
            {isAllBranchesSelected ? 'All Branches' : currentBranch?.branchName || 'Branch'}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0 ml-0.5" />
        </button>

        <SwitchBranchModal isOpen={isSwitchModalOpen} onClose={closeSwitchModal} />
      </div>
    );
  }

  // Desktop Header variant for owner
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-xs font-semibold shadow-2xs cursor-pointer group"
        title="Switch Operating Branch (Owner Access)"
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

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 animate-fade-in text-xs backdrop-blur-md">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 mb-1 flex items-center justify-between">
            <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">
              Active Operating Branch
            </span>
            {currentBranch && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium">
                {currentBranch.branchCode}
              </span>
            )}
          </div>

          <div className="p-3 my-1 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                {isAllBranchesSelected ? 'All Branches (Consolidated)' : currentBranch?.branchName}
              </div>
              <div className="text-[10px] text-slate-400">
                {isAllBranchesSelected
                  ? 'Viewing enterprise-wide numbers'
                  : `Operating Code: ${currentBranch?.branchCode || 'N/A'}`}
              </div>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          </div>

          <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Switch Location (Branch Password Required)
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1 pr-1 my-1">
            {!isAllBranchesSelected && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Globe2 className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="font-medium text-slate-700 dark:text-slate-200">All Branches (Consolidated)</span>
                </div>
              </button>
            )}

            {allWorkspaceBranches.map((b) => {
              const Icon = getBranchIcon(b.branchType);
              const isCurrent = currentBranch?.id === b.id && !isAllBranchesSelected;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSelectBranch(b)}
                  disabled={isCurrent}
                  className={`w-full flex items-center justify-between p-2 rounded-xl transition-colors text-left cursor-pointer ${
                    isCurrent
                      ? 'bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold cursor-default'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                    <div className="truncate min-w-0">
                      <div className="truncate text-xs font-medium">{b.branchName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{b.branchCode}</div>
                    </div>
                  </div>
                  {!isCurrent && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          {onManageBranches && (
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onManageBranches();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Manage Branches & Locations</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Security Authenticated Branch Switch Modal */}
      <SwitchBranchModal isOpen={isSwitchModalOpen} onClose={closeSwitchModal} />
    </div>
  );
};

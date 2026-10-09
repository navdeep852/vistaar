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
import { BranchType } from '../types';
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
    canAccessAllBranches,
    requestSwitchBranch,
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

  const handleOpenAuthModal = () => {
    setIsOpen(false);
    requestSwitchBranch();
  };

  const CurrentIcon = currentBranch ? getBranchIcon(currentBranch.branchType) : Globe2;
  const availableCount = canAccessAllBranches ? allWorkspaceBranches.length : branches.length;
  const canSwitch = canAccessAllBranches || availableCount > 1;

  // If there are no branches loaded yet
  if (branches.length === 0 && !isLoadingBranches && !canAccessAllBranches) {
    return null;
  }

  // If staff user only has 1 branch assigned, show locked badge
  if (!canSwitch) {
    return (
      <>
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs font-semibold select-none ${className}`}
          title="Assigned Operating Location (Locked to your assigned branch)"
        >
          <CurrentIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="truncate max-w-[120px]">{currentBranch?.branchName || 'Assigned Branch'}</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            {currentBranch?.branchCode}
          </span>
        </div>
        <SwitchBranchModal isOpen={isSwitchModalOpen} onClose={closeSwitchModal} />
      </>
    );
  }

  // Mobile compact layout
  if (variant === 'mobile') {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          type="button"
          onClick={handleOpenAuthModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-semibold cursor-pointer max-w-[140px] truncate"
          title="Authenticate to Switch Location"
        >
          <CurrentIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="truncate">
            {isAllBranchesSelected ? 'All Branches' : currentBranch?.branchName || 'Branch'}
          </span>
          <Lock className="w-3 h-3 text-slate-400 shrink-0 ml-0.5" />
        </button>

        <SwitchBranchModal isOpen={isSwitchModalOpen} onClose={closeSwitchModal} />
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
        title="Switch Operating Branch (Password Authentication Required)"
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
        <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 animate-fade-in text-xs backdrop-blur-md">
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

          <button
            type="button"
            onClick={handleOpenAuthModal}
            className="w-full mt-1.5 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer text-xs"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Switch Location (Authenticate)</span>
          </button>

          {onManageBranches && canAccessAllBranches && (
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

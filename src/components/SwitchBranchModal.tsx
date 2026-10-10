import React, { useState, useEffect } from 'react';
import {
  Building2,
  Lock,
  Store,
  Warehouse,
  Factory,
  Globe2,
  AlertCircle,
  Eye,
  EyeOff,
  X,
  ArrowRight,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { branchService } from '../services/supabase/branchService';
import { BranchType, Branch } from '../types';

interface SwitchBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
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

export const SwitchBranchModal: React.FC<SwitchBranchModalProps> = ({ isOpen, onClose }) => {
  const {
    currentBranch,
    allWorkspaceBranches,
    targetSwitchBranch,
    isOwner,
    switchBranch,
    refreshBranches,
  } = useBranch();

  // Selected target branch to switch into
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSetupMode, setIsSetupMode] = useState(false);

  // Sync state whenever modal is opened or target branch changes
  useEffect(() => {
    if (isOpen) {
      const initial = targetSwitchBranch || (allWorkspaceBranches.find((b) => b.id !== currentBranch?.id) || null);
      setSelectedBranch(initial);
      setPassword('');
      setConfirmPassword('');
      setAuthError(null);
      setIsSetupMode(Boolean(initial && initial.hasPassword === false));
    }
  }, [isOpen, targetSwitchBranch, allWorkspaceBranches, currentBranch?.id]);

  if (!isOpen) return null;

  // Strict check: Non-owners cannot switch branches
  if (!isOwner) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
        <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 overflow-hidden">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Operating Location Restricted
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Employee branch security policy
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mb-6">
            Employee accounts are permanently locked to their assigned operating location. Branch switching is restricted to the Business Owner.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleBranchSelect = (branch: Branch) => {
    setSelectedBranch(branch);
    setPassword('');
    setConfirmPassword('');
    setAuthError(null);
    setIsSetupMode(Boolean(branch.hasPassword === false));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;

    // Handle setup mode if branch has no access password configured yet
    if (isSetupMode) {
      if (!password || password.length < 4) {
        setAuthError('Branch access password must be at least 4 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setAuthError('Passwords do not match. Please verify your entry.');
        return;
      }

      setIsVerifying(true);
      setAuthError(null);
      try {
        const setupRes = await branchService.setBranchPassword(selectedBranch.id, password);
        if (!setupRes.success) {
          setAuthError(setupRes.error || 'Failed to configure branch access password.');
          setIsVerifying(false);
          return;
        }

        await refreshBranches();
        // After setting password, switch branch
        const switchRes = await switchBranch(selectedBranch.id, password);
        if (!switchRes.success) {
          setAuthError(switchRes.error || 'Failed to switch branch.');
          setIsVerifying(false);
          return;
        }

        onClose();
      } catch (err: any) {
        setAuthError(err?.message || 'Error setting branch password.');
      } finally {
        setIsVerifying(false);
      }
      return;
    }

    // Normal branch access verification
    if (!password.trim()) {
      setAuthError('Please enter the branch access password.');
      return;
    }

    setIsVerifying(true);
    setAuthError(null);

    try {
      const res = await switchBranch(selectedBranch.id, password.trim());
      if (!res.success) {
        if (res.requiresSetup) {
          setIsSetupMode(true);
          setAuthError('This branch does not have an access password yet. Please configure one now as the Business Owner.');
        } else {
          setAuthError(res.error || 'Incorrect branch access password.');
        }
        setIsVerifying(false);
        return;
      }

      // Success! Modal is closed by switchBranch or onClose
      onClose();
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to verify branch password.');
    } finally {
      setIsVerifying(false);
    }
  };

  const TargetIcon = selectedBranch ? getBranchIcon(selectedBranch.branchType) : Globe2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {isSetupMode ? 'Configure Branch Access Password' : 'Enter Branch Access Password'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {selectedBranch ? `Target: ${selectedBranch.branchName}` : 'Select target location'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Target Branch Card */}
            {selectedBranch && (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <TargetIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        {selectedBranch.branchName}
                        {selectedBranch.isMainBranch && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold uppercase">
                            Main / HQ
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Code: {selectedBranch.branchCode}
                      </div>
                    </div>
                  </div>
                  {allWorkspaceBranches.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setSelectedBranch(null)}
                      className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Change Branch
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* If no branch selected yet: Branch Selection List */}
            {!selectedBranch && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Select Target Location:
                </label>
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                  {allWorkspaceBranches
                    .filter((b) => b.id !== currentBranch?.id)
                    .map((b) => {
                      const Icon = getBranchIcon(b.branchType);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => handleBranchSelect(b)}
                          className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all cursor-pointer text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {b.branchName}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {b.branchCode}
                              </div>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-400" />
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Error Banner */}
            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 flex items-center gap-2.5 text-rose-700 dark:text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {/* Password Input (Only when target branch is selected) */}
            {selectedBranch && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {isSetupMode ? 'Create Branch Access Password:' : 'Branch Access Password:'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSetupMode ? 'Enter a secure branch password' : 'Enter branch access password'}
                      autoFocus
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {isSetupMode
                      ? 'This password belongs exclusively to this location. It is independent of your account password.'
                      : 'Enter the access password configured for this branch.'}
                  </p>
                </div>

                {isSetupMode && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Confirm Branch Access Password:
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm branch access password"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              {selectedBranch && (
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isVerifying ? (
                    'Verifying...'
                  ) : (
                    <>
                      <span>{isSetupMode ? 'Set Password & Switch' : 'Continue'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

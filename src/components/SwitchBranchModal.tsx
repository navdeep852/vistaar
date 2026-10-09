import React, { useState } from 'react';
import {
  Building2,
  Lock,
  ShieldCheck,
  Store,
  Warehouse,
  Factory,
  Globe2,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  X,
  ArrowRight,
  User,
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { supabaseAuthService } from '../services/supabaseAuth';
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
    branches,
    allWorkspaceBranches,
    canAccessAllBranches,
    isAllBranchesSelected,
    switchBranch,
  } = useBranch();

  const currentUser = supabaseAuthService.getUser();

  const [step, setStep] = useState<'auth' | 'select'>('auth');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | 'ALL'>(
    isAllBranchesSelected ? 'ALL' : currentBranch?.id || 'ALL'
  );

  // Reset state whenever modal is opened
  React.useEffect(() => {
    if (isOpen) {
      setStep('auth');
      setPassword('');
      setAuthError(null);
      setSelectedBranchId(isAllBranchesSelected ? 'ALL' : currentBranch?.id || 'ALL');
    }
  }, [isOpen, isAllBranchesSelected, currentBranch?.id]);

  if (!isOpen) return null;

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setAuthError('Please enter your password.');
      return;
    }

    setIsVerifying(true);
    setAuthError(null);

    try {
      const res = await supabaseAuthService.verifyCurrentUserPassword(password);
      if (!res.success) {
        setAuthError(res.error || 'Incorrect password. Verification failed.');
        setIsVerifying(false);
        return;
      }

      // Password verified! Advance to branch selection
      setStep('select');
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExecuteSwitch = async () => {
    const res = await switchBranch(selectedBranchId, true);
    if (!res.success) {
      setAuthError(res.error || 'Failed to switch branch.');
      return;
    }
    onClose();
  };

  const availableBranches: Branch[] = canAccessAllBranches ? allWorkspaceBranches : branches;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              {step === 'auth' ? <Lock className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {step === 'auth' ? 'Authenticate Branch Switch' : 'Select Operating Location'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {step === 'auth' ? 'Current user verification required' : 'Choose authorized branch'}
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
          {/* STEP 1: AUTHENTICATION */}
          {step === 'auth' && (
            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Current Location:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {isAllBranchesSelected ? 'All Branches (Consolidated)' : currentBranch?.branchName || 'Main Branch'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">User Identity:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-blue-500" />
                    {currentUser?.name || 'Authorized User'} ({currentUser?.role || 'Staff'})
                  </span>
                </div>
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 flex items-center gap-2.5 text-rose-700 dark:text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Enter your password:
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your account password"
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
                  Authentication validates that you are authorized to operate across branches.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isVerifying ? (
                    'Verifying...'
                  ) : (
                    <>
                      <span>Verify & Continue</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: AUTHORIZED BRANCH SELECTION */}
          {step === 'select' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>Identity verified. Showing authorized locations for your role.</span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {canAccessAllBranches && (
                  <button
                    type="button"
                    onClick={() => setSelectedBranchId('ALL')}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer text-left ${
                      selectedBranchId === 'ALL'
                        ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/50 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Globe2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">All Branches</div>
                        <div className="text-[11px] text-slate-400">Consolidated Workspace Data</div>
                      </div>
                    </div>
                    {selectedBranchId === 'ALL' && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                )}

                {availableBranches.map((b) => {
                  const Icon = getBranchIcon(b.branchType);
                  const isSelected = selectedBranchId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBranchId(b.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/50 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                            {b.branchName}
                            {b.isMainBranch && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold uppercase">
                                Main / HQ
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {b.branchCode} {b.city ? `• ${b.city}` : ''}
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep('auth')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleExecuteSwitch}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                >
                  Switch Location
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Building2,
  User,
  Shield,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  LogOut,
  Clock,
  KeyRound,
} from 'lucide-react';
import { useScreenLock } from '../context/ScreenLockContext';

const logoFullNameLight = '/Vistaar_Logo_With_Name_Light.png';
const logoFullNameDark = '/Vistaar_Logo_With_Name.png';

export const ScreenLockOverlay: React.FC = () => {
  const {
    isLocked,
    unlockScreen,
    failedAttempts,
    isCooldown,
    cooldownRemaining,
    activeBranchName,
    activeBranchCode,
    currentUser,
    logoutAndReset,
  } = useScreenLock();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Focus input whenever screen is locked
  useEffect(() => {
    if (isLocked) {
      setPassword('');
      setErrorMessage(null);
      setShowPassword(false);
      // Short delay for DOM render before focusing
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLocked]);

  // Trap keyboard focus and block global keyboard shortcuts while locked
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow typing in inputs
      if (e.target === inputRef.current) {
        if (e.key === 'Enter') {
          // Enter key submitted
          return;
        }
      }

      // Block tab navigation away from overlay
      if (e.key === 'Tab') {
        const focusableElements = overlayRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements && focusableElements.length > 0) {
          const first = focusableElements[0];
          const last = focusableElements[focusableElements.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }

      // Suppress Esc or other app shortcuts from reaching background views
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isLocked]);

  if (!isLocked) {
    return null;
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying || isCooldown) return;

    if (!password.trim()) {
      setErrorMessage('Please enter the branch access password.');
      inputRef.current?.focus();
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const res = await unlockScreen(password);
      if (!res.success) {
        setErrorMessage(res.error || 'Incorrect branch password.');
        setPassword('');
        inputRef.current?.focus();
      } else {
        // Unlock succeeded! Modal unmounts automatically via isLocked=false
        setPassword('');
        setErrorMessage(null);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Verification error occurred.');
    } finally {
      setIsVerifying(false);
    }
  };

  const isOwner = (currentUser?.role || '').toLowerCase() === 'owner';

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="screen-lock-title"
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/90 dark:bg-slate-950/95 backdrop-blur-2xl text-slate-900 dark:text-white select-none animate-fade-in overflow-y-auto"
    >
      {/* Decorative Blur Backing */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Lock Card */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 my-auto overflow-hidden">
        {/* Header with Logo */}
        <div className="text-center mb-6">
          <div className="mb-4">
            <img
              src={logoFullNameDark}
              alt="VISTAAR"
              className="h-12 sm:h-14 mx-auto object-contain drop-shadow-md dark:hidden"
            />
            <img
              src={logoFullNameLight}
              alt="VISTAAR"
              className="h-12 sm:h-14 mx-auto object-contain drop-shadow-md hidden dark:block"
            />
          </div>

          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 mb-3 border border-amber-500/20">
            <Lock className="w-6 h-6" />
          </div>

          <h1
            id="screen-lock-title"
            className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase"
          >
            Screen Locked
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
            Automatic lock after 5 minutes of inactivity. Re-enter your branch password to resume.
          </p>
        </div>

        {/* User & Active Branch Context Badges */}
        <div className="p-3.5 mb-5 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
          {/* User Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {currentUser?.name || 'Authorized User'}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">
                  {(currentUser as any)?.employeeId || currentUser?.email || 'Active User'}
                </div>
              </div>
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${
                isOwner
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60'
                  : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60'
              }`}
            >
              {isOwner ? 'Owner' : 'Employee'}
            </span>
          </div>

          <div className="border-t border-slate-200/60 dark:border-slate-800/80" />

          {/* Branch Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {activeBranchName}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                  Location Code: {activeBranchCode}
                </div>
              </div>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Shield className="w-3 h-3 text-emerald-500" />
              <span>Protected</span>
            </span>
          </div>
        </div>

        {/* Error or Cooldown Banner */}
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-rose-700 dark:text-rose-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span className="break-words">{errorMessage}</span>
          </div>
        )}

        {isCooldown && (
          <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-amber-700 dark:text-amber-400 text-xs font-semibold">
            <Clock className="w-4 h-4 shrink-0 text-amber-500 animate-spin" />
            <span>Too many attempts. Cooldown active for {cooldownRemaining}s.</span>
          </div>
        )}

        {/* Password Form */}
        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="branch-unlock-password"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider"
            >
              Branch Access Password
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                id="branch-unlock-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isVerifying || isCooldown}
                placeholder="Enter branch access password"
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-11 transition-all disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isVerifying || isCooldown}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {failedAttempts > 0 && !isCooldown && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                Failed attempts: {failedAttempts} / 5
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isVerifying || isCooldown || !password.trim()}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Branch Password...</span>
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Unlock Session</span>
              </>
            )}
          </button>
        </form>

        {/* Footer: Safe Logout / Switch User Option */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
          <button
            type="button"
            onClick={logoutAndReset}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out / Switch User</span>
          </button>
        </div>
      </div>
    </div>
  );
};

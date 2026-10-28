import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBranch } from './BranchContext';
import { supabaseAuthService } from '../services/supabaseAuth';
import { branchService } from '../services/supabase/branchService';
import { useInactivityLock, SCREEN_LOCK_STORAGE_KEY, SCREEN_LOCK_ENABLED } from '../hooks/useInactivityLock';
import { Branch, UserProfile } from '../types';

export { SCREEN_LOCK_ENABLED } from '../hooks/useInactivityLock';

const FAILED_ATTEMPTS_STORAGE_KEY = 'vistaar_screen_lock_failed_attempts';
const COOLDOWN_UNTIL_STORAGE_KEY = 'vistaar_screen_lock_cooldown_until';
const MAX_CONSECUTIVE_FAILURES = 5;
const COOLDOWN_DURATION_MS = 30 * 1000; // 30 seconds

export interface ScreenLockContextType {
  isLocked: boolean;
  lockScreen: () => void;
  unlockScreen: (password: string) => Promise<{
    success: boolean;
    requiresSetup?: boolean;
    sessionExpired?: boolean;
    error?: string;
  }>;
  setupBranchPassword: (newPassword: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  failedAttempts: number;
  isCooldown: boolean;
  cooldownRemaining: number;
  activeBranch: Branch | null;
  activeBranchName: string;
  activeBranchCode: string;
  currentUser: UserProfile | null;
  isBranchLoading: boolean;
  branchHasPassword: boolean;
  logoutAndReset: () => Promise<void>;
}

const ScreenLockContext = createContext<ScreenLockContextType>({
  isLocked: false,
  lockScreen: () => {},
  unlockScreen: async () => ({ success: false }),
  setupBranchPassword: async () => ({ success: false }),
  failedAttempts: 0,
  isCooldown: false,
  cooldownRemaining: 0,
  activeBranch: null,
  activeBranchName: '',
  activeBranchCode: '',
  currentUser: null,
  isBranchLoading: false,
  branchHasPassword: true,
  logoutAndReset: async () => {},
});

export const ScreenLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentBranch, allWorkspaceBranches, isLoadingBranches } = useBranch();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => supabaseAuthService.getUser());

  // Listen to auth state changes to update currentUser
  useEffect(() => {
    const unsubscribe = supabaseAuthService.subscribe(() => {
      setCurrentUser(supabaseAuthService.getUser());
    });
    return unsubscribe;
  }, []);

  const isAuthenticated = Boolean(currentUser && supabaseAuthService.isAuthenticated());

  // Failed attempts and cooldown state (persisted across page reloads)
  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    try {
      const stored = sessionStorage.getItem(FAILED_ATTEMPTS_STORAGE_KEY) || localStorage.getItem(FAILED_ATTEMPTS_STORAGE_KEY);
      return stored ? parseInt(stored, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const [cooldownRemaining, setCooldownRemaining] = useState<number>(() => {
    try {
      const storedUntil = sessionStorage.getItem(COOLDOWN_UNTIL_STORAGE_KEY) || localStorage.getItem(COOLDOWN_UNTIL_STORAGE_KEY);
      if (storedUntil) {
        const targetTime = parseInt(storedUntil, 10);
        const diff = Math.ceil((targetTime - Date.now()) / 1000);
        return diff > 0 ? diff : 0;
      }
    } catch {}
    return 0;
  });

  // Determine authoritative branch context for lock screen
  // If 'ALL' is selected by owner (currentBranch === null), fall back to primary Main Branch
  const targetBranch = useMemo<Branch | null>(() => {
    if (currentBranch) return currentBranch;
    const main = allWorkspaceBranches.find((b) => b.isMainBranch) || allWorkspaceBranches[0] || null;
    return main;
  }, [currentBranch, allWorkspaceBranches]);

  const activeBranchName = useMemo(() => {
    if (currentBranch) return currentBranch.branchName;
    if (targetBranch) return `${targetBranch.branchName} (HQ)`;
    return 'Main Branch';
  }, [currentBranch, targetBranch]);

  const branchHasPassword = useMemo(() => {
    if (!targetBranch) return false;
    return Boolean(targetBranch.hasPassword);
  }, [targetBranch]);

  const activeBranchCode = useMemo(() => {
    if (currentBranch) return currentBranch.branchCode;
    if (targetBranch) return `${targetBranch.branchCode} / ALL`;
    return 'ALL';
  }, [currentBranch, targetBranch]);

  // Hook for inactivity tracking and cross-tab lock synchronization
  const { isLocked: rawIsLocked, lock: rawLockScreen, unlock: unlockLocalSession } = useInactivityLock({
    isAuthenticated,
  });

  const isLocked = SCREEN_LOCK_ENABLED ? rawIsLocked : false;

  const lockScreen = useCallback(() => {
    if (!SCREEN_LOCK_ENABLED) return;
    rawLockScreen();
  }, [rawLockScreen]);

  // Progressive failure cooldown countdown timer
  useEffect(() => {
    let timer: any;
    if (cooldownRemaining > 0) {
      timer = setInterval(() => {
        setCooldownRemaining((prev) => {
          if (prev <= 1) {
            try {
              sessionStorage.removeItem(COOLDOWN_UNTIL_STORAGE_KEY);
              localStorage.removeItem(COOLDOWN_UNTIL_STORAGE_KEY);
            } catch {}
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // Safely record a failed attempt and apply progressive rate limiting
  const recordFailedAttempt = useCallback(() => {
    const newCount = failedAttempts + 1;
    setFailedAttempts(newCount);

    try {
      sessionStorage.setItem(FAILED_ATTEMPTS_STORAGE_KEY, String(newCount));
      localStorage.setItem(FAILED_ATTEMPTS_STORAGE_KEY, String(newCount));
    } catch {}

    if (newCount >= MAX_CONSECUTIVE_FAILURES) {
      const cooldownUntil = Date.now() + COOLDOWN_DURATION_MS;
      try {
        sessionStorage.setItem(COOLDOWN_UNTIL_STORAGE_KEY, String(cooldownUntil));
        localStorage.setItem(COOLDOWN_UNTIL_STORAGE_KEY, String(cooldownUntil));
      } catch {}
      setCooldownRemaining(Math.ceil(COOLDOWN_DURATION_MS / 1000));
    }
  }, [failedAttempts]);

  // Reset failures upon successful unlock
  const resetFailedAttempts = useCallback(() => {
    setFailedAttempts(0);
    setCooldownRemaining(0);
    try {
      sessionStorage.removeItem(FAILED_ATTEMPTS_STORAGE_KEY);
      sessionStorage.removeItem(COOLDOWN_UNTIL_STORAGE_KEY);
      localStorage.removeItem(FAILED_ATTEMPTS_STORAGE_KEY);
      localStorage.removeItem(COOLDOWN_UNTIL_STORAGE_KEY);
    } catch {}
  }, []);

  // Unlock verification
  const isVerifyingRef = useRef(false);
  const unlockScreen = useCallback(
    async (password: string): Promise<{
      success: boolean;
      requiresSetup?: boolean;
      sessionExpired?: boolean;
      error?: string;
    }> => {
      // 1. Guard against concurrent submissions
      if (isVerifyingRef.current) {
        return { success: false, error: 'Verification in progress...' };
      }

      // 2. Cooldown check
      if (cooldownRemaining > 0) {
        return {
          success: false,
          error: `Too many failed attempts. Please wait ${cooldownRemaining}s before trying again, or log out.`,
        };
      }

      // 3. Progressive artificial delay based on recent failed attempts
      if (failedAttempts > 0 && failedAttempts < MAX_CONSECUTIVE_FAILURES) {
        const delayMs = Math.min(failedAttempts * 800, 3000);
        await new Promise((r) => setTimeout(r, delayMs));
      }

      // 4. Session validity check
      if (!supabaseAuthService.isAuthenticated()) {
        try {
          localStorage.removeItem(SCREEN_LOCK_STORAGE_KEY);
        } catch {}
        await supabaseAuthService.logout();
        return {
          success: false,
          sessionExpired: true,
          error: 'Your authenticated session has expired. Please log in again.',
        };
      }

      // 5. Target branch resolution
      if (!targetBranch?.id) {
        return {
          success: false,
          error: 'No active business location identified. Please contact support.',
        };
      }

      isVerifyingRef.current = true;
      try {
        const res = await branchService.verifyBranchUnlockPassword(targetBranch.id, password);

        if (res.sessionExpired) {
          try {
            localStorage.removeItem(SCREEN_LOCK_STORAGE_KEY);
          } catch {}
          await supabaseAuthService.logout();
          return {
            success: false,
            sessionExpired: true,
            error: res.error || 'Your session has expired. Please sign in again.',
          };
        }

        if (res.requiresSetup) {
          return {
            success: false,
            requiresSetup: true,
            error: res.error || 'Branch password has not been configured for this branch.',
          };
        }

        if (!res.success || !res.authorized) {
          recordFailedAttempt();
          return {
            success: false,
            error: res.error || 'Incorrect branch password.',
          };
        }

        // Verification successful!
        resetFailedAttempts();
        unlockLocalSession();
        return { success: true };
      } catch (err: any) {
        recordFailedAttempt();
        return {
          success: false,
          error: err?.message || 'Failed to verify branch password.',
        };
      } finally {
        isVerifyingRef.current = false;
      }
    },
    [
      cooldownRemaining,
      failedAttempts,
      targetBranch?.id,
      recordFailedAttempt,
      resetFailedAttempts,
      unlockLocalSession,
    ]
  );

  // Safe logout from lock screen
  const logoutAndReset = useCallback(async () => {
    try {
      localStorage.removeItem(SCREEN_LOCK_STORAGE_KEY);
      resetFailedAttempts();
    } catch {}
    await supabaseAuthService.logout();
  }, [resetFailedAttempts]);

  // Setup branch password (Owner only)
  const setupBranchPassword = useCallback(
    async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
      if (!newPassword || newPassword.trim().length < 4) {
        return { success: false, error: 'Branch access password must be at least 4 characters long.' };
      }

      if (!targetBranch?.id) {
        return { success: false, error: 'No active branch selected.' };
      }

      const role = (currentUser?.role || '').toLowerCase();
      if (role !== 'owner') {
        return { success: false, error: 'Permission denied: Only the Business Owner can configure branch passwords.' };
      }

      try {
        const res = await branchService.setBranchPassword(targetBranch.id, newPassword);
        if (!res.success) {
          return { success: false, error: res.error || 'Failed to configure branch password.' };
        }

        targetBranch.hasPassword = true;
        resetFailedAttempts();
        unlockLocalSession();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Error configuring branch password.' };
      }
    },
    [targetBranch, currentUser?.role, resetFailedAttempts, unlockLocalSession]
  );

  const value = useMemo<ScreenLockContextType>(
    () => ({
      isLocked,
      lockScreen,
      unlockScreen,
      setupBranchPassword,
      failedAttempts,
      isCooldown: cooldownRemaining > 0,
      cooldownRemaining,
      activeBranch: targetBranch,
      activeBranchName,
      activeBranchCode,
      currentUser,
      isBranchLoading: isLoadingBranches,
      branchHasPassword,
      logoutAndReset,
    }),
    [
      isLocked,
      lockScreen,
      unlockScreen,
      setupBranchPassword,
      failedAttempts,
      cooldownRemaining,
      targetBranch,
      activeBranchName,
      activeBranchCode,
      currentUser,
      isLoadingBranches,
      branchHasPassword,
      logoutAndReset,
    ]
  );

  return <ScreenLockContext.Provider value={value}>{children}</ScreenLockContext.Provider>;
};

export const useScreenLock = () => useContext(ScreenLockContext);

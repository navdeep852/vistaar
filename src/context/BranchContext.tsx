import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Branch } from '../types';
import { branchService } from '../services/supabase/branchService';
import { supabaseAuthService } from '../services/supabaseAuth';
import { safeGetTenantItem, safeSaveTenantItem } from '../services/supabase/safeStorage';
import { productService } from '../services/supabase/productService';
import { salesAnalyticsService } from '../services/supabase/salesAnalyticsService';
import { auditLogService } from '../services/supabase/auditLogService';

export interface BranchContextType {
  workspaceId: string;
  branchId: string | undefined; // current active branch ID (undefined for 'ALL')
  branchName: string;
  branchCode: string;
  role: string;
  currentBranch: Branch | null; // null signifies "All Branches"
  branches: Branch[]; // strictly authorized branches for current user
  allWorkspaceBranches: Branch[]; // complete list for enterprise admin management
  isLoadingBranches: boolean;
  isBranchReady: boolean; // TRUE once initial authorized branch resolution completes
  isAllBranchesSelected: boolean;
  canAccessAllBranches: boolean;
  activeBranchId: string | undefined;
  isOwner: boolean;
  targetSwitchBranch: Branch | null;
  switchBranch: (branchId: string | 'ALL', branchPassword?: string) => Promise<{ success: boolean; requiresSetup?: boolean; error?: string }>;
  requestSwitchBranch: (targetBranch?: Branch) => void;
  isSwitchModalOpen: boolean;
  closeSwitchModal: () => void;
  refreshBranches: () => Promise<void>;
}

const BranchContext = createContext<BranchContextType>({
  workspaceId: '',
  branchId: undefined,
  branchName: 'All Branches',
  branchCode: 'ALL',
  role: 'owner',
  currentBranch: null,
  branches: [],
  allWorkspaceBranches: [],
  isLoadingBranches: true,
  isBranchReady: false,
  isAllBranchesSelected: false,
  canAccessAllBranches: true,
  activeBranchId: undefined,
  isOwner: true,
  targetSwitchBranch: null,
  switchBranch: async () => ({ success: true }),
  requestSwitchBranch: () => {},
  isSwitchModalOpen: false,
  closeSwitchModal: () => {},
  refreshBranches: async () => {},
});

export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allWorkspaceBranches, setAllWorkspaceBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState<boolean>(true);
  const [isBranchReady, setIsBranchReady] = useState<boolean>(false);
  const [isAllExplicitlySelected, setIsAllExplicitlySelected] = useState<boolean>(false);
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState<boolean>(false);

  const [targetSwitchBranch, setTargetSwitchBranch] = useState<Branch | null>(null);

  const currentUser = supabaseAuthService.getUser();
  const isOwner = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    return role === 'owner';
  }, [currentUser]);

  const loadBranches = useCallback(async () => {
    try {
      setIsLoadingBranches(true);
      const [fullListRes, authorizedRes] = await Promise.all([
        branchService.getBranches({ activeOnly: true }),
        branchService.getUserAuthorizedBranches(currentUser?.id),
      ]);

      const fullList = fullListRes.data || [];
      const authorizedList = isOwner ? fullList : (authorizedRes.data || []);

      setAllWorkspaceBranches(fullList);
      setBranches(authorizedList);

      // Persist authoritative Main Branch ID
      const mainBranchObj = fullList.find((b) => b.isMainBranch) || fullList[0] || null;
      if (mainBranchObj) {
        safeSaveTenantItem('main_branch_id', mainBranchObj.id);
      }

      // Determine initial / restored branch
      const savedBranchId = safeGetTenantItem<string | null>('active_branch_id', null);

      if (isOwner) {
        if (savedBranchId === 'ALL') {
          setCurrentBranch(null);
          setIsAllExplicitlySelected(true);
        } else if (savedBranchId) {
          const match = fullList.find((b) => b.id === savedBranchId);
          if (match) {
            setCurrentBranch(match);
            setIsAllExplicitlySelected(false);
          } else {
            // Default to main branch
            const main = mainBranchObj;
            setCurrentBranch(main);
            setIsAllExplicitlySelected(false);
            if (main) {
              safeSaveTenantItem('active_branch_id', main.id);
              safeSaveTenantItem('main_branch_id', main.id);
            }
          }
        } else {
          // Default to main branch if available
          const main = mainBranchObj;
          setCurrentBranch(main);
          setIsAllExplicitlySelected(false);
          if (main) {
            safeSaveTenantItem('active_branch_id', main.id);
            safeSaveTenantItem('main_branch_id', main.id);
          }
        }
      } else {
        setIsAllExplicitlySelected(false);
        // CRITICAL EMPLOYEE RULE: Employee is permanently locked to their SINGLE assigned branch
        const assignedBranch = authorizedList[0] || fullList.find((b) => b.id === (currentUser as any)?.defaultBranchId) || mainBranchObj;
        setCurrentBranch(assignedBranch);
        if (assignedBranch) {
          safeSaveTenantItem('active_branch_id', assignedBranch.id);
        }
      }
      setIsBranchReady(true);
    } catch (err) {
      console.warn('Error loading branches:', err);
    } finally {
      setIsLoadingBranches(false);
    }
  }, [currentUser?.id, currentUser?.defaultBranchId, isOwner]);

  useEffect(() => {
    loadBranches();

    // Subscribe to auth / workspace state changes to reload branches
    const unsubscribeAuth = supabaseAuthService.subscribe(() => {
      loadBranches();
    });

    return () => {
      unsubscribeAuth();
    };
  }, [loadBranches]);

  const requestSwitchBranch = useCallback((targetBranch?: Branch) => {
    setTargetSwitchBranch(targetBranch || null);
    setIsSwitchModalOpen(true);
  }, []);

  const closeSwitchModal = useCallback(() => {
    setTargetSwitchBranch(null);
    setIsSwitchModalOpen(false);
  }, []);

  const switchBranch = useCallback(
    async (branchId: string | 'ALL', branchPassword?: string): Promise<{ success: boolean; requiresSetup?: boolean; error?: string }> => {
      // 1. Employee restriction: non-owners can NEVER switch branches
      if (!isOwner) {
        await auditLogService.logSecurityEvent({
          action: 'BRANCH_SWITCH_DENIED',
          result: 'DENIED',
          details: { reason: 'Employees are restricted to their assigned operating location', targetBranchId: branchId },
        });
        return { success: false, error: 'Unauthorized: Employees cannot switch branches. You are restricted to your assigned operating location.' };
      }

      // 2. All Branches (Consolidated enterprise view)
      if (branchId === 'ALL') {
        const oldBranchId = currentBranch?.id;
        setCurrentBranch(null);
        setIsAllExplicitlySelected(true);
        safeSaveTenantItem('active_branch_id', 'ALL');

        await auditLogService.logSecurityEvent({
          action: 'BRANCH_SWITCHED',
          result: 'ALLOWED',
          details: { fromBranch: oldBranchId || 'ALL', toBranch: 'ALL' },
        });

        // Clear branch-specific cached data
        productService.invalidateCache();
        salesAnalyticsService.invalidateCache();
        try {
          const { enterpriseAnalyticsService } = await import('../services/supabase/enterpriseAnalyticsService');
          enterpriseAnalyticsService.invalidateCache();
        } catch {}

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('vistaar:branch_changed', { detail: { branchId: 'ALL', branch: null } })
          );
          window.dispatchEvent(new CustomEvent('vistaar:refresh-dashboard'));
        }

        setIsSwitchModalOpen(false);
        setTargetSwitchBranch(null);
        return { success: true };
      }

      // 3. Specific Branch
      const selected = allWorkspaceBranches.find((b) => b.id === branchId);
      if (!selected) {
        await auditLogService.logSecurityEvent({
          action: 'BRANCH_SWITCH_DENIED',
          result: 'DENIED',
          details: { reason: 'Branch not found in business workspace', targetBranchId: branchId },
        });
        return { success: false, error: 'Branch not found in your business.' };
      }

      // If already on this branch, just close modal
      if (currentBranch?.id === branchId) {
        setIsSwitchModalOpen(false);
        setTargetSwitchBranch(null);
        return { success: true };
      }

      // VERIFY TARGET BRANCH ACCESS PASSWORD (NOT USER'S ACCOUNT PASSWORD!)
      const verifyRes = await branchService.verifyBranchPassword(branchId, branchPassword || '');
      if (!verifyRes.success || !verifyRes.authorized) {
        await auditLogService.logSecurityEvent({
          action: 'BRANCH_ACCESS_DENIED',
          result: 'DENIED',
          details: { targetBranchId: branchId, reason: verifyRes.error || 'Incorrect branch access password' },
        });
        return {
          success: false,
          requiresSetup: verifyRes.requiresSetup,
          error: verifyRes.error || 'Incorrect branch access password.',
        };
      }

      // Branch password verified! Activate target branch
      const oldBranchId = currentBranch?.id;
      setCurrentBranch(selected);
      setIsAllExplicitlySelected(false);
      safeSaveTenantItem('active_branch_id', selected.id);

      await auditLogService.logSecurityEvent({
        action: 'BRANCH_ACCESS_GRANTED',
        result: 'ALLOWED',
        details: { fromBranch: oldBranchId || 'ALL', toBranch: selected.id, branchCode: selected.branchCode },
      });

      // Invalidate caches immediately
      productService.invalidateCache();
      salesAnalyticsService.invalidateCache();
      try {
        const { enterpriseAnalyticsService } = await import('../services/supabase/enterpriseAnalyticsService');
        enterpriseAnalyticsService.invalidateCache();
      } catch {}

      // Notify all views and components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vistaar:branch_changed', { detail: { branchId: selected.id, branch: selected } })
        );
        window.dispatchEvent(new CustomEvent('vistaar:refresh-dashboard'));
      }

      setIsSwitchModalOpen(false);
      setTargetSwitchBranch(null);
      return { success: true };
    },
    [allWorkspaceBranches, currentBranch?.id, isOwner]
  );

  const contextValue = useMemo<BranchContextType>(
    () => ({
      workspaceId: supabaseAuthService.getAuthoritativeWorkspaceIdSync() || currentUser?.companyId || 'default',
      branchId: currentBranch?.id,
      branchName: currentBranch ? currentBranch.branchName : 'All Branches',
      branchCode: currentBranch ? currentBranch.branchCode : 'ALL',
      role: (currentUser?.role || 'employee').toLowerCase(),
      currentBranch,
      branches,
      allWorkspaceBranches,
      isLoadingBranches,
      isBranchReady,
      isAllBranchesSelected: isBranchReady && !isLoadingBranches && currentBranch === null && isAllExplicitlySelected && isOwner,
      canAccessAllBranches: isOwner,
      activeBranchId: currentBranch?.id,
      isOwner,
      targetSwitchBranch,
      switchBranch,
      requestSwitchBranch,
      isSwitchModalOpen,
      closeSwitchModal,
      refreshBranches: loadBranches,
    }),
    [
      currentUser?.companyId,
      currentUser?.role,
      currentBranch,
      branches,
      allWorkspaceBranches,
      isLoadingBranches,
      isBranchReady,
      isAllExplicitlySelected,
      isOwner,
      targetSwitchBranch,
      switchBranch,
      requestSwitchBranch,
      isSwitchModalOpen,
      closeSwitchModal,
      loadBranches,
    ]
  );

  return <BranchContext.Provider value={contextValue}>{children}</BranchContext.Provider>;
};

export const useBranch = () => useContext(BranchContext);

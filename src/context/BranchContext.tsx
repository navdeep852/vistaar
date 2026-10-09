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
  switchBranch: (branchId: string | 'ALL', bypassPasswordCheck?: boolean) => Promise<{ success: boolean; error?: string }>;
  requestSwitchBranch: () => void;
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

  const currentUser = supabaseAuthService.getUser();
  const isOwnerOrAdmin = useMemo(() => {
    if (!currentUser) return true;
    const role = (currentUser.role || '').toLowerCase();
    return role === 'owner' || role === 'admin' || role === 'super_admin' || !role;
  }, [currentUser]);

  const loadBranches = useCallback(async () => {
    try {
      setIsLoadingBranches(true);
      const [fullListRes, authorizedRes] = await Promise.all([
        branchService.getBranches({ activeOnly: true }),
        branchService.getUserAuthorizedBranches(currentUser?.id),
      ]);

      const fullList = fullListRes.data || [];
      const authorizedList = isOwnerOrAdmin ? fullList : (authorizedRes.data || []);

      setAllWorkspaceBranches(fullList);
      setBranches(authorizedList);

      // Determine initial / restored branch
      const savedBranchId = safeGetTenantItem<string | null>('active_branch_id', null);

      if (isOwnerOrAdmin) {
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
            const main = fullList.find((b) => b.isMainBranch) || fullList[0] || null;
            setCurrentBranch(main);
            setIsAllExplicitlySelected(false);
            if (main) safeSaveTenantItem('active_branch_id', main.id);
          }
        } else {
          // Default to main branch if available
          const main = fullList.find((b) => b.isMainBranch) || fullList[0] || null;
          setCurrentBranch(main);
          setIsAllExplicitlySelected(false);
          if (main) safeSaveTenantItem('active_branch_id', main.id);
        }
      } else {
        setIsAllExplicitlySelected(false);
        // Staff member: MUST have an assigned branch. CANNOT view "ALL" or unauthorized branches
        if (authorizedList.length === 1) {
          // Only 1 branch authorized: strictly force that branch
          setCurrentBranch(authorizedList[0]);
          safeSaveTenantItem('active_branch_id', authorizedList[0].id);
        } else if (authorizedList.length > 1) {
          const match = authorizedList.find((b) => b.id === savedBranchId);
          if (match) {
            setCurrentBranch(match);
          } else {
            setCurrentBranch(authorizedList[0]);
            safeSaveTenantItem('active_branch_id', authorizedList[0].id);
          }
        } else {
          // If no specific branch access assigned, check default non-main or fallback
          const defaultB = fullList.find((b) => !b.isMainBranch) || fullList[0] || null;
          setCurrentBranch(defaultB);
          if (defaultB) safeSaveTenantItem('active_branch_id', defaultB.id);
        }
      }
      setIsBranchReady(true);
    } catch (err) {
      console.warn('Error loading branches:', err);
    } finally {
      setIsLoadingBranches(false);
    }
  }, [currentUser?.id, isOwnerOrAdmin]);

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

  const requestSwitchBranch = useCallback(() => {
    setIsSwitchModalOpen(true);
  }, []);

  const closeSwitchModal = useCallback(() => {
    setIsSwitchModalOpen(false);
  }, []);

  const switchBranch = useCallback(
    async (branchId: string | 'ALL', bypassPasswordCheck = false): Promise<{ success: boolean; error?: string }> => {
      // 1. Authorization validation
      if (branchId === 'ALL') {
        if (!isOwnerOrAdmin) {
          await auditLogService.logSecurityEvent({
            action: 'BRANCH_SWITCH_DENIED',
            result: 'DENIED',
            details: { reason: 'Unauthorized attempt to switch to All Branches', target: 'ALL' },
          });
          return { success: false, error: 'Unauthorized: Staff members cannot view consolidated enterprise data.' };
        }

        const oldBranchId = currentBranch?.id;
        setCurrentBranch(null);
        setIsAllExplicitlySelected(true);
        safeSaveTenantItem('active_branch_id', 'ALL');

        // Audit log branch switch
        await auditLogService.logSecurityEvent({
          action: 'BRANCH_SWITCHED',
          result: 'ALLOWED',
          details: { fromBranch: oldBranchId || 'ALL', toBranch: 'ALL' },
        });

        // 2. Clear branch-specific cached data
        productService.invalidateCache();
        salesAnalyticsService.invalidateCache();
        try {
          const { enterpriseAnalyticsService } = await import('../services/supabase/enterpriseAnalyticsService');
          enterpriseAnalyticsService.invalidateCache();
        } catch {}

        // 3. Dispatch global events
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('vistaar:branch_changed', { detail: { branchId: 'ALL', branch: null } })
          );
          window.dispatchEvent(new CustomEvent('vistaar:refresh-dashboard'));
        }

        setIsSwitchModalOpen(false);
        return { success: true };
      }

      // Check if target branch is in authorized list
      const targetList = isOwnerOrAdmin ? allWorkspaceBranches : branches;
      const selected = targetList.find((b) => b.id === branchId);

      if (!selected) {
        await auditLogService.logSecurityEvent({
          action: 'BRANCH_SWITCH_DENIED',
          result: 'DENIED',
          details: { reason: 'Branch not found or unauthorized for this user', targetBranchId: branchId },
        });
        return { success: false, error: 'You are not authorized to access this branch.' };
      }

      const oldBranchId = currentBranch?.id;
      setCurrentBranch(selected);
      setIsAllExplicitlySelected(false);
      safeSaveTenantItem('active_branch_id', selected.id);

      // Audit log branch switch
      await auditLogService.logSecurityEvent({
        action: 'BRANCH_SWITCHED',
        result: 'ALLOWED',
        details: { fromBranch: oldBranchId || 'ALL', toBranch: selected.id, branchCode: selected.branchCode },
      });

      // 4. Invalidate caches immediately
      productService.invalidateCache();
      salesAnalyticsService.invalidateCache();
      try {
        const { enterpriseAnalyticsService } = await import('../services/supabase/enterpriseAnalyticsService');
        enterpriseAnalyticsService.invalidateCache();
      } catch {}

      // 5. Notify all views and components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vistaar:branch_changed', { detail: { branchId: selected.id, branch: selected } })
        );
        window.dispatchEvent(new CustomEvent('vistaar:refresh-dashboard'));
      }

      setIsSwitchModalOpen(false);
      return { success: true };
    },
    [allWorkspaceBranches, branches, currentBranch?.id, isOwnerOrAdmin]
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
      isAllBranchesSelected: isBranchReady && !isLoadingBranches && currentBranch === null && isAllExplicitlySelected && isOwnerOrAdmin,
      canAccessAllBranches: isOwnerOrAdmin,
      activeBranchId: currentBranch?.id,
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
      isOwnerOrAdmin,
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

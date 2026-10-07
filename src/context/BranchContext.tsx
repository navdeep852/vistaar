import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Branch } from '../types';
import { branchService } from '../services/supabase/branchService';
import { supabaseAuthService } from '../services/supabaseAuth';
import { safeGetTenantItem, safeSaveTenantItem } from '../services/supabase/safeStorage';

interface BranchContextType {
  currentBranch: Branch | null; // null signifies "All Branches"
  branches: Branch[];
  isLoadingBranches: boolean;
  isAllBranchesSelected: boolean;
  canAccessAllBranches: boolean;
  activeBranchId: string | undefined;
  switchBranch: (branchId: string | 'ALL') => Promise<void>;
  refreshBranches: () => Promise<void>;
}

const BranchContext = createContext<BranchContextType>({
  currentBranch: null,
  branches: [],
  isLoadingBranches: false,
  isAllBranchesSelected: true,
  canAccessAllBranches: true,
  activeBranchId: undefined,
  switchBranch: async () => {},
  refreshBranches: async () => {},
});

export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState<boolean>(true);

  const currentUser = supabaseAuthService.getUser();
  const isOwnerOrAdmin = useMemo(() => {
    if (!currentUser) return true;
    const role = (currentUser.role || '').toLowerCase();
    return role === 'owner' || role === 'admin' || role === 'super_admin' || !role;
  }, [currentUser]);

  const loadBranches = useCallback(async () => {
    try {
      setIsLoadingBranches(true);
      const { data: list = [] } = await branchService.getBranches({ activeOnly: true });
      setBranches(list);

      // Determine initial / restored branch
      const savedBranchId = safeGetTenantItem<string | null>('active_branch_id', null);

      if (isOwnerOrAdmin) {
        if (savedBranchId === 'ALL') {
          setCurrentBranch(null);
        } else if (savedBranchId) {
          const match = list.find((b) => b.id === savedBranchId);
          if (match) {
            setCurrentBranch(match);
          } else {
            // Default to main branch or all branches
            const main = list.find((b) => b.isMainBranch) || list[0] || null;
            setCurrentBranch(main);
          }
        } else {
          // Default to main branch if available, else first branch or null
          const main = list.find((b) => b.isMainBranch) || list[0] || null;
          setCurrentBranch(main);
        }
      } else {
        // Staff member: MUST have an assigned branch. Cannot view "ALL"
        if (savedBranchId && savedBranchId !== 'ALL') {
          const match = list.find((b) => b.id === savedBranchId);
          if (match) {
            setCurrentBranch(match);
          } else {
            setCurrentBranch(list[0] || null);
          }
        } else {
          const main = list.find((b) => b.isMainBranch) || list[0] || null;
          setCurrentBranch(main);
        }
      }
    } catch (err) {
      console.warn('Error loading branches:', err);
    } finally {
      setIsLoadingBranches(false);
    }
  }, [isOwnerOrAdmin]);

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

  const switchBranch = useCallback(
    async (branchId: string | 'ALL') => {
      if (branchId === 'ALL') {
        if (!isOwnerOrAdmin) {
          console.warn('Unauthorized attempt to switch to All Branches');
          return;
        }
        setCurrentBranch(null);
        safeSaveTenantItem('active_branch_id', 'ALL');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('vistaar:branch_changed', { detail: { branchId: 'ALL', branch: null } })
          );
        }
        return;
      }

      const selected = branches.find((b) => b.id === branchId);
      if (!selected) {
        console.warn(`Branch with id ${branchId} not found in authorized list.`);
        return;
      }

      setCurrentBranch(selected);
      safeSaveTenantItem('active_branch_id', selected.id);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vistaar:branch_changed', { detail: { branchId: selected.id, branch: selected } })
        );
      }
    },
    [branches, isOwnerOrAdmin]
  );

  const contextValue = useMemo<BranchContextType>(
    () => ({
      currentBranch,
      branches,
      isLoadingBranches,
      isAllBranchesSelected: currentBranch === null,
      canAccessAllBranches: isOwnerOrAdmin,
      activeBranchId: currentBranch?.id,
      switchBranch,
      refreshBranches: loadBranches,
    }),
    [currentBranch, branches, isLoadingBranches, isOwnerOrAdmin, switchBranch, loadBranches]
  );

  return <BranchContext.Provider value={contextValue}>{children}</BranchContext.Provider>;
};

export const useBranch = () => useContext(BranchContext);

import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { FinancialAccount, FinancialAccountType } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { fromDbFinancialAccount } from './types';

const LOCAL_ACCOUNTS_KEY = 'vistaar_local_financial_accounts_db';

export class FinancialAccountService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  /**
   * Auto-provision default accounts if workspace has 0 accounts
   */
  private getDefaultAccounts(wsId: string): FinancialAccount[] {
    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];
    return [
      {
        id: `acc-cash-${wsId.substring(0, 8)}`,
        workspaceId: wsId,
        name: 'Main Cash',
        accountType: 'CASH',
        openingBalance: 0,
        openingBalanceDate: todayStr,
        isDefault: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `acc-bank-${wsId.substring(0, 8)}`,
        workspaceId: wsId,
        name: 'Primary Bank',
        accountType: 'BANK',
        openingBalance: 0,
        openingBalanceDate: todayStr,
        isDefault: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `acc-upi-${wsId.substring(0, 8)}`,
        workspaceId: wsId,
        name: 'UPI Account',
        accountType: 'UPI',
        openingBalance: 0,
        openingBalanceDate: todayStr,
        isDefault: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  /**
   * Fetch all financial accounts for the current workspace with auto-provisioning
   */
  public async getAccounts(): Promise<FinancialAccount[]> {
    const wsId = this.getWorkspaceId();

    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('financial_accounts')
          .select('*')
          .eq('workspace_id', wsId)
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true });

        if (error) {
          handleSupabaseError(error, 'getAccounts');
          return this.getLocalAccounts(wsId);
        }

        if (!data || data.length === 0) {
          // Provision defaults
          const defaults = this.getDefaultAccounts(wsId);
          for (const acc of defaults) {
            await supabase.from('financial_accounts').insert([{
              id: acc.id.startsWith('acc-') ? undefined : acc.id,
              workspace_id: wsId,
              name: acc.name,
              account_type: acc.accountType,
              opening_balance: acc.openingBalance,
              opening_balance_date: acc.openingBalanceDate,
              is_default: acc.isDefault,
              is_active: acc.isActive,
            }]);
          }
          const { data: refetched } = await supabase
            .from('financial_accounts')
            .select('*')
            .eq('workspace_id', wsId)
            .eq('is_active', true);

          if (refetched && refetched.length > 0) {
            return refetched.map((row: any) => fromDbFinancialAccount(row));
          }
        } else {
          return data.map((row: any) => fromDbFinancialAccount(row));
        }
      }
    } catch (e) {
      handleSupabaseError(e, 'getAccounts');
    }

    return this.getLocalAccounts(wsId);
  }

  /**
   * Fetch a single financial account by ID
   */
  public async getAccountById(id: string): Promise<FinancialAccount | null> {
    const accounts = await this.getAccounts();
    return accounts.find((a) => a.id === id) || null;
  }

  /**
   * Create a new financial account
   */
  public async createAccount(payload: {
    name: string;
    accountType: FinancialAccountType;
    accountNumber?: string;
    ifscCode?: string;
    openingBalance?: number;
    openingBalanceDate?: string;
    isDefault?: boolean;
  }): Promise<{ success: boolean; data?: FinancialAccount; error?: string }> {
    const wsId = this.getWorkspaceId();
    const todayStr = new Date().toISOString().split('T')[0];

    const dbRecord = {
      workspace_id: wsId,
      name: payload.name.trim(),
      account_type: payload.accountType,
      account_number: payload.accountNumber?.trim() || null,
      ifsc_code: payload.ifscCode?.trim() || null,
      opening_balance: Math.abs(Number(payload.openingBalance) || 0),
      opening_balance_date: payload.openingBalanceDate || todayStr,
      is_default: Boolean(payload.isDefault),
      is_active: true,
    };

    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('financial_accounts')
          .insert([dbRecord])
          .select('*')
          .single();

        if (error) {
          const errStr = handleSupabaseError(error, 'createAccount');
          return { success: false, error: errStr };
        }

        return { success: true, data: fromDbFinancialAccount(data) };
      }
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createAccount');
      return { success: false, error: errStr };
    }

    // Local Fallback
    const local = safeGetTenantStorage<FinancialAccount>(LOCAL_ACCOUNTS_KEY, []);
    const newAcc: FinancialAccount = {
      id: `acc-local-${Date.now()}`,
      workspaceId: wsId,
      name: dbRecord.name,
      accountType: payload.accountType,
      accountNumber: payload.accountNumber,
      ifscCode: payload.ifscCode,
      openingBalance: dbRecord.opening_balance,
      openingBalanceDate: dbRecord.opening_balance_date,
      isDefault: dbRecord.is_default,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    local.push(newAcc);
    safeSaveTenantStorage<FinancialAccount>(LOCAL_ACCOUNTS_KEY, local);
    return { success: true, data: newAcc };
  }

  /**
   * Update an existing financial account
   */
  public async updateAccount(id: string, payload: Partial<FinancialAccount>): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();

    const dbUpdates: any = {};
    if (payload.name !== undefined) dbUpdates.name = payload.name.trim();
    if (payload.accountType !== undefined) dbUpdates.account_type = payload.accountType;
    if (payload.accountNumber !== undefined) dbUpdates.account_number = payload.accountNumber.trim();
    if (payload.ifscCode !== undefined) dbUpdates.ifsc_code = payload.ifscCode.trim();
    if (payload.openingBalance !== undefined) dbUpdates.opening_balance = Math.abs(Number(payload.openingBalance) || 0);
    if (payload.openingBalanceDate !== undefined) dbUpdates.opening_balance_date = payload.openingBalanceDate;
    if (payload.isDefault !== undefined) dbUpdates.is_default = payload.isDefault;

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('financial_accounts')
          .update(dbUpdates)
          .eq('workspace_id', wsId)
          .eq('id', id);

        if (error) {
          const errStr = handleSupabaseError(error, 'updateAccount');
          return { success: false, error: errStr };
        }

        return { success: true };
      }
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'updateAccount');
      return { success: false, error: errStr };
    }

    const local = safeGetTenantStorage<FinancialAccount>(LOCAL_ACCOUNTS_KEY, []);
    const idx = local.findIndex((a) => a.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...payload, updatedAt: new Date().toISOString() };
      safeSaveTenantStorage<FinancialAccount>(LOCAL_ACCOUNTS_KEY, local);
    }
    return { success: true };
  }

  // --- PRIVATE LOCAL STORAGE HELPER ---
  private getLocalAccounts(wsId: string): FinancialAccount[] {
    let local = safeGetTenantStorage<FinancialAccount>(LOCAL_ACCOUNTS_KEY, []);
    if (!local || local.length === 0) {
      local = this.getDefaultAccounts(wsId);
      safeSaveTenantStorage<FinancialAccount>(LOCAL_ACCOUNTS_KEY, local);
    }
    return local;
  }
}

export const financialAccountService = new FinancialAccountService();

import { supabase } from '../../lib/supabase';
import { Expense } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_EXPENSES_KEY = 'vistaar_local_expenses_db';

export class ExpenseService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getExpenses(): Promise<{ data: any[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        const errStr = handleSupabaseError(error, 'getExpenses');
        const fallback = safeGetTenantStorage(LOCAL_EXPENSES_KEY, []);
        return { data: fallback, error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getExpenses');
      const fallback = safeGetTenantStorage(LOCAL_EXPENSES_KEY, []);
      return { data: fallback, error: errStr };
    }
  }

  public async createExpense(exp: Partial<Expense>): Promise<{ expenseId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    const payload = {
      workspace_id: wsId,
      category: exp.category || 'Other',
      expense_name: exp.expenseName || null,
      amount: exp.amount || 0,
      date: exp.date || new Date().toISOString().split('T')[0],
      paid_to: exp.paidTo || null,
    };

    try {
      const { data, error } = await supabase
        .from('expenses')
        .insert([payload])
        .select('id')
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createExpense');
        if (errStr.startsWith('Network Error')) {
          const newId = `exp-${Date.now()}`;
          const newExp = { id: newId, ...exp, createdAt: new Date().toISOString() };
          const local = safeGetTenantStorage(LOCAL_EXPENSES_KEY, []);
          local.unshift(newExp);
          safeSaveTenantStorage(LOCAL_EXPENSES_KEY, local);
          return { expenseId: newId };
        }
        return { error: errStr };
      }
      return { expenseId: data.id };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createExpense');
      const newId = `exp-${Date.now()}`;
      const newExp = { id: newId, ...exp, createdAt: new Date().toISOString() };
      const local = safeGetTenantStorage(LOCAL_EXPENSES_KEY, []);
      local.unshift(newExp);
      safeSaveTenantStorage(LOCAL_EXPENSES_KEY, local);
      return { expenseId: newId };
    }
  }

  public async deleteExpense(id: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (error) {
        const errStr = handleSupabaseError(error, 'deleteExpense');
        return { success: false, error: errStr };
      }
      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'deleteExpense');
      return { success: false, error: errStr };
    }
  }
}

export const expenseService = new ExpenseService();

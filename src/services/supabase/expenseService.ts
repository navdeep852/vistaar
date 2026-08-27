import { supabase } from '../../lib/supabase';
import { Expense } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

const LOCAL_EXPENSES_KEY = 'vistaar_local_expenses_db';

const SEED_EXPENSES: any[] = [
  {
    id: 'exp-2026-001',
    category: 'Other',
    expenseName: 'Computer Repair',
    amount: 5000,
    date: '2026-08-23',
    paidTo: 'TechCare Solutions',
    referenceNo: 'TXN-9988',
    notes: 'Repaired motherboard for office workstation',
    createdAt: '2026-08-23T07:00:00Z',
  },
  {
    id: 'exp-2026-002',
    category: 'Marketing',
    amount: 2000,
    date: '2026-08-22',
    paidTo: 'Facebook Ads',
    referenceNo: 'FB-9021',
    notes: 'Social media ad campaign',
    createdAt: '2026-08-22T10:00:00Z',
  },
];

const safeStorageGet = (key: string, fallback: any[]): any[] => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(key);
      if (stored) return JSON.parse(stored);
    }
  } catch (e) {
    // ignore
  }
  return fallback;
};

const safeStorageSave = (key: string, items: any[]): void => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(items));
    }
  } catch (e) {
    // ignore
  }
};

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
        const fallback = safeStorageGet(LOCAL_EXPENSES_KEY, SEED_EXPENSES);
        return { data: fallback, error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getExpenses');
      const fallback = safeStorageGet(LOCAL_EXPENSES_KEY, SEED_EXPENSES);
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
          const local = safeStorageGet(LOCAL_EXPENSES_KEY, SEED_EXPENSES);
          local.unshift(newExp);
          safeStorageSave(LOCAL_EXPENSES_KEY, local);
          return { expenseId: newId };
        }
        return { error: errStr };
      }
      return { expenseId: data.id };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createExpense');
      const newId = `exp-${Date.now()}`;
      const newExp = { id: newId, ...exp, createdAt: new Date().toISOString() };
      const local = safeStorageGet(LOCAL_EXPENSES_KEY, SEED_EXPENSES);
      local.unshift(newExp);
      safeStorageSave(LOCAL_EXPENSES_KEY, local);
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

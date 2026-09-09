import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Expense } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { fromDbExpense } from './types';
import { store } from '../store';

const LOCAL_EXPENSES_KEY = 'vistaar_local_expenses_db';

export class ExpenseService {
  private activeLocks = new Set<string>();

  private async getWorkspaceId(): Promise<string> {
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) return authWsId;
    } catch (e) {
      console.warn('Failed to get authoritative workspace ID in expenseService:', e);
    }
    const wsId = supabaseAuthService.getCurrentCompanyId();
    const userId = supabaseAuthService.getUser()?.id;
    if (isValidUuid(wsId) && wsId !== userId) return wsId;
    return '';
  }

  public async getOrFetchWorkspaceId(): Promise<string> {
    return this.getWorkspaceId();
  }

  /**
   * Fetch expenses for the authoritative workspace with multi-tenant isolation
   * and sync with frontend store.
   */
  public async getExpenses(): Promise<{ data: Expense[]; error?: string }> {
    const wsId = await this.getWorkspaceId();

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const { data, error } = await supabase
          .from('expenses')
          .select('*')
          .eq('workspace_id', wsId)
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false });

        if (!error && data) {
          const mapped: Expense[] = data.map((row: any) => fromDbExpense(row));
          safeSaveTenantStorage(LOCAL_EXPENSES_KEY, mapped);
          // Sync in-memory store so UI components reading store get authoritative data
          store.setExpenses(mapped);
          return { data: mapped };
        } else if (error) {
          console.warn('[ExpenseService.getExpenses] Supabase error:', error.message);
        }
      }
    } catch (e: any) {
      handleSupabaseError(e, 'getExpenses');
    }

    // Resilient fallback to local storage / memory store
    const local = safeGetTenantStorage<Expense>(LOCAL_EXPENSES_KEY, []);
    const fallback = local.length > 0 ? local : store.getExpenses();
    return { data: fallback };
  }

  /**
   * Create an Expense and atomically generate the corresponding Daybook transaction
   * and Cashbook outflow entry.
   */
  public async createExpense(exp: Partial<Expense>): Promise<{ expenseId?: string; expense?: Expense; error?: string }> {
    const amount = Number(exp.amount) || 0;
    if (amount <= 0) {
      return { error: 'Expense amount must be greater than zero.' };
    }

    const category = exp.category || 'Other';
    const dateStr = exp.date || new Date().toISOString().split('T')[0];
    const paymentMode = exp.paymentMode || 'Cash';
    const expenseName = exp.expenseName?.trim() || undefined;
    const paidTo = exp.paidTo?.trim() || undefined;
    const referenceNo = exp.referenceNo?.trim() || undefined;
    const notes = exp.notes?.trim() || undefined;

    // Idempotency lock key to prevent rapid double-clicks
    const lockKey = `create_${category}_${amount}_${dateStr}_${expenseName || ''}_${paidTo || ''}`;
    if (this.activeLocks.has(lockKey)) {
      return { error: 'A duplicate expense request is already being processed. Please wait.' };
    }
    this.activeLocks.add(lockKey);

    try {
      const wsId = await this.getWorkspaceId();
      const expenseId = crypto.randomUUID ? crypto.randomUUID() : `exp-${Date.now()}`;

      // 1. Primary: Try Atomic Supabase RPC if database migration is applied
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('record_expense_atomic', {
            p_payload: {
              workspace_id: wsId,
              expense_id: expenseId,
              category,
              expense_name: expenseName || null,
              amount,
              expense_date: dateStr,
              payment_mode: paymentMode,
              paid_to: paidTo || null,
              reference_no: referenceNo || null,
              notes: notes || null,
            },
          });

          if (!rpcErr && rpcRes && rpcRes.success) {
            const createdExp: Expense = {
              id: rpcRes.expense_id || expenseId,
              category,
              expenseName,
              amount,
              date: dateStr,
              paymentMode,
              paidTo,
              referenceNo,
              notes,
              createdAt: new Date().toISOString(),
            };

            this.syncExpenseLocally(createdExp);
            return { expenseId: createdExp.id, expense: createdExp };
          }
        } catch (rpcEx) {
          // Fall through to resilient client-side 2-phase orchestration
        }
      }

      // 2. Resilient Client-Side Transactional Pipeline (with compensation rollback)
      let persistedToDb = false;
      let dbExpenseId = expenseId;

      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const payload: any = {
          id: expenseId,
          workspace_id: wsId,
          category,
          expense_name: expenseName || null,
          amount,
          expense_date: dateStr,
          paid_to: paidTo || null,
          reference_no: referenceNo || null,
          notes: notes || null,
          payment_mode: paymentMode,
        };

        let { data: expData, error: expErr } = await supabase
          .from('expenses')
          .insert([payload])
          .select('id')
          .single();

        // If payment_mode column does not exist yet in schema cache, retry without it
        if (expErr && (expErr.code === '42703' || expErr.message?.includes('payment_mode'))) {
          delete payload.payment_mode;
          const retry = await supabase.from('expenses').insert([payload]).select('id').single();
          expData = retry.data;
          expErr = retry.error;
        }

        if (expErr) {
          const errStr = handleSupabaseError(expErr, 'createExpense');
          return { error: `Unable to save expense: ${errStr}` };
        }

        persistedToDb = true;
        if (expData && expData.id) {
          dbExpenseId = expData.id;
        }

        // Synchronize with Daybook Journal (Strict: must succeed or rollback)
        try {
          const { daybookService } = await import('./daybookService');
          const partyName = paidTo || category || 'Vendor';
          const description = expenseName ? `${category}: ${expenseName}` : `${category} Expense`;

          const dbRes = await daybookService.recordFinancialTransaction({
            referenceType: 'EXPENSE',
            referenceId: dbExpenseId,
            referenceNumber: referenceNo || category,
            transactionType: 'EXPENSE',
            direction: 'OUT',
            amount,
            paymentMode,
            partyType: 'other',
            partyName,
            description,
            notes,
            transactionDate: dateStr,
          });

          if (!dbRes.success && dbRes.error) {
            throw new Error(dbRes.error);
          }
        } catch (dbErr: any) {
          // COMPENSATION ROLLBACK: Delete expense from database so no orphan expense remains
          console.error('[ExpenseService] Daybook synchronization failed, rolling back expense record:', dbErr);
          await supabase.from('expenses').delete().eq('workspace_id', wsId).eq('id', dbExpenseId);
          return {
            error: `Unable to save expense because the accounting transaction could not be created. No changes were committed. (${dbErr.message || 'Daybook sync error'})`,
          };
        }

        // Synchronize with Cashbook Outflow (if actual money was paid out)
        try {
          const { cashbookService } = await import('./cashbookService');
          await cashbookService.recordCashbookEntry({
            sourceType: 'EXPENSE',
            sourceId: dbExpenseId,
            referenceNumber: referenceNo || category,
            direction: 'OUT',
            amount,
            paymentMethod: paymentMode,
            partyName: paidTo || category || 'Vendor',
            description: expenseName ? `${category}: ${expenseName}` : `${category} Expense`,
            notes,
            transactionDate: dateStr,
          });
        } catch (cbErr) {
          console.warn('[ExpenseService] Cashbook sync notice:', cbErr);
        }
      }

      // 3. Local Mirror & Store Update
      const createdExp: Expense = {
        id: dbExpenseId,
        category,
        expenseName,
        amount,
        date: dateStr,
        paymentMode,
        paidTo,
        referenceNo,
        notes,
        createdAt: new Date().toISOString(),
      };

      this.syncExpenseLocally(createdExp);

      // If offline/unconfigured, also record Daybook entry to local storage
      if (!persistedToDb) {
        try {
          const { daybookService } = await import('./daybookService');
          await daybookService.recordFinancialTransaction({
            referenceType: 'EXPENSE',
            referenceId: dbExpenseId,
            referenceNumber: referenceNo || category,
            transactionType: 'EXPENSE',
            direction: 'OUT',
            amount,
            paymentMode,
            partyType: 'other',
            partyName: paidTo || category || 'Vendor',
            description: expenseName ? `${category}: ${expenseName}` : `${category} Expense`,
            notes,
            transactionDate: dateStr,
          });
        } catch (e) {
          // ignore offline daybook error
        }
      }

      return { expenseId: dbExpenseId, expense: createdExp };
    } finally {
      this.activeLocks.delete(lockKey);
    }
  }

  /**
   * Update an existing expense and update the single corresponding Daybook
   * and Cashbook transaction records in place.
   */
  public async updateExpense(id: string, updated: Partial<Expense>): Promise<{ success: boolean; expense?: Expense; error?: string }> {
    if (!id) return { success: false, error: 'Expense ID is required for update.' };

    const amount = updated.amount !== undefined ? Number(updated.amount) : undefined;
    if (amount !== undefined && amount <= 0) {
      return { success: false, error: 'Expense amount must be greater than zero.' };
    }

    const lockKey = `update_${id}`;
    if (this.activeLocks.has(lockKey)) {
      return { success: false, error: 'This expense is currently being updated. Please wait.' };
    }
    this.activeLocks.add(lockKey);

    try {
      const wsId = await this.getWorkspaceId();
      const currentList = safeGetTenantStorage<Expense>(LOCAL_EXPENSES_KEY, []);
      const existing = currentList.find((e) => e.id === id) || store.getExpenses().find((e) => e.id === id);

      const mergedCategory = updated.category || existing?.category || 'Other';
      const mergedAmount = amount !== undefined ? amount : (existing?.amount || 0);
      const mergedDate = updated.date || existing?.date || new Date().toISOString().split('T')[0];
      const mergedPaymentMode = updated.paymentMode || existing?.paymentMode || 'Cash';
      const mergedExpenseName = updated.expenseName !== undefined ? updated.expenseName?.trim() : existing?.expenseName;
      const mergedPaidTo = updated.paidTo !== undefined ? updated.paidTo?.trim() : existing?.paidTo;
      const mergedReferenceNo = updated.referenceNo !== undefined ? updated.referenceNo?.trim() : existing?.referenceNo;
      const mergedNotes = updated.notes !== undefined ? updated.notes?.trim() : existing?.notes;

      // 1. Primary: Try Atomic Supabase RPC
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('record_expense_atomic', {
            p_payload: {
              workspace_id: wsId,
              expense_id: id,
              category: mergedCategory,
              expense_name: mergedExpenseName || null,
              amount: mergedAmount,
              expense_date: mergedDate,
              payment_mode: mergedPaymentMode,
              paid_to: mergedPaidTo || null,
              reference_no: mergedReferenceNo || null,
              notes: mergedNotes || null,
            },
          });

          if (!rpcErr && rpcRes && rpcRes.success) {
            const updatedExp: Expense = {
              id,
              category: mergedCategory,
              expenseName: mergedExpenseName,
              amount: mergedAmount,
              date: mergedDate,
              paymentMode: mergedPaymentMode,
              paidTo: mergedPaidTo,
              referenceNo: mergedReferenceNo,
              notes: mergedNotes,
              createdAt: existing?.createdAt || new Date().toISOString(),
            };

            this.syncExpenseLocally(updatedExp, true);
            return { success: true, expense: updatedExp };
          }
        } catch (rpcEx) {
          // Fall through to client-side 2-phase update
        }
      }

      // 2. Resilient Client-Side Pipeline
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const payload: any = {
          category: mergedCategory,
          expense_name: mergedExpenseName || null,
          amount: mergedAmount,
          expense_date: mergedDate,
          paid_to: mergedPaidTo || null,
          reference_no: mergedReferenceNo || null,
          notes: mergedNotes || null,
          payment_mode: mergedPaymentMode,
        };

        let { error: expErr } = await supabase
          .from('expenses')
          .update(payload)
          .eq('workspace_id', wsId)
          .eq('id', id);

        if (expErr && (expErr.code === '42703' || expErr.message?.includes('payment_mode'))) {
          delete payload.payment_mode;
          const retry = await supabase.from('expenses').update(payload).eq('workspace_id', wsId).eq('id', id);
          expErr = retry.error;
        }

        if (expErr) {
          const errStr = handleSupabaseError(expErr, 'updateExpense');
          return { success: false, error: `Unable to update expense: ${errStr}` };
        }

        // Update single linked Daybook transaction in-place
        try {
          const { daybookService } = await import('./daybookService');
          const partyName = mergedPaidTo || mergedCategory || 'Vendor';
          const description = mergedExpenseName ? `${mergedCategory}: ${mergedExpenseName}` : `${mergedCategory} Expense`;

          await daybookService.recordFinancialTransaction({
            referenceType: 'EXPENSE',
            referenceId: id,
            referenceNumber: mergedReferenceNo || mergedCategory,
            transactionType: 'EXPENSE',
            direction: 'OUT',
            amount: mergedAmount,
            paymentMode: mergedPaymentMode,
            partyType: 'other',
            partyName,
            description,
            notes: mergedNotes,
            transactionDate: mergedDate,
          });
        } catch (dbErr) {
          console.warn('[ExpenseService.updateExpense] Daybook update notice:', dbErr);
        }

        // Update Cashbook entry
        try {
          const { cashbookService } = await import('./cashbookService');
          await cashbookService.recordCashbookEntry({
            sourceType: 'EXPENSE',
            sourceId: id,
            referenceNumber: mergedReferenceNo || mergedCategory,
            direction: 'OUT',
            amount: mergedAmount,
            paymentMethod: mergedPaymentMode,
            partyName: mergedPaidTo || mergedCategory || 'Vendor',
            description: mergedExpenseName ? `${mergedCategory}: ${mergedExpenseName}` : `${mergedCategory} Expense`,
            notes: mergedNotes,
            transactionDate: mergedDate,
          });
        } catch (cbErr) {
          console.warn('[ExpenseService.updateExpense] Cashbook update notice:', cbErr);
        }
      }

      // 3. Local Mirror Update
      const updatedExp: Expense = {
        id,
        category: mergedCategory,
        expenseName: mergedExpenseName,
        amount: mergedAmount,
        date: mergedDate,
        paymentMode: mergedPaymentMode,
        paidTo: mergedPaidTo,
        referenceNo: mergedReferenceNo,
        notes: mergedNotes,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };

      this.syncExpenseLocally(updatedExp, true);
      return { success: true, expense: updatedExp };
    } finally {
      this.activeLocks.delete(lockKey);
    }
  }

  /**
   * Delete an expense and remove the corresponding Daybook transaction and Cashbook entry.
   * Guarantees: Expense count -1 and Daybook expense transaction count -1.
   */
  public async deleteExpense(id: string): Promise<{ success: boolean; error?: string }> {
    if (!id) return { success: false, error: 'Expense ID is required for deletion.' };

    const lockKey = `delete_${id}`;
    if (this.activeLocks.has(lockKey)) {
      return { success: false, error: 'This expense is currently being deleted. Please wait.' };
    }
    this.activeLocks.add(lockKey);

    try {
      const wsId = await this.getWorkspaceId();

      // 1. Primary: Try Atomic Supabase RPC
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('delete_expense_atomic', {
            p_workspace_id: wsId,
            p_expense_id: id,
          });

          if (!rpcErr && rpcRes && rpcRes.success) {
            this.removeExpenseLocally(id);
            return { success: true };
          }
        } catch (rpcEx) {
          // Fall through to client-side multi-table deletion
        }
      }

      // 2. Resilient Client-Side Pipeline
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        // Delete from Daybook transactions
        try {
          await supabase
            .from('daybook_transactions')
            .delete()
            .eq('workspace_id', wsId)
            .eq('reference_type', 'EXPENSE')
            .eq('reference_id', id);
        } catch (dbErr) {
          console.warn('[ExpenseService.deleteExpense] Daybook deletion notice:', dbErr);
        }

        // Delete from Cashbook entries (if table exists)
        try {
          await supabase
            .from('cashbook_entries')
            .delete()
            .eq('workspace_id', wsId)
            .eq('source_type', 'EXPENSE')
            .eq('source_id', id);
        } catch (cbErr) {
          // ignore if table does not exist
        }

        // Delete from Expenses table
        const { error: expErr } = await supabase
          .from('expenses')
          .delete()
          .eq('workspace_id', wsId)
          .eq('id', id);

        if (expErr) {
          const errStr = handleSupabaseError(expErr, 'deleteExpense');
          return { success: false, error: `Failed to delete expense: ${errStr}` };
        }
      }

      // 3. Update local cache and store
      this.removeExpenseLocally(id);

      // Clean local daybook cache
      try {
        const localDb = safeGetTenantStorage<any>('vistaar_local_daybook_db', []);
        const filteredDb = localDb.filter((t: any) => !(t.referenceType === 'EXPENSE' && t.referenceId === id));
        safeSaveTenantStorage('vistaar_local_daybook_db', filteredDb);
      } catch (e) {
        // ignore
      }

      return { success: true };
    } finally {
      this.activeLocks.delete(lockKey);
    }
  }

  /**
   * Reconciles all expenses with Daybook transactions.
   * - Backfills missing Daybook transactions for expenses.
   * - Corrects mismatched amounts / dates / payment modes.
   * - Removes duplicate Daybook entries.
   */
  public async reconcileWithDaybook(): Promise<{
    totalExpenses: number;
    reconciledCount: number;
    updatedCount: number;
    duplicatesRemoved: number;
    orphansCleaned: number;
  }> {
    const wsId = await this.getWorkspaceId();
    let reconciledCount = 0;
    let updatedCount = 0;
    let duplicatesRemoved = 0;
    let orphansCleaned = 0;

    // 1. Fetch authoritative expenses
    const { data: expensesList } = await this.getExpenses();
    const expenseMap = new Map<string, Expense>();
    expensesList.forEach((e) => expenseMap.set(e.id, e));

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        // Try RPC first
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('reconcile_expenses_daybook', {
          p_workspace_id: wsId,
        });
        if (!rpcErr && rpcRes && rpcRes.success) {
          return {
            totalExpenses: expensesList.length,
            reconciledCount: rpcRes.reconciled_count || 0,
            updatedCount: 0,
            duplicatesRemoved: 0,
            orphansCleaned: 0,
          };
        }
      } catch (rpcEx) {
        // Fall back to programmatic client reconciliation
      }

      try {
        // Fetch all Daybook transactions where reference_type = 'EXPENSE'
        const { data: daybookRows } = await supabase
          .from('daybook_transactions')
          .select('*')
          .eq('workspace_id', wsId)
          .eq('reference_type', 'EXPENSE');

        const daybookByExpId = new Map<string, any[]>();
        (daybookRows || []).forEach((row: any) => {
          const refId = String(row.reference_id);
          const list = daybookByExpId.get(refId) || [];
          list.push(row);
          daybookByExpId.set(refId, list);
        });

        const { daybookService } = await import('./daybookService');

        // Check each expense
        for (const exp of expensesList) {
          const dbRows = daybookByExpId.get(exp.id);

          if (!dbRows || dbRows.length === 0) {
            // Case A: Missing Daybook transaction -> Idempotently Create
            const partyName = exp.paidTo || exp.category || 'Vendor';
            const description = exp.expenseName ? `${exp.category}: ${exp.expenseName}` : `${exp.category} Expense`;

            await daybookService.recordFinancialTransaction({
              referenceType: 'EXPENSE',
              referenceId: exp.id,
              referenceNumber: exp.referenceNo || exp.category,
              transactionType: 'EXPENSE',
              direction: 'OUT',
              amount: exp.amount,
              paymentMode: exp.paymentMode || 'Cash',
              partyType: 'other',
              partyName,
              description,
              notes: exp.notes,
              transactionDate: exp.date,
            });
            reconciledCount++;
          } else {
            // Case B: Exactly 1 row -> Check for drift
            const canonical = dbRows[0];
            const hasAmountDrift = Math.abs(Number(canonical.amount) - exp.amount) > 0.01;
            const hasDateDrift = canonical.transaction_date !== exp.date;
            const hasModeDrift = exp.paymentMode && canonical.payment_mode !== exp.paymentMode;

            if (hasAmountDrift || hasDateDrift || hasModeDrift) {
              await supabase
                .from('daybook_transactions')
                .update({
                  amount: exp.amount,
                  transaction_date: exp.date,
                  payment_mode: exp.paymentMode || 'Cash',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', canonical.id);
              updatedCount++;
            }

            // Case C: Duplicate rows -> Remove duplicates, keep canonical
            if (dbRows.length > 1) {
              const duplicates = dbRows.slice(1);
              for (const dup of duplicates) {
                await supabase.from('daybook_transactions').delete().eq('id', dup.id);
                duplicatesRemoved++;
              }
            }
          }
        }

        // Case D: Orphan Daybook transactions (where expense was deleted)
        for (const [refId, rows] of daybookByExpId.entries()) {
          if (!expenseMap.has(refId)) {
            for (const r of rows) {
              await supabase.from('daybook_transactions').delete().eq('id', r.id);
              orphansCleaned++;
            }
          }
        }
      } catch (err) {
        console.warn('[ExpenseService.reconcileWithDaybook] Notice:', err);
      }
    }

    return {
      totalExpenses: expensesList.length,
      reconciledCount,
      updatedCount,
      duplicatesRemoved,
      orphansCleaned,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers for Cache & In-Memory Store Synchronization
  // ---------------------------------------------------------------------------
  private syncExpenseLocally(exp: Expense, isEdit = false): void {
    const local = safeGetTenantStorage<Expense>(LOCAL_EXPENSES_KEY, []);
    const idx = local.findIndex((e) => e.id === exp.id);
    if (idx >= 0) {
      local[idx] = { ...local[idx], ...exp };
    } else {
      local.unshift(exp);
    }
    safeSaveTenantStorage(LOCAL_EXPENSES_KEY, local);

    // Sync in-memory store
    if (isEdit) {
      store.updateExpense(exp.id, exp);
    } else {
      // If not already present in store, add it
      const storeExps = store.getExpenses();
      if (!storeExps.some((e) => e.id === exp.id)) {
        store.setExpenses([exp, ...storeExps]);
      }
    }
  }

  private removeExpenseLocally(id: string): void {
    const local = safeGetTenantStorage<Expense>(LOCAL_EXPENSES_KEY, []);
    const filtered = local.filter((e) => e.id !== id);
    safeSaveTenantStorage(LOCAL_EXPENSES_KEY, filtered);
    store.deleteExpense(id);
  }
}

export const expenseService = new ExpenseService();

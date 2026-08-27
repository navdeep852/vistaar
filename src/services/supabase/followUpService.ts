import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { FollowUp } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

const LOCAL_FOLLOWUPS_KEY = 'vistaar_local_followups_db';

const safeStorageGet = (key: string): any[] => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(key);
      if (stored) return JSON.parse(stored);
    }
  } catch (e) {
    // ignore
  }
  return [];
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

export class FollowUpService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getFollowUps(options?: { status?: string; customerId?: string }): Promise<{ data: any[]; error?: string }> {
    if (!isSupabaseConfigured()) {
      const fallback = safeStorageGet(LOCAL_FOLLOWUPS_KEY);
      return { data: fallback };
    }
    const wsId = this.getWorkspaceId();
    let query = supabase.from('follow_ups').select('*').eq('workspace_id', wsId);

    if (options?.status) query = query.eq('status', options.status);
    if (options?.customerId) query = query.eq('customer_id', options.customerId);

    try {
      const { data, error } = await query.order('due_date', { ascending: true });
      if (error) {
        const errStr = handleSupabaseError(error, 'getFollowUps');
        const fallback = safeStorageGet(LOCAL_FOLLOWUPS_KEY);
        return { data: fallback, error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getFollowUps');
      const fallback = safeStorageGet(LOCAL_FOLLOWUPS_KEY);
      return { data: fallback, error: errStr };
    }
  }

  public async getFollowUpById(id: string): Promise<{ data?: any; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('id', id)
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'getFollowUpById');
        return { error: errStr };
      }
      return { data };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getFollowUpById');
      return { error: errStr };
    }
  }

  public async createFollowUp(followUp: Partial<FollowUp>): Promise<{ followUp?: any; error?: string }> {
    const wsId = this.getWorkspaceId();
    const payload = {
      workspace_id: wsId,
      customer_id: followUp.customerId || null,
      customer_name: followUp.customerName || 'Customer',
      customer_phone: followUp.customerPhone || '',
      title: followUp.title || 'Follow-up',
      due_date: followUp.dueDate || new Date().toISOString().split('T')[0],
      due_time: followUp.dueTime || '10:00',
      priority: followUp.priority || 'Medium',
      status: followUp.status || 'Pending',
      action_type: followUp.actionType || 'WHATSAPP_MESSAGE',
      attempt_count: followUp.attemptCount || 0,
      max_attempts: followUp.maxAttempts || 3,
      execution_logs: followUp.executionLogs || [],
    };

    try {
      const { data, error } = await supabase
        .from('follow_ups')
        .insert([payload])
        .select()
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createFollowUp');
        if (errStr.startsWith('Network Error')) {
          const newF = { id: `fu-${Date.now()}`, ...payload, createdAt: new Date().toISOString() };
          const local = safeStorageGet(LOCAL_FOLLOWUPS_KEY);
          local.unshift(newF);
          safeStorageSave(LOCAL_FOLLOWUPS_KEY, local);
          return { followUp: newF };
        }
        return { error: errStr };
      }
      return { followUp: data };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createFollowUp');
      const newF = { id: `fu-${Date.now()}`, ...payload, createdAt: new Date().toISOString() };
      const local = safeStorageGet(LOCAL_FOLLOWUPS_KEY);
      local.unshift(newF);
      safeStorageSave(LOCAL_FOLLOWUPS_KEY, local);
      return { followUp: newF };
    }
  }

  public async updateFollowUp(id: string, updates: Partial<FollowUp>): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase
        .from('follow_ups')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (error) {
        const errStr = handleSupabaseError(error, 'updateFollowUp');
        return { success: false, error: errStr };
      }
      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'updateFollowUp');
      return { success: false, error: errStr };
    }
  }

  public async updateFollowUpStatus(id: string, status: string, errorMessage?: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const payload: any = { status, updated_at: new Date().toISOString() };
      if (errorMessage !== undefined) payload.error_message = errorMessage;

      const { error } = await supabase
        .from('follow_ups')
        .update(payload)
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (error) {
        const errStr = handleSupabaseError(error, 'updateFollowUpStatus');
        return { success: false, error: errStr };
      }
      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'updateFollowUpStatus');
      return { success: false, error: errStr };
    }
  }

  public async appendExecutionLog(id: string, logItem: any): Promise<{ success: boolean; error?: string }> {
    const { data: current, error: fetchErr } = await this.getFollowUpById(id);
    if (fetchErr || !current) return { success: false, error: fetchErr || 'Record not found' };

    const logs = Array.isArray(current.execution_logs) ? [...current.execution_logs, logItem] : [logItem];
    return this.updateFollowUp(id, { executionLogs: logs } as any);
  }

  public async deleteFollowUp(id: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase
        .from('follow_ups')
        .delete()
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (error) {
        const errStr = handleSupabaseError(error, 'deleteFollowUp');
        return { success: false, error: errStr };
      }
      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'deleteFollowUp');
      return { success: false, error: errStr };
    }
  }
}

export const followUpService = new FollowUpService();

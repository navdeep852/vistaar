import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { AppNotification } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

export class NotificationService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getNotifications(): Promise<{ data: any[]; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { data: [] };
    }
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        const errStr = handleSupabaseError(error, 'getNotifications');
        return { data: [], error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getNotifications');
      return { data: [], error: errStr };
    }
  }

  public async getUnreadCount(): Promise<{ count: number; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { count: 0 };
    }
    const wsId = this.getWorkspaceId();
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', wsId)
        .eq('read', false);

      if (error) {
        const errStr = handleSupabaseError(error, 'getUnreadCount');
        return { count: 0, error: errStr };
      }
      return { count: count || 0 };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getUnreadCount');
      return { count: 0, error: errStr };
    }
  }

  public async createNotification(notif: Partial<AppNotification>): Promise<{ notificationId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert([{
          workspace_id: wsId,
          type: notif.type || 'SYSTEM',
          title: notif.title || 'System Notification',
          message: notif.message,
          read: notif.read || false,
          route_link: notif.linkRoute || null,
        }])
        .select('id')
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createNotification');
        return { error: errStr };
      }
      return { notificationId: data.id };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createNotification');
      return { error: errStr };
    }
  }

  public async markAsRead(id: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true, updated_at: new Date().toISOString() })
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (error) {
        const errStr = handleSupabaseError(error, 'markAsRead');
        return { success: false, error: errStr };
      }
      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'markAsRead');
      return { success: false, error: errStr };
    }
  }
}

export const notificationService = new NotificationService();

import { supabase } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

export class SupabaseBusinessSettingsService {
  public async getSettings(): Promise<{ success: boolean; data?: any; error?: string }> {
    const workspaceId = supabaseAuthService.getCurrentCompanyId();
    try {
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (error) {
        const errStr = handleSupabaseError(error, 'getSettings');
        return { success: false, error: errStr };
      }
      return { success: true, data };
    } catch (err: any) {
      const errStr = handleSupabaseError(err, 'getSettings');
      return { success: false, error: errStr };
    }
  }

  public async updateSettings(settings: any): Promise<{ success: boolean; error?: string }> {
    const workspaceId = supabaseAuthService.getCurrentCompanyId();
    try {
      const { error } = await supabase
        .from('business_settings')
        .upsert(
          {
            workspace_id: workspaceId,
            ...settings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id' }
        );

      if (error) {
        const errStr = handleSupabaseError(error, 'updateSettings');
        return { success: false, error: errStr };
      }
      return { success: true };
    } catch (err: any) {
      const errStr = handleSupabaseError(err, 'updateSettings');
      return { success: false, error: errStr };
    }
  }
}

export const businessSettingsService = new SupabaseBusinessSettingsService();

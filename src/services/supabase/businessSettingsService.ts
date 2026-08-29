import { supabase } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { validateIndianPhoneNumber } from '../../lib/phoneUtils';

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

    if (settings.phone) {
      const pRes = validateIndianPhoneNumber(settings.phone, false);
      if (!pRes.isValid) {
        return { success: false, error: pRes.error || 'Business phone number must contain exactly 10 digits.' };
      }
      settings.phone = pRes.normalized;
    }

    const alt = settings.alternate_phone || settings.alternatePhone;
    if (alt) {
      const aRes = validateIndianPhoneNumber(alt, false);
      if (!aRes.isValid) {
        return { success: false, error: aRes.error || 'Alternate phone number must contain exactly 10 digits.' };
      }
      if (settings.alternate_phone) settings.alternate_phone = aRes.normalized;
      if (settings.alternatePhone) settings.alternatePhone = aRes.normalized;
    }

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

import { supabase } from '../../lib/supabase';
import { Transporter } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_TRANSPORTERS_KEY = 'vistaar_local_transporters_db';

export class TransporterService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getTransporters(): Promise<{ data: Transporter[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('transporters')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        const errStr = handleSupabaseError(error, 'getTransporters');
        const fallback = safeGetTenantStorage<Transporter>(LOCAL_TRANSPORTERS_KEY, []);
        return { data: fallback, error: errStr };
      }

      const mapped: Transporter[] = (data || []).map((row: any) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        gstinTransporterId: row.gstin_transporter_id,
        phone: row.phone,
        email: row.email,
        address: row.address,
        state: row.state,
        pincode: row.pincode,
        status: row.status || 'ACTIVE',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      safeSaveTenantStorage(LOCAL_TRANSPORTERS_KEY, mapped);
      return { data: mapped };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getTransporters');
      const fallback = safeGetTenantStorage<Transporter>(LOCAL_TRANSPORTERS_KEY, []);
      return { data: fallback, error: errStr };
    }
  }

  public async createTransporter(transporter: Partial<Transporter>): Promise<{ data?: Transporter; error?: string }> {
    const wsId = this.getWorkspaceId();
    const payload = {
      workspace_id: wsId,
      name: transporter.name,
      gstin_transporter_id: transporter.gstinTransporterId || transporter.name,
      phone: transporter.phone || '',
      email: transporter.email || '',
      address: transporter.address || '',
      state: transporter.state || '',
      pincode: transporter.pincode || '',
      status: transporter.status || 'ACTIVE',
    };

    try {
      const { data, error } = await supabase.from('transporters').insert([payload]).select('*').single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createTransporter');
        const localObj: Transporter = {
          id: `trans-${Date.now()}`,
          workspaceId: wsId,
          name: transporter.name || '',
          gstinTransporterId: transporter.gstinTransporterId || '',
          phone: transporter.phone,
          email: transporter.email,
          address: transporter.address,
          state: transporter.state,
          pincode: transporter.pincode,
          status: transporter.status || 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const list = safeGetTenantStorage<Transporter>(LOCAL_TRANSPORTERS_KEY, []);
        list.unshift(localObj);
        safeSaveTenantStorage(LOCAL_TRANSPORTERS_KEY, list);
        return { data: localObj };
      }

      const created: Transporter = {
        id: data.id,
        workspaceId: data.workspace_id,
        name: data.name,
        gstinTransporterId: data.gstin_transporter_id,
        phone: data.phone,
        email: data.email,
        address: data.address,
        state: data.state,
        pincode: data.pincode,
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      const list = safeGetTenantStorage<Transporter>(LOCAL_TRANSPORTERS_KEY, []);
      list.unshift(created);
      safeSaveTenantStorage(LOCAL_TRANSPORTERS_KEY, list);

      return { data: created };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createTransporter');
      const localObj: Transporter = {
        id: `trans-${Date.now()}`,
        workspaceId: wsId,
        name: transporter.name || '',
        gstinTransporterId: transporter.gstinTransporterId || '',
        phone: transporter.phone,
        email: transporter.email,
        address: transporter.address,
        state: transporter.state,
        pincode: transporter.pincode,
        status: transporter.status || 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const list = safeGetTenantStorage<Transporter>(LOCAL_TRANSPORTERS_KEY, []);
      list.unshift(localObj);
      safeSaveTenantStorage(LOCAL_TRANSPORTERS_KEY, list);
      return { data: localObj };
    }
  }

  public async deleteTransporter(id: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase.from('transporters').delete().eq('workspace_id', wsId).eq('id', id);
      if (error) handleSupabaseError(error, 'deleteTransporter');

      const list = safeGetTenantStorage<Transporter>(LOCAL_TRANSPORTERS_KEY, []);
      const filtered = list.filter((item) => item.id !== id);
      safeSaveTenantStorage(LOCAL_TRANSPORTERS_KEY, filtered);

      return { success: true };
    } catch (e: any) {
      const list = safeGetTenantStorage<Transporter>(LOCAL_TRANSPORTERS_KEY, []);
      const filtered = list.filter((item) => item.id !== id);
      safeSaveTenantStorage(LOCAL_TRANSPORTERS_KEY, filtered);
      return { success: true };
    }
  }
}

export const transporterService = new TransporterService();

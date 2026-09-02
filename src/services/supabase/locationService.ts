import { supabase } from '../../lib/supabase';
import { BusinessLocation } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_LOCATIONS_KEY = 'vistaar_local_locations_db';

export class LocationService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getLocations(): Promise<{ data: BusinessLocation[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('business_locations')
        .select('*')
        .eq('workspace_id', wsId)
        .order('is_default', { ascending: false });

      if (error) {
        const errStr = handleSupabaseError(error, 'getLocations');
        const fallback = safeGetTenantStorage<BusinessLocation>(LOCAL_LOCATIONS_KEY, []);
        return { data: fallback, error: errStr };
      }

      const mapped: BusinessLocation[] = (data || []).map((row: any) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        locationType: row.location_type || 'WAREHOUSE',
        locationName: row.location_name,
        gstin: row.gstin,
        tradeName: row.trade_name,
        address: row.address,
        city: row.city,
        state: row.state,
        pincode: row.pincode,
        isDefault: row.is_default || false,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      safeSaveTenantStorage(LOCAL_LOCATIONS_KEY, mapped);
      return { data: mapped };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getLocations');
      const fallback = safeGetTenantStorage<BusinessLocation>(LOCAL_LOCATIONS_KEY, []);
      return { data: fallback, error: errStr };
    }
  }

  public async createLocation(location: Partial<BusinessLocation>): Promise<{ data?: BusinessLocation; error?: string }> {
    const wsId = this.getWorkspaceId();
    const payload = {
      workspace_id: wsId,
      location_type: location.locationType || 'WAREHOUSE',
      location_name: location.locationName,
      gstin: location.gstin || null,
      trade_name: location.tradeName || location.locationName,
      address: location.address || '',
      city: location.city || '',
      state: location.state || '',
      pincode: location.pincode || '',
      is_default: location.isDefault || false,
    };

    try {
      const { data, error } = await supabase.from('business_locations').insert([payload]).select('*').single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createLocation');
        const localObj: BusinessLocation = {
          id: `loc-${Date.now()}`,
          workspaceId: wsId,
          locationType: location.locationType || 'WAREHOUSE',
          locationName: location.locationName || 'Dispatch Point',
          gstin: location.gstin,
          tradeName: location.tradeName,
          address: location.address || '',
          city: location.city,
          state: location.state || '',
          pincode: location.pincode || '',
          isDefault: location.isDefault || false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const list = safeGetTenantStorage<BusinessLocation>(LOCAL_LOCATIONS_KEY, []);
        list.unshift(localObj);
        safeSaveTenantStorage(LOCAL_LOCATIONS_KEY, list);
        return { data: localObj };
      }

      const created: BusinessLocation = {
        id: data.id,
        workspaceId: data.workspace_id,
        locationType: data.location_type,
        locationName: data.location_name,
        gstin: data.gstin,
        tradeName: data.trade_name,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        isDefault: data.is_default,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      const list = safeGetTenantStorage<BusinessLocation>(LOCAL_LOCATIONS_KEY, []);
      list.unshift(created);
      safeSaveTenantStorage(LOCAL_LOCATIONS_KEY, list);

      return { data: created };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createLocation');
      const localObj: BusinessLocation = {
        id: `loc-${Date.now()}`,
        workspaceId: wsId,
        locationType: location.locationType || 'WAREHOUSE',
        locationName: location.locationName || 'Dispatch Point',
        gstin: location.gstin,
        tradeName: location.tradeName,
        address: location.address || '',
        city: location.city,
        state: location.state || '',
        pincode: location.pincode || '',
        isDefault: location.isDefault || false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const list = safeGetTenantStorage<BusinessLocation>(LOCAL_LOCATIONS_KEY, []);
      list.unshift(localObj);
      safeSaveTenantStorage(LOCAL_LOCATIONS_KEY, list);
      return { data: localObj };
    }
  }

  public async deleteLocation(id: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase.from('business_locations').delete().eq('workspace_id', wsId).eq('id', id);
      if (error) handleSupabaseError(error, 'deleteLocation');

      const list = safeGetTenantStorage<BusinessLocation>(LOCAL_LOCATIONS_KEY, []);
      const filtered = list.filter((item) => item.id !== id);
      safeSaveTenantStorage(LOCAL_LOCATIONS_KEY, filtered);

      return { success: true };
    } catch (e: any) {
      const list = safeGetTenantStorage<BusinessLocation>(LOCAL_LOCATIONS_KEY, []);
      const filtered = list.filter((item) => item.id !== id);
      safeSaveTenantStorage(LOCAL_LOCATIONS_KEY, filtered);
      return { success: true };
    }
  }
}

export const locationService = new LocationService();

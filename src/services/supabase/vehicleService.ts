import { supabase } from '../../lib/supabase';
import { Vehicle } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_VEHICLES_KEY = 'vistaar_local_vehicles_db';

export class VehicleService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getVehicles(): Promise<{ data: Vehicle[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*, transporters(name)')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        const errStr = handleSupabaseError(error, 'getVehicles');
        const fallback = safeGetTenantStorage<Vehicle>(LOCAL_VEHICLES_KEY, []);
        return { data: fallback, error: errStr };
      }

      const mapped: Vehicle[] = (data || []).map((row: any) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        vehicleNumber: row.vehicle_number,
        vehicleType: row.vehicle_type || 'REGULAR',
        transporterId: row.transporter_id,
        transporterName: row.transporters?.name,
        ownerName: row.owner_name,
        status: row.status || 'ACTIVE',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      safeSaveTenantStorage(LOCAL_VEHICLES_KEY, mapped);
      return { data: mapped };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getVehicles');
      const fallback = safeGetTenantStorage<Vehicle>(LOCAL_VEHICLES_KEY, []);
      return { data: fallback, error: errStr };
    }
  }

  public async createVehicle(vehicle: Partial<Vehicle>): Promise<{ data?: Vehicle; error?: string }> {
    const wsId = this.getWorkspaceId();
    const cleanVehNum = (vehicle.vehicleNumber || '').replace(/[\s-]/g, '').toUpperCase();

    const payload = {
      workspace_id: wsId,
      vehicle_number: cleanVehNum,
      vehicle_type: vehicle.vehicleType || 'REGULAR',
      transporter_id: vehicle.transporterId || null,
      owner_name: vehicle.ownerName || '',
      status: vehicle.status || 'ACTIVE',
    };

    try {
      const { data, error } = await supabase.from('vehicles').insert([payload]).select('*').single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createVehicle');
        const localObj: Vehicle = {
          id: `veh-${Date.now()}`,
          workspaceId: wsId,
          vehicleNumber: cleanVehNum,
          vehicleType: vehicle.vehicleType || 'REGULAR',
          transporterId: vehicle.transporterId,
          ownerName: vehicle.ownerName,
          status: vehicle.status || 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const list = safeGetTenantStorage<Vehicle>(LOCAL_VEHICLES_KEY, []);
        list.unshift(localObj);
        safeSaveTenantStorage(LOCAL_VEHICLES_KEY, list);
        return { data: localObj };
      }

      const created: Vehicle = {
        id: data.id,
        workspaceId: data.workspace_id,
        vehicleNumber: data.vehicle_number,
        vehicleType: data.vehicle_type,
        transporterId: data.transporter_id,
        ownerName: data.owner_name,
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      const list = safeGetTenantStorage<Vehicle>(LOCAL_VEHICLES_KEY, []);
      list.unshift(created);
      safeSaveTenantStorage(LOCAL_VEHICLES_KEY, list);

      return { data: created };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createVehicle');
      const localObj: Vehicle = {
        id: `veh-${Date.now()}`,
        workspaceId: wsId,
        vehicleNumber: cleanVehNum,
        vehicleType: vehicle.vehicleType || 'REGULAR',
        transporterId: vehicle.transporterId,
        ownerName: vehicle.ownerName,
        status: vehicle.status || 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const list = safeGetTenantStorage<Vehicle>(LOCAL_VEHICLES_KEY, []);
      list.unshift(localObj);
      safeSaveTenantStorage(LOCAL_VEHICLES_KEY, list);
      return { data: localObj };
    }
  }

  public async deleteVehicle(id: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase.from('vehicles').delete().eq('workspace_id', wsId).eq('id', id);
      if (error) handleSupabaseError(error, 'deleteVehicle');

      const list = safeGetTenantStorage<Vehicle>(LOCAL_VEHICLES_KEY, []);
      const filtered = list.filter((item) => item.id !== id);
      safeSaveTenantStorage(LOCAL_VEHICLES_KEY, filtered);

      return { success: true };
    } catch (e: any) {
      const list = safeGetTenantStorage<Vehicle>(LOCAL_VEHICLES_KEY, []);
      const filtered = list.filter((item) => item.id !== id);
      safeSaveTenantStorage(LOCAL_VEHICLES_KEY, filtered);
      return { success: true };
    }
  }
}

export const vehicleService = new VehicleService();

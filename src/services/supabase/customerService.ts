import { supabase } from '../../lib/supabase';
import { Customer } from '../../types';
import { DbCustomer, fromDbCustomer, toDbCustomer } from './types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { validateIndianPhoneNumber } from '../../lib/phoneUtils';

const LOCAL_CUSTOMERS_KEY = 'vistaar_local_customers_db';

export class CustomerService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getCustomers(options?: {
    search?: string;
    customerType?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: Customer[]; count: number; error?: string }> {
    const wsId = this.getWorkspaceId();
    let query = supabase.from('customers').select('*', { count: 'exact' }).eq('workspace_id', wsId);

    if (options?.search) {
      const s = `%${options.search}%`;
      query = query.or(`name.ilike.${s},phone.ilike.${s},email.ilike.${s}`);
    }

    if (options?.customerType) {
      query = query.eq('customer_type', options.customerType);
    }

    if (options?.page && options?.pageSize) {
      const from = (options.page - 1) * options.pageSize;
      const to = from + options.pageSize - 1;
      query = query.range(from, to);
    }

    query = query.order('name', { ascending: true });

    try {
      const { data, count, error } = await query;
      if (error) {
        const errStr = handleSupabaseError(error, 'getCustomers');
        const fallback = safeGetTenantStorage<Customer>(LOCAL_CUSTOMERS_KEY, []);
        return { data: fallback, count: fallback.length, error: errStr };
      }
      const customers = (data as DbCustomer[]).map(fromDbCustomer);
      return { data: customers, count: count || 0 };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getCustomers');
      const fallback = safeGetTenantStorage<Customer>(LOCAL_CUSTOMERS_KEY, []);
      return { data: fallback, count: fallback.length, error: errStr };
    }
  }

  public async getCustomerById(id: string): Promise<{ customer?: Customer; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('id', id)
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'getCustomerById');
        const fallback = safeGetTenantStorage<Customer>(LOCAL_CUSTOMERS_KEY, []);
        const match = fallback.find((c) => c.id === id);
        return { customer: match, error: match ? undefined : errStr };
      }
      return { customer: fromDbCustomer(data as DbCustomer) };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getCustomerById');
      const fallback = safeGetTenantStorage<Customer>(LOCAL_CUSTOMERS_KEY, []);
      const match = fallback.find((c) => c.id === id);
      return { customer: match, error: match ? undefined : errStr };
    }
  }

  public async createCustomer(customer: Partial<Customer>): Promise<{ customer?: Customer; error?: string }> {
    const wsId = this.getWorkspaceId();

    if (!customer.name || !customer.name.trim()) {
      return { error: 'Customer name is required.' };
    }

    if (customer.phone) {
      const pRes = validateIndianPhoneNumber(customer.phone, true);
      if (!pRes.isValid) {
        return { error: pRes.error || 'Customer phone number must contain exactly 10 digits.' };
      }
      customer.phone = pRes.normalized;
    } else {
      return { error: 'Customer phone number is required.' };
    }

    if (customer.whatsapp) {
      const wRes = validateIndianPhoneNumber(customer.whatsapp, false);
      if (!wRes.isValid) {
        return { error: wRes.error || 'WhatsApp phone number must contain exactly 10 digits.' };
      }
      customer.whatsapp = wRes.normalized;
    }

    const payload = toDbCustomer(customer, wsId);

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([payload])
        .select()
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createCustomer');
        if (errStr.startsWith('Network Error')) {
          const newCust: Customer = {
            id: `cust-${Date.now()}`,
            name: customer.name || 'New Customer',
            phone: customer.phone || '',
            whatsapp: customer.whatsapp || customer.phone || '',
            email: customer.email || '',
            customerType: customer.customerType || 'Retail',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...customer,
          } as Customer;
          const local = safeGetTenantStorage<Customer>(LOCAL_CUSTOMERS_KEY, []);
          local.unshift(newCust);
          safeSaveTenantStorage(LOCAL_CUSTOMERS_KEY, local);
          return { customer: newCust };
        }
        return { error: errStr };
      }
      return { customer: fromDbCustomer(data as DbCustomer) };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createCustomer');
      const newCust: Customer = {
        id: `cust-${Date.now()}`,
        name: customer.name || 'New Customer',
        phone: customer.phone || '',
        whatsapp: customer.whatsapp || customer.phone || '',
        email: customer.email || '',
        customerType: customer.customerType || 'Retail',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...customer,
      } as Customer;
      const local = safeGetTenantStorage<Customer>(LOCAL_CUSTOMERS_KEY, []);
      local.unshift(newCust);
      safeSaveTenantStorage(LOCAL_CUSTOMERS_KEY, local);
      return { customer: newCust };
    }
  }

  public async addCustomer(customer: Partial<Customer>): Promise<{ success: boolean; data?: Customer; error?: string }> {
    const res = await this.createCustomer(customer);
    if (res.error || !res.customer) return { success: false, error: res.error };
    return { success: true, data: res.customer };
  }

  public async getCustomerLedger(customerId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data: invoices, error } = await supabase.from('invoices').select('*').eq('workspace_id', wsId).eq('customer_id', customerId);
      if (error) {
        handleSupabaseError(error, 'getCustomerLedger');
      }
      const invList = invoices || [];
      const totalDebit = invList.reduce((acc: number, inv: { total_amount?: number | null }) => acc + (inv.total_amount || 0), 0);
      const totalCredit = invList.reduce((acc: number, inv: { paid_amount?: number | null }) => acc + (inv.paid_amount || 0), 0);
      const outstanding = totalDebit - totalCredit;

      return {
        success: true,
        data: {
          outstanding,
          totalDebit,
          totalCredit,
          invoices: invList,
        },
      };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getCustomerLedger');
      return { success: false, error: errStr };
    }
  }

  public async updateCustomer(id: string, customer: Partial<Customer>): Promise<{ customer?: Customer; error?: string }> {
    const wsId = this.getWorkspaceId();

    if (customer.phone) {
      const pRes = validateIndianPhoneNumber(customer.phone, true);
      if (!pRes.isValid) {
        return { error: pRes.error || 'Customer phone number must contain exactly 10 digits.' };
      }
      customer.phone = pRes.normalized;
    }

    if (customer.whatsapp) {
      const wRes = validateIndianPhoneNumber(customer.whatsapp, false);
      if (!wRes.isValid) {
        return { error: wRes.error || 'WhatsApp phone number must contain exactly 10 digits.' };
      }
      customer.whatsapp = wRes.normalized;
    }

    const payload = toDbCustomer(customer, wsId);

    try {
      const { data, error } = await supabase
        .from('customers')
        .update(payload)
        .eq('workspace_id', wsId)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'updateCustomer');
        return { error: errStr };
      }
      return { customer: fromDbCustomer(data as DbCustomer) };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'updateCustomer');
      return { error: errStr };
    }
  }

  public async deleteCustomer(id: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (error) {
        const errStr = handleSupabaseError(error, 'deleteCustomer');
        return { success: false, error: errStr };
      }
      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'deleteCustomer');
      return { success: false, error: errStr };
    }
  }
}

export const customerService = new CustomerService();

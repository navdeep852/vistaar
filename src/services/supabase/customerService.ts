import { supabase } from '../../lib/supabase';
import { Customer } from '../../types';
import { DbCustomer, fromDbCustomer, toDbCustomer } from './types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

const LOCAL_CUSTOMERS_KEY = 'vistaar_local_customers_db';

const SEED_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    name: 'Rajesh Enterprise',
    phone: '9820011223',
    whatsapp: '9820011223',
    email: 'rajesh@enterprise.com',
    address: 'Shop 12, Main Market',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    gstin: '27ABCDE1234F1Z2',
    customerType: 'Wholesale',
    creditLimit: 100000,
    paymentTerms: 'Net 30',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'cust-2',
    name: 'Priya Sharma',
    phone: '9833344455',
    whatsapp: '9833344455',
    email: 'priya.sharma@gmail.com',
    address: 'B-402, Green Acres',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
    customerType: 'Retail',
    creditLimit: 25000,
    paymentTerms: 'Immediate',
    createdAt: '2026-08-05T14:30:00Z',
    updatedAt: '2026-08-05T14:30:00Z',
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
        const fallback = safeStorageGet(LOCAL_CUSTOMERS_KEY, SEED_CUSTOMERS);
        return { data: fallback, count: fallback.length, error: errStr };
      }
      const customers = (data as DbCustomer[]).map(fromDbCustomer);
      return { data: customers, count: count || 0 };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getCustomers');
      const fallback = safeStorageGet(LOCAL_CUSTOMERS_KEY, SEED_CUSTOMERS);
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
        const fallback = safeStorageGet(LOCAL_CUSTOMERS_KEY, SEED_CUSTOMERS);
        const match = fallback.find((c) => c.id === id);
        return { customer: match, error: match ? undefined : errStr };
      }
      return { customer: fromDbCustomer(data as DbCustomer) };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getCustomerById');
      const fallback = safeStorageGet(LOCAL_CUSTOMERS_KEY, SEED_CUSTOMERS);
      const match = fallback.find((c) => c.id === id);
      return { customer: match, error: match ? undefined : errStr };
    }
  }

  public async createCustomer(customer: Partial<Customer>): Promise<{ customer?: Customer; error?: string }> {
    const wsId = this.getWorkspaceId();
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
          const local = safeStorageGet(LOCAL_CUSTOMERS_KEY, SEED_CUSTOMERS);
          local.unshift(newCust);
          safeStorageSave(LOCAL_CUSTOMERS_KEY, local);
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
      const local = safeStorageGet(LOCAL_CUSTOMERS_KEY, SEED_CUSTOMERS);
      local.unshift(newCust);
      safeStorageSave(LOCAL_CUSTOMERS_KEY, local);
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
      const totalDebit = invList.reduce((acc, inv) => acc + (inv.total_amount || 0), 0);
      const totalCredit = invList.reduce((acc, inv) => acc + (inv.paid_amount || 0), 0);
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

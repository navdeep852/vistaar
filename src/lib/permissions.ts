import { UserRole, UserProfile } from '../types';

export type Permission =
  // Dashboard
  | 'dashboard.view'
  // Inventory
  | 'inventory.view'
  | 'inventory.create_product'
  | 'inventory.edit_metadata'
  | 'inventory.receive_stock'
  | 'inventory.edit_quantity'
  | 'inventory.adjust_stock'
  | 'inventory.delete_product'
  | 'inventory.delete_movement'
  | 'inventory.edit_receipt'
  // Sales & Quotations
  | 'sales.create_invoice'
  | 'sales.create_counter_sale'
  | 'sales.view_invoices'
  | 'quotation.create'
  | 'quotation.view'
  | 'customers.manage'
  | 'suppliers.manage'
  // Analytics & Financial Statements (Executive / Owner only)
  | 'analytics.view'
  | 'financial_statements.view'
  // Business Settings
  | 'business_info.view'
  | 'business_info.edit'
  | 'branding.logo.edit'
  | 'branding.signature.edit'
  | 'settings.bank.edit'
  | 'settings.defaults.edit'
  | 'settings.terms.edit'
  | 'settings.preview.view'
  // Team & Employees Management
  | 'employees.view'
  | 'employees.manage'
  | 'employees.change_role'
  | 'employees.change_status'
  | 'employees.create_login_account'
  // Salary & Payroll
  | 'payroll.view'
  | 'payroll.manage_records'
  | 'payroll.create_login_account'
  // Security
  | 'security.manage'
  | 'security.change_own_password'
  // Multi-Branch Management
  | 'branches.view'
  | 'branches.manage'
  | 'branches.switch'
  | 'stock_transfers.view'
  | 'stock_transfers.create';

export class AuthorizationError extends Error {
  public readonly code = 'FORBIDDEN';
  public readonly permission: Permission;

  constructor(permission: Permission, message?: string) {
    super(message || `Access Denied: You do not have permission '${permission}'.`);
    this.name = 'AuthorizationError';
    this.permission = permission;
  }
}

/**
 * Authoritative Role-Permission Mapping Matrix
 * Strict, unambiguous permissions mapped per UserRole.
 * Do not rely on role !== 'owner'.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Set<Permission>> = {
  // OWNER: Unrestricted master access across workspace
  owner: new Set<Permission>([
    'dashboard.view',
    'inventory.view',
    'inventory.create_product',
    'inventory.edit_metadata',
    'inventory.receive_stock',
    'inventory.edit_quantity',
    'inventory.adjust_stock',
    'inventory.delete_product',
    'inventory.delete_movement',
    'inventory.edit_receipt',
    'sales.create_invoice',
    'sales.create_counter_sale',
    'sales.view_invoices',
    'quotation.create',
    'quotation.view',
    'customers.manage',
    'suppliers.manage',
    'analytics.view',
    'financial_statements.view',
    'business_info.view',
    'business_info.edit',
    'branding.logo.edit',
    'branding.signature.edit',
    'settings.bank.edit',
    'settings.defaults.edit',
    'settings.terms.edit',
    'settings.preview.view',
    'employees.view',
    'employees.manage',
    'employees.change_role',
    'employees.change_status',
    'employees.create_login_account',
    'payroll.view',
    'payroll.manage_records',
    'payroll.create_login_account',
    'security.manage',
    'security.change_own_password',
    'branches.view',
    'branches.manage',
    'branches.switch',
    'stock_transfers.view',
    'stock_transfers.create',
  ]),

  // ADMIN: Delegated workspace administration, but CANNOT modify company security or directly adjust stock without audit
  admin: new Set<Permission>([
    'dashboard.view',
    'inventory.view',
    'inventory.create_product',
    'inventory.edit_metadata',
    'inventory.receive_stock',
    'sales.create_invoice',
    'sales.create_counter_sale',
    'sales.view_invoices',
    'quotation.create',
    'quotation.view',
    'customers.manage',
    'suppliers.manage',
    'branding.signature.edit',
    'settings.bank.edit',
    'settings.defaults.edit',
    'settings.terms.edit',
    'settings.preview.view',
    'employees.view',
    'payroll.view',
    'payroll.manage_records',
    'security.change_own_password',
    'branches.view',
    'branches.manage',
    'branches.switch',
    'stock_transfers.view',
    'stock_transfers.create',
  ]),

  // MANAGER: Departmental operations, quotations, sales, inventory view/receive
  manager: new Set<Permission>([
    'dashboard.view',
    'inventory.view',
    'inventory.create_product',
    'inventory.edit_metadata',
    'inventory.receive_stock',
    'sales.create_invoice',
    'sales.create_counter_sale',
    'sales.view_invoices',
    'quotation.create',
    'quotation.view',
    'customers.manage',
    'suppliers.manage',
    'branding.signature.edit',
    'settings.defaults.edit',
    'settings.terms.edit',
    'settings.preview.view',
    'payroll.view',
    'payroll.manage_records',
    'security.change_own_password',
    'branches.view',
    'branches.switch',
    'stock_transfers.view',
    'stock_transfers.create',
  ]),

  // EMPLOYEE: Operational day-to-day work strictly restricted from stock manipulation, analytics, financial statements, business info, employee management
  employee: new Set<Permission>([
    'dashboard.view',
    'inventory.view',
    'inventory.create_product',
    'inventory.edit_metadata',
    'inventory.receive_stock',
    'sales.create_invoice',
    'sales.create_counter_sale',
    'sales.view_invoices',
    'quotation.create',
    'quotation.view',
    'customers.manage',
    'suppliers.manage',
    'branding.signature.edit',
    'settings.defaults.edit',
    'settings.terms.edit',
    'settings.preview.view',
    'payroll.view',
    'payroll.manage_records',
    'security.change_own_password',
    'branches.view',
    'stock_transfers.view',
  ]),

  // STAFF: Baseline operational staff (same as employee)
  staff: new Set<Permission>([
    'dashboard.view',
    'inventory.view',
    'inventory.create_product',
    'inventory.edit_metadata',
    'inventory.receive_stock',
    'sales.create_invoice',
    'sales.create_counter_sale',
    'sales.view_invoices',
    'quotation.create',
    'quotation.view',
    'customers.manage',
    'suppliers.manage',
    'branding.signature.edit',
    'settings.defaults.edit',
    'settings.terms.edit',
    'settings.preview.view',
    'payroll.view',
    'payroll.manage_records',
    'security.change_own_password',
    'branches.view',
    'stock_transfers.view',
  ]),
};

/**
 * Checks if a role has the specified permission
 */
export function hasPermission(role: UserRole | string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const normalizedRole = role.toLowerCase() as UserRole;
  const permissions = ROLE_PERMISSIONS[normalizedRole];
  if (!permissions) return false;
  return permissions.has(permission);
}

/**
 * Checks if a role has any of the specified permissions
 */
export function hasAnyPermission(role: UserRole | string | undefined | null, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Checks if a role has all of the specified permissions
 */
export function hasAllPermissions(role: UserRole | string | undefined | null, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * Checks if the currently authenticated user in active profile has the permission.
 */
let getCurrentUserFn: () => UserProfile | null = () => null;

export function registerCurrentUserResolver(fn: () => UserProfile | null) {
  getCurrentUserFn = fn;
}

export function hasCurrentUserPermission(permission: Permission): boolean {
  const profile = getCurrentUserFn();
  if (!profile) return false;
  if (profile.status && profile.status !== 'Active') return false;
  return hasPermission(profile.role, permission);
}

/**
 * Enforces permission check or throws AuthorizationError
 */
export function requirePermission(permission: Permission, customMessage?: string): void {
  if (!hasCurrentUserPermission(permission)) {
    throw new AuthorizationError(permission, customMessage);
  }
}

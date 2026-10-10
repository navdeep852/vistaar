import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { isValidUuid } from '../../lib/supabaseError';

export type SecurityAuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'STOCK_ADJUSTMENT_ATTEMPT'
  | 'OWNER_STOCK_ADJUSTMENT'
  | 'UNAUTHORIZED_DASHBOARD_ATTEMPT'
  | 'UNAUTHORIZED_ANALYTICS_ATTEMPT'
  | 'UNAUTHORIZED_FINANCIAL_STATEMENTS_ATTEMPT'
  | 'UNAUTHORIZED_SETTINGS_ATTEMPT'
  | 'EMPLOYEE_CREATION'
  | 'EMPLOYEE_STATUS_CHANGE'
  | 'PASSWORD_CHANGED'
  | 'BRANCH_SWITCHED'
  | 'BRANCH_SWITCH_DENIED'
  | 'BRANCH_SWITCH_REAUTH_SUCCESS'
  | 'BRANCH_SWITCH_REAUTH_FAILED'
  | 'BRANCH_ACCESS_GRANTED'
  | 'BRANCH_ACCESS_DENIED'
  | 'BRANCH_PASSWORD_CHANGED'
  | 'EMPLOYEE_BRANCH_TRANSFERRED';

export type SecurityAuditResult = 'SUCCESS' | 'DENIED' | 'ERROR' | 'ALLOWED';

export interface SecurityAuditEvent {
  id?: string;
  workspaceId?: string;
  userId?: string;
  employeeId?: string;
  action: SecurityAuditAction;
  result: SecurityAuditResult;
  details?: Record<string, any>;
  timestamp?: string;
}

export interface InventoryAuditRecord {
  id?: string;
  workspaceId?: string;
  productId: string;
  productName?: string;
  movementType: string;
  quantityDelta: number;
  previousQuantity: number;
  resultingQuantity: number;
  referenceType?: string;
  referenceId?: string;
  performedByUserId?: string;
  performedByEmployeeId?: string;
  reason?: string;
  timestamp?: string;
}

const LOCAL_SECURITY_LOGS_KEY = 'vistaar_security_audit_logs';
const LOCAL_INVENTORY_AUDIT_KEY = 'vistaar_inventory_audit_logs';

export class AuditLogService {
  /**
   * Records a security audit event
   */
  public async logSecurityEvent(
    eventOrAction: SecurityAuditEvent | SecurityAuditAction | string,
    param2?: any,
    param3?: any,
    param4?: any
  ): Promise<void> {
    let event: SecurityAuditEvent;
    if (typeof eventOrAction === 'object') {
      event = eventOrAction;
    } else {
      let result: SecurityAuditResult = 'DENIED';
      let details: Record<string, any> = {};

      if (param2 === 'SUCCESS' || param2 === 'DENIED' || param2 === 'ERROR') {
        result = param2;
        details = typeof param3 === 'object' ? param3 : (param3 ? { message: String(param3) } : {});
      } else if (param3 === 'SUCCESS' || param3 === 'DENIED' || param3 === 'ERROR') {
        result = param3;
        details = typeof param4 === 'object' ? { ...param4, message: param2 } : { message: param2 };
      } else if (typeof param2 === 'object') {
        details = param2;
        if (param3 === 'SUCCESS' || param3 === 'DENIED' || param3 === 'ERROR') {
          result = param3;
        }
      } else if (param2) {
        details = { message: String(param2) };
      }

      event = {
        action: eventOrAction as any,
        result,
        details,
      };
    }

    const user = supabaseAuthService.getUser();
    const wsId = event.workspaceId || supabaseAuthService.getCurrentCompanyId();
    const empId = event.employeeId || user?.employeeId || 'ANONYMOUS';
    const uid = event.userId || user?.id || null;
    const nowIso = new Date().toISOString();

    const record: SecurityAuditEvent = {
      id: event.id || `sec-log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      workspaceId: wsId,
      userId: uid || undefined,
      employeeId: empId,
      action: event.action,
      result: event.result,
      details: event.details || {},
      timestamp: nowIso,
    };

    // 1. Always record to local tenant storage for instant audit trail & offline access
    try {
      const localLogs = safeGetTenantStorage<SecurityAuditEvent>(LOCAL_SECURITY_LOGS_KEY, []);
      localLogs.unshift(record);
      safeSaveTenantStorage(LOCAL_SECURITY_LOGS_KEY, localLogs.slice(0, 1000));
    } catch {
      // ignore
    }

    // 2. Persist to Supabase if configured and valid workspace
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        await supabase.from('security_audit_logs').insert([
          {
            workspace_id: wsId,
            user_id: uid && isValidUuid(uid) ? uid : null,
            employee_id: empId,
            action: event.action,
            result: event.result,
            details: event.details || {},
            created_at: nowIso,
          },
        ]);
      } catch (err) {
        // Non-blocking fallback
        console.warn('[AUDIT_LOG_REMOTE_NOTICE] Could not push security log to Supabase:', err);
      }
    }
  }

  /**
   * Records an inventory mutation audit record
   */
  public async logInventoryMutation(audit: InventoryAuditRecord): Promise<void> {
    const user = supabaseAuthService.getUser();
    const wsId = audit.workspaceId || supabaseAuthService.getCurrentCompanyId();
    const empId = audit.performedByEmployeeId || user?.employeeId || 'UNKNOWN';
    const uid = audit.performedByUserId || user?.id || null;
    const nowIso = new Date().toISOString();

    const record: InventoryAuditRecord = {
      id: audit.id || `inv-audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      workspaceId: wsId,
      productId: audit.productId,
      productName: audit.productName,
      movementType: audit.movementType,
      quantityDelta: audit.quantityDelta,
      previousQuantity: audit.previousQuantity,
      resultingQuantity: audit.resultingQuantity,
      referenceType: audit.referenceType,
      referenceId: audit.referenceId,
      performedByUserId: uid || undefined,
      performedByEmployeeId: empId,
      reason: audit.reason,
      timestamp: nowIso,
    };

    // 1. Save to local tenant storage
    try {
      const localInv = safeGetTenantStorage<InventoryAuditRecord>(LOCAL_INVENTORY_AUDIT_KEY, []);
      localInv.unshift(record);
      safeSaveTenantStorage(LOCAL_INVENTORY_AUDIT_KEY, localInv.slice(0, 2000));
    } catch {
      // ignore
    }

    // 2. Save to Supabase
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        await supabase.from('inventory_audit_logs').insert([
          {
            workspace_id: wsId,
            product_id: audit.productId,
            movement_type: audit.movementType,
            quantity_delta: audit.quantityDelta,
            previous_quantity: audit.previousQuantity,
            resulting_quantity: audit.resultingQuantity,
            reference_type: audit.referenceType || null,
            reference_id: audit.referenceId || null,
            performed_by_user_id: uid && isValidUuid(uid) ? uid : null,
            performed_by_employee_id: empId,
            reason: audit.reason || null,
            created_at: nowIso,
          },
        ]);
      } catch (err) {
        console.warn('[AUDIT_LOG_REMOTE_NOTICE] Could not push inventory audit to Supabase:', err);
      }
    }
  }

  /**
   * Retrieve security audit logs
   */
  public async getSecurityLogs(limit = 100): Promise<SecurityAuditEvent[]> {
    const wsId = supabaseAuthService.getCurrentCompanyId();
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data, error } = await supabase
          .from('security_audit_logs')
          .select('*')
          .eq('workspace_id', wsId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data) {
          return (data as any[]).map((d: any) => ({
            id: d.id,
            workspaceId: d.workspace_id,
            userId: d.user_id,
            employeeId: d.employee_id,
            action: d.action,
            result: d.result,
            details: d.details,
            timestamp: d.created_at,
          }));
        }
      } catch {
        // fallback to local
      }
    }
    const local = safeGetTenantStorage<SecurityAuditEvent>(LOCAL_SECURITY_LOGS_KEY, []);
    return local.slice(0, limit);
  }

  /**
   * Retrieve inventory audit logs
   */
  public async getInventoryLogs(productId?: string, limit = 100): Promise<InventoryAuditRecord[]> {
    const wsId = supabaseAuthService.getCurrentCompanyId();
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        let q = supabase
          .from('inventory_audit_logs')
          .select('*')
          .eq('workspace_id', wsId);

        if (productId) {
          q = q.eq('product_id', productId);
        }

        const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);

        if (!error && data) {
          return (data as any[]).map((d: any) => ({
            id: d.id,
            workspaceId: d.workspace_id,
            productId: d.product_id,
            movementType: d.movement_type,
            quantityDelta: Number(d.quantity_delta) || 0,
            previousQuantity: Number(d.previous_quantity) || 0,
            resultingQuantity: Number(d.resulting_quantity) || 0,
            referenceType: d.reference_type,
            referenceId: d.reference_id,
            performedByUserId: d.performed_by_user_id,
            performedByEmployeeId: d.performed_by_employee_id,
            reason: d.reason,
            timestamp: d.created_at,
          }));
        }
      } catch {
        // fallback to local
      }
    }
    const local = safeGetTenantStorage<InventoryAuditRecord>(LOCAL_INVENTORY_AUDIT_KEY, []);
    const filtered = productId ? local.filter((l) => l.productId === productId) : local;
    return filtered.slice(0, limit);
  }

  /**
   * Synchronous accessor for local audit logs across security and inventory
   */
  public getLocalAuditLogs(): Array<{ eventType: string; details?: any; action?: string; result?: string; timestamp?: string }> {
    const sec = safeGetTenantStorage<SecurityAuditEvent>(LOCAL_SECURITY_LOGS_KEY, []);
    const inv = safeGetTenantStorage<InventoryAuditRecord>(LOCAL_INVENTORY_AUDIT_KEY, []);
    return [
      ...sec.map((s) => ({ eventType: s.action, details: s.details, action: s.action, result: s.result, timestamp: s.timestamp })),
      ...inv.map((i) => ({ eventType: i.movementType, details: { reason: i.reason, delta: i.quantityDelta, requestedBy: i.performedByEmployeeId }, action: i.movementType, result: 'SUCCESS', timestamp: i.timestamp })),
    ];
  }
}

export const auditLogService = new AuditLogService();

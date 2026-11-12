/**
 * VISTAAR BUSINESS OS — Financial Reconciliation & Audit Diagnostic Engine
 * Section 10 of Master Prompt Specification.
 * Exposes detailed auditability metrics for developers and authorized administrators.
 */

import { financialAnalyticsRepository } from './financialAnalyticsRepository.ts';
import type { FinancialReconciliationAudit, AuthoritativeAnalyticsResult } from './analyticsTypes.ts';
import { ResolvedDateRange } from '../../lib/dateRange';
import { hasCurrentUserPermission } from '../../lib/permissions';

export class FinancialReconciliationAuditService {
  /**
   * Retrieves full audit metrics for a specific workspace and date range.
   * Protected: requires 'analytics.view' permission.
   */
  public async getAuditReport(
    dateRange: ResolvedDateRange,
    branchId?: string,
    explicitWsId?: string
  ): Promise<FinancialReconciliationAudit> {
    if (!hasCurrentUserPermission('analytics.view')) {
      throw new Error('UNAUTHORIZED: Financial reconciliation audit requires analytics.view permission.');
    }

    const res: AuthoritativeAnalyticsResult = await financialAnalyticsRepository.getAuthoritativeFinancials({
      dateRange,
      branchId,
      forceFresh: true,
      explicitWsId,
    });

    return res.audit;
  }
}

export const financialReconciliationAuditService = new FinancialReconciliationAuditService();

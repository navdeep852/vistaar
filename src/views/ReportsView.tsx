import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, DollarSign, Receipt, FileText, Package, CheckCheck, RefreshCw } from 'lucide-react';
import { store } from '../services/store';
import {
  dashboardReconciliationService,
  ReconciliationReport,
} from '../services/dashboardReconciliationService';
import { resolveDateRange } from '../lib/dateRange';
import { formatInr } from '../lib/currency';

export const ReportsView: React.FC = () => {
  const [data, setData] = useState({
    invoicesCount: 0,
    quotationsCount: 0,
    customersCount: 0,
    productsCount: 0,
  });

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditReport, setAuditReport] = useState<ReconciliationReport | null>(null);

  const handleRunAudit = async () => {
    setAuditLoading(true);
    try {
      const todayRange = resolveDateRange('today');
      const rep = await dashboardReconciliationService.runAudit(todayRange);
      setAuditReport(rep);
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  const settings = store.getSettings();
  const pl = store.calculatePL();

  useEffect(() => {
    const updateData = () => {
      setData({
        invoicesCount: store.getInvoices().length,
        quotationsCount: store.getQuotations().length,
        customersCount: store.getCustomers().length,
        productsCount: store.getProducts().length,
      });
    };
    updateData();
    return store.subscribe(updateData);
  }, []);


  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Analytics & Business Reports</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Live aggregated metrics from database records</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Total Sales Invoices</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">{data.invoicesCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Quotations Issued</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">{data.quotationsCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Client Base</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">{data.customersCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Net Profit Margin</span>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">
            {pl.revenue > 0 ? ((pl.netProfit / pl.revenue) * 100).toFixed(1) : '0.0'}%
          </p>
        </div>
      </div>
      {/* System Consistency & Mathematical Reconciliation Diagnostics */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CheckCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Financial Ledger Consistency Audit</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Verify mathematical consistency between source invoices, counter sales, and customer ledgers
            </p>
          </div>
          <button
            onClick={handleRunAudit}
            disabled={auditLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/60 transition-colors self-start sm:self-auto disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
            <span>{auditLoading ? 'Running Audit...' : 'Run Consistency Audit'}</span>
          </button>
        </div>

        {auditReport && (
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
              auditReport.overallStatus === 'PASS'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
            }`}>
              <div className="flex items-center gap-2">
                <CheckCheck className="w-5 h-5 shrink-0" />
                <div>
                  <span className="font-extrabold uppercase">Audit Status: {auditReport.overallStatus}</span>
                  <p className="text-[11px] opacity-90">All authoritative modules cross-referenced.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-1.5 flex items-center justify-between">
                  <span>Sales Pipeline Reconciliation</span>
                  <span className="text-[11px] font-bold text-emerald-600">
                    {auditReport.salesReconciliation.isSalesConsistent ? '100% MATCH' : 'VARIANCE'}
                  </span>
                </h4>
                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Dashboard Sales:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-200">{formatInr(auditReport.salesReconciliation.dashboardTotalSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Source Invoices:</span>
                    <span>{formatInr(auditReport.salesReconciliation.sourceInvoiceSalesSum)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Source Counter Sales:</span>
                    <span>{formatInr(auditReport.salesReconciliation.sourceCounterSalesSum)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 font-semibold">
                    <span>Variance:</span>
                    <span className={auditReport.salesReconciliation.discrepancySales === 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {formatInr(auditReport.salesReconciliation.discrepancySales)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 mb-1.5 flex items-center justify-between">
                  <span>Udhari Ledger Reconciliation</span>
                  <span className="text-[11px] font-bold text-emerald-600">
                    {auditReport.udhariReconciliation.isUdhariConsistent ? '100% MATCH' : 'NOTICE'}
                  </span>
                </h4>
                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Dashboard Outstanding:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-200">{formatInr(auditReport.udhariReconciliation.dashboardOutstandingUdhari)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Customer Ledgers Sum:</span>
                    <span>{formatInr(auditReport.udhariReconciliation.udhariLedgerTotalOutstanding)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


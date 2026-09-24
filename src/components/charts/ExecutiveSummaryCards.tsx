import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, ArrowUpRight } from 'lucide-react';
import { ChartCard } from './ChartCard';
import { formatInr } from '../../lib/currency';
import { EnterpriseAnalyticsData } from '../../services/supabase/enterpriseAnalyticsService';

interface ExecutiveSummaryCardsProps {
  data?: EnterpriseAnalyticsData | null;
  onNavigateTab?: (tab: string) => void;
  loading?: boolean;
}

export const ExecutiveSummaryCards: React.FC<ExecutiveSummaryCardsProps> = ({
  data,
  onNavigateTab,
  loading = false,
}) => {
  if (!data) {
    return null;
  }

  const { kpis, receivablesAging, quotationFunnel } = data;

  const isMarginHealthy = kpis.profitMarginPercent >= 20;
  const isReceivablesHigh = receivablesAging.overdueAmount > 0;
  const isFunnelConverting = quotationFunnel.conversionRatePercent >= 25;

  return (
    <ChartCard
      title="Executive Summary & Signals"
      subtitle="Automated high-level business intelligence signals & performance alerts"
      loading={loading}
      actionSlot={
        onNavigateTab ? (
          <button
            type="button"
            onClick={() => onNavigateTab('profit-loss')}
            className="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            <span>Financial Statements</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        ) : null
      }
    >
      <div className="space-y-2.5">
        {/* Signal 1: Gross Margin Health */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border-l-4 border-l-emerald-500 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Gross Margin Health
              </span>
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                {isMarginHealthy ? 'Strong' : 'Moderate'}
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5">
              Operating at <strong className="text-slate-900 dark:text-slate-100">{kpis.profitMarginPercent}%</strong> gross margin with {formatInr(kpis.grossProfit)} in realized gross profits.
            </p>
          </div>
        </div>

        {/* Signal 2: Receivables Watch */}
        <div
          className={`p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border-l-4 flex items-start gap-2.5 text-xs border border-slate-100 dark:border-slate-800 ${
            isReceivablesHigh ? 'border-l-amber-500' : 'border-l-emerald-500'
          }`}
        >
          {isReceivablesHigh ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Customer Receivables
              </span>
              <span
                className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                  isReceivablesHigh
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {isReceivablesHigh ? 'Watch' : 'Clean'}
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5">
              {formatInr(kpis.outstandingUdhari)} outstanding across customer accounts. {receivablesAging.overdueAmount > 0 ? (
                <span className="text-rose-600 dark:text-rose-400 font-bold">{formatInr(receivablesAging.overdueAmount)} is currently overdue.</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">Zero overdue debt in this period.</span>
              )}
            </p>
          </div>
        </div>

        {/* Signal 3: Quotation Conversion Pipeline */}
        <div
          className={`p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border-l-4 flex items-start gap-2.5 text-xs border border-slate-100 dark:border-slate-800 ${
            isFunnelConverting ? 'border-l-indigo-500' : 'border-l-slate-400'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Quotation Pipeline
              </span>
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                {quotationFunnel.conversionRatePercent}% Rate
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5">
              Converted <strong className="text-slate-900 dark:text-slate-100">{quotationFunnel.convertedCount}</strong> estimates generating {formatInr(quotationFunnel.convertedValue)} in invoiced billing.
            </p>
          </div>
        </div>
      </div>
    </ChartCard>
  );
};

import React from 'react';
import { ResponsiveContainer, FunnelChart, Funnel, LabelList, Tooltip } from 'recharts';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { ChartCard } from './ChartCard';
import { PbiTooltip } from './PbiTooltip';
import { formatFullInr, PBI_PALETTE, PBI_FONTS } from './theme';
import { QuotationFunnelStage } from '../../services/supabase/enterpriseAnalyticsService';

interface QuotationFunnelChartProps {
  conversionRatePercent: number;
  stages: QuotationFunnelStage[];
  totalQuotations: number;
  convertedCount: number;
  convertedValue: number;
  onDrillDown?: () => void;
  loading?: boolean;
}

export const QuotationFunnelChart: React.FC<QuotationFunnelChartProps> = ({
  conversionRatePercent,
  stages,
  totalQuotations,
  convertedCount,
  convertedValue,
  onDrillDown,
  loading = false,
}) => {
  const isEmpty = totalQuotations <= 0 && (!stages || stages.every((s) => s.count === 0));

  // Funnel stage colors descending in brightness / hue
  const funnelColors = [
    PBI_PALETTE[0], // #118DFF (Created)
    PBI_PALETTE[1], // #12239E (Sent)
    PBI_PALETTE[5], // #744EC2 (Accepted)
    '#1AAB40',      // Emerald (Converted)
  ];

  const funnelData = (stages || []).map((s, idx) => ({
    name: s.stage,
    value: s.count,
    amountValue: s.value,
    percentage: s.percentage,
    fill: funnelColors[idx % funnelColors.length],
  }));

  const tableColumns = [
    { key: 'stage', label: 'Funnel Stage' },
    { key: 'count', label: 'Estimates Count' },
    { key: 'value', label: 'Total Value (₹)', format: formatFullInr },
    { key: 'percentage', label: 'Conversion %', format: (v: number) => `${v}%` },
  ];

  return (
    <ChartCard
      title="Quotation Funnel"
      subtitle="Lead-to-Invoice quotation lifecycle conversion velocity"
      badge={`${conversionRatePercent}% Converted`}
      loading={loading}
      empty={isEmpty}
      emptyMessage="No quotations recorded in this period."
      tableData={stages}
      tableColumns={tableColumns}
      actionSlot={
        onDrillDown ? (
          <button
            type="button"
            onClick={onDrillDown}
            className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <span>Quotations</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        {/* Top Metric Bar */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 text-xs">
          <div>
            <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider block">
              Conversion Rate
            </span>
            <strong className="text-base font-extrabold text-indigo-700 dark:text-indigo-300">
              {conversionRatePercent}%
            </strong>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-indigo-400 uppercase font-bold tracking-wider block">
              Realized Billed Value
            </span>
            <strong className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
              {formatFullInr(convertedValue)}
            </strong>
          </div>
        </div>

        {/* Funnel Visual */}
        <div className="w-full h-44">
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip
                content={
                  <PbiTooltip
                    valueFormatter={(v) => `${v} Quotations`}
                    showPercentOfTotal={false}
                  />
                }
              />
              <Funnel
                dataKey="value"
                data={funnelData}
                isAnimationActive
              >
                <LabelList
                  position="right"
                  fill="#475569"
                  stroke="none"
                  dataKey="name"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: PBI_FONTS.family,
                  }}
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>

        {/* Step-by-Step Conversion Progression Bar */}
        <div className="grid grid-cols-4 gap-1 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-center text-xs">
          {stages &&
            stages.map((st, i) => (
              <div key={st.stage} className="p-1 rounded bg-slate-50 dark:bg-slate-800/40">
                <span className="text-[10px] text-slate-400 block truncate">{st.stage}</span>
                <span className="font-extrabold text-slate-800 dark:text-slate-200">{st.count}</span>
              </div>
            ))}
        </div>
      </div>
    </ChartCard>
  );
};

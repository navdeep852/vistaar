import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import { Scale, ArrowUpRight } from 'lucide-react';
import { ChartCard } from './ChartCard';
import { PbiTooltip } from './PbiTooltip';
import { formatCompactInr, formatFullInr, PBI_GRIDLINES, PBI_FONTS } from './theme';
import { AgingBucket } from '../../services/supabase/enterpriseAnalyticsService';

interface ReceivablesAgingChartProps {
  totalOutstanding: number;
  overdueAmount: number;
  buckets: AgingBucket[];
  selectedBucket?: string | null;
  onSelectBucket?: (bucketLabel: string | null) => void;
  onDrillDown?: () => void;
  loading?: boolean;
}

export const ReceivablesAgingChart: React.FC<ReceivablesAgingChartProps> = ({
  totalOutstanding,
  overdueAmount,
  buckets,
  selectedBucket,
  onSelectBucket,
  onDrillDown,
  loading = false,
}) => {
  const [hoveredBucket, setHoveredBucket] = useState<string | null>(null);

  const isEmpty = !buckets || buckets.every((b) => (b.amount || 0) === 0);

  // Define Power BI color ramp: 0-30 Green, 31-60 Yellow, 61-90 Orange, 90+ Red
  const rampColors: Record<string, string> = {
    '0-30 Days': '#1AAB40',
    '31-60 Days': '#D9B300',
    '61-90 Days': '#E66C37',
    '90+ Days': '#D64550',
  };

  const chartData = (buckets || []).map((b) => ({
    ...b,
    color: rampColors[b.label] || b.color || '#118DFF',
  }));

  const tableColumns = [
    { key: 'label', label: 'Aging Bracket' },
    { key: 'amount', label: 'Outstanding (₹)', format: formatFullInr },
    { key: 'count', label: 'Accounts' },
    { key: 'percentage', label: 'Share', format: (v: number) => `${v}%` },
  ];

  return (
    <ChartCard
      title="Receivables Aging"
      subtitle="Outstanding credit categorized by invoice due date overdue brackets"
      loading={loading}
      empty={isEmpty}
      emptyMessage="No outstanding receivables in aging buckets."
      tableData={chartData}
      tableColumns={tableColumns}
      actionSlot={
        onDrillDown ? (
          <button
            type="button"
            onClick={onDrillDown}
            className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline"
          >
            <span>Ledgers</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        {/* Total Outstanding & Overdue Metric Banner */}
        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider block">
              Total Outstanding
            </span>
            <strong className="text-base font-extrabold text-slate-900 dark:text-slate-100">
              {formatFullInr(totalOutstanding)}
            </strong>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider block">
              Overdue Balance
            </span>
            <strong
              className={`text-base font-extrabold ${
                overdueAmount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {formatFullInr(overdueAmount)}
            </strong>
          </div>
        </div>

        {/* Clustered Column Chart with Color Ramp & Data Labels */}
        <div className="w-full h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 18, right: 10, left: -20, bottom: 0 }}
              onClick={(e) => {
                if (e && e.activeLabel && onSelectBucket) {
                  onSelectBucket(selectedBucket === e.activeLabel ? null : String(e.activeLabel));
                }
              }}
            >
              <CartesianGrid strokeDasharray="0" stroke={PBI_GRIDLINES.dark} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: PBI_FONTS.axisSize, fill: '#888888', fontFamily: PBI_FONTS.family }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatCompactInr}
                tick={{ fontSize: PBI_FONTS.axisSize, fill: '#888888', fontFamily: PBI_FONTS.family }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={
                  <PbiTooltip
                    totalSum={totalOutstanding}
                    valueFormatter={formatFullInr}
                    showPercentOfTotal={true}
                  />
                }
              />
              <Bar
                dataKey="amount"
                name="Receivables"
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
                cursor="pointer"
              >
                {chartData.map((entry) => {
                  const isDimmed =
                    (hoveredBucket && hoveredBucket !== entry.label) ||
                    (selectedBucket && selectedBucket !== entry.label);
                  return (
                    <Cell
                      key={`aging-${entry.label}`}
                      fill={entry.color}
                      opacity={isDimmed ? 0.35 : 1}
                      onMouseEnter={() => setHoveredBucket(entry.label)}
                      onMouseLeave={() => setHoveredBucket(null)}
                    />
                  );
                })}
                <LabelList
                  dataKey="amount"
                  position="top"
                  formatter={(val: any) => formatCompactInr(Number(val))}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    fill: '#64748b',
                    fontFamily: PBI_FONTS.family,
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
};

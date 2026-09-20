import React, { useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { PbiTooltip } from './PbiTooltip';
import { PbiLegend } from './PbiLegend';
import { formatCompactInr, formatFullInr, PBI_PALETTE, PBI_GRIDLINES, PBI_FONTS } from './theme';
import { ChannelDataPoint } from '../../services/supabase/enterpriseAnalyticsService';

interface ChannelDonutChartProps {
  totalInvoiceSales: number;
  totalCounterSales: number;
  invoicePercentage: number;
  counterPercentage: number;
  points: ChannelDataPoint[];
  selectedChannel?: string | null;
  onSelectChannel?: (channel: string | null) => void;
  onDrillDown?: (channel: string) => void;
  loading?: boolean;
}

export const ChannelDonutChart: React.FC<ChannelDonutChartProps> = ({
  totalInvoiceSales,
  totalCounterSales,
  invoicePercentage,
  counterPercentage,
  points,
  selectedChannel,
  onSelectChannel,
  onDrillDown,
  loading = false,
}) => {
  const [viewMode, setViewMode] = useState<'donut' | 'stacked'>('donut');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const totalSales = totalInvoiceSales + totalCounterSales;
  const isEmpty = totalSales <= 0;

  const donutData = [
    {
      id: 'invoices',
      name: 'Invoice Sales',
      value: totalInvoiceSales,
      percentage: invoicePercentage,
      color: PBI_PALETTE[0], // #118DFF
    },
    {
      id: 'counter',
      name: 'Counter Sales',
      value: totalCounterSales,
      percentage: counterPercentage,
      color: PBI_PALETTE[2], // #E66C37
    },
  ];

  // Daily channel points for 100% stacked or clustered column view
  const stackedData = (points || []).map((pt) => {
    const sum = (pt.invoiceSales || 0) + (pt.counterSales || 0);
    const invPct = sum > 0 ? ((pt.invoiceSales || 0) / sum) * 100 : 0;
    const cntPct = sum > 0 ? ((pt.counterSales || 0) / sum) * 100 : 0;
    return {
      periodLabel: pt.periodLabel,
      invoiceSales: pt.invoiceSales,
      counterSales: pt.counterSales,
      invoicePct: Math.round(invPct),
      counterPct: Math.round(cntPct),
    };
  });

  const tableData = [
    { channel: 'Invoice Sales (B2B/Credit)', amount: totalInvoiceSales, share: `${invoicePercentage}%` },
    { channel: 'Counter Sales (POS/Retail)', amount: totalCounterSales, share: `${counterPercentage}%` },
  ];

  return (
    <ChartCard
      title="Sales by Channel"
      subtitle="B2B Invoice Billing vs Direct Counter POS"
      badge={`${invoicePercentage}% / ${counterPercentage}%`}
      loading={loading}
      empty={isEmpty}
      emptyMessage="No channel sales recorded in this period."
      tableData={tableData}
      actionSlot={
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('donut')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              viewMode === 'donut'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            Donut
          </button>
          <button
            type="button"
            onClick={() => setViewMode('stacked')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              viewMode === 'stacked'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            Daily 100%
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {viewMode === 'donut' ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Donut Chart with Centered Total */}
            <div className="relative w-48 h-48 shrink-0 mx-auto sm:mx-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={
                      <PbiTooltip
                        totalSum={totalSales}
                        valueFormatter={formatFullInr}
                        showPercentOfTotal={true}
                      />
                    }
                  />
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={78}
                    paddingAngle={3}
                    cursor="pointer"
                    onClick={(entry: any) => {
                      const channelId = entry?.id || entry?.payload?.id;
                      if (onSelectChannel && channelId) {
                        onSelectChannel(selectedChannel === channelId ? null : channelId);
                      }
                    }}
                  >
                    {donutData.map((entry) => {
                      const isDimmed =
                        (hoveredId && hoveredId !== entry.id) ||
                        (selectedChannel && selectedChannel !== entry.id);
                      return (
                        <Cell
                          key={`cell-${entry.id}`}
                          fill={entry.color}
                          opacity={isDimmed ? 0.35 : 1}
                          stroke="transparent"
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Centered Total KPI Callout */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Total
                </span>
                <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  {formatCompactInr(totalSales)}
                </span>
              </div>
            </div>

            {/* Right Legend with Value + % share */}
            <div className="flex-1 w-full space-y-2">
              <PbiLegend
                items={donutData.map((d) => ({
                  id: d.id,
                  name: d.name,
                  color: d.color,
                  value: formatCompactInr(d.value),
                  percentage: d.percentage,
                }))}
                activeId={selectedChannel}
                hoveredId={hoveredId}
                onItemHover={setHoveredId}
                onItemClick={(id) => {
                  if (onSelectChannel) {
                    onSelectChannel(selectedChannel === id ? null : id);
                  }
                  if (onDrillDown) {
                    onDrillDown(id);
                  }
                }}
                direction="column"
              />
            </div>
          </div>
        ) : (
          /* 100% Stacked Daily Distribution Column Chart */
          <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stackedData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                stackOffset="expand"
              >
                <CartesianGrid strokeDasharray="0" stroke={PBI_GRIDLINES.dark} vertical={false} />
                <XAxis
                  dataKey="periodLabel"
                  tick={{ fontSize: PBI_FONTS.axisSize, fill: '#888888', fontFamily: PBI_FONTS.family }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val) => `${Math.round(val * 100)}%`}
                  tick={{ fontSize: PBI_FONTS.axisSize, fill: '#888888', fontFamily: PBI_FONTS.family }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={
                    <PbiTooltip
                      valueFormatter={(v) => `${formatFullInr(v)}`}
                      showPercentOfTotal={false}
                    />
                  }
                />
                <Bar
                  dataKey="invoiceSales"
                  name="Invoice Sales"
                  fill={PBI_PALETTE[0]}
                  stackId="a"
                  radius={[0, 0, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="counterSales"
                  name="Counter Sales"
                  fill={PBI_PALETTE[2]}
                  stackId="a"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </ChartCard>
  );
};

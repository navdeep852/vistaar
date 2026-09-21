import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Brush,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { PbiTooltip } from './PbiTooltip';
import { PbiLegend } from './PbiLegend';
import { formatCompactInr, formatFullInr, PBI_PALETTE, PBI_GRIDLINES, PBI_FONTS } from './theme';
import { TrendDataPoint } from '../../services/supabase/enterpriseAnalyticsService';

interface SalesTrendComboChartProps {
  points: TrendDataPoint[];
  granularity: 'hourly' | 'daily' | 'weekly' | 'monthly';
  totalSales: number;
  peakSales?: number;
  peakLabel?: string;
  selectedLabel?: string | null;
  onSelectPoint?: (label: string | null) => void;
  loading?: boolean;
}

export const SalesTrendComboChart: React.FC<SalesTrendComboChartProps> = ({
  points,
  granularity,
  totalSales,
  peakSales: propPeakSales,
  peakLabel: propPeakLabel,
  selectedLabel,
  onSelectPoint,
  loading = false,
}) => {
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);

  // Compute cumulative or moving average line
  const { chartData, avgSales, computedPeakSales, computedPeakLabel } = useMemo(() => {
    if (!points || points.length === 0) {
      return { chartData: [], avgSales: 0, computedPeakSales: 0, computedPeakLabel: '' };
    }

    let runningSum = 0;
    let maxSale = 0;
    let maxLabel = '';

    const enriched = points.map((p, idx) => {
      const sales = Math.max(0, p.sales || 0);
      runningSum += sales;
      if (sales > maxSale) {
        maxSale = sales;
        maxLabel = p.fullDate || p.label;
      }

      // 7-period moving average or cumulative
      const windowStart = Math.max(0, idx - 6);
      const windowPoints = points.slice(windowStart, idx + 1);
      const movingAvg = Math.round(
        windowPoints.reduce((acc, curr) => acc + (curr.sales || 0), 0) / windowPoints.length
      );

      return {
        ...p,
        sales,
        movingAvg,
        cumulative: runningSum,
      };
    });

    const avg = points.length > 0 ? Math.round(runningSum / points.length) : 0;
    return {
      chartData: enriched,
      avgSales: avg,
      computedPeakSales: propPeakSales || maxSale,
      computedPeakLabel: propPeakLabel || maxLabel,
    };
  }, [points, propPeakSales, propPeakLabel]);

  const isEmpty = !chartData || chartData.length === 0 || chartData.every((p) => (p.sales || 0) === 0);

  const tableColumns = [
    { key: 'label', label: 'Period' },
    { key: 'sales', label: 'Sales (₹)', format: formatFullInr },
    { key: 'movingAvg', label: 'Moving Avg (₹)', format: formatFullInr },
    { key: 'invoices', label: 'Invoice Sales (₹)', format: formatFullInr },
    { key: 'counterSales', label: 'Counter Sales (₹)', format: formatFullInr },
  ];

  return (
    <ChartCard
      title="Sales Trend & Performance"
      subtitle={`Revenue velocity (${granularity}) with moving average & peak detection`}
      badge={granularity}
      loading={loading}
      empty={isEmpty}
      emptyMessage="No sales trend data available for this period."
      tableData={chartData}
      tableColumns={tableColumns}
      actionSlot={
        computedPeakSales > 0 ? (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-900/40 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>Peak: {formatCompactInr(computedPeakSales)} ({computedPeakLabel})</span>
          </div>
        ) : null
      }
    >
      <div className="space-y-3">
        {/* Interactive Legend */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
          <PbiLegend
            items={[
              { id: 'sales', name: 'Sales Revenue', color: PBI_PALETTE[0] },
              { id: 'movingAvg', name: '7-Day Moving Avg', color: PBI_PALETTE[2] },
            ]}
            hoveredId={hoveredSeries}
            onItemHover={setHoveredSeries}
          />
          {avgSales > 0 && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              Daily Avg: <strong className="text-slate-700 dark:text-slate-300">{formatCompactInr(avgSales)}</strong>
            </span>
          )}
        </div>

        {/* Combo Chart */}
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 12, right: 12, left: -10, bottom: 0 }}
              onClick={(e) => {
                if (e && e.activeLabel && onSelectPoint) {
                  onSelectPoint(selectedLabel === e.activeLabel ? null : String(e.activeLabel));
                }
              }}
            >
              <defs>
                <linearGradient id="pbiSalesBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PBI_PALETTE[0]} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={PBI_PALETTE[0]} stopOpacity={0.65} />
                </linearGradient>
                <linearGradient id="pbiLineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PBI_PALETTE[2]} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={PBI_PALETTE[2]} stopOpacity={0.0} />
                </linearGradient>
              </defs>

              {/* Minimal horizontal gridlines only */}
              <CartesianGrid
                strokeDasharray="0"
                stroke={PBI_GRIDLINES.dark}
                vertical={false}
              />

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
                domain={[0, Math.max(computedPeakSales, 1)]}
              />

              <Tooltip
                content={
                  <PbiTooltip
                    valueFormatter={formatFullInr}
                    showPercentOfTotal={false}
                  />
                }
              />

              {/* Dashed Average Reference Line */}
              {avgSales > 0 && (
                <ReferenceLine
                  y={avgSales}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
              )}

              {/* Clustered Column: Sales */}
              <Bar
                dataKey="sales"
                name="Sales Revenue"
                fill="url(#pbiSalesBarGrad)"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
                opacity={hoveredSeries && hoveredSeries !== 'sales' ? 0.35 : 1}
                cursor="pointer"
              />

              {/* Smooth Moving Average Line with Area Accent */}
              <Line
                type="monotone"
                dataKey="movingAvg"
                name="7-Day Moving Avg"
                stroke={PBI_PALETTE[2]}
                strokeWidth={2.5}
                dot={chartData.length < 15 ? { r: 3, fill: PBI_PALETTE[2], strokeWidth: 0 } : false}
                activeDot={{ r: 5, strokeWidth: 0, fill: PBI_PALETTE[2] }}
                opacity={hoveredSeries && hoveredSeries !== 'movingAvg' ? 0.35 : 1}
              />

              {/* Zoom & Brush Slider for date ranges with >10 points */}
              {chartData.length > 10 && (
                <Brush
                  dataKey="label"
                  height={22}
                  stroke={PBI_PALETTE[0]}
                  fill="rgba(17, 141, 255, 0.05)"
                  tickFormatter={() => ''}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartCard>
  );
};

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
} from 'recharts';
import { ArrowUpRight } from 'lucide-react';
import { ChartCard } from './ChartCard';
import { PbiTooltip } from './PbiTooltip';
import { PbiLegend } from './PbiLegend';
import { formatCompactInr, formatFullInr, PBI_PALETTE, PBI_FONTS } from './theme';
import { ExpenseCategoryBreakdown } from '../../services/supabase/enterpriseAnalyticsService';

interface ExpenseAnalysisChartProps {
  totalExpenses: number;
  categories: ExpenseCategoryBreakdown[];
  onDrillDown?: () => void;
  loading?: boolean;
}

export const ExpenseAnalysisChart: React.FC<ExpenseAnalysisChartProps> = ({
  totalExpenses,
  categories,
  onDrillDown,
  loading = false,
}) => {
  const [viewMode, setViewMode] = useState<'donut' | 'bars'>('donut');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const isEmpty = totalExpenses <= 0 || !categories || categories.length === 0;

  // Sort descending by amount
  const sortedCategories = useMemo(() => {
    return [...(categories || [])].sort((a, b) => b.amount - a.amount);
  }, [categories]);

  const chartData = useMemo(() => {
    return sortedCategories.map((c, idx) => ({
      id: c.category,
      name: c.category,
      amount: c.amount,
      value: c.amount,
      percentage: c.percentage,
      color: PBI_PALETTE[idx % PBI_PALETTE.length],
      isLargest: idx === 0,
    }));
  }, [sortedCategories]);

  const largestCategory = chartData[0];

  const tableColumns = [
    { key: 'category', label: 'Expense Category' },
    { key: 'amount', label: 'Amount (₹)', format: formatFullInr },
    { key: 'percentage', label: 'Share', format: (v: number) => `${v}%` },
    { key: 'count', label: 'Transactions' },
  ];

  return (
    <ChartCard
      title="Expense Analysis"
      subtitle="Operational overhead categorized by expense category breakdown"
      badge={formatCompactInr(totalExpenses)}
      loading={loading}
      empty={isEmpty}
      emptyMessage="No expenses recorded in this period."
      tableData={categories}
      tableColumns={tableColumns}
      actionSlot={
        <div className="flex items-center gap-2">
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
              onClick={() => setViewMode('bars')}
              className={`px-2 py-0.5 rounded-md transition-all ${
                viewMode === 'bars'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Bars
            </button>
          </div>

          {onDrillDown && (
            <button
              type="button"
              onClick={onDrillDown}
              className="flex items-center gap-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              <span>Expenses</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {/* Largest Category Callout Badge */}
        {largestCategory && (
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              Top Outflow: <strong className="text-slate-900 dark:text-slate-100">{largestCategory.name}</strong>
            </span>
            <span className="font-extrabold text-blue-600 dark:text-blue-400">
              {formatFullInr(largestCategory.amount)} ({largestCategory.percentage}%)
            </span>
          </div>
        )}

        {viewMode === 'donut' ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Donut Chart */}
            <div className="relative w-44 h-44 shrink-0 mx-auto sm:mx-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={
                      <PbiTooltip
                        totalSum={totalExpenses}
                        valueFormatter={formatFullInr}
                        showPercentOfTotal={true}
                      />
                    }
                  />
                  <Pie
                    data={chartData}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {chartData.map((entry) => {
                      const isDimmed = hoveredId && hoveredId !== entry.id;
                      return (
                        <Cell
                          key={`exp-${entry.id}`}
                          fill={entry.color}
                          opacity={isDimmed ? 0.35 : entry.isLargest ? 1 : 0.85}
                          stroke="transparent"
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  Total
                </span>
                <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  {formatCompactInr(totalExpenses)}
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 w-full space-y-1 max-h-40 overflow-y-auto pr-1">
              <PbiLegend
                items={chartData.slice(0, 5).map((d) => ({
                  id: d.id,
                  name: d.name,
                  color: d.color,
                  value: formatCompactInr(d.amount),
                  percentage: d.percentage,
                }))}
                hoveredId={hoveredId}
                onItemHover={setHoveredId}
                direction="column"
              />
            </div>
          </div>
        ) : (
          /* Ranked Horizontal Bar Breakdown */
          <div className="w-full h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData.slice(0, 5)}
                layout="vertical"
                margin={{ top: 5, right: 45, left: 10, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  tickFormatter={formatCompactInr}
                  tick={{ fontSize: PBI_FONTS.axisSize, fill: '#888888', fontFamily: PBI_FONTS.family }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={85}
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 600, fontFamily: PBI_FONTS.family }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={
                    <PbiTooltip
                      totalSum={totalExpenses}
                      valueFormatter={formatFullInr}
                      showPercentOfTotal={true}
                    />
                  }
                />
                <Bar dataKey="amount" name="Expense" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {chartData.slice(0, 5).map((entry) => (
                    <Cell
                      key={`exp-bar-${entry.id}`}
                      fill={entry.color}
                      opacity={entry.isLargest ? 1 : 0.75}
                    />
                  ))}
                  <LabelList
                    dataKey="amount"
                    position="right"
                    formatter={(v: any) => formatCompactInr(Number(v))}
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
        )}
      </div>
    </ChartCard>
  );
};

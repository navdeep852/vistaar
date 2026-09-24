import React, { useMemo } from 'react';
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
import { ChartCard } from './ChartCard';
import { PbiTooltip } from './PbiTooltip';
import { formatCompactInr, formatFullInr, PBI_PALETTE, PBI_SEMANTIC, PBI_GRIDLINES, PBI_FONTS } from './theme';
import { ProfitabilityDataPoint } from '../../services/supabase/enterpriseAnalyticsService';

interface ProfitabilityWaterfallChartProps {
  totalRevenue: number;
  totalCogs: number;
  totalGrossProfit: number;
  totalExpenses: number;
  totalNetProfit: number;
  overallMarginPercent: number;
  points?: ProfitabilityDataPoint[];
  loading?: boolean;
}

export const ProfitabilityWaterfallChart: React.FC<ProfitabilityWaterfallChartProps> = ({
  totalRevenue,
  totalCogs,
  totalGrossProfit,
  totalExpenses,
  totalNetProfit,
  overallMarginPercent,
  loading = false,
}) => {
  const isEmpty = totalRevenue <= 0 && totalCogs <= 0 && totalExpenses <= 0;

  // Build Waterfall step data:
  // Step 1: Revenue (start=0, amount=Revenue)
  // Step 2: COGS (start=GrossProfit, amount=COGS, negative deduction)
  // Step 3: Gross Profit (start=0, amount=GrossProfit, subtotal)
  // Step 4: Operating Expenses (start=NetProfit, amount=OpEx, negative deduction)
  // Step 5: Net Profit (start=0, amount=NetProfit, final total)
  const waterfallData = useMemo(() => {
    const rev = totalRevenue;
    const cogs = totalCogs;
    const gp = totalGrossProfit !== undefined ? totalGrossProfit : (rev - cogs);
    const opex = totalExpenses;
    const np = totalNetProfit !== undefined ? totalNetProfit : (gp - opex);

    return [
      {
        name: 'Revenue',
        stepType: 'total',
        base: 0,
        amount: Math.max(0, rev),
        actualValue: rev,
        color: PBI_PALETTE[0], // #118DFF
      },
      {
        name: 'COGS',
        stepType: 'deduction',
        base: Math.max(0, gp),
        amount: Math.abs(cogs),
        actualValue: -cogs,
        color: PBI_SEMANTIC.negative, // #D64550
      },
      {
        name: 'Gross Profit',
        stepType: 'subtotal',
        base: 0,
        amount: Math.abs(gp),
        actualValue: gp,
        color: gp >= 0 ? PBI_PALETTE[1] : PBI_SEMANTIC.negative,
      },
      {
        name: 'OpEx',
        stepType: 'deduction',
        base: Math.max(0, np),
        amount: Math.abs(opex),
        actualValue: -opex,
        color: PBI_SEMANTIC.negative, // #D64550
      },
      {
        name: 'Net Profit',
        stepType: 'total',
        base: 0,
        amount: Math.abs(np),
        actualValue: np,
        color: np >= 0 ? PBI_SEMANTIC.positive : PBI_SEMANTIC.negative,
      },
    ];
  }, [totalRevenue, totalCogs, totalGrossProfit, totalExpenses, totalNetProfit]);

  const tableColumns = [
    { key: 'name', label: 'Financial Stage' },
    { key: 'actualValue', label: 'Impact / Amount (₹)', format: formatFullInr },
  ];

  return (
    <ChartCard
      title="Profitability Waterfall"
      subtitle="Financial walk from Gross Sales to Bottom-Line Net Operating Profit"
      badge={`${overallMarginPercent}% Margin`}
      loading={loading}
      empty={isEmpty}
      emptyMessage="No revenue or expense data recorded in this period."
      tableData={waterfallData}
      tableColumns={tableColumns}
      actionSlot={
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-900/40 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
          <span>Net Margin: {overallMarginPercent}%</span>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Waterfall Stacked Bar Chart */}
        <div className="w-full h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={waterfallData}
              margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="0" stroke={PBI_GRIDLINES.dark} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10.5, fill: '#64748b', fontWeight: 600, fontFamily: PBI_FONTS.family }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatCompactInr}
                tick={{ fontSize: PBI_FONTS.axisSize, fill: '#888888', fontFamily: PBI_FONTS.family }}
                axisLine={false}
                tickLine={false}
                domain={[0, Math.max(totalRevenue, 1)]}
              />
              <Tooltip
                content={
                  <PbiTooltip
                    valueFormatter={(v) => formatFullInr(Number(v))}
                    showPercentOfTotal={false}
                  />
                }
              />

              {/* Invisible floating base */}
              <Bar dataKey="base" stackId="wf" fill="transparent" />

              {/* Colored step delta */}
              <Bar dataKey="amount" name="Financial Impact" stackId="wf" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {waterfallData.map((entry, idx) => (
                  <Cell key={`wf-cell-${idx}`} fill={entry.color} />
                ))}
                <LabelList
                  dataKey="actualValue"
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

        {/* Footer Summary */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-center text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block">Revenue</span>
            <strong className="text-slate-800 dark:text-slate-200 font-bold">{formatCompactInr(totalRevenue)}</strong>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block">Gross Profit</span>
            <strong className="text-blue-600 dark:text-blue-400 font-bold">{formatCompactInr(totalGrossProfit)}</strong>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block">Net Profit</span>
            <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{formatCompactInr(totalNetProfit)}</strong>
          </div>
        </div>
      </div>
    </ChartCard>
  );
};

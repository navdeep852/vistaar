import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  Receipt,
  Scale,
  ShoppingBag,
  Package,
  AlertTriangle,
  FileText,
  PieChart,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  TrendDataPoint,
  ChannelDataPoint,
  AgingBucket,
  ProductPerformanceItem,
  ProfitabilityDataPoint,
  InventoryHealthMetrics,
  QuotationFunnelStage,
  ExpenseCategoryBreakdown,
} from '../../services/supabase/enterpriseAnalyticsService';
import { formatInr, formatSafeCount } from '../../lib/currency';

// Helper to format large currency for axis labels (e.g. ₹50K, ₹1.2L)
function formatCompactInr(val: number): string {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${Math.round(val / 1000)}K`;
  return `₹${Math.round(val)}`;
}

// =========================================================================
// 1. SALES TREND CHART (Interactive SVG Line with Area Gradient)
// =========================================================================
interface SalesTrendChartProps {
  points: TrendDataPoint[];
  granularity: 'hourly' | 'daily' | 'weekly' | 'monthly';
  totalSales: number;
  peakSales: number;
  peakLabel: string;
}

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({
  points,
  granularity,
  totalSales,
  peakSales,
  peakLabel,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!points || points.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs flex flex-col items-center justify-center min-h-[300px] text-slate-400">
        <TrendingUp className="w-8 h-8 mb-2 opacity-40 text-blue-500" />
        <p className="text-sm font-medium">No sales trend data available for this period.</p>
      </div>
    );
  }

  const width = 800;
  const height = 240;
  const paddingLeft = 55;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const maxVal = Math.max(1000, ...points.map((p) => p.sales), peakSales) * 1.15;
  const n = points.length;

  const getX = (i: number) => paddingLeft + (i / Math.max(1, n - 1)) * chartW;
  const getY = (v: number) => paddingTop + chartH - (v / maxVal) * chartH;

  const linePoints = points.map((p, i) => `${getX(i)},${getY(p.sales)}`).join(' ');
  const areaPath = `M ${getX(0)},${paddingTop + chartH} L ${linePoints} L ${getX(n - 1)},${paddingTop + chartH} Z`;

  const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal];

  // Pick ~6 readable X-axis labels
  const step = Math.max(1, Math.ceil(n / 6));

  const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs transition-colors space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Sales Trend</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
              {granularity}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Revenue progression over time
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Period Sales</span>
            <span className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base">
              {formatInr(totalSales)}
            </span>
          </div>
          {peakSales > 0 && (
            <div className="border-l border-slate-200 dark:border-slate-800 pl-4">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Peak ({peakLabel})</span>
              <span className="font-extrabold text-blue-600 dark:text-blue-400 text-sm sm:text-base">
                {formatInr(peakSales)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-48 sm:h-64 overflow-visible"
        >
          <defs>
            <linearGradient id="salesTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y axis */}
          {yTicks.map((t, idx) => {
            const yPos = getY(t);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={yPos}
                  x2={width - paddingRight}
                  y2={yPos}
                  stroke="currentColor"
                  className="text-slate-100 dark:text-slate-800/80"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={yPos + 4}
                  textAnchor="end"
                  className="text-[10px] fill-slate-400 font-medium"
                >
                  {formatCompactInr(t)}
                </text>
              </g>
            );
          })}

          {/* Area fill under curve */}
          <path d={areaPath} fill="url(#salesTrendGrad)" />

          {/* Main trend line */}
          <path
            d={`M ${linePoints}`}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points */}
          {points.map((p, i) => {
            const cx = getX(i);
            const cy = getY(p.sales);
            const isHovered = hoveredIdx === i;

            return (
              <g key={i}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 6 : p.sales > 0 ? 3.5 : 2}
                  fill={isHovered ? '#1d4ed8' : '#2563eb'}
                  stroke="#ffffff"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  className="transition-all cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
                {/* Hit area */}
                <rect
                  x={cx - 15}
                  y={paddingTop}
                  width={30}
                  height={chartH}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              </g>
            );
          })}

          {/* X axis labels */}
          {points.map((p, i) => {
            if (i % step !== 0 && i !== n - 1) return null;
            const cx = getX(i);
            return (
              <text
                key={i}
                x={cx}
                y={height - 12}
                textAnchor="middle"
                className="text-[10px] fill-slate-400 dark:fill-slate-500 font-medium"
              >
                {p.label}
              </text>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {hoveredPoint && hoveredIdx !== null && (
          <div
            className="absolute top-2 pointer-events-none z-10 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs space-y-1.5 transition-all"
            style={{
              left: `${Math.min(75, Math.max(10, (getX(hoveredIdx) / width) * 100))}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="flex items-center justify-between gap-4 font-bold border-b border-slate-700 pb-1 text-[11px] text-slate-300">
              <span>{hoveredPoint.label}</span>
              <span className="text-blue-400 font-extrabold">{formatInr(hoveredPoint.sales)}</span>
            </div>
            <div className="space-y-0.5 text-[10px] text-slate-300">
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Invoice Sales:</span>
                <span>{formatInr(hoveredPoint.invoices)} ({hoveredPoint.invoiceCount})</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Counter Sales:</span>
                <span>{formatInr(hoveredPoint.counterSales)} ({hoveredPoint.counterCount})</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// =========================================================================
// 2. SALES BY CHANNEL CHART (Stacked Bar Breakdown)
// =========================================================================
interface SalesChannelChartProps {
  totalInvoiceSales: number;
  totalCounterSales: number;
  invoicePercentage: number;
  counterPercentage: number;
  points: ChannelDataPoint[];
  onDrillDown?: (channel: string) => void;
}

export const SalesChannelChart: React.FC<SalesChannelChartProps> = ({
  totalInvoiceSales,
  totalCounterSales,
  invoicePercentage,
  counterPercentage,
  points,
  onDrillDown,
}) => {
  const total = totalInvoiceSales + totalCounterSales;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs transition-colors space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Sales by Channel</h3>
          </div>
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
            {formatInr(total)}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Revenue contribution: Invoices vs Counter sales
        </p>
      </div>

      {/* Aggregate Proportion Bar */}
      <div className="space-y-2">
        <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
          <div
            style={{ width: `${invoicePercentage}%` }}
            className="bg-blue-600 transition-all duration-500"
            title={`Invoice Sales: ${formatInr(totalInvoiceSales)} (${invoicePercentage}%)`}
          />
          <div
            style={{ width: `${counterPercentage}%` }}
            className="bg-emerald-500 transition-all duration-500"
            title={`Counter Sales: ${formatInr(totalCounterSales)} (${counterPercentage}%)`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
          <div
            onClick={() => onDrillDown?.('invoices')}
            className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>Invoice Sales</span>
            </div>
            <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-1">
              {formatInr(totalInvoiceSales)}
            </p>
            <span className="text-[10px] text-slate-400">{invoicePercentage}% of total</span>
          </div>

          <div
            onClick={() => onDrillDown?.('counter-sale')}
            className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-emerald-300 dark:hover:border-emerald-700 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Counter Sales</span>
            </div>
            <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-1">
              {formatInr(totalCounterSales)}
            </p>
            <span className="text-[10px] text-slate-400">{counterPercentage}% of total</span>
          </div>
        </div>
      </div>

      {/* Period mini-bars breakdown */}
      {points.length > 1 && (
        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">
            Channel Distribution Trend
          </span>
          <div className="space-y-1.5">
            {points.slice(0, 5).map((p, idx) => {
              const pTotal = Math.max(1, p.totalSales);
              const invPct = Math.round((p.invoiceSales / pTotal) * 100);
              const csPct = 100 - invPct;
              return (
                <div key={idx} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 truncate text-slate-500 dark:text-slate-400 shrink-0 font-medium">
                    {p.periodLabel}
                  </span>
                  <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                    <div style={{ width: `${invPct}%` }} className="bg-blue-600" />
                    <div style={{ width: `${csPct}%` }} className="bg-emerald-500" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 w-16 text-right shrink-0">
                    {formatInr(p.totalSales)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// 3. RECEIVABLES / UDHARI AGING CHART (Horizontal Bar)
// =========================================================================
interface ReceivablesAgingChartProps {
  totalOutstanding: number;
  overdueAmount: number;
  buckets: AgingBucket[];
  onDrillDown?: () => void;
}

export const ReceivablesAgingChart: React.FC<ReceivablesAgingChartProps> = ({
  totalOutstanding,
  overdueAmount,
  buckets,
  onDrillDown,
}) => {
  const maxAmount = Math.max(1, ...buckets.map((b) => b.amount));

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs transition-colors space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Receivables Aging</h3>
          </div>
          <div className="text-right">
            <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400 block">
              {formatInr(totalOutstanding)}
            </span>
            <span className="text-[10px] text-slate-400">Total Outstanding</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Unpaid customer balances segmented by overdue duration
        </p>
      </div>

      {/* Aging Horizontal Bars */}
      <div className="space-y-2.5">
        {buckets.map((b, idx) => {
          const widthPct = Math.round((b.amount / maxAmount) * 100);
          return (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                  <span>{b.label}</span>
                  <span className="text-[10px] text-slate-400 font-normal">({b.count} accounts)</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">{b.percentage}%</span>
                  <strong className="font-extrabold text-slate-900 dark:text-slate-100">{formatInr(b.amount)}</strong>
                </div>
              </div>

              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  style={{
                    width: `${Math.max(b.amount > 0 ? 3 : 0, widthPct)}%`,
                    backgroundColor: b.color,
                  }}
                  className="h-full rounded-full transition-all duration-500"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Overdue Balance:</span>
          <strong className={overdueAmount > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-700 dark:text-slate-300 font-bold'}>
            {formatInr(overdueAmount)}
          </strong>
        </div>

        <button
          onClick={onDrillDown}
          className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
        >
          <span>View Udhari Ledger</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// =========================================================================
// 4. TOP SELLING PRODUCTS CHART (Horizontal Bar with Toggle)
// =========================================================================
interface TopProductsChartProps {
  byValue: ProductPerformanceItem[];
  byQuantity: ProductPerformanceItem[];
  onDrillDown?: (productId?: string) => void;
}

export const TopProductsChart: React.FC<TopProductsChartProps> = ({
  byValue,
  byQuantity,
  onDrillDown,
}) => {
  const [metric, setMetric] = useState<'value' | 'quantity'>('value');
  const items = metric === 'value' ? byValue : byQuantity;
  const maxVal = Math.max(1, ...items.map((it) => (metric === 'value' ? it.salesValue : it.quantitySold)));

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs transition-colors space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Top Selling Products</h3>
          </div>

          {/* Metric Toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 self-start sm:self-auto text-xs">
            <button
              onClick={() => setMetric('value')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                metric === 'value'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Sales Value
            </button>
            <button
              onClick={() => setMetric('quantity')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                metric === 'quantity'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Quantity
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Top grossing inventory items in selected period
        </p>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No product sales recorded in this period.
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.slice(0, 5).map((it, idx) => {
            const curVal = metric === 'value' ? it.salesValue : it.quantitySold;
            const widthPct = Math.round((curVal / maxVal) * 100);

            return (
              <div
                key={it.id || idx}
                onClick={() => onDrillDown?.(it.id)}
                className="space-y-1 cursor-pointer group"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate max-w-[200px] sm:max-w-[260px] flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold text-slate-400 w-4">#{idx + 1}</span>
                    <span className="truncate">{it.name}</span>
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 shrink-0">
                    {metric === 'value' ? formatInr(it.salesValue) : `${formatSafeCount(it.quantitySold)} units`}
                  </span>
                </div>

                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${Math.max(4, widthPct)}%` }}
                    className="h-full rounded-full bg-indigo-500 group-hover:bg-indigo-600 transition-all duration-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
        <span className="text-slate-400">Showing top {Math.min(5, items.length)} products</span>
        <button
          onClick={() => onDrillDown?.()}
          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
        >
          <span>View Catalog</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// =========================================================================
// 5. PROFITABILITY CHART (Combo Chart: Revenue vs Cost vs Profit)
// =========================================================================
interface ProfitabilityChartProps {
  totalRevenue: number;
  totalCogs: number;
  totalGrossProfit: number;
  totalExpenses: number;
  totalNetProfit: number;
  overallMarginPercent: number;
  points: ProfitabilityDataPoint[];
}

export const ProfitabilityChart: React.FC<ProfitabilityChartProps> = ({
  totalRevenue,
  totalCogs,
  totalGrossProfit,
  totalExpenses,
  totalNetProfit,
  overallMarginPercent,
  points,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs transition-colors space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Profitability</h3>
          </div>
          <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
            {overallMarginPercent}% Margin
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Revenue, Cost of Goods Sold (COGS), and Gross Profit
        </p>
      </div>

      {/* Primary KPI Breakdown */}
      <div className="grid grid-cols-3 gap-2 pt-1 text-center">
        <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Revenue</span>
          <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
            {formatInr(totalRevenue)}
          </span>
        </div>
        <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">COGS</span>
          <span className="text-sm font-extrabold text-rose-600 dark:text-rose-400">
            {formatInr(totalCogs)}
          </span>
        </div>
        <div className="p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/30">
          <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">Gross Profit</span>
          <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
            {formatInr(totalGrossProfit)}
          </span>
        </div>
      </div>

      {/* Visual Bar Breakdown */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Profit Split</span>
          <span>{totalRevenue > 0 ? Math.round((totalCogs / totalRevenue) * 100) : 0}% Cost / {overallMarginPercent}% Profit</span>
        </div>
        <div className="w-full h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
          <div
            style={{ width: `${totalRevenue > 0 ? (totalCogs / totalRevenue) * 100 : 0}%` }}
            className="bg-rose-500 transition-all duration-500"
            title={`COGS: ${formatInr(totalCogs)}`}
          />
          <div
            style={{ width: `${totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0}%` }}
            className="bg-emerald-500 transition-all duration-500"
            title={`Gross Profit: ${formatInr(totalGrossProfit)}`}
          />
        </div>
      </div>

      {/* Net profit callout with expenses deducted */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Period Operating Expenses:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{formatInr(totalExpenses)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Net Profit:</span>
          <strong className={`font-extrabold ${totalNetProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {formatInr(totalNetProfit)}
          </strong>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// 6. INVENTORY HEALTH CHART (Stacked Bar & Critical Items)
// =========================================================================
interface InventoryHealthChartProps {
  metrics: InventoryHealthMetrics;
  onDrillDown?: () => void;
}

export const InventoryHealthChart: React.FC<InventoryHealthChartProps> = ({
  metrics,
  onDrillDown,
}) => {
  const total = Math.max(1, metrics.totalCount);
  const healthyPct = Math.round((metrics.healthyCount / total) * 100);
  const lowPct = Math.round((metrics.lowStockCount / total) * 100);
  const outPct = Math.round((metrics.outOfStockCount / total) * 100);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs transition-colors space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Inventory Health</h3>
          </div>
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
            {metrics.totalCount} Products
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Current catalog stock levels against minimum reorder points
        </p>
      </div>

      {/* Stacked Health Bar */}
      <div className="space-y-2">
        <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
          <div style={{ width: `${healthyPct}%` }} className="bg-emerald-500 transition-all duration-500" title={`Healthy: ${metrics.healthyCount}`} />
          <div style={{ width: `${lowPct}%` }} className="bg-amber-500 transition-all duration-500" title={`Low Stock: ${metrics.lowStockCount}`} />
          <div style={{ width: `${outPct}%` }} className="bg-rose-500 transition-all duration-500" title={`Out of Stock: ${metrics.outOfStockCount}`} />
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded-xl bg-emerald-50/40 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 block">Healthy</span>
            <span className="font-extrabold text-slate-900 dark:text-slate-100">{metrics.healthyCount}</span>
          </div>
          <div className="p-2 rounded-xl bg-amber-50/40 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block">Low Stock</span>
            <span className="font-extrabold text-slate-900 dark:text-slate-100">{metrics.lowStockCount}</span>
          </div>
          <div className="p-2 rounded-xl bg-rose-50/40 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40">
            <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 block">Out of Stock</span>
            <span className="font-extrabold text-slate-900 dark:text-slate-100">{metrics.outOfStockCount}</span>
          </div>
        </div>
      </div>

      {/* Critical Stock Items List */}
      {metrics.criticalItems.length > 0 ? (
        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Critical Attention Items</span>
          <div className="space-y-1">
            {metrics.criticalItems.slice(0, 3).map((item) => (
              <div key={item.id} className="flex justify-between items-center text-xs">
                <span className="truncate max-w-[180px] font-medium text-slate-800 dark:text-slate-200">
                  {item.name}
                </span>
                <span className={`font-bold ${item.currentStock <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {item.currentStock} {item.unit} left
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 pt-2 font-medium text-center">
          All catalog inventory levels are healthy!
        </p>
      )}

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
        <span className="text-slate-400">Reorder alerts active</span>
        <button
          onClick={onDrillDown}
          className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
        >
          <span>Stock Movement</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// =========================================================================
// 7. QUOTATION CONVERSION FUNNEL CHART
// =========================================================================
interface QuotationFunnelChartProps {
  conversionRatePercent: number;
  stages: QuotationFunnelStage[];
  totalQuotations: number;
  convertedCount: number;
  convertedValue: number;
  onDrillDown?: () => void;
}

export const QuotationFunnelChart: React.FC<QuotationFunnelChartProps> = ({
  conversionRatePercent,
  stages,
  totalQuotations,
  convertedCount,
  convertedValue,
  onDrillDown,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs transition-colors space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Quotation Funnel</h3>
          </div>
          <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
            {conversionRatePercent}% Conversion
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Estimate acceptance and invoice conversion pipeline
        </p>
      </div>

      {totalQuotations === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No quotations recorded in this period.
        </div>
      ) : (
        <div className="space-y-2">
          {stages.map((st, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {st.stage}
                </span>
                <span className="font-extrabold text-slate-900 dark:text-slate-100">
                  {st.count} {st.value > 0 ? `(${formatInr(st.value)})` : ''}
                </span>
              </div>

              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  style={{ width: `${Math.max(st.count > 0 ? 4 : 0, st.percentage)}%` }}
                  className={`h-full rounded-full transition-all duration-500 ${
                    idx === 0
                      ? 'bg-blue-400'
                      : idx === 1
                      ? 'bg-blue-500'
                      : idx === 2
                      ? 'bg-indigo-500'
                      : idx === 3
                      ? 'bg-emerald-500'
                      : 'bg-emerald-600'
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Converted Value:</span>
          <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{formatInr(convertedValue)}</strong>
        </div>
        <button
          onClick={onDrillDown}
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          <span>Manage Quotations</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// =========================================================================
// 8. EXPENSE ANALYSIS CHART (Category Breakdown)
// =========================================================================
interface ExpenseAnalysisChartProps {
  totalExpenses: number;
  categories: ExpenseCategoryBreakdown[];
  onDrillDown?: () => void;
}

export const ExpenseAnalysisChart: React.FC<ExpenseAnalysisChartProps> = ({
  totalExpenses,
  categories,
  onDrillDown,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs transition-colors space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <PieChart className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Expense Analysis</h3>
          </div>
          <span className="text-sm font-extrabold text-rose-600 dark:text-rose-400">
            {formatInr(totalExpenses)}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Operational expenditure distribution across categories
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No expenses recorded in this period.
        </div>
      ) : (
        <div className="space-y-2">
          {categories.slice(0, 5).map((cat, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {cat.category} <span className="text-[10px] text-slate-400">({cat.count})</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">{cat.percentage}%</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{formatInr(cat.amount)}</span>
                </div>
              </div>

              <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  style={{ width: `${Math.max(4, cat.percentage)}%` }}
                  className="h-full rounded-full bg-rose-500"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
        <span className="text-slate-400">{categories.length} expense categories</span>
        <button
          onClick={onDrillDown}
          className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
        >
          <span>View Expenses</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

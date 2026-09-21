import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
  Treemap,
} from 'recharts';
import { ChartCard } from './ChartCard';
import { PbiTooltip } from './PbiTooltip';
import { formatCompactInr, formatFullInr, formatCompactCount, PBI_PALETTE, PBI_FONTS } from './theme';
import { ProductPerformanceItem } from '../../services/supabase/enterpriseAnalyticsService';

interface TopProductsBarChartProps {
  byValue: ProductPerformanceItem[];
  byQuantity: ProductPerformanceItem[];
  selectedProductId?: string | null;
  onSelectProduct?: (productId: string | null) => void;
  onDrillDown?: () => void;
  loading?: boolean;
}

export const TopProductsBarChart: React.FC<TopProductsBarChartProps> = ({
  byValue,
  byQuantity,
  selectedProductId,
  onSelectProduct,
  onDrillDown,
  loading = false,
}) => {
  const [metric, setMetric] = useState<'value' | 'quantity'>('value');
  const [chartType, setChartType] = useState<'bar' | 'treemap'>('bar');
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);

  const rawList = metric === 'value' ? byValue : byQuantity;

  // Sort descending and take top 5 for bar, up to 12 for treemap
  const displayData = useMemo(() => {
    if (!rawList || rawList.length === 0) return [];
    const sorted = [...rawList].sort((a, b) => {
      const valA = metric === 'value' ? (a.salesValue || 0) : (a.quantitySold || 0);
      const valB = metric === 'value' ? (b.salesValue || 0) : (b.quantitySold || 0);
      return valB - valA;
    });

    if (chartType === 'treemap') {
      return sorted.slice(0, 12).map((item, idx) => ({
        ...item,
        size: metric === 'value' ? item.salesValue : item.quantitySold,
        color: PBI_PALETTE[idx % PBI_PALETTE.length],
      }));
    }

    return sorted.slice(0, 5).reverse(); // reverse for vertical bar layout so #1 is at top
  }, [rawList, metric, chartType]);

  const totalSum = useMemo(() => {
    return (rawList || []).reduce(
      (acc, curr) => acc + (metric === 'value' ? (curr.salesValue || 0) : (curr.quantitySold || 0)),
      0
    );
  }, [rawList, metric]);

  const isEmpty = !displayData || displayData.length === 0 || totalSum <= 0;

  const tableColumns = [
    { key: 'name', label: 'Product Name' },
    { key: 'sku', label: 'SKU' },
    { key: 'salesValue', label: 'Sales Value (₹)', format: formatFullInr },
    { key: 'quantitySold', label: 'Quantity Sold', format: (v: number) => `${v} Units` },
  ];

  return (
    <ChartCard
      title="Top Selling Products"
      subtitle={`Ranked ranking by ${metric === 'value' ? 'Sales Revenue' : 'Units Sold'}`}
      loading={loading}
      empty={isEmpty}
      emptyMessage="No product sales recorded in this period."
      tableData={rawList}
      tableColumns={tableColumns}
      actionSlot={
        <div className="flex items-center gap-2">
          {/* Sales Value vs Quantity Toggle */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setMetric('value')}
              className={`px-2 py-0.5 rounded-md transition-all ${
                metric === 'value'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Value (₹)
            </button>
            <button
              type="button"
              onClick={() => setMetric('quantity')}
              className={`px-2 py-0.5 rounded-md transition-all ${
                metric === 'quantity'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
            >
              Qty
            </button>
          </div>

          {/* Treemap Toggle */}
          <button
            type="button"
            onClick={() => setChartType(chartType === 'bar' ? 'treemap' : 'bar')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
              chartType === 'treemap'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-600'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700'
            }`}
          >
            {chartType === 'bar' ? 'Treemap' : 'Bars'}
          </button>
        </div>
      }
    >
      <div className="w-full h-56 pt-1">
        {chartType === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={displayData}
              layout="vertical"
              margin={{ top: 5, right: 45, left: 10, bottom: 0 }}
              onClick={(e: any) => {
                if (e && e.activePayload && e.activePayload[0] && onSelectProduct) {
                  const pId = e.activePayload[0].payload?.id;
                  onSelectProduct(selectedProductId === pId ? null : pId);
                }
              }}
            >
              <XAxis
                type="number"
                tickFormatter={(v) => (metric === 'value' ? formatCompactInr(v) : formatCompactCount(v))}
                tick={{ fontSize: PBI_FONTS.axisSize, fill: '#888888', fontFamily: PBI_FONTS.family }}
                axisLine={false}
                tickLine={false}
                domain={[0, Math.max(totalSum, 1)]}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={95}
                tick={{ fontSize: 11, fill: '#475569', fontWeight: 600, fontFamily: PBI_FONTS.family }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={
                  <PbiTooltip
                    totalSum={totalSum}
                    valueFormatter={(v) => (metric === 'value' ? formatFullInr(v) : `${v} Units`)}
                    showPercentOfTotal={true}
                  />
                }
              />
              <Bar
                dataKey={metric === 'value' ? 'salesValue' : 'quantitySold'}
                name={metric === 'value' ? 'Revenue' : 'Units'}
                radius={[0, 4, 4, 0]}
                maxBarSize={22}
                cursor="pointer"
              >
                {displayData.map((item, idx) => {
                  const isDimmed =
                    (hoveredProduct && hoveredProduct !== item.id) ||
                    (selectedProductId && selectedProductId !== item.id);
                  const color = PBI_PALETTE[idx % PBI_PALETTE.length];
                  return (
                    <Cell
                      key={`prod-${item.id || idx}`}
                      fill={color}
                      opacity={isDimmed ? 0.35 : 1}
                      onMouseEnter={() => setHoveredProduct(item.id)}
                      onMouseLeave={() => setHoveredProduct(null)}
                    />
                  );
                })}
                <LabelList
                  dataKey={metric === 'value' ? 'salesValue' : 'quantitySold'}
                  position="right"
                  formatter={(val: any) =>
                    metric === 'value' ? formatCompactInr(Number(val)) : `${val} U`
                  }
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
        ) : (
          /* Treemap Visual */
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={displayData as any[]}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="#fff"
              fill={PBI_PALETTE[0]}
            >
              <Tooltip
                content={
                  <PbiTooltip
                    totalSum={totalSum}
                    valueFormatter={(v) => (metric === 'value' ? formatFullInr(v) : `${v} Units`)}
                    showPercentOfTotal={true}
                  />
                }
              />
            </Treemap>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
};

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { ChartCard } from './ChartCard';
import { PbiTooltip } from './PbiTooltip';
import { PbiLegend } from './PbiLegend';
import { PBI_SEMANTIC } from './theme';
import { InventoryHealthMetrics } from '../../services/supabase/enterpriseAnalyticsService';

interface InventoryHealthGaugeProps {
  metrics: InventoryHealthMetrics;
  onDrillDown?: () => void;
  loading?: boolean;
}

export const InventoryHealthGauge: React.FC<InventoryHealthGaugeProps> = ({
  metrics,
  onDrillDown,
  loading = false,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { healthyCount, lowStockCount, outOfStockCount, totalCount, criticalItems } = metrics;
  const isEmpty = totalCount <= 0;

  const gaugeData = [
    { id: 'healthy', name: 'Healthy Stock', value: healthyCount, color: PBI_SEMANTIC.positive },
    { id: 'low', name: 'Low Stock', value: lowStockCount, color: PBI_SEMANTIC.warning },
    { id: 'out', name: 'Out of Stock', value: outOfStockCount, color: PBI_SEMANTIC.negative },
  ];

  const tableData = (criticalItems || []).map((i) => ({
    name: i.name,
    sku: i.sku,
    currentStock: `${i.currentStock} ${i.unit}`,
    minimumStock: `${i.minimumStock} ${i.unit}`,
    status: i.currentStock <= 0 ? 'Out of Stock' : 'Low Stock',
  }));

  return (
    <ChartCard
      title="Inventory Health & Stock Status"
      subtitle="Catalog inventory categorization and critical restock requirements"
      badge={`${totalCount} SKUs`}
      loading={loading}
      empty={isEmpty}
      emptyMessage="No inventory items found."
      tableData={tableData}
      actionSlot={
        onDrillDown ? (
          <button
            type="button"
            onClick={onDrillDown}
            className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
          >
            <span>Restock</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        {/* Semi-Circle Gauge + Legend */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          {/* Semi-circle Gauge */}
          <div className="relative w-44 h-28 shrink-0 mx-auto sm:mx-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={
                    <PbiTooltip
                      totalSum={totalCount}
                      valueFormatter={(v) => `${v} SKUs`}
                      showPercentOfTotal={true}
                    />
                  }
                />
                <Pie
                  data={gaugeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="90%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {gaugeData.map((entry) => (
                    <Cell
                      key={`gauge-${entry.id}`}
                      fill={entry.color}
                      opacity={hoveredId && hoveredId !== entry.id ? 0.35 : 1}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-x-0 bottom-0 text-center pointer-events-none">
              <span className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                {totalCount}
              </span>
              <span className="text-[10px] text-slate-400 block -mt-0.5">Total SKUs</span>
            </div>
          </div>

          {/* Legend Items */}
          <div className="flex-1 w-full space-y-1.5">
            <PbiLegend
              items={gaugeData.map((d) => ({
                id: d.id,
                name: d.name,
                color: d.color,
                value: d.value,
                percentage: totalCount > 0 ? (d.value / totalCount) * 100 : 0,
              }))}
              hoveredId={hoveredId}
              onItemHover={setHoveredId}
              direction="column"
            />
          </div>
        </div>

        {/* Critical Attention Items Table */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
            Critical Attention Items
          </span>
          {criticalItems && criticalItems.length > 0 ? (
            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
              {criticalItems.slice(0, 3).map((item) => {
                const isOut = item.currentStock <= 0;
                return (
                  <div
                    key={item.id}
                    className="p-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between text-xs gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 truncate block">
                        {item.name}
                      </span>
                      <span className="text-[10px] text-slate-400">SKU: {item.sku}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isOut
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {item.currentStock} {item.unit} left
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium py-1">
              ✓ All inventory items are above minimum stock levels.
            </p>
          )}
        </div>
      </div>
    </ChartCard>
  );
};

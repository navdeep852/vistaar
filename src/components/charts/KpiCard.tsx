import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface SparklinePoint {
  val: number;
}

export interface KpiCardProps {
  title: string;
  value: string;
  subValue?: string;
  deltaPercent?: number;
  deltaLabel?: string;
  sparklineData?: number[];
  color?: string;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subValue,
  deltaPercent,
  deltaLabel = 'vs previous',
  sparklineData,
  color = '#118DFF',
  icon,
  footer,
  loading = false,
  onClick,
}) => {
  const chartData = useMemo(() => {
    const raw = sparklineData && sparklineData.length > 0 ? sparklineData : [10, 15, 12, 18, 20, 25, 22, 30];
    return raw.map((v, i) => ({ i, val: isNaN(Number(v)) ? 0 : Number(v) }));
  }, [sparklineData]);

  const hasDelta = deltaPercent !== undefined && deltaPercent !== null;
  const isPositive = (deltaPercent ?? 0) >= 0;

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[175px] relative overflow-hidden group ${
        onClick ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700' : ''
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between z-10">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
          {title}
        </span>
        {icon && (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
            style={{ backgroundColor: `${color}15`, color: color }}
          >
            {icon}
          </div>
        )}
      </div>

      {/* Main KPI Value */}
      <div className="my-2 z-10">
        {loading ? (
          <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg" />
        ) : (
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              {value}
            </h3>
            {subValue && (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {subValue}
              </span>
            )}
          </div>
        )}

        {/* Delta Badge */}
        {!loading && hasDelta && (
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                isPositive
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
              }`}
            >
              {isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{Math.abs(deltaPercent)}%</span>
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {deltaLabel}
            </span>
          </div>
        )}
      </div>

      {/* Tiny Power BI Area Sparkline at the bottom of the card */}
      <div className="h-9 -mx-5 -mb-2 mt-1 relative z-0 opacity-80 group-hover:opacity-100 transition-opacity">
        <ResponsiveContainer width="100%" height="100%" debounce={50} minHeight={28}>
          <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <YAxis hide domain={[0, 'auto']} />
            <defs>
              <linearGradient id={`kpi-spark-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="val"
              stroke={color}
              strokeWidth={1.75}
              fill={`url(#kpi-spark-${title.replace(/\s+/g, '')})`}
              isAnimationActive={true}
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Optional Card Footer */}
      {footer && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 z-10">
          {footer}
        </div>
      )}
    </div>
  );
};

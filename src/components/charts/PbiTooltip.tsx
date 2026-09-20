import React from 'react';
import { formatFullInr, formatCompactCount } from './theme';

export interface PbiTooltipPayloadItem {
  name: string;
  value: number | string;
  color?: string;
  unit?: string;
  isCurrency?: boolean;
}

interface PbiTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  title?: string;
  totalSum?: number;
  valueFormatter?: (val: number) => string;
  showPercentOfTotal?: boolean;
}

export const PbiTooltip: React.FC<PbiTooltipProps> = ({
  active,
  payload,
  label,
  title,
  totalSum,
  valueFormatter,
  showPercentOfTotal = false,
}) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const heading = title || label || '';

  return (
    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-700/80 shadow-xl text-xs z-50 min-w-[160px] animate-in fade-in-50 duration-150">
      {heading && (
        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-2">
          {heading}
        </div>
      )}

      <div className="space-y-1.5">
        {payload.map((item, index) => {
          const rawVal = Number(item.value);
          const formattedVal = valueFormatter
            ? valueFormatter(rawVal)
            : item.payload?.isCount
            ? formatCompactCount(rawVal)
            : formatFullInr(rawVal);

          const percent =
            showPercentOfTotal && totalSum && totalSum > 0 && !isNaN(rawVal)
              ? ((rawVal / totalSum) * 100).toFixed(1)
              : null;

          const dotColor = item.color || item.fill || item.stroke || '#118DFF';

          return (
            <div key={`pbi-tip-${index}`} className="flex items-center justify-between gap-3 text-[11px]">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: dotColor }}
                />
                <span className="text-slate-500 dark:text-slate-400 font-medium truncate">
                  {item.name || 'Value'}:
                </span>
              </div>
              <div className="text-right shrink-0 flex items-center gap-1">
                <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                  {formattedVal}
                </span>
                {percent && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                    ({percent}%)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

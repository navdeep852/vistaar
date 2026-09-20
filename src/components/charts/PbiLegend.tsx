import React from 'react';

export interface LegendItem {
  id: string;
  name: string;
  color: string;
  value?: string | number;
  percentage?: number;
}

interface PbiLegendProps {
  items: LegendItem[];
  activeId?: string | null;
  hoveredId?: string | null;
  onItemHover?: (id: string | null) => void;
  onItemClick?: (id: string) => void;
  direction?: 'row' | 'column';
  className?: string;
}

export const PbiLegend: React.FC<PbiLegendProps> = ({
  items,
  activeId,
  hoveredId,
  onItemHover,
  onItemClick,
  direction = 'row',
  className = '',
}) => {
  return (
    <div
      className={`flex flex-wrap gap-2.5 text-xs select-none ${
        direction === 'column' ? 'flex-col items-start' : 'items-center'
      } ${className}`}
    >
      {items.map((item) => {
        const isDimmed =
          (hoveredId && hoveredId !== item.id) ||
          (activeId && activeId !== item.id);
        const isSelected = activeId === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onItemClick && onItemClick(item.id)}
            onMouseEnter={() => onItemHover && onItemHover(item.id)}
            onMouseLeave={() => onItemHover && onItemHover(null)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all duration-150 text-left ${
              isDimmed
                ? 'opacity-35 hover:opacity-75'
                : 'opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800'
            } ${
              isSelected
                ? 'ring-1.5 ring-blue-500 bg-blue-50/50 dark:bg-blue-950/40 font-bold'
                : 'font-medium'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-slate-700 dark:text-slate-300 truncate max-w-[130px] text-[11px]">
              {item.name}
            </span>
            {item.value !== undefined && (
              <span className="text-slate-900 dark:text-slate-100 font-bold text-[11px]">
                {item.value}
              </span>
            )}
            {item.percentage !== undefined && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                ({item.percentage.toFixed(0)}%)
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

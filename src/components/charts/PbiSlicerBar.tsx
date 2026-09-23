import React from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import { DatePresetType, ResolvedDateRange, formatReportingPeriodSubtitle } from '../../lib/dateRange';

interface PbiSlicerBarProps {
  rangePreset: DatePresetType;
  onPresetChange: (preset: DatePresetType) => void;
  dateRange: ResolvedDateRange;
  customStartDate: string;
  customEndDate: string;
  onCustomStartChange: (val: string) => void;
  onCustomEndChange: (val: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export const PbiSlicerBar: React.FC<PbiSlicerBarProps> = ({
  rangePreset,
  onPresetChange,
  dateRange,
  customStartDate,
  customEndDate,
  onCustomStartChange,
  onCustomEndChange,
  onRefresh,
  loading = false,
}) => {
  const presets: Array<{ id: DatePresetType; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3 sm:px-5 sm:py-3.5 shadow-xs transition-colors space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Slicer Title & Scope Badge */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
              KPI Reporting Scope
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatReportingPeriodSubtitle(dateRange)}
              </span>
              {dateRange.isHistorical && (
                <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40">
                  Historical
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Slicer Buttons & Refresh */}
        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
            {presets.map((btn) => {
              const isActive = rangePreset === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => onPresetChange(btn.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold shadow-xs shadow-blue-600/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="Refresh Visuals"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Custom Date Inputs if 'custom' is active */}
      {rangePreset === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 animate-fade-in text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-medium">From:</span>
            <input
              type="date"
              value={customStartDate}
              max={customEndDate || undefined}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-blue-500 outline-none text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-medium">To:</span>
            <input
              type="date"
              value={customEndDate}
              min={customStartDate || undefined}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-blue-500 outline-none text-xs"
            />
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
            Inclusive date bounds
          </span>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Loader2, ShieldCheck, Database, HardDrive, CheckCircle2, AlertOctagon } from 'lucide-react';
import { BackupProgressInfo } from '../../services/backup/backupTypes';

interface BackupProgressProps {
  progress: BackupProgressInfo;
}

export const BackupProgress: React.FC<BackupProgressProps> = ({ progress }) => {
  const getIcon = () => {
    switch (progress.stage) {
      case 'collecting':
        return <Database className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-pulse" />;
      case 'compressing':
        return <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />;
      case 'encrypting':
        return <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
      case 'writing':
        return <HardDrive className="w-5 h-5 text-purple-600 dark:text-purple-400 animate-pulse" />;
      case 'verifying':
        return <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-pulse" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'failed':
        return <AlertOctagon className="w-5 h-5 text-rose-600 dark:text-rose-400" />;
      default:
        return <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />;
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold">
        <div className="flex items-center gap-2.5">
          {getIcon()}
          <span className="text-slate-800 dark:text-slate-200">{progress.message}</span>
        </div>
        <span className="font-mono text-blue-600 dark:text-blue-400">{progress.percentage}%</span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            progress.stage === 'failed'
              ? 'bg-rose-500'
              : progress.stage === 'completed'
              ? 'bg-emerald-500'
              : 'bg-blue-600'
          }`}
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

      {progress.rowsCollected !== undefined && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
          <span>
            {progress.currentTable
              ? `Processing: ${progress.currentTable} (${progress.tableIndex || 0}/${progress.totalTables || 0})`
              : 'Workspace Snapshot Engine'}
          </span>
          <span>{progress.rowsCollected.toLocaleString()} records gathered</span>
        </div>
      )}
    </div>
  );
};


import React from 'react';
import {
  FileArchive,
  RotateCcw,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  Clock,
  Layers,
  HardDrive,
} from 'lucide-react';
import { BackupFileInfo } from '../../services/backup/backupTypes';

interface BackupHistoryProps {
  backups: BackupFileInfo[];
  isLoading: boolean;
  onRestore: (backup: BackupFileInfo) => void;
  onVerify: (backup: BackupFileInfo) => void;
  onDelete: (backup: BackupFileInfo) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const BackupHistory: React.FC<BackupHistoryProps> = ({
  backups,
  isLoading,
  onRestore,
  onVerify,
  onDelete,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Detected Backup Archives
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Locally detected `.vistaarbackup` files in your configured OneDrive sync destination.
          </p>
        </div>
        <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          {backups.length} {backups.length === 1 ? 'file' : 'files'}
        </span>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-500 animate-pulse">
          Scanning OneDrive folder for backup archives...
        </div>
      ) : backups.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
            <FileArchive className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              No Backups Detected in Folder
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Click &quot;Create Backup Now&quot; to generate an encrypted snapshot of your business workspace
              into your connected OneDrive folder.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {backups.map((b) => {
            const rowCount = b.manifest?.tables
              ? Object.values(b.manifest.tables).reduce((acc, curr) => acc + (curr.rowCount || 0), 0)
              : undefined;

            return (
              <div
                key={b.fileName}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 px-3 rounded-xl transition-colors"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {b.fileName}
                    </span>
                    {b.manifest?.encryption.enabled && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40">
                        <ShieldCheck className="w-3 h-3" />
                        AES-256-GCM
                      </span>
                    )}
                    {b.status === 'valid' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                        Unverified
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(b.createdAt).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                      {formatBytes(b.fileSizeBytes)}
                    </span>
                    {rowCount !== undefined && (
                      <span className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        {rowCount.toLocaleString()} records
                      </span>
                    )}
                  </div>

                  {b.manifest?.workspaceName && (
                    <div className="text-[11px] text-slate-400 dark:text-slate-500">
                      Workspace: <span className="font-semibold">{b.manifest.workspaceName}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onRestore(b)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-900/40 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore
                  </button>

                  <button
                    onClick={() => onVerify(b)}
                    title="Verify SHA-256 Checksum"
                    className="p-1.5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onDelete(b)}
                    title="Delete Backup"
                    className="p-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


import React, { useState } from 'react';
import {
  FileArchive,
  RotateCcw,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  Clock,
  Layers,
  HardDrive,
  Download,
  FolderCheck,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Backup History &amp; Archives
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Full ledger of OneDrive snapshots, downloads, and automated archives.
          </p>
        </div>
        <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 self-start sm:self-auto">
          {backups.length} {backups.length === 1 ? 'record' : 'records'}
        </span>
      </div>

      {/* Cloud Sync Status Advisory */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
        <div>
          <span className="font-semibold text-slate-700 dark:text-slate-300">Sync Status Notice:</span> Backup saved
          successfully to your OneDrive folder. OneDrive will synchronise this file when its sync service is
          available. Cloud upload status is not independently verified by VISTAAR.
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-500 animate-pulse">
          Loading backup archives and history...
        </div>
      ) : backups.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
            <FileArchive className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              No Backups Created Yet
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Use &quot;Back Up Now&quot; to save directly to your OneDrive folder or &quot;Download Backup&quot; to download an encrypted copy.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {backups.map((b) => {
            const isDownload = b.backupType === 'download' || b.destinationName?.includes('Download');
            const isAuto = b.backupType === 'automatic' || b.fileName.includes('_daily_') || b.fileName.includes('_weekly_');
            const isExpanded = expandedFile === b.fileName;

            const rowCount = b.manifest?.tables
              ? Object.values(b.manifest.tables).reduce((acc, curr) => acc + (curr.rowCount || 0), 0)
              : undefined;

            return (
              <div
                key={b.fileName}
                className="py-4 px-3 rounded-xl hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {b.fileName}
                      </span>

                      {/* Backup Type Badge */}
                      {isDownload ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                          <Download className="w-3 h-3" />
                          Manual Download
                        </span>
                      ) : isAuto ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40">
                          <Clock className="w-3 h-3" />
                          Automatic Schedule
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40">
                          <FolderCheck className="w-3 h-3" />
                          OneDrive Folder
                        </span>
                      )}

                      {/* Integrity Status */}
                      {b.status === 'valid' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                          <CheckCircle2 className="w-3 h-3" />
                          SHA-256 Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                          <AlertTriangle className="w-3 h-3" />
                          Unverified
                        </span>
                      )}

                      {/* Real OneDrive Cloud Sync Status */}
                      {!isDownload && (
                        <span
                          title="Backup saved to local folder; OneDrive desktop client syncs in background."
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                        >
                          Sync Status Unknown
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
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
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        Destination: <strong className="text-slate-700 dark:text-slate-300">{b.destinationName || (isDownload ? 'Computer Downloads' : 'OneDrive Folder')}</strong>
                      </span>
                    </div>

                    {b.manifest?.workspaceName && (
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">
                        Workspace: <span className="font-semibold text-slate-700 dark:text-slate-300">{b.manifest.workspaceName}</span>
                      </div>
                    )}
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {b.manifest?.tables && (
                      <button
                        onClick={() => setExpandedFile(isExpanded ? null : b.fileName)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" /> Less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" /> Details
                          </>
                        )}
                      </button>
                    )}

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

                    {!isDownload && (
                      <button
                        onClick={() => onDelete(b)}
                        title="Delete Backup from Folder"
                        className="p-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Table Breakdown */}
                {isExpanded && b.manifest?.tables && (
                  <div className="p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-2">
                    <div className="font-semibold text-slate-700 dark:text-slate-300">
                      Record Breakdown by Database Table:
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {Object.entries(b.manifest.tables).map(([table, meta]) => (
                        <div key={table} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          <div className="text-[10px] text-slate-400 font-mono truncate">{table}</div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">{meta.rowCount || 0} rows</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


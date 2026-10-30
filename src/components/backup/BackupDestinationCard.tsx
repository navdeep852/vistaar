import React from 'react';
import {
  FolderCheck,
  FolderX,
  ExternalLink,
  RefreshCw,
  FolderSync,
  Laptop,
  Globe,
  Info,
} from 'lucide-react';
import { BackupCapabilities } from '../../services/backup/backupTypes';

interface BackupDestinationCardProps {
  label: string;
  isConnected: boolean;
  capabilities: BackupCapabilities | null;
  lastVerifiedAt?: string;
  onSelectFolder: () => void;
  onDisconnect: () => void;
  onVerify: () => void;
  onOpenExplorer?: () => void;
  isLoading?: boolean;
}

export const BackupDestinationCard: React.FC<BackupDestinationCardProps> = ({
  label,
  isConnected,
  capabilities,
  lastVerifiedAt,
  onSelectFolder,
  onDisconnect,
  onVerify,
  onOpenExplorer,
  isLoading,
}) => {
  const isDesktop = capabilities?.platform === 'desktop';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              isConnected
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {isConnected ? <FolderCheck className="w-6 h-6" /> : <FolderX className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Backup Destination: OneDrive Folder
              </h3>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isConnected
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40'
                }`}
              >
                {isConnected ? 'Folder Connected' : 'Not Connected'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Backs up your business records into your locally synchronised OneDrive folder.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isDesktop ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700">
              <Laptop className="w-3.5 h-3.5 text-blue-500" />
              Windows Desktop Native
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-700">
              <Globe className="w-3.5 h-3.5 text-indigo-500" />
              File System Access API
            </span>
          )}
        </div>
      </div>

      {/* Destination & Permission Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 col-span-1 md:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
            Folder Name &amp; Path
          </div>
          <div className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 break-all">
            {label}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Permission &amp; Verification
            </div>
            <div className="text-xs font-semibold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              {isConnected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Read &amp; Write Permitted
                </>
              ) : (
                <span className="text-slate-500">Awaiting Connection</span>
              )}
            </div>
          </div>
          {isConnected && (
            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
              {lastVerifiedAt ? `Last verified: ${lastVerifiedAt}` : 'Active session'}
            </div>
          )}
        </div>
      </div>

      {/* Honest OneDrive Sync Explanation */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/30 text-xs text-blue-800 dark:text-blue-300">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
        <div>
          <span className="font-semibold">Local Sync Architecture:</span> VISTAAR creates encrypted,
          integrity-verified backup files directly in your chosen folder. The official Microsoft OneDrive
          application automatically syncs them to your cloud storage in the background without needing
          Azure Entra or Microsoft Graph OAuth permissions.
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          onClick={onSelectFolder}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <FolderSync className="w-4 h-4" />
          {isConnected ? 'Change OneDrive Folder' : 'Connect OneDrive Folder'}
        </button>

        {isConnected && (
          <>
            <button
              onClick={onVerify}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Verify Access
            </button>

            {isDesktop && onOpenExplorer && (
              <button
                onClick={onOpenExplorer}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Backup Folder
              </button>
            )}

            <button
              onClick={onDisconnect}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors border border-rose-200 dark:border-rose-900/50 cursor-pointer ml-auto"
            >
              Disconnect Folder
            </button>
          </>
        )}
      </div>
    </div>
  );
};


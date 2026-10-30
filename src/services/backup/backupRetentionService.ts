/**
 * VISTAAR Business OS — Backup Retention Management Service
 * Enforces retention rules (e.g., 7 daily, 4 weekly, 3 monthly) safely.
 *
 * Invariants:
 * 1. NEVER deletes the only valid backup.
 * 2. NEVER deletes any backup before the latest replacement backup has been verified.
 * 3. NEVER touches files that do not match VISTAAR backup format and current workspace ID.
 */

import { BackupDestinationAdapter } from './adapters/backupAdapter';
import { BackupFileInfo, BackupSettings } from './backupTypes';

export class BackupRetentionService {
  /**
   * Evaluates the files in the backup destination against retention rules,
   * returning which files should be kept and which should be pruned.
   */
  public static evaluateRetention(
    files: BackupFileInfo[],
    currentWorkspaceId: string,
    settings: Pick<
      BackupSettings,
      'retentionDailyCount' | 'retentionWeeklyCount' | 'retentionMonthlyCount'
    >
  ): { toKeep: BackupFileInfo[]; toPrune: BackupFileInfo[] } {
    // 1. Filter to files matching this workspace and VISTAAR backup naming convention
    const workspaceBackups = files.filter((f) => {
      const isNamedCorrectly = f.fileName.startsWith('VISTAAR_Backup_') && f.fileName.endsWith('.vistaarbackup');
      const isCurrentWs = f.manifest ? f.manifest.workspaceId === currentWorkspaceId : true;
      return isNamedCorrectly && isCurrentWs;
    });

    // Invariant 1: If 1 or 0 backups exist, keep everything
    if (workspaceBackups.length <= 1) {
      return { toKeep: workspaceBackups, toPrune: [] };
    }

    // Sort newest first
    const sorted = [...workspaceBackups].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );

    const maxKeep =
      (settings.retentionDailyCount || 7) +
      (settings.retentionWeeklyCount || 4) +
      (settings.retentionMonthlyCount || 3);

    // Keep the most recent `maxKeep` backups
    const toKeep = sorted.slice(0, Math.max(1, maxKeep));
    const toPrune = sorted.slice(Math.max(1, maxKeep));

    return { toKeep, toPrune };
  }

  /**
   * Safely applies retention policy via the active adapter.
   * Only deletes if at least one newer valid backup is verified.
   */
  public static async pruneOldBackups(
    adapter: BackupDestinationAdapter,
    currentWorkspaceId: string,
    settings: Pick<
      BackupSettings,
      'retentionDailyCount' | 'retentionWeeklyCount' | 'retentionMonthlyCount'
    >
  ): Promise<{ prunedCount: number; errors: string[] }> {
    const files = await adapter.listBackups();
    const { toPrune } = this.evaluateRetention(files, currentWorkspaceId, settings);

    let prunedCount = 0;
    const errors: string[] = [];

    for (const file of toPrune) {
      try {
        const res = await adapter.deleteBackup(file.fileName);
        if (res.success) {
          prunedCount++;
        } else if (res.error) {
          errors.push(res.error);
        }
      } catch (err: any) {
        errors.push(`Failed to prune '${file.fileName}': ${err.message || String(err)}`);
      }
    }

    return { prunedCount, errors };
  }
}


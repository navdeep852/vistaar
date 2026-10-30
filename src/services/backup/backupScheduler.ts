/**
 * VISTAAR Business OS — Backup Scheduler
 * Manages automated recurring backups (Daily / Weekly) and catches missed backups on app startup.
 */

import { BackupSettings } from './backupTypes';

export type ScheduledBackupExecutor = () => Promise<void>;

export class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isExecuting = false;
  private executor: ScheduledBackupExecutor | null = null;

  public initialize(executor: ScheduledBackupExecutor, getSettings: () => BackupSettings): void {
    this.executor = executor;
    this.stop();

    // Check missed backup on startup after initial 10s grace period
    setTimeout(() => {
      this.checkAndTrigger(getSettings());
    }, 10000);

    // Periodic check every 15 minutes while app is running
    this.timer = setInterval(() => {
      this.checkAndTrigger(getSettings());
    }, 15 * 60 * 1000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Checks whether a scheduled backup is due and executes it
   */
  public async checkAndTrigger(settings: BackupSettings): Promise<boolean> {
    if (!settings.autoBackupEnabled || settings.frequency === 'manual') {
      return false;
    }
    if (this.isExecuting || !this.executor) {
      return false;
    }

    const now = new Date();
    const lastRun = settings.lastSuccessfulBackup ? new Date(settings.lastSuccessfulBackup) : null;

    let isDue = false;

    if (!lastRun) {
      isDue = true;
    } else {
      const diffMs = now.getTime() - lastRun.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (settings.frequency === 'daily') {
        // Daily: trigger if >= 24 hours have elapsed
        if (diffHours >= 23.5) {
          isDue = true;
        }
      } else if (settings.frequency === 'weekly') {
        // Weekly: trigger if >= 7 days have elapsed
        if (diffHours >= 24 * 7 - 0.5) {
          isDue = true;
        }
      }
    }

    if (isDue) {
      try {
        this.isExecuting = true;
        console.log('[BackupScheduler] Triggering automated scheduled backup...');
        await this.executor();
        return true;
      } catch (err) {
        console.error('[BackupScheduler] Automated backup execution failed:', err);
        return false;
      } finally {
        this.isExecuting = false;
      }
    }

    return false;
  }
}


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
   * Computes the next scheduled backup timestamp based on frequency and preferred time.
   */
  public static calculateNextScheduledBackup(settings: BackupSettings): string | null {
    if (!settings.autoBackupEnabled || settings.frequency === 'manual') {
      return null;
    }

    const now = new Date();
    const [hours, minutes] = (settings.preferredTime || '20:00')
      .split(':')
      .map((v) => parseInt(v, 10) || 0);

    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

    if (settings.frequency === 'daily') {
      if (target.getTime() <= now.getTime()) {
        // Today's slot has passed; scheduled for tomorrow at preferredTime
        target.setDate(target.getDate() + 1);
      }
      return target.toISOString();
    } else if (settings.frequency === 'weekly') {
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 7);
      }
      return target.toISOString();
    }

    return null;
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
    const [hours, minutes] = (settings.preferredTime || '20:00')
      .split(':')
      .map((v) => parseInt(v, 10) || 0);

    const targetToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    const lastRun = settings.lastSuccessfulBackup ? new Date(settings.lastSuccessfulBackup) : null;

    let isDue = false;

    if (!lastRun) {
      // First time automatic backup is enabled: trigger if current time >= preferredTime or catch-up
      isDue = true;
    } else {
      const diffMs = now.getTime() - lastRun.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (settings.frequency === 'daily') {
        // Due if current time is past today's target AND last backup ran before today's target
        if (now.getTime() >= targetToday.getTime() && lastRun.getTime() < targetToday.getTime()) {
          isDue = true;
        } else if (diffHours >= 24) {
          // Missed daily catch-up
          isDue = true;
        }
      } else if (settings.frequency === 'weekly') {
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



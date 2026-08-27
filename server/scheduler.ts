import type { FollowUp, AppNotification, FollowUpExecutionLog } from '../src/types/index.ts';
import { serverStore } from './serverStore.ts';

/**
 * Masks a phone number for privacy during server logging.
 * Example: "918176013733" -> "********3733"
 */
export function maskPhone(phone?: string): string {
  if (!phone) return 'N/A';
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length < 4) return '****';
  return '*'.repeat(Math.max(0, clean.length - 4)) + clean.slice(-4);
}

/**
 * Converts a dueDate (YYYY-MM-DD) and dueTime (HH:mm) interpreted in Asia/Kolkata (IST, UTC+05:30)
 * into a UTC epoch timestamp in milliseconds.
 */
export function getFollowUpDueTimestamp(dueDate: string, dueTime: string): number {
  if (!dueDate) return Infinity;
  const timeStr = dueTime ? (dueTime.length === 5 ? `${dueTime}:00` : dueTime) : '00:00:00';
  const isoStr = `${dueDate}T${timeStr}+05:30`;
  const timestamp = Date.parse(isoStr);
  return isNaN(timestamp) ? Infinity : timestamp;
}

export interface ProcessingResult {
  processedCount: number;
  processedIds: string[];
  failures: Array<{ id: string; error: string }>;
}

export function processDueFollowUps(): ProcessingResult {
  const nowMs = Date.now();
  const data = serverStore.getData();
  const allFollowUps = data.followUps || [];

  // Find pending follow-ups where dueAt <= current time (Asia/Kolkata parsed to UTC ms)
  const dueFollowUps = allFollowUps.filter((f) => {
    if (f.status !== 'Pending') return false;
    const dueMs = getFollowUpDueTimestamp(f.dueDate, f.dueTime);
    return dueMs <= nowMs;
  });

  const result: ProcessingResult = {
    processedCount: 0,
    processedIds: [],
    failures: [],
  };

  if (dueFollowUps.length > 0) {
    console.log(`[Follow-up Scheduler] Processing ${dueFollowUps.length} due follow-ups...`);
  }

  for (const followUp of dueFollowUps) {
    const singleRes = processSingleFollowUp(followUp.id);
    if (singleRes.success) {
      result.processedCount++;
      result.processedIds.push(followUp.id);
    } else {
      result.failures.push({ id: followUp.id, error: singleRes.error || 'Unknown error' });
    }
  }

  return result;
}

export interface SingleProcessResult {
  success: boolean;
  status: FollowUp['status'];
  error?: string;
  logs: FollowUpExecutionLog[];
}

export function processSingleFollowUp(id: string): SingleProcessResult {
  const data = serverStore.getData();
  const followUp = data.followUps.find((f) => f.id === id);
  if (!followUp) {
    return {
      success: false,
      status: 'Failed',
      error: `Follow-up record ${id} not found.`,
      logs: [],
    };
  }

  const logs: FollowUpExecutionLog[] = Array.isArray(followUp.executionLogs) ? [...followUp.executionLogs] : [];
  const nowIso = new Date().toISOString();
  const masked = maskPhone(followUp.customerPhone);
  const topic = followUp.actionConfig?.topic || followUp.title || 'Follow-up';

  console.log(`[Follow-up Scheduler] Follow-up ${followUp.id} (${followUp.customerName}, ${masked}) is now DUE.`);

  logs.push({
    timestamp: nowIso,
    level: 'info',
    message: `Follow-up is now Due. Generated message prepared for ${followUp.customerName} (${masked}).`,
  });

  // Create in-app notification for assigned staff member
  const notifId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const notification: AppNotification = {
    id: notifId,
    type: 'followup_due',
    title: `Follow-up Due (${topic}): ${followUp.customerName}`,
    message: `Assigned to: ${followUp.assignedTo}. Customer: ${followUp.customerName} (${masked}). Pre-filled message ready for WhatsApp.`,
    date: nowIso,
    read: false,
    linkRoute: 'follow-ups',
  };

  serverStore.addNotification(notification);

  // Transition status to 'Due'
  serverStore.updateFollowUpExecution(followUp.id, {
    status: 'Due',
    executionLogs: logs,
  });

  return {
    success: true,
    status: 'Due',
    logs,
  };
}

let schedulerTimer: NodeJS.Timeout | null = null;

export function startScheduler(intervalMs = 60000): void {
  if (schedulerTimer) return;
  console.log(`[Follow-up Scheduler] Initializing automatic scheduler loop (interval: ${intervalMs}ms)...`);
  
  processDueFollowUps();

  schedulerTimer = setInterval(() => {
    processDueFollowUps();
  }, intervalMs);
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('[Follow-up Scheduler] Scheduler stopped.');
  }
}

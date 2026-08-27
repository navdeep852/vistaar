import fs from 'fs';
import path from 'path';
import type { FollowUp, AppNotification } from '../src/types/index.ts';

export interface ServerDataStore {
  followUps: FollowUp[];
  notifications: AppNotification[];
  lastUpdated: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const initialStore: ServerDataStore = {
  followUps: [],
  notifications: [],
  lastUpdated: new Date().toISOString(),
};

function normalizeFollowUp(f: any): FollowUp {
  return {
    ...f,
    actionType: f.actionType || 'INTERNAL_REMINDER',
    actionConfig: f.actionConfig || {},
    attemptCount: typeof f.attemptCount === 'number' ? f.attemptCount : 0,
    maxAttempts: typeof f.maxAttempts === 'number' ? f.maxAttempts : 3,
    executionLogs: Array.isArray(f.executionLogs) ? f.executionLogs : [],
  };
}

export class ServerStoreManager {
  private data: ServerDataStore;

  constructor() {
    this.data = this.loadFromFile();
  }

  private ensureDirectoryExists() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadFromFile(): ServerDataStore {
    try {
      this.ensureDirectoryExists();
      if (fs.existsSync(DATA_FILE)) {
        const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent);
        const rawFollowUps = Array.isArray(parsed.followUps) ? parsed.followUps : [];
        return {
          followUps: rawFollowUps.map(normalizeFollowUp),
          notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
          lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        };
      }
    } catch (err) {
      console.error('[ServerStoreManager] Failed to load data from file:', err);
    }
    return { ...initialStore };
  }

  public saveToFile(): void {
    try {
      this.ensureDirectoryExists();
      this.data.lastUpdated = new Date().toISOString();
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ServerStoreManager] Failed to save data to file:', err);
    }
  }

  public getData(): ServerDataStore {
    return this.data;
  }

  public syncFromClient(clientFollowUps: FollowUp[], clientNotifications: AppNotification[]): ServerDataStore {
    let changed = false;

    if (Array.isArray(clientFollowUps)) {
      const map = new Map<string, FollowUp>();
      this.data.followUps.forEach((f) => map.set(f.id, normalizeFollowUp(f)));

      clientFollowUps.forEach((rawCf) => {
        const cf = normalizeFollowUp(rawCf);
        const existing = map.get(cf.id);
        if (!existing) {
          map.set(cf.id, cf);
          changed = true;
        } else {
          if ((existing.status === 'Completed' || existing.status === 'Due') && cf.status === 'Pending') {
            // Keep server status
          } else if (
            existing.status !== cf.status ||
            existing.title !== cf.title ||
            existing.notes !== cf.notes ||
            existing.actionType !== cf.actionType
          ) {
            map.set(cf.id, cf);
            changed = true;
          }
        }
      });

      if (changed) {
        this.data.followUps = Array.from(map.values());
      }
    }

    if (Array.isArray(clientNotifications)) {
      const notifMap = new Map<string, AppNotification>();
      this.data.notifications.forEach((n) => notifMap.set(n.id, n));
      clientNotifications.forEach((cn) => {
        if (!notifMap.has(cn.id)) {
          notifMap.set(cn.id, cn);
          changed = true;
        }
      });
      if (changed) {
        this.data.notifications = Array.from(notifMap.values());
      }
    }

    if (changed) {
      this.saveToFile();
    }
    return this.data;
  }

  public updateFollowUpStatus(id: string, status: FollowUp['status'], errorMessage?: string): void {
    const f = this.data.followUps.find((item) => item.id === id);
    if (f) {
      f.status = status;
      if (errorMessage !== undefined) {
        f.errorMessage = errorMessage;
      }
      this.saveToFile();
    }
  }

  public updateFollowUpExecution(id: string, updates: Partial<FollowUp>): void {
    const f = this.data.followUps.find((item) => item.id === id);
    if (f) {
      Object.assign(f, updates);
      this.saveToFile();
    }
  }

  public addNotification(notification: AppNotification): void {
    const exists = this.data.notifications.some((n) => n.id === notification.id);
    if (!exists) {
      this.data.notifications.unshift(notification);
      this.saveToFile();
    }
  }
}

export const serverStore = new ServerStoreManager();

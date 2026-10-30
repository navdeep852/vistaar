import { currentPlatform } from '../platform/platformDetection';
import { UserRole } from '../types';

export interface MinimalStoredSession {
  id: string;
  companyId: string;
  employeeId?: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  designation?: string;
  role: UserRole;
  status?: string;
  businessName?: string;
  mustChangePassword?: boolean;
  avatarUrl?: string;
  savedAt?: number;
}

const DESKTOP_SESSION_FILE = 'session.json';

/**
 * Checks whether the current runtime environment is a desktop application (Tauri / Electron).
 */
export function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as any;
  return Boolean(
    currentPlatform.isDesktop ||
    win.__TAURI__ ||
    win.__TAURI_INTERNALS__ ||
    win.process?.versions?.electron
  );
}

/**
 * Safely imports the Tauri plugin-fs module dynamically to avoid
 * bundle errors or crashes in web or mobile environments.
 */
async function getTauriFs() {
  if (!isDesktopRuntime()) return null;
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    return fs;
  } catch (err) {
    console.warn('[DesktopSessionService] Tauri plugin-fs not available in this environment:', err);
    return null;
  }
}

/**
 * Persists the minimal session payload to the native desktop AppData directory.
 */
export async function saveDesktopSession(session: MinimalStoredSession): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  try {
    const fs = await getTauriFs();
    if (!fs || !fs.writeTextFile || !fs.BaseDirectory) return false;

    const data = JSON.stringify({
      ...session,
      savedAt: session.savedAt || Date.now(),
    });

    try {
      if (fs.mkdir) {
        await fs.mkdir('', { baseDir: fs.BaseDirectory.AppData, recursive: true });
      }
    } catch {
      // Ignore if directory already exists
    }

    await fs.writeTextFile(DESKTOP_SESSION_FILE, data, {
      baseDir: fs.BaseDirectory.AppData,
    });
    return true;
  } catch (err) {
    console.warn('[DesktopSessionService] Failed to save desktop session:', err);
    return false;
  }
}

/**
 * Reads and restores the minimal session payload from the native desktop AppData directory.
 */
export async function loadDesktopSession(): Promise<MinimalStoredSession | null> {
  if (!isDesktopRuntime()) return null;
  try {
    const fs = await getTauriFs();
    if (!fs || !fs.readTextFile || !fs.BaseDirectory) return null;

    if (fs.exists) {
      const exists = await fs.exists(DESKTOP_SESSION_FILE, {
        baseDir: fs.BaseDirectory.AppData,
      });
      if (!exists) return null;
    }

    const content = await fs.readTextFile(DESKTOP_SESSION_FILE, {
      baseDir: fs.BaseDirectory.AppData,
    });

    if (!content || !content.trim()) return null;

    const parsed = JSON.parse(content) as MinimalStoredSession;
    if (parsed && parsed.id && (parsed.email || parsed.name)) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.warn('[DesktopSessionService] Notice: Could not read desktop session:', err);
    return null;
  }
}

/**
 * Clears the persistent desktop session file upon logout.
 */
export async function clearDesktopSession(): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  try {
    const fs = await getTauriFs();
    if (!fs || !fs.remove || !fs.BaseDirectory) return false;

    if (fs.exists) {
      const exists = await fs.exists(DESKTOP_SESSION_FILE, {
        baseDir: fs.BaseDirectory.AppData,
      });
      if (!exists) return true;
    }

    await fs.remove(DESKTOP_SESSION_FILE, {
      baseDir: fs.BaseDirectory.AppData,
    });
    return true;
  } catch (err) {
    console.warn('[DesktopSessionService] Notice: Failed to clear desktop session file:', err);
    return false;
  }
}


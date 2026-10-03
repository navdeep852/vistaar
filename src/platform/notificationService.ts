import { LocalNotificationOptions } from './types';
import { getPlatformInfo } from './platformDetection';
import { notificationService as supabaseNotificationService } from '../services/supabase/notificationService';

export interface PlatformNotificationService {
  requestPermission(): Promise<boolean>;
  scheduleLocalNotification(options: LocalNotificationOptions): Promise<boolean>;
}

class UniversalNotificationService implements PlatformNotificationService {
  public async requestPermission(): Promise<boolean> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    // 1. Desktop Native via Tauri 2 Notification Plugin
    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
        let granted = await isPermissionGranted();
        if (!granted) {
          const perm = await requestPermission();
          granted = perm === 'granted';
        }
        return granted;
      } catch (err) {
        console.warn('[NotificationService] Tauri notification permission request failed:', err);
      }
    }

    // 2. Mobile Native via Capacitor LocalNotifications Plugin
    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const res = await win.Capacitor.Plugins.LocalNotifications.requestPermissions();
        return res.display === 'granted';
      } catch (err) {
        console.warn('[NotificationService] Native notification permission request failed:', err);
      }
    }

    // 3. Web Notification Permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      } catch (e) {
        console.warn('[NotificationService] Web notification permission request failed:', e);
      }
    }

    return false;
  }

  public async scheduleLocalNotification(options: LocalNotificationOptions): Promise<boolean> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    // 1. Desktop Native via Tauri 2 Notification Plugin
    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
        let granted = await isPermissionGranted();
        if (!granted) {
          const perm = await requestPermission();
          granted = perm === 'granted';
        }
        if (granted) {
          sendNotification({
            title: options.title,
            body: options.body,
          });
          return true;
        }
      } catch (err) {
        console.warn('[NotificationService] Tauri sendNotification failed, falling back:', err);
      }
    }

    // 2. Mobile Native via Capacitor LocalNotifications Plugin
    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const notifId = options.id || Math.floor(Math.random() * 1000000);
        await win.Capacitor.Plugins.LocalNotifications.schedule({
          notifications: [
            {
              id: notifId,
              title: options.title,
              body: options.body,
              schedule: options.scheduleDate ? { at: options.scheduleDate } : undefined,
              extra: options.extra,
            },
          ],
        });
        return true;
      } catch (err) {
        console.warn('[NotificationService] Native local notification failed:', err);
      }
    }

    // 2. Web Notification fallback
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(options.title, {
          body: options.body,
          icon: '/Vistaar_Icon_logo.png',
        });
        return true;
      } catch (e) {}
    }

    // 3. Supabase In-App Notification Record fallback
    try {
      await supabaseNotificationService.createNotification({
        title: options.title,
        message: options.body,
      });
      return true;
    } catch (e) {
      return false;
    }
  }
}

export const platformNotificationService: PlatformNotificationService = new UniversalNotificationService();

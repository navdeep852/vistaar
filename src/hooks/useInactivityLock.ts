import { useState, useEffect, useRef, useCallback } from 'react';

export const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 300,000 ms (5 minutes)
export const SCREEN_LOCK_STORAGE_KEY = 'vistaar_screen_locked';
export const LAST_ACTIVITY_STORAGE_KEY = 'vistaar_last_activity_time';
export const BROADCAST_CHANNEL_NAME = 'vistaar_screen_lock_channel';

interface UseInactivityLockOptions {
  isAuthenticated: boolean;
  onLockTriggered?: () => void;
  onUnlockTriggered?: () => void;
}

export function useInactivityLock({
  isAuthenticated,
  onLockTriggered,
  onUnlockTriggered,
}: UseInactivityLockOptions) {
  // Initialize lock state from storage or elapsed inactivity
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (!isAuthenticated) return false;

    try {
      const persistedLock = localStorage.getItem(SCREEN_LOCK_STORAGE_KEY);
      if (persistedLock === 'true') {
        return true;
      }
      const lastActiveStr = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
      if (lastActiveStr) {
        const lastActive = parseInt(lastActiveStr, 10);
        if (!isNaN(lastActive) && Date.now() - lastActive >= INACTIVITY_TIMEOUT_MS) {
          localStorage.setItem(SCREEN_LOCK_STORAGE_KEY, 'true');
          return true;
        }
      }
    } catch {
      // Storage access failure fallback
    }
    return false;
  });

  const lastActivityRef = useRef<number>(Date.now());
  const isLockedRef = useRef<boolean>(isLocked);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const lastThrottleCallRef = useRef<number>(0);

  // Keep ref synchronized
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  // Lock session helper
  const lock = useCallback(() => {
    if (isLockedRef.current) return;
    isLockedRef.current = true;
    setIsLocked(true);

    try {
      localStorage.setItem(SCREEN_LOCK_STORAGE_KEY, 'true');
    } catch {}

    // Broadcast lock event to other tabs
    try {
      broadcastChannelRef.current?.postMessage({ type: 'LOCK', timestamp: Date.now() });
    } catch {}

    onLockTriggered?.();
  }, [onLockTriggered]);

  // Unlock session helper
  const unlock = useCallback(() => {
    isLockedRef.current = false;
    setIsLocked(false);
    const now = Date.now();
    lastActivityRef.current = now;

    try {
      localStorage.setItem(SCREEN_LOCK_STORAGE_KEY, 'false');
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
    } catch {}

    // Broadcast unlock event to other tabs
    try {
      broadcastChannelRef.current?.postMessage({ type: 'UNLOCK', timestamp: now });
    } catch {}

    onUnlockTriggered?.();
  }, [onUnlockTriggered]);

  // Reset inactivity timestamp (user activity recorded)
  const recordActivity = useCallback(() => {
    // If screen is already locked, activity on the lock overlay does NOT reset inactivity
    if (isLockedRef.current) return;

    const now = Date.now();
    // Throttle activity updates to once per 1,000ms
    if (now - lastThrottleCallRef.current < 1000) {
      return;
    }
    lastThrottleCallRef.current = now;
    lastActivityRef.current = now;

    try {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
    } catch {}

    // Notify other tabs that user is active
    try {
      broadcastChannelRef.current?.postMessage({ type: 'ACTIVITY', timestamp: now });
    } catch {}
  }, []);

  // Periodic elapsed time check (immune to timer suspension / background throttling)
  const checkInactivityElapsed = useCallback(() => {
    if (isLockedRef.current || !isAuthenticated) return;

    let lastActive = lastActivityRef.current;
    try {
      const stored = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > lastActive) {
          lastActive = parsed;
          lastActivityRef.current = parsed;
        }
      }
    } catch {}

    const elapsed = Date.now() - lastActive;
    if (elapsed >= INACTIVITY_TIMEOUT_MS) {
      lock();
    }
  }, [isAuthenticated, lock]);

  // Set up BroadcastChannel and cross-tab storage listener
  useEffect(() => {
    if (!isAuthenticated) return;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        broadcastChannelRef.current = channel;

        channel.onmessage = (event) => {
          if (!event?.data) return;
          const { type, timestamp } = event.data;

          if (type === 'LOCK') {
            if (!isLockedRef.current) {
              isLockedRef.current = true;
              setIsLocked(true);
            }
          } else if (type === 'UNLOCK') {
            if (isLockedRef.current) {
              isLockedRef.current = false;
              setIsLocked(false);
              lastActivityRef.current = timestamp || Date.now();
            }
          } else if (type === 'ACTIVITY') {
            if (timestamp && timestamp > lastActivityRef.current) {
              lastActivityRef.current = timestamp;
            }
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel initialization note:', err);
      }
    }

    // Storage event listener fallback (for browsers or tabs without BroadcastChannel)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SCREEN_LOCK_STORAGE_KEY) {
        if (e.newValue === 'true' && !isLockedRef.current) {
          isLockedRef.current = true;
          setIsLocked(true);
        } else if (e.newValue === 'false' && isLockedRef.current) {
          isLockedRef.current = false;
          setIsLocked(false);
          lastActivityRef.current = Date.now();
        }
      } else if (e.key === LAST_ACTIVITY_STORAGE_KEY && e.newValue) {
        const parsed = parseInt(e.newValue, 10);
        if (!isNaN(parsed) && parsed > lastActivityRef.current) {
          lastActivityRef.current = parsed;
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.close();
        } catch {}
        broadcastChannelRef.current = null;
      }
    };
  }, [isAuthenticated]);

  // Set up user activity listeners and elapsed inactivity checking
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLocked(false);
      isLockedRef.current = false;
      return;
    }

    // Initialize lastActivity timestamp
    const now = Date.now();
    try {
      const stored = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) {
          lastActivityRef.current = parsed;
        } else {
          lastActivityRef.current = now;
          localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
        }
      } else {
        lastActivityRef.current = now;
        localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
      }
    } catch {
      lastActivityRef.current = now;
    }

    // Events that signify human activity
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'touchstart',
      'touchmove',
      'scroll',
      'pointerdown',
      'pointermove',
      'click',
    ];

    const handleUserActivity = () => {
      recordActivity();
    };

    // Attach passive listeners to window
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleUserActivity, { passive: true });
    });

    // Check elapsed inactivity when window gains focus or tab becomes visible
    const handleVisibilityOrFocusChange = () => {
      if (document.visibilityState === 'visible') {
        checkInactivityElapsed();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocusChange);
    window.addEventListener('focus', handleVisibilityOrFocusChange);
    window.addEventListener('vistaar:app_resumed', handleVisibilityOrFocusChange);

    // Periodic heartbeat check every 5 seconds (5000ms)
    const intervalTimer = setInterval(() => {
      checkInactivityElapsed();
    }, 5000);

    // Run immediate elapsed check on mount
    checkInactivityElapsed();

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleUserActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityOrFocusChange);
      window.removeEventListener('focus', handleVisibilityOrFocusChange);
      window.removeEventListener('vistaar:app_resumed', handleVisibilityOrFocusChange);
      clearInterval(intervalTimer);
    };
  }, [isAuthenticated, recordActivity, checkInactivityElapsed]);

  return {
    isLocked,
    lock,
    unlock,
    recordActivity,
    checkInactivityElapsed,
  };
}

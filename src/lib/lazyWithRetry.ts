import React from 'react';

/**
 * Storage key to track chunk reload attempts within a session.
 * Protects against infinite refresh loops.
 */
const CHUNK_RELOAD_KEY = 'vistaar_chunk_reload_attempted';
const CHUNK_RELOAD_COOLDOWN_MS = 20000; // 20 seconds cooldown window

/**
 * Robust cross-browser detection for dynamic import & chunk loading failures.
 * Covers Chrome, Edge, Safari, WebKit, Firefox, iOS, Android, and Vite CSS preload failures.
 */
export function isChunkLoadError(error: any): boolean {
  if (!error) return false;
  const msg = (
    typeof error === 'string'
      ? error
      : (error.message || error.name || String(error))
  ).toLowerCase();

  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('unable to preload css') ||
    msg.includes('failed to load module script') ||
    msg.includes('chunkloaderror') ||
    msg.includes('loading chunk') ||
    msg.includes('dynamically imported module') ||
    msg.includes('error resolving module specifier')
  );
}

/**
 * Controlled recovery handler for stale/missing dynamic chunks after new deployments.
 * Triggers a single page reload per deployment/cooldown without clearing user session.
 * Returns true if a reload was initiated, false if prevented by cooldown.
 */
export function handleChunkLoadFailure(error: any): boolean {
  if (!isChunkLoadError(error)) {
    return false;
  }

  if (typeof window === 'undefined') return false;

  try {
    const lastReload = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const now = Date.now();

    if (lastReload) {
      const timeSince = now - Number(lastReload);
      if (timeSince < CHUNK_RELOAD_COOLDOWN_MS) {
        console.warn(
          '[VISTAAR] Chunk reload cooldown active (reloaded ' +
            Math.round(timeSince / 1000) +
            's ago). Skipping auto-reload to prevent loop.',
          error
        );
        return false;
      }
    }

    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    console.warn(
      '[VISTAAR] Deployment update detected: dynamic chunk missing. Reloading application to fetch latest deployment...',
      error
    );

    // Perform full page reload to fetch current deployment index.html
    window.location.reload();
    return true;
  } catch (e) {
    console.error('[VISTAAR] Failed to manage chunk reload in sessionStorage:', e);
    return false;
  }
}

/**
 * Clears the chunk reload attempt record so manual retries or user clicks can reload immediately.
 */
export function clearChunkReloadRecord(): void {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {}
  }
}

/**
 * Production-safe React.lazy wrapper with automatic chunk recovery.
 * If a dynamically imported module fails due to a deployment hash change:
 * 1. Detects the missing/stale chunk error.
 * 2. Triggers a controlled reload to get the new deployment index.html.
 * 3. Returns a pending promise so React remains in Suspense and avoids flashing an error screen.
 * 4. If already reloaded within cooldown, throws error to ErrorBoundary.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  moduleName?: string
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    factory().catch((error) => {
      if (isChunkLoadError(error)) {
        console.warn(
          `[VISTAAR] Failed to load lazy module ${moduleName || 'unknown'}:`,
          error
        );
        const didReload = handleChunkLoadFailure(error);
        if (didReload) {
          // Return a hanging promise while browser reloads to prevent React error screen flash
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw error;
    })
  );
}

// Global listener for Vite's native preload error event
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event: any) => {
    console.warn('[VISTAAR] Native vite:preloadError event received:', event);
    handleChunkLoadFailure(event?.payload || event);
  });
}

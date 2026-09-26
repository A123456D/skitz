// PWA offline support — registers the game-shell service worker (public/sw.js).
// Guarded defensively: real SW support, a secure context (https or localhost),
// and never the Vite dev port (strictPort 5185 per vite.config.ts) so raw dev
// output never poisons the offline cache.
export function registerOffline(): void {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (typeof window === 'undefined' || !window.isSecureContext) return;
    if (window.location.port === '5185') return;
    // relative: the build deploys under the hub's /games/orbital/ subpath, and
    // an absolute path would hijack the whole domain's root SW scope
    void navigator.serviceWorker.register('sw.js').catch(() => undefined);
  } catch {
    // SW unavailable or blocked — online play is unaffected
  }
}

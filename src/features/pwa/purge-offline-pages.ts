// The logout's word to the service worker (src/features/auth/logout-storage.ts): forget every
// page and picture kept for offline use. Its own module, with its one constant (the worker's source reads it
// from here: sw-offline.ts), so the pages that can log out carry nothing more.

/** The message a page posts to the worker. */
export const PURGE_PAGES_MESSAGE = 'ff:purge-pages'

/**
 * Tells the service worker to forget every page and picture it keeps for offline use (on
 * logout). The pictures include the visitor's avatar (through `/_next/image`). The pages are
 * anonymous copies (no cookie, no session: offline-rules.ts), so none holds the visitor's data;
 * forgotten all the same, then kept again as such by the worker. Nothing without a worker.
 */
export function purgeOfflinePages(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: PURGE_PAGES_MESSAGE })
  } catch {
    // No worker to tell.
  }
}

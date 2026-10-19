// The service worker's message to the pages (`/sw.js`). A pure string, so a page's bundle never
// carries the worker's source to read it. (The logout's message to the worker:
// purge-offline-pages.ts.)

/** The worker tells the pages after a notification click: the inbox reads itself again. */
export const REFRESH_MESSAGE = 'ff:notifications-refresh'

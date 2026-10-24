// The offline page's words (src/app/offline/page.tsx), and the plain page the service worker
// shows in its place when it could not keep it (sw-offline.ts). Pure.

export const OFFLINE_TITLE = 'اتصال اینترنت برقرار نیست'
export const OFFLINE_MESSAGE = 'اتصال اینترنت دستگاه را بررسی کنید و دوباره امتحان کنید.'
export const OFFLINE_RETRY = 'تلاش دوباره'

/**
 * A whole page, without the app's styles or scripts: the worker serves it as it is, in place of
 * the offline page it kept when it has none, and always at an address that holds the visitor's own
 * pages or a credential (sw-offline-fetch.ts). So it runs no script at all and loads nothing:
 * «تلاش دوباره» is a link to the address itself (`href=""`), which asks for it again.
 */
export const OFFLINE_FALLBACK_HTML = [
  '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  `<meta name="robots" content="noindex"><title>${OFFLINE_TITLE}</title></head>`,
  '<body style="margin:0;padding:4rem 1rem;font:16px/1.8 system-ui,sans-serif;text-align:center;color:#0f172a;background:#fff">',
  `<h1 style="font-size:1.25rem">${OFFLINE_TITLE}</h1><p>${OFFLINE_MESSAGE}</p>`,
  '<a href="" style="display:inline-block;min-height:44px;line-height:44px;padding:0 1.5rem;border:1px solid #94a3b8;border-radius:.5rem;color:#0f172a;text-decoration:none">',
  `${OFFLINE_RETRY}</a></body></html>`,
].join('')

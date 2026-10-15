const HOME_LINK = 'بازگشت به صفحه\u{0654} اصلی'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char)
}

// Self-contained: no fonts, scripts or images, so the page renders even when the app cannot.
const STYLE = [
  '*{box-sizing:border-box}',
  'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;',
  'padding:24px;background:#fff;color:#1f2937;font:16px/1.8 system-ui,-apple-system,',
  '"Segoe UI",Tahoma,Arial,sans-serif}',
  'main{max-width:32rem;text-align:center}',
  'h1{margin:0 0 12px;font-size:1.5rem;line-height:1.5}',
  'p{margin:0 0 24px;color:#4b5563}',
  'a{display:inline-flex;align-items:center;min-height:44px;padding:8px 20px;border-radius:8px;',
  'background:#1f2937;color:#fff;text-decoration:none}',
  'a:focus-visible{outline:3px solid #2563eb;outline-offset:3px}',
].join('')

/**
 * A small Persian (RTL) HTML page that carries a real HTTP status, for answers the app itself
 * cannot render: 410 for a gone redirect rule, 404/410/503 for short links. Never cached.
 */
export function statusPage(status: number, title: string, message: string): Response {
  const safeTitle = escapeHtml(title)
  const html =
    '<!doctype html>' +
    '<html lang="fa" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex">' +
    `<title>${safeTitle}</title><style>${STYLE}</style></head>` +
    `<body><main><h1>${safeTitle}</h1><p>${escapeHtml(message)}</p>` +
    `<a href="/">${HOME_LINK}</a></main></body></html>`
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

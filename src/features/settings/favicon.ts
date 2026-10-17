import 'server-only'

// The shop's favicon for `/favicon.ico` (src/app/favicon.ico/route.ts): browsers ask for it on
// their own when a page's icon fails to load, and a 404 there is noise in every console.

export interface Icon {
  bytes: Uint8Array<ArrayBuffer>
  type: string
}

/** A favicon changes rarely; `revalidateTag('settings')` picks up a new one at once. */
export const FAVICON_REVALIDATE_SECONDS = 86_400
const TIMEOUT_MS = 3_000
const MAX_BYTES = 100 * 1024
/** The only paths the API serves files from. */
const MEDIA_PATH = /^\/(?:media|static)\//

/**
 * 32×32 PNG: a slate rounded square with a white shopping bag, no brand colour (any shop). Served
 * when the configured favicon is missing or cannot be read.
 */
const DEFAULT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAbklEQVR42u3Xyw3AIAwD0GzXCToE+w9Ab70AkepAPqot5cTB74hFlFx36ztOvmRXKYQ5Xa4ivMqnCO/yAfFvQFT5iygJWMUFMCu0IMRabkVAAPQdBqAhgAACCCCgBoB/whSA8GGSYpqlGKcR8/wByjLtWTUAWOwAAAAASUVORK5CYII='

export function defaultFavicon(): Icon {
  return { bytes: new Uint8Array(Buffer.from(DEFAULT_PNG, 'base64')), type: 'image/png' }
}

/**
 * The favicon's file on the API host itself: its path (under `/media/` or `/static/`) and query
 * on `apiUrl`, whatever host the settings' absolute URL names (the API builds it from the Host it
 * was asked on). Null for anything else.
 */
function sourceUrl(favicon: string, apiUrl: string): string | null {
  let url: URL
  try {
    url = new URL(favicon, apiUrl)
  } catch {
    return null
  }
  return MEDIA_PATH.test(url.pathname) ? `${apiUrl}${url.pathname}${url.search}` : null
}

/**
 * A raster image only: an SVG served from the shop's own origin could run script when opened as
 * a page.
 */
function isRaster(type: string | null): type is string {
  return type !== null && type.startsWith('image/') && !type.startsWith('image/svg')
}

/** The body, or null as soon as it passes `MAX_BYTES`. */
async function readCapped(res: Response): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!res.body) return null
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * The configured favicon (`settings.favicon`), or null when there is none, or it does not answer
 * 2xx within 3 s, is not a raster image, or is over 100 KB. Never throws.
 */
export async function loadFavicon(
  favicon: string | null | undefined,
  apiUrl: string,
): Promise<Icon | null> {
  const url = favicon ? sourceUrl(favicon, apiUrl) : null
  if (url === null) return null
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: FAVICON_REVALIDATE_SECONDS, tags: ['settings'] },
    })
    const type = res.headers.get('content-type')
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (!res.ok || !isRaster(type) || declared > MAX_BYTES) return null
    const bytes = await readCapped(res)
    return bytes && bytes.byteLength > 0 ? { bytes, type } : null
  } catch {
    return null
  }
}

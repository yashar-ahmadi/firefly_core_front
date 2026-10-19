import 'server-only'

// Reading an image the settings name (the favicon, the logo) from the API host, for the routes
// that serve the shop's icons (`/favicon.ico`, `/icons/<size>/`). The settings' URL is the
// operator's: only its `/media/` or `/static/` path is read, always on the configured API host
// (never a host the URL names: no request to anywhere else), without following redirects, within
// a timeout and a byte cap, a raster image only. Read with `cache: 'no-store'`: Next's patched
// fetch would buffer the whole body for its Data Cache before the cap could stop it.

export interface ApiImage {
  bytes: Uint8Array<ArrayBuffer>
  type: string
}

export interface ReadLimits {
  maxBytes: number
  timeoutMs: number
}

/** The only paths the API serves files from. */
const MEDIA_PATH = /^\/(?:media|static)\//

/**
 * The file on the API host itself: the settings URL's path (under `/media/` or `/static/`) and
 * query on `apiUrl`, whatever host it names (the API builds it from the Host it was asked on).
 * Null for anything else.
 */
export function apiFileUrl(fileUrl: string, apiUrl: string): string | null {
  let url: URL
  try {
    url = new URL(fileUrl, apiUrl)
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

/** The body, or null as soon as it passes `maxBytes`. */
async function readCapped(
  res: Response,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!res.body) return null
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
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
 * The raster image at `url` (an `apiFileUrl`), or null when it does not answer 2xx within the
 * timeout, is not a raster image, is empty or is over the cap. Never throws.
 */
export async function readApiImage(url: string, limits: ReadLimits): Promise<ApiImage | null> {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(limits.timeoutMs),
      cache: 'no-store',
    })
    const type = res.headers.get('content-type')
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (!res.ok || !isRaster(type) || declared > limits.maxBytes) {
      await res.body?.cancel().catch(() => undefined)
      return null
    }
    const bytes = await readCapped(res, limits.maxBytes)
    return bytes && bytes.byteLength > 0 ? { bytes, type } : null
  } catch {
    return null
  }
}

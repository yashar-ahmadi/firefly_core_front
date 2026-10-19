// A linker video's embed (content digest §8): Aparat and YouTube only, at each provider's own
// embed address. Pure.

/** Aparat's video hash (`/v/<hash>`, maybe followed by a title slug). */
const APARAT_PATH = /^\/v\/([A-Za-z0-9]+)(?:\/.*)?$/
/** A YouTube video id. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

const APARAT_HOSTS = new Set(['aparat.com', 'www.aparat.com'])
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])

function parse(value: string): URL | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

/**
 * The embed URL for a video link, or null (the link then shows as a button):
 * - Aparat `aparat.com/v/<hash>` → `https://www.aparat.com/video/video/embed/videohash/<hash>/vt/frame`
 *   (the iframe Aparat's own embed code builds);
 * - YouTube `youtube.com/watch?v=<id>` (www, m) and `youtu.be/<id>` → `https://www.youtube.com/embed/<id>`.
 * Hosts are matched exactly (no look-alike), the id by its shape; always https.
 */
export function videoEmbedUrl(value: string): string | null {
  const url = parse(value)
  if (url === null) return null
  const host = url.hostname.toLowerCase()
  if (APARAT_HOSTS.has(host)) {
    const hash = APARAT_PATH.exec(url.pathname)?.[1]
    return hash ? `https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame` : null
  }
  let id: string | null = null
  if (YOUTUBE_HOSTS.has(host) && url.pathname === '/watch') id = url.searchParams.get('v')
  else if (host === 'youtu.be') id = url.pathname.replace(/^\/|\/$/g, '')
  return id && YOUTUBE_ID.test(id) ? `https://www.youtube.com/embed/${id}` : null
}

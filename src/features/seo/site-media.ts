// A picture's URL on the shop's own origin. Pure.

const MEDIA_PATH = /^\/(?:media|static)\//

/**
 * An http(s) URL of a file under `/media/` or `/static/` (the API's pictures) moved onto
 * `siteUrl`'s origin, as the structured data has them: the shop serves both there (the proxy
 * forwards them to the API, or the single-origin nginx serves them: docs/DEPLOYMENT.md). Anything
 * else as it is.
 */
export function mediaOnSite(url: string | null, siteUrl: string): string | null {
  if (url === null) return null
  try {
    const parsed = new URL(url)
    if (!/^https?:$/.test(parsed.protocol) || !MEDIA_PATH.test(parsed.pathname)) return url
    return `${new URL(siteUrl).origin}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

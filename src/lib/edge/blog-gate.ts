// How the proxy tells a blog page that the blog is switched off (src/proxy.ts sets it, the blog
// pages read it: src/features/blog/availability.ts). Pure.

/** Set by the proxy on a blog page's request while the switch is off; never the visitor's own. */
export const BLOG_OFF_HEADER = 'x-ff-blog-off'

/** What the blog's pages show while the switch is off: the operator's reason, if one was given. */
export interface BlogOff {
  reason: string | null
}

/** `/blog/`, the archive, its category pages and its posts. */
export function isBlogPath(pathname: string): boolean {
  return /^\/blog(?:\/|$)/.test(pathname)
}

/** The header's value: the reason percent-encoded (headers carry ASCII only), "" for none. */
export function blogOffHeaderValue(off: BlogOff): string {
  return off.reason ? encodeURIComponent(off.reason) : ''
}

/** The proxy's verdict from a request's headers, or null while the blog is on (no header). */
export function readBlogOff(headers: Pick<Headers, 'get'>): BlogOff | null {
  const value = headers.get(BLOG_OFF_HEADER)
  if (value === null) return null
  let reason: string
  try {
    reason = decodeURIComponent(value).trim()
  } catch {
    reason = ''
  }
  return { reason: reason === '' ? null : reason }
}

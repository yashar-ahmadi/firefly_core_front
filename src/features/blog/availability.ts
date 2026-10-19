import 'server-only'
import { headers } from 'next/headers'
import { BlogUnavailableError } from '@/features/blog/blog-errors'
import { readBlogOff, type BlogOff } from '@/lib/edge/blog-gate'
import { noteBlogOff } from '@/lib/edge/blog-switch'

export type { BlogOff } from '@/lib/edge/blog-gate'

/** A blog page's data, or the blog's switch turned off (with the operator's reason). */
export type BlogLoad<T> = { off: BlogOff; data?: undefined } | { off: null; data: T }

/**
 * Loads a blog page's data unless the blog is switched off (Review Focus #1). Two sources say so:
 *
 * - the proxy (`x-ff-blog-off`, never the visitor's own): it read the switch, and the response
 *   already carries HTTP 503 (src/proxy.ts; a page cannot set that status itself);
 * - the API refusing a read (`BlogUnavailableError`) while the proxy still knew the switch as
 *   on (it reads it at most once a minute): the page shows the same, and `noteBlogOff` tells the
 *   proxy, so the next request answers 503 at once.
 *
 * `load`'s other failures are thrown (the error boundary, or `notFound()` handled by the caller).
 */
export async function loadBlog<T>(load: () => Promise<T>): Promise<BlogLoad<T>> {
  const proxied = readBlogOff(await headers())
  if (proxied) return { off: proxied }
  try {
    return { off: null, data: await load() }
  } catch (error) {
    if (!(error instanceof BlogUnavailableError)) throw error
    const off = { reason: error.reason }
    noteBlogOff(off)
    return { off }
  }
}

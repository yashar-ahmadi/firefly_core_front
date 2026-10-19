import 'server-only'
import { getStoreConfig } from '@/config/store-config'
import { sanitizeOperatorHtml, type SanitizeOptions } from '@/lib/html/sanitize'
import { htmlToText } from '@/lib/html/to-text'

/**
 * Operator HTML made safe to render (`sanitizeOperatorHtml`: `/media` made absolute, links
 * leaving the shop opened in a new tab), or null when nothing visible is left: only `&nbsp;`,
 * only a script. Server only. For callers that must know before rendering a frame around it.
 *
 * Apart from RichContent (rich-content.tsx, which re-exports it) on purpose: that module imports
 * the client RichContentBody, and Turbopack puts every client component a page's server modules
 * import into that page's chunks. A page that only sanitises (the checkout's sentences, a message
 * slot) imports this one and ships no RichContentBody.
 */
export function richContentHtml(
  html: string,
  options: Pick<SanitizeOptions, 'linksInNewTab' | 'headingIds' | 'wideImages'> = {},
): string | null {
  const config = getStoreConfig()
  const clean = sanitizeOperatorHtml(html, config.apiUrl, { ...options, siteUrl: config.siteUrl })
  return htmlToText(clean) !== '' || clean.includes('<img') ? clean : null
}

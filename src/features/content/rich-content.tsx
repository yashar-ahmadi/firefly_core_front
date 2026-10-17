import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { sanitizeOperatorHtml, type SanitizeOptions } from '@/lib/html/sanitize'
import { htmlToText } from '@/lib/html/to-text'
import { RichContentBody } from './rich-content-body'

export interface RichContentProps {
  /** HTML written in the Firefly admin (homepage rich text, pages, descriptions). */
  html: string
  className?: string
}

/**
 * Operator HTML made safe to render (`sanitizeOperatorHtml`: `/media` made absolute, links
 * leaving the shop opened in a new tab), or null when nothing visible is left: only `&nbsp;`,
 * only a script. Server only. For callers that must know before rendering a frame around it.
 */
export function richContentHtml(
  html: string,
  options: Pick<SanitizeOptions, 'linksInNewTab'> = {},
): string | null {
  const config = getStoreConfig()
  const clean = sanitizeOperatorHtml(html, config.apiUrl, { ...options, siteUrl: config.siteUrl })
  return htmlToText(clean) !== '' || clean.includes('<img') ? clean : null
}

/**
 * Operator HTML, sanitised on the server and typeset by `.rich-content`; its storefront links
 * route on the client (RichContentBody). Renders nothing when nothing visible is left.
 */
export function RichContent({ html, className }: RichContentProps) {
  const clean = richContentHtml(html)
  if (clean === null) return null
  return <RichContentBody html={clean} className={cn('rich-content', className)} />
}

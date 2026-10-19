import { cn } from '@/components/ui/cn'
import { RichContentBody } from './rich-content-body'
import { richContentHtml } from './rich-content-html'

export { richContentHtml }

export interface RichContentProps {
  /** HTML written in the Firefly admin (homepage rich text, pages, descriptions). */
  html: string
  className?: string
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

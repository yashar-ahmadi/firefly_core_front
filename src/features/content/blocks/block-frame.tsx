import type { ReactNode } from 'react'
import { SectionHeader } from '@/components/layout/section-header'
import { cn } from '@/components/ui/cn'
import type { DisplayStyle } from '@/features/display/display-style'
import type { PageBlock } from '@/lib/api/types/page'
import { blockHeadingId, text } from './blocks'

export interface BlockFrameProps {
  block: PageBlock
  style: DisplayStyle
  /** The block's «مشاهدهٔ همه» (`slider`, `banners`, `cards`); null for none. */
  link?: { href: string; label: string } | null
  /** `div` when the body is itself a named region (a carousel). */
  as?: 'section' | 'div'
  /** The header's alignment: `center` for a statement-like style. */
  align?: 'start' | 'center'
  /** Leaves the header out: the body draws its own title (a call to action, a side heading). */
  bare?: boolean
  className?: string
  children: ReactNode
}

/**
 * A page block (content digest §2): the shop's section header from the block's title, subtitle
 * and link ("" or null: left out), then its body, in a size container (`@container`), so the
 * body's columns follow the page's column, not the screen. Marked with its type and style.
 */
export function BlockFrame({
  block,
  style,
  link = null,
  as = 'section',
  align = 'start',
  bare = false,
  className,
  children,
}: BlockFrameProps) {
  const id = blockHeadingId(block)
  const title = text(block.title)
  const Tag = as
  return (
    <Tag
      aria-labelledby={as === 'section' && title ? id : undefined}
      data-block={block.type}
      data-style={style}
      className={cn('@container min-w-0', className)}
    >
      {!bare && (
        <SectionHeader
          id={id}
          title={title}
          subtitle={text(block.subtitle)}
          link={link}
          align={align}
        />
      )}
      {children}
    </Tag>
  )
}

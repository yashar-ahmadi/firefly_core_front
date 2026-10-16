import type { ReactNode } from 'react'
import { SectionHeader } from '@/components/layout/section-header'
import { seeAllHref } from '@/features/home/see-all'
import type { HomeSection } from '@/lib/api/types/catalog'

export interface SectionShellProps {
  section: HomeSection
  /** The label of an operator link without a title, and of the automatic product link. */
  seeAllLabel: string
  /**
   * `div` when the body is a carousel, which is itself the region named after the section; a
   * `section` would announce the same name twice.
   */
  as?: 'section' | 'div'
  children: ReactNode
}

/**
 * A homepage section: the shared header from the section's envelope (content.md §6.1: "" means
 * not shown), then the body. The page spaces sections evenly.
 */
export function SectionShell({
  section,
  seeAllLabel,
  as = 'section',
  children,
}: SectionShellProps) {
  const title = section.title.trim()
  const href = seeAllHref(section)
  const label = (href === section.link?.url.trim() && section.link?.title.trim()) || seeAllLabel
  const id = `home-section-${section.id}`
  const Tag = as
  return (
    <Tag aria-labelledby={as === 'section' && title ? id : undefined} className="min-w-0">
      <SectionHeader
        id={id}
        title={title}
        subtitle={section.subtitle.trim()}
        link={href ? { href, label } : null}
      />
      {children}
    </Tag>
  )
}

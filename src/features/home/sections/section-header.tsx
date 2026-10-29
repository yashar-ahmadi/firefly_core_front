import type { ReactNode } from 'react'
import { SectionHeader } from '@/components/layout/section-header'
import { displayStyle } from '@/features/display/display-style'
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
  /** The header's alignment (`SectionHeader`): `center` for a statement-like style. */
  align?: 'start' | 'center'
  children: ReactNode
}

/** The id of a section's heading (`aria-labelledby`). */
export function homeSectionId(section: Pick<HomeSection, 'id'>): string {
  return `home-section-${section.id}`
}

/** The see-all link of a section: its href and label, or null (`seeAllHref`). */
export function sectionLink(section: HomeSection, seeAllLabel: string) {
  const href = seeAllHref(section)
  if (!href) return null
  const label = (href === section.link?.url.trim() && section.link?.title.trim()) || seeAllLabel
  return { href, label }
}

/**
 * A homepage section: the shared header from the section's envelope (content.md §6.1: "" means
 * not shown), then the body, marked with its style (`data-style`). The page spaces sections
 * evenly.
 */
export function SectionShell({
  section,
  seeAllLabel,
  as = 'section',
  align = 'start',
  children,
}: SectionShellProps) {
  const title = section.title.trim()
  const id = homeSectionId(section)
  const Tag = as
  return (
    <Tag
      aria-labelledby={as === 'section' && title ? id : undefined}
      data-style={displayStyle(section.style)}
      className="min-w-0"
    >
      <SectionHeader
        id={id}
        title={title}
        subtitle={section.subtitle.trim()}
        link={sectionLink(section, seeAllLabel)}
        align={align}
      />
      {children}
    </Tag>
  )
}

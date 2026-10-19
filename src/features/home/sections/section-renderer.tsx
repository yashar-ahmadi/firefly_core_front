import { Fragment, type ReactNode } from 'react'
import { getProductSettings } from '@/features/catalog/api'
import { hasImage } from '@/features/home/promo-tile'
import { getTranslations } from '@/features/settings/api'
import type { HomeSection } from '@/lib/api/types/catalog'
import { createTranslator } from '@/lib/i18n/translator'
import { BannerGroupSection } from './banner-group-section'
import { CategoryGridSection } from './category-grid-section'
import { PostCarouselSection } from './post-carousel-section'
import { ProductCarouselSection } from './product-carousel-section'
import { RichTextSection } from './rich-text-section'
import { SliderSection } from './slider-section'

interface SectionContext {
  /** This section holds the page's LCP image. */
  priority: boolean
  showOutOfStockLabel: boolean
  seeAllLabel: string
}

/** The first slider or banner group with a picture: its first picture is the LCP image. */
function firstImageSection(sections: HomeSection[]): number {
  return sections.findIndex(
    (section) =>
      (section.type === 'slider' || section.type === 'banner_group') &&
      Array.isArray(section.items) &&
      section.items.some(hasImage),
  )
}

function Section({ section, ...context }: { section: HomeSection } & SectionContext) {
  const { priority, showOutOfStockLabel, seeAllLabel } = context
  switch (section.type) {
    case 'slider':
      return <SliderSection section={section} priority={priority} seeAllLabel={seeAllLabel} />
    case 'banner_group':
      return <BannerGroupSection section={section} priority={priority} seeAllLabel={seeAllLabel} />
    case 'product_carousel':
      return (
        <ProductCarouselSection
          section={section}
          showOutOfStockLabel={showOutOfStockLabel}
          seeAllLabel={seeAllLabel}
        />
      )
    case 'category_grid':
      return <CategoryGridSection section={section} seeAllLabel={seeAllLabel} />
    case 'post_carousel':
      return <PostCarouselSection section={section} seeAllLabel={seeAllLabel} />
    case 'rich_text':
      return <RichTextSection section={section} seeAllLabel={seeAllLabel} />
    default:
      // A type added to the backend after this storefront: skipped.
      return null
  }
}

/**
 * The homepage sections in the operator's order (content.md §6). Unknown types, and sections
 * left with nothing to show, render nothing. Only the first picture of the first slider or
 * banner group loads eagerly with high priority (the LCP rule), even after a rich text.
 */
export async function SectionRenderer({
  sections,
  notice,
}: {
  sections: HomeSection[]
  /** Placed after the first section (the operator's `home` message slot), or first with none. */
  notice?: ReactNode
}) {
  const [settings, translations] = await Promise.all([getProductSettings(), getTranslations()])
  const seeAllLabel = createTranslator(translations)('see_all')
  const lcp = firstImageSection(sections)
  const rendered = sections.map((section, index) => (
    <Section
      key={section.id}
      section={section}
      priority={index === lcp}
      showOutOfStockLabel={settings.show_out_of_stock_label}
      seeAllLabel={seeAllLabel}
    />
  ))
  if (notice) rendered.splice(1, 0, <Fragment key="notice">{notice}</Fragment>)
  return rendered
}

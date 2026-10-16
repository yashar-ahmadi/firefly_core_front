import { cn } from '@/components/ui/cn'
import { hasImage, PromoTile } from '@/features/home/promo-tile'
import type { HomeSection } from '@/lib/api/types/catalog'
import { SectionShell } from './section-header'

type Layout = '1' | '2' | '3' | '4' | 'many'

/**
 * content.md §6.4: phones stack the banners; from md, 1 is full width, 2 sit side by side, 3 in
 * three columns, 4 in a 2×2 grid and 5 or more in three columns that wrap.
 */
const GRID = cn(
  'grid grid-cols-1 gap-3 sm:gap-4',
  'md:grid-cols-2 md:data-[count=1]:grid-cols-1 md:data-[count=3]:grid-cols-3 md:data-[count=many]:grid-cols-3',
)

/**
 * 2:1 frames (a lone banner is 4:1 from md). Pictures are fitted whole, never cropped, since a
 * banner's text is often part of its picture; one of another ratio is centred on a neutral band.
 */
const FRAME: Record<'single' | 'multi', string> = {
  single: 'aspect-[2/1] bg-ink-100 md:aspect-[4/1]',
  multi: 'aspect-[2/1] bg-ink-100',
}

const SIZES: Record<'1' | '2' | '3', string> = {
  '1': '(min-width: 1440px) 1392px, (min-width: 1024px) calc(100vw - 3rem), calc(100vw - 2rem)',
  '2': '(min-width: 1440px) 688px, (min-width: 768px) 50vw, calc(100vw - 2rem)',
  '3': '(min-width: 1440px) 456px, (min-width: 768px) 33vw, calc(100vw - 2rem)',
}

function layoutOf(count: number): Layout {
  return count > 4 ? 'many' : (String(count) as Layout)
}

function columnsOf(layout: Layout): '1' | '2' | '3' {
  if (layout === '1') return '1'
  return layout === '2' || layout === '4' ? '2' : '3'
}

export interface BannerGroupSectionProps {
  section: Extract<HomeSection, { type: 'banner_group' }>
  /** The page's first image section: its first banner is the LCP image. */
  priority: boolean
  seeAllLabel: string
}

/** A grid of banners laid out by their count (`data-count`). */
export function BannerGroupSection({ section, priority, seeAllLabel }: BannerGroupSectionProps) {
  const items = section.items.filter(hasImage)
  if (items.length === 0) return null
  const layout = layoutOf(items.length)
  const columns = columnsOf(layout)
  const label = section.title.trim() || 'بنر تبلیغاتی'
  return (
    <SectionShell section={section} seeAllLabel={seeAllLabel}>
      <div data-count={layout} className={GRID}>
        {items.map((item, index) => (
          <PromoTile
            key={item.id}
            item={item}
            size="tile"
            frameClassName={FRAME[layout === '1' ? 'single' : 'multi']}
            sizes={SIZES[columns]}
            priority={priority && index === 0}
            fit="contain"
            fallbackLabel={label}
          />
        ))}
      </div>
    </SectionShell>
  )
}

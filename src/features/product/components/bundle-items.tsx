import { SectionHeader } from '@/components/layout/section-header'
import { SmartImage } from '@/components/ui/smart-image'
import type { BundleItem } from '@/lib/api/types/catalog'
import { formatNumber } from '@/lib/format'

const HEADING_ID = 'bundle-items'

/**
 * «محتویات بسته» for a bundle (product digest §5.9): each component of the default variant
 * with its picture, name, variant and quantity. Components carry no slug, so they are not
 * links; the bundle's own price is the admin's, so no "savings" are worked out here.
 */
export function BundleItems({ items }: { items: readonly BundleItem[] }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby={HEADING_ID} className="rounded-card bg-white p-4 shadow-card md:p-6">
      <SectionHeader id={HEADING_ID} title="محتویات بسته" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.variant}
            className="flex items-center gap-3 rounded-control border border-ink-200 p-2"
          >
            <SmartImage
              src={item.image}
              alt=""
              ratio="1/1"
              sizes="64px"
              className="size-16 shrink-0 rounded-control bg-white"
            />
            <div className="flex min-w-0 flex-col">
              <span dir="auto" className="text-base font-medium text-ink-900">
                {item.product_name}
              </span>
              {item.variant_name && (
                <span className="text-sm text-ink-600">{item.variant_name}</span>
              )}
              <span className="text-sm text-ink-600">{`${formatNumber(item.quantity)} عدد`}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

import Link from 'next/link'
import { Rating } from '@/components/ui/rating'
import { badgeColors } from '@/features/catalog/components/badge-colors'
import { brandPath } from '@/features/catalog/listing-routes'
import type { ProductDetail, ProductSpecification } from '@/lib/api/types/catalog'
import { formatNumber, toPersianDigits } from '@/lib/format'
import { VariantPicker } from './variant-picker'

/** The key specs shown beside the picker; the full table comes further down the page. */
const MAX_KEY_SPECS = 5
const KEY_SPECS = 'ویژگی\u{200C}های اصلی'

/** A spec row's text (product digest §5.7): the values joined, else the free text; '' if none. */
export function specText(row: Pick<ProductSpecification, 'values' | 'custom_attribute_value'>) {
  return row.values.length > 0 ? row.values.join('، ') : (row.custom_attribute_value ?? '').trim()
}

/**
 * The highlighted specs worth a box at the top: not empty, and not an axis of the picker (which
 * already shows those values), at most five.
 */
function keySpecs(product: ProductDetail) {
  const axes = new Set(product.variant_options.map((option) => option.attribute_id))
  return product.highlighted_specifications
    .filter((row) => !axes.has(row.attribute_id))
    .map((row) => ({ id: row.id, name: row.attribute_name, text: specText(row) }))
    .filter((row) => row.text !== '')
    .slice(0, MAX_KEY_SPECS)
}

/**
 * The top of the product: the operator's badge and the brand, the name, its subtitle, the
 * rating (a link to the reviews) and the product code, the key specs and the variant picker.
 */
export function ProductSummary({ product }: { product: ProductDetail }) {
  const specs = keySpecs(product)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        {(product.badge || product.brand) && (
          <div className="flex flex-wrap items-center gap-2">
            {product.badge && (
              <span
                className="inline-block h-7 max-w-full truncate rounded-pill px-3 text-sm leading-7 font-medium"
                style={badgeColors(product.badge)}
              >
                {product.badge.name}
              </span>
            )}
            {product.brand && (
              <Link
                href={brandPath(product.brand.slug)}
                className="inline-flex min-h-11 items-center text-base font-medium text-brand-700 hover:underline"
              >
                {product.brand.name}
              </Link>
            )}
          </div>
        )}
        <h1
          dir="auto"
          className="text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10"
        >
          {product.name}
        </h1>
        {product.extra_detail && (
          <p dir="auto" className="text-base text-ink-600">
            {product.extra_detail}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base">
          <a
            href="#reviews"
            className="inline-flex min-h-11 items-center gap-2 text-ink-700 hover:text-brand-700"
          >
            {product.rating > 0 ? (
              <Rating value={product.rating} size="sm" />
            ) : (
              <span>بدون امتیاز</span>
            )}
            {product.comment_count > 0 && (
              <>
                <span aria-hidden className="text-ink-300">
                  |
                </span>
                <span className="underline-offset-4 hover:underline">
                  {`${formatNumber(product.comment_count)} دیدگاه`}
                </span>
              </>
            )}
          </a>
          <p className="text-sm text-ink-500">
            <span>شناسه محصول:</span>{' '}
            <span className="tabular-nums">{toPersianDigits(product.product_code)}</span>
          </p>
        </div>
      </div>

      {specs.length > 0 && (
        <section aria-labelledby="key-specs" className="flex flex-col gap-2">
          <h2 id="key-specs" className="text-base font-bold text-ink-900">
            {KEY_SPECS}
          </h2>
          <ul aria-labelledby="key-specs" className="flex flex-wrap gap-2">
            {specs.map((spec) => (
              <li
                key={spec.id}
                className="flex min-w-40 flex-1 basis-48 flex-col rounded-control bg-white px-3 py-2 shadow-card"
              >
                <span className="text-sm text-ink-600">{spec.name}</span>
                <span dir="auto" className="text-base text-ink-900">
                  {spec.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <VariantPicker />
    </div>
  )
}

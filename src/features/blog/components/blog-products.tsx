import Link from 'next/link'
import { Price } from '@/components/ui/price'
import { SmartImage } from '@/components/ui/smart-image'
import { productPath } from '@/features/catalog/listing-routes'
import type { BlogProductCard } from '@/lib/api/types/blog'

const HEADING_ID = 'blog-products'

/**
 * The blog home's `recent_products` (blog digest §1.3): compact product tiles, picture, name and
 * the price to pay (`final_price`, the old one struck only with a discount). Nothing when empty.
 * The cart is not offered here: the product page re-checks the stock first.
 */
export function BlogProducts({ products }: { products: BlogProductCard[] }) {
  if (products.length === 0) return null
  return (
    <section aria-labelledby={HEADING_ID} className="mt-8 md:mt-10">
      <h2
        id={HEADING_ID}
        className="mb-3 text-lg leading-8 font-bold text-ink-900 md:mb-4 md:text-xl"
      >
        محصولات پیشنهادی
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
        {products.map((product) => (
          <li key={product.id} className="min-w-0">
            <Link
              href={productPath(product.slug)}
              prefetch={false}
              className="group flex h-full flex-col gap-2 rounded-card bg-white p-2.5 shadow-card transition-shadow duration-150 hover:shadow-raised sm:p-3"
            >
              <SmartImage
                src={product.image}
                alt=""
                ratio="1/1"
                skeleton
                sizes="(min-width: 1024px) 200px, (min-width: 640px) 30vw, 45vw"
                loading="lazy"
                className="rounded-control bg-ink-50"
              />
              <span
                dir="auto"
                className="line-clamp-2 min-h-12 text-sm leading-6 font-medium text-ink-800 group-hover:text-brand-700"
              >
                {product.name}
              </span>
              <Price
                amount={product.final_price}
                original={product.has_discount ? product.price : null}
                discountPercent={product.has_discount ? product.discount_percent : undefined}
                size="sm"
                className="mt-auto"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

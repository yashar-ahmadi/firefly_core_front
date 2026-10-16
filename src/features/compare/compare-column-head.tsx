'use client'

import { X } from 'lucide-react'
import Link from 'next/link'
import { useId } from 'react'
import { IconButton } from '@/components/ui/icon-button'
import { Price } from '@/components/ui/price'
import { SmartImage } from '@/components/ui/smart-image'
import { cardAction, type ActionProduct } from '@/features/catalog/components/card-action'
import { productPath } from '@/features/catalog/listing-routes'
import type { ProductDetail, Variant } from '@/lib/api/types/catalog'

const REMOVE = 'حذف از مقایسه'

const defaultVariant = (product: ProductDetail): Variant | null =>
  product.variants.find((variant) => variant.id === product.default_variant_id) ?? null

/** The slice of a payload the shared add-slot decision reads, from its default variant. */
function actionProduct(product: ProductDetail, variant: Variant | null): ActionProduct {
  return {
    slug: product.slug,
    name: product.name,
    image: product.image,
    type: product.type,
    in_stock: variant?.in_stock ?? false,
    default_variant_id: product.default_variant_id,
    order_limit_min: variant?.order_limit_min ?? null,
  }
}

/**
 * One product's column head in the compare table: the picture, the name (a link to the
 * product), the representative variant's price from the API, the shared add slot (one tap for
 * a simple product, quick view for a variable one) and «حذف از مقایسه» in the corner.
 */
export function CompareColumnHead({
  product,
  onRemove,
}: {
  product: ProductDetail
  onRemove: () => void
}) {
  const nameId = useId()
  const variant = defaultVariant(product)
  return (
    // At most 16rem wide: on a wide column the × stays by its picture.
    <div className="relative flex h-full max-w-64 flex-col gap-2">
      <IconButton
        label={REMOVE}
        aria-describedby={nameId}
        icon={<X />}
        size="sm"
        onClick={onRemove}
        data-compare-remove=""
        className="absolute -end-2 -top-2 z-[1] bg-white/90 text-ink-600 hover:bg-danger/10 hover:text-danger"
      />
      <SmartImage
        src={product.image}
        alt=""
        ratio="1/1"
        sizes="(min-width: 768px) 96px, 64px"
        className="w-16 rounded-control bg-ink-50 md:w-24"
      />
      <Link
        id={nameId}
        href={productPath(product.slug)}
        prefetch={false}
        dir="auto"
        className="line-clamp-2 min-h-14 text-start text-base leading-7 font-medium text-ink-900 hover:text-brand-700"
      >
        {product.name}
      </Link>
      <div className="mt-auto flex min-h-[3.125rem] flex-col justify-end">
        {variant ? (
          <Price
            amount={variant.final_price}
            original={variant.has_discount ? variant.price : null}
            discountPercent={variant.has_discount ? variant.discount_percent : undefined}
            size="sm"
            muted={!variant.in_stock}
          />
        ) : (
          <span className="text-sm text-ink-600">ناموجود</span>
        )}
      </div>
      {cardAction(actionProduct(product, variant), nameId)}
    </div>
  )
}

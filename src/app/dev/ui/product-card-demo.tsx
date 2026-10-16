'use client'

import { ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/toaster'
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button'
import { ProductCard } from '@/features/catalog/components/product-card'
import type { ProductCard as ProductCardData } from '@/lib/api/types/catalog'

// The product card as a Client Component parent uses it. Following the spec's one-tap rule, a
// simple product adds straight from the card; a variable one opens quick view, so the shopper
// always sees the variant. The add button is the real one (it writes to the dev cart through the
// BFF); quick view (Plan 2 Task 9) only toasts here.

export function ProductCardDemo({ product }: { product: ProductCardData }) {
  const openQuickView = (slug: string) => notify.info(`مشاهده سریع: ${slug}`)
  const oneTap = product.type !== 'variable' && product.default_variant_id !== null
  return (
    <ProductCard
      product={product}
      showOutOfStockLabel
      onQuickView={openQuickView}
      addSlot={
        oneTap ? (
          <AddToCartButton
            variantId={product.in_stock ? product.default_variant_id : null}
            quantity={product.order_limit_min || 1}
            product={{ name: product.name, image: product.image }}
            size="sm"
            variant="secondary"
            fullWidth
            label="افزودن به سبد"
          />
        ) : (
          <Button
            size="sm"
            variant="outline"
            fullWidth
            iconStart={<ListFilter />}
            aria-haspopup="dialog"
            onClick={() => openQuickView(product.slug)}
          >
            {'انتخاب ویژگی\u{200C}ها'}
          </Button>
        )
      }
    />
  )
}

'use client'

import { ListFilter, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/toaster'
import { ProductCard } from '@/features/catalog/components/product-card'
import type { ProductCard as ProductCardData } from '@/lib/api/types/catalog'

// The product card as a Client Component parent uses it. Following the spec's one-tap rule, a
// simple product adds straight from the card; a variable one opens quick view, so the shopper
// always sees the variant. Plan 2 Tasks 3 and 9 supply the real buttons; these only toast.

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
          <Button
            size="sm"
            variant="secondary"
            fullWidth
            iconStart={<ShoppingCart />}
            disabled={!product.in_stock}
            onClick={() => notify.success(`«${product.name}» به سبد خرید افزوده شد.`)}
          >
            {product.in_stock ? 'افزودن به سبد' : 'ناموجود'}
          </Button>
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

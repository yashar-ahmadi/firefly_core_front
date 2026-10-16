'use client'

import { ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/components/ui/toaster'
import { ProductCard } from '@/features/catalog/components/product-card'
import type { ProductCard as ProductCardData } from '@/lib/api/types/catalog'

// The product card as a Client Component parent uses it: with quick view and an add button.
// Plan 2 Tasks 3 and 9 supply the real ones; here they only show a toast.

export function ProductCardDemo({ product }: { product: ProductCardData }) {
  return (
    <ProductCard
      product={product}
      showOutOfStockLabel
      onQuickView={(slug) => notify.info(`مشاهده سریع: ${slug}`)}
      addSlot={
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
      }
    />
  )
}

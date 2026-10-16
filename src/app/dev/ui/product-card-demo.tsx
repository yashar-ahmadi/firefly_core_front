import { ProductCard } from '@/features/catalog/components/product-card'
import type { ProductCard as ProductCardData } from '@/lib/api/types/catalog'

// The product card with the shop's own add slot (`withAction`): following the spec's one-tap
// rule, a simple product adds straight from the card (the real cart, through the BFF); a
// variable one opens quick view, so the shopper always sees the variant. The showcase mounts
// its own quick view host.

export function ProductCardDemo({ product }: { product: ProductCardData }) {
  return (
    <ProductCard
      product={product}
      showOutOfStockLabel
      withAction
    />
  )
}

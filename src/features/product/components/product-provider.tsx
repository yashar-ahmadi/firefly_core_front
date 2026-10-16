'use client'

import { useSearchParams } from 'next/navigation'
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Variant } from '@/lib/api/types/catalog'
import { useLeavingPage } from '@/lib/navigation/router-navigation'
import type { ClientProduct } from '../client-product'
import { clampQuantity, quantityBounds, type QuantityBounds } from '../quantity'
import {
  currentVariant,
  initialSelection,
  requestedVariantId,
  selectValue,
  type Selection,
} from '../variant'

export interface ProductState {
  product: ClientProduct
  selection: Selection
  /** What the buy buttons add; null when the selection is no variant. */
  variant: Variant | null
  /** Chooses a value (auto-adjusting a missing combination) and writes `?variant=` to the URL. */
  select: (axisId: number, valueId: number) => void
  /** Always within `bounds`; starts at the minimum. */
  quantity: number
  setQuantity: (quantity: number) => void
  bounds: QuantityBounds
}

const ProductContext = createContext<ProductState | null>(null)

const ignore = () => {}

/** The current address with `?variant=<id>` set (or removed), the rest of the query kept. */
function addressWith(variant: Variant | null): string {
  const url = new URL(window.location.href)
  if (variant) url.searchParams.set('variant', String(variant.id))
  else url.searchParams.delete('variant')
  return `${url.pathname}${url.search}${url.hash}`
}

export interface ProductProviderProps {
  /** A `ProductDetail`, or the slice of it the page hands to the browser (`toClientProduct`). */
  product: ClientProduct
  /**
   * The variant to start on. By default the URL's `?variant=` when it names a variant of this
   * product (a shared link opens the same variant), else the default variant. Read through
   * `useSearchParams`, which the server render and hydration see alike on this dynamic route,
   * and which is right on a page restored by Back/Forward too (its payload was built for the
   * URL it was first opened at, so the page cannot pass it).
   */
  initialVariantId?: number | null
  children: ReactNode
}

/**
 * The product page's client state: the selected values, the variant they resolve to and the
 * quantity. Choosing a value changes the image, price, stock text and limits with no request,
 * and records the variant in the URL with `history.replaceState` (no history entry, no
 * navigation); never while a navigation to another page is on its way, which it would cancel.
 */
export function ProductProvider({ product, initialVariantId, children }: ProductProviderProps) {
  const requested = useSearchParams().get('variant') ?? undefined
  const [selection, setSelection] = useState(() =>
    initialSelection(
      product.variant_options,
      product.variants,
      initialVariantId === undefined
        ? requestedVariantId(product, requested)
        : (initialVariantId ?? product.default_variant_id),
    ),
  )
  // The quantity the shopper asked for; shown within the current variant's bounds.
  const [wanted, setWanted] = useState<number | null>(null)
  const leaving = useLeavingPage(ignore)

  const variant = currentVariant(product, selection)
  const bounds = quantityBounds(variant)

  const value: ProductState = {
    product,
    selection,
    variant,
    select(axisId, valueId) {
      const next = selectValue(
        product.variant_options,
        product.variants,
        selection,
        axisId,
        valueId,
      )
      setSelection(next)
      if (leaving) return
      window.history.replaceState(null, '', addressWith(currentVariant(product, next)))
    },
    quantity: clampQuantity(wanted ?? bounds.min, bounds),
    setQuantity: (quantity) => setWanted(clampQuantity(quantity, bounds)),
    bounds,
  }
  return <ProductContext value={value}>{children}</ProductContext>
}

/** The product page's state. Throws outside `ProductProvider`. */
export function useProduct(): ProductState {
  const state = useContext(ProductContext)
  if (!state) throw new Error('useProduct must be used inside ProductProvider')
  return state
}

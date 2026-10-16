'use client'

import { useSearchParams } from 'next/navigation'
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Variant } from '@/lib/api/types/catalog'
import { useLeavingPage } from '@/lib/navigation/router-navigation'
import { choiceSummary } from '../announce'
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
  /**
   * Chooses a value (auto-adjusting a missing combination); on the product page it also writes
   * `?variant=` to the URL.
   */
  select: (axisId: number, valueId: number) => void
  /** Always within `bounds`; starts at the minimum. */
  quantity: number
  setQuantity: (quantity: number) => void
  bounds: QuantityBounds
  /** The last choice in words, for a live region; '' until the shopper chooses (not on load). */
  announcement: string
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
   * The variant to start on, given by a host that owns the choice (quick view, over any page):
   * the provider is then detached from the URL, which it neither reads nor writes.
   *
   * Left out (the product page), the URL is the record: it starts on the URL's `?variant=` when
   * that names a variant of this product (a shared link opens the same variant), else the
   * default variant, follows a later `?variant=` and writes each choice back. Read through
   * `useSearchParams`, which the server render and hydration see alike on this dynamic route,
   * and which is right on a page restored by Back/Forward too (its payload was built for the
   * URL it was first opened at, so the page cannot pass it).
   */
  initialVariantId?: number | null
  children: ReactNode
}

/**
 * The product's client state (the product page, quick view): the selected values, the variant
 * they resolve to and the quantity. Choosing a value changes the image, price, stock text and
 * limits with no request. On the product page (URL mode: no `initialVariantId`) it records the
 * variant in the URL with `history.replaceState` (no history entry, no navigation; the null
 * state is Next's documented way to sync `useSearchParams`); never while a navigation to another
 * page is on its way, which it would cancel.
 */
export function ProductProvider({ product, initialVariantId, children }: ProductProviderProps) {
  const urlMode = initialVariantId === undefined
  const requested = useSearchParams().get('variant') ?? undefined
  const [selection, setSelection] = useState(() =>
    initialSelection(
      product.variant_options,
      product.variants,
      urlMode
        ? requestedVariantId(product, requested)
        : (initialVariantId ?? product.default_variant_id),
    ),
  )
  const [announcement, setAnnouncement] = useState('')
  // The quantity the shopper asked for; shown within the current variant's bounds.
  const [wanted, setWanted] = useState<number | null>(null)
  const leaving = useLeavingPage(ignore)

  const variant = currentVariant(product, selection)
  const bounds = quantityBounds(variant)

  // A navigation to this page with another `?variant=` (a link, Back within the page's own
  // entries) keeps this component: follow it when it names another variant of this product.
  // The URL that `select` writes names the variant already shown, so it changes nothing.
  const [seenRequest, setSeenRequest] = useState(requested)
  if (requested !== seenRequest) {
    setSeenRequest(requested)
    const id = requestedVariantId(product, requested)
    const named = id !== null && String(id) === requested
    if (urlMode && named && id !== variant?.id) {
      setSelection(initialSelection(product.variant_options, product.variants, id))
    }
  }

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
      setAnnouncement(choiceSummary(product, next, currentVariant(product, next)))
      if (!urlMode || leaving) return
      window.history.replaceState(null, '', addressWith(currentVariant(product, next)))
    },
    quantity: clampQuantity(wanted ?? bounds.min, bounds),
    setQuantity: (quantity) => setWanted(clampQuantity(quantity, bounds)),
    bounds,
    announcement,
  }
  return <ProductContext value={value}>{children}</ProductContext>
}

/** The product page's state. Throws outside `ProductProvider`. */
export function useProduct(): ProductState {
  const state = useContext(ProductContext)
  if (!state) throw new Error('useProduct must be used inside ProductProvider')
  return state
}

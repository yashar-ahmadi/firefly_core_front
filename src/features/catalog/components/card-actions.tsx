'use client'

import { useState } from 'react'
import { AddToCartButtonView } from '@/features/cart/components/add-to-cart-button'
import type { CompareItem } from '@/features/compare/compare-item'
import { CompareToggleView, toggleCompare } from '@/features/compare/compare-toggle'
import { QuickViewButton } from '@/features/quick-view/quick-view-button'
import { QuickViewLinkView } from '@/features/quick-view/quick-view-link'
import { HeartButtonView } from '@/features/wishlist/heart-button'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { CARD_ADD_LABEL, NARROW, cardActionKind, type ActionProduct } from './card-action'
import { CardScope, useCardScope, type CardScopeValue } from './card-scope'
import { CARD_IMAGE_OVERLAY, REVEAL_ON_HOVER } from './card-styles'

export type CardActionsProduct = Pick<
  ActionProduct,
  'slug' | 'name' | 'image' | 'type' | 'in_stock' | 'default_variant_id' | 'order_limit_min'
> & { id: number }

export interface CardActionsProps {
  product: CardActionsProduct
  /** What the compare list keeps (built on the server: `compareItemFrom`). */
  compareItem: CompareItem
  /** The card's name link: describes every button (`aria-describedby`). */
  nameId: string
  /** Also the add slot: a one-tap add, or the variant chooser (`cardActionKind`). */
  withAction: boolean
}

interface Busy {
  /** Heart presses so far: a new one replays the beat. */
  beats: number
  hearting: boolean
  adding: boolean
}

/**
 * A product card's buttons as one client island: the heart, the compare toggle and quick view
 * over the image, and the add slot under the price. They read the grid's `CardScope` (one
 * hydration flag, one wishlist query, one compare subscription for all cards); the heart and the
 * add button create their mutation when pressed. A card outside any grid or rail brings its own
 * scope. The markup is the same as the separate buttons' (HeartButton, CompareToggle,
 * QuickViewButton, AddToCartButton, QuickViewLink).
 */
export function CardActions(props: CardActionsProps) {
  const scope = useCardScope()
  if (!scope) {
    return (
      <CardScope>
        <CardActions {...props} />
      </CardScope>
    )
  }
  return <ScopedCardActions {...props} scope={scope} />
}

function ScopedCardActions({
  product,
  compareItem,
  nameId,
  withAction,
  scope,
}: CardActionsProps & { scope: CardScopeValue }) {
  const features = useOptionalStoreConfig()?.features
  const [busy, setBusy] = useState<Busy>({ beats: 0, hearting: false, adding: false })
  const { hydrated } = scope
  // The server and hydration render it unpressed (see HeartButton); then the cached ids.
  const saved = hydrated && scope.saved.has(product.id)
  const waiting = hydrated && scope.savedLoading
  const selected = scope.compared.has(product.slug)
  const kind = withAction ? cardActionKind(product) : null

  const onHeart = () => {
    if (waiting || busy.hearting) return
    setBusy((current) => ({ ...current, beats: current.beats + 1, hearting: true }))
    void scope
      .toggleWishlist({ id: product.id, slug: product.slug })
      .finally(() => setBusy((current) => ({ ...current, hearting: false })))
  }

  const onAdd = () => {
    if (busy.adding || !product.in_stock || product.default_variant_id === null) return
    setBusy((current) => ({ ...current, adding: true }))
    void scope
      .addToCart(product.default_variant_id, product.order_limit_min || 1, {
        name: product.name,
        image: product.image,
      })
      .finally(() => setBusy((current) => ({ ...current, adding: false })))
  }

  return (
    <>
      {/* Over the image too, after the price in the DOM: the focus order is the name link,
          these buttons, then the add button. */}
      <div className={CARD_IMAGE_OVERLAY}>
        <div className="pointer-events-auto absolute start-0 top-0">
          <HeartButtonView
            saved={saved}
            waiting={waiting}
            beats={busy.beats}
            describedBy={nameId}
            className={REVEAL_ON_HOVER}
            onClick={onHeart}
          />
        </div>
        <div className="pointer-events-auto absolute end-0 top-0 flex flex-col">
          {features?.compare !== false && (
            <CompareToggleView
              selected={selected}
              hydrated={scope.compareReady}
              describedBy={nameId}
              className={REVEAL_ON_HOVER}
              onClick={() => toggleCompare(compareItem, selected)}
            />
          )}
          <QuickViewButton slug={product.slug} describedBy={nameId} className={REVEAL_ON_HOVER} />
        </div>
      </div>

      {kind && (
        <div className="@container relative z-[1] mt-1">
          {kind === 'choose' ? (
            <QuickViewLinkView
              slug={product.slug}
              describedBy={nameId}
              className={NARROW}
              upgraded={hydrated && features?.quickView !== false}
            />
          ) : (
            <AddToCartButtonView
              unavailable={!product.in_stock}
              pending={busy.adding}
              size="sm"
              variant="secondary"
              fullWidth
              label={CARD_ADD_LABEL}
              describedBy={nameId}
              className={NARROW}
              onClick={onAdd}
            />
          )}
        </div>
      )}
    </>
  )
}

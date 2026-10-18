'use client'

import type { UseQueryResult } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useCart } from '@/features/cart/hooks'
import type { Cart } from '@/lib/api/types/cart'
import { useSession } from '@/lib/session/session-context'
import {
  activeStep,
  destinationReady as hasDestination,
  doneSteps,
  shippingReady as hasShipping,
  type CheckoutStep,
} from './checkout-steps'
import { EMPTY_RECEIVER, receiverFrom, type GuestReceiver } from './guest-receiver'
import {
  clearReceiverDraft,
  parseReceiverDraft,
  receiverDraftSnapshot,
  saveReceiverDraft,
  subscribeReceiverDraft,
} from './receiver-draft'
import { useDestinationWrite, useShippingWrite, type WriteOutcome } from './use-checkout-writes'

// The checkout's state machine (Plan 4 Task 2; Task 3 adds payment and review): the cart as the
// API returned it (`useCart`, the one cart query) decides what is done, the page adds only what
// the API cannot know (a guest's receiver until placement, a step reopened with «ویرایش»), and
// local state never overrides the cart: a write that changes the cart clears its shipping
// choice there, and the steps follow.

export interface Checkout {
  cart: Cart | undefined
  cartQuery: UseQueryResult<Cart>
  /** The page holds a session (`useSession`). */
  signedIn: boolean
  /** It held one, and it ended here (expired, or ended in another tab): login is the way on. */
  sessionEnded: boolean
  step: CheckoutStep
  done: Record<CheckoutStep, boolean>
  destinationReady: boolean
  shippingReady: boolean
  /**
   * A done step reopened with «ویرایش», or the shipping step while the shopper chooses there:
   * until a destination is chosen (receiver) or `finishEditing` («ادامه»).
   */
  editing: CheckoutStep | null
  edit: (step: CheckoutStep) => void
  finishEditing: () => void
  /** `cart/destination/ {address}`: a saved address (signed in). */
  setDestinationByAddress: (id: number) => Promise<WriteOutcome>
  /** `cart/destination/ {province, city}`: a guest's (shipping can price at once). */
  setDestinationByCity: (provinceId: number, cityId: number) => Promise<WriteOutcome>
  destinationPending: boolean
  /** `cart/shipping/select/`; COD refused, the same method prepaid (`codDropped`). */
  selectShipping: (code: string, cashOnDelivery: boolean) => Promise<WriteOutcome>
  shippingPending: boolean
  /** A guest's receiver (sessionStorage while the tab lasts). */
  receiver: GuestReceiver
  setReceiver: (changes: Partial<GuestReceiver>) => void
  receiverConfirmed: boolean
  /** «ادامه» with a receiver the form checked. */
  confirmReceiver: () => void
}

interface Draft {
  values: GuestReceiver
  confirmed: boolean
}

const NO_DRAFT: Draft = { values: EMPTY_RECEIVER, confirmed: false }

function draftOf(raw: string | null): Draft {
  const stored = parseReceiverDraft(raw)
  return stored ? { values: receiverFrom(stored.values), confirmed: stored.confirmed } : NO_DRAFT
}

/**
 * A guest's draft, from the tab's store (`receiver-draft`: none on the server, so hydration
 * matches); every change is saved there. Signed in, there is none: a draft left is forgotten.
 */
function useReceiverDraft(signedIn: boolean) {
  const raw = useSyncExternalStore(subscribeReceiverDraft, receiverDraftSnapshot, () => null)
  const draft = useMemo(() => (signedIn ? NO_DRAFT : draftOf(raw)), [raw, signedIn])
  useEffect(() => {
    if (signedIn) clearReceiverDraft()
  }, [signedIn])
  const update = useCallback(
    (change: (current: Draft) => Draft) => {
      if (!signedIn) saveReceiverDraft(change(draftOf(receiverDraftSnapshot())))
    },
    [signedIn],
  )
  return [draft, update] as const
}

/** Whether this page began signed in, or became so: a session that ends then is not a guest's. */
function useSessionEnded(hasSession: boolean): boolean {
  const [held, setHeld] = useState(hasSession)
  if (hasSession && !held) setHeld(true)
  return held && !hasSession
}

export function useCheckout(): Checkout {
  const cartQuery = useCart()
  const cart = cartQuery.data
  const { hasSession: signedIn } = useSession()
  const sessionEnded = useSessionEnded(signedIn)
  const [draft, setDraft] = useReceiverDraft(signedIn)
  const [editing, setEditing] = useState<CheckoutStep | null>(null)
  const destination = useDestinationWrite()
  const shipping = useShippingWrite()

  const done = cart
    ? doneSteps({
        cart,
        signedIn,
        receiver: { confirmed: draft.confirmed, city: draft.values.city },
      })
    : { receiver: false, shipping: false, payment: false, review: false }

  const after = (outcome: WriteOutcome, step: CheckoutStep) => {
    // A choice made where the shopper reopened the step closes it.
    if (outcome.status === 'done') setEditing((current) => (current === step ? null : current))
    return outcome
  }

  const setReceiver = useCallback(
    (changes: Partial<GuestReceiver>) =>
      setDraft((current) => ({ ...current, values: { ...current.values, ...changes } })),
    [setDraft],
  )

  return {
    cart,
    cartQuery,
    signedIn,
    sessionEnded,
    step: activeStep(done, editing),
    done,
    destinationReady: cart ? hasDestination(cart, signedIn) : false,
    shippingReady: cart ? hasShipping(cart) : false,
    editing,
    edit: setEditing,
    finishEditing: () => setEditing(null),
    setDestinationByAddress: async (id) =>
      after(await destination.setDestination({ address: id }), 'receiver'),
    setDestinationByCity: async (province, city) =>
      // A guest's step closes with «ادامه» (`confirmReceiver`), not with the city.
      destination.setDestination({ province, city }),
    destinationPending: destination.isPending,
    // A choice keeps the shipping step as it is: reopened, it stays open for the COD box until
    // «ادامه با این روش ارسال» (`finishEditing`).
    selectShipping: (code, cod) => shipping.select(code, cod),
    shippingPending: shipping.isPending,
    receiver: draft.values,
    setReceiver,
    receiverConfirmed: draft.confirmed,
    confirmReceiver: () => {
      setDraft((current) => ({ ...current, confirmed: true }))
      setEditing((current) => (current === 'receiver' ? null : current))
    },
  }
}

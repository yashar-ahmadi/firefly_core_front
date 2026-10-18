'use client'

import type { UseQueryResult } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { CHECKOUT_ISSUES, checkoutBlock } from '@/features/cart/checkout-block'
import { useCart } from '@/features/cart/hooks'
import type { Cart } from '@/lib/api/types/cart'
import { useSession } from '@/lib/session/session-context'
import { useFeature } from '@/features/settings/feature-context'
import {
  activeStep,
  canReopen,
  destinationReady as hasDestination,
  doneSteps,
  shippingReady as hasShipping,
  type CheckoutStep,
} from './checkout-steps'
import {
  checkGuestReceiver,
  EMPTY_RECEIVER,
  receiverFrom,
  type GuestField,
  type GuestReceiver,
} from './guest-receiver'
import {
  clearReceiverDraft,
  parseReceiverDraft,
  receiverDraftSnapshot,
  saveReceiverDraft,
  subscribeReceiverDraft,
} from './receiver-draft'
import { useAutoDestination, useAutoShipping, type AutoChoice } from './use-auto-choices'
import { useDestinationWrite, useShippingWrite, type WriteOutcome } from './use-checkout-writes'

// The checkout's state machine (Plan 4 Tasks 2–3): the cart as the API returned it (`useCart`,
// the one cart query) decides what is done, the page adds only what the API cannot know (a
// guest's receiver until placement, the payment route chosen, a step reopened with «ویرایش»),
// and local state never overrides the cart: a write that changes the cart clears its shipping
// choice there, and the steps follow. The choices made for the shopper (the default address, the
// default shipping option) are made here too (use-auto-choices.ts).

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
  /** The API's messages on the guest form's fields (a refused placement), until a change. */
  receiverErrors: Partial<Record<GuestField, string>>
  /** A placement refused the receiver: the form again, with the API's messages. */
  reopenReceiver: (errors: Partial<Record<GuestField, string>>) => void
  /** Signed in: the book's default posted as the destination for the shopper (use-auto-choices). */
  autoDestination: AutoChoice
  /** The operator's default shipping option chosen for the shopper (use-auto-choices). */
  autoShipping: AutoChoice
}

export interface CheckoutOptions {
  /** A payment route the rules allow is chosen (`usePaymentStep`). */
  paymentReady?: boolean
  /** The order is placed: its cart is closed, nothing more is chosen for it. */
  halted?: boolean
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

export function useCheckout({
  paymentReady = false,
  halted = false,
}: CheckoutOptions = {}): Checkout {
  const cartQuery = useCart()
  const cart = cartQuery.data
  const { hasSession: signedIn } = useSession()
  const sessionEnded = useSessionEnded(signedIn)
  const [draft, setDraft] = useReceiverDraft(signedIn)
  const [editing, setEditing] = useState<CheckoutStep | null>(null)
  const [receiverErrors, setReceiverErrors] = useState<Partial<Record<GuestField, string>>>({})
  const destination = useDestinationWrite()
  const shipping = useShippingWrite()

  const guestCheckout = useFeature('guest_checkout').enabled
  const receiverValid = useMemo(
    () => Object.keys(checkGuestReceiver(draft.values)).length === 0,
    [draft.values],
  )
  const done = cart
    ? doneSteps({
        cart,
        signedIn,
        receiver: { confirmed: draft.confirmed, valid: receiverValid, city: draft.values.city },
        guestCheckout,
        paymentReady,
      })
    : { receiver: false, shipping: false, payment: false, review: false }
  // A reopened step the cart no longer reaches (an earlier step undone elsewhere) is let go.
  if (cart && editing && !canReopen(done, editing)) setEditing(null)

  const after = (outcome: WriteOutcome, step: CheckoutStep) => {
    // A choice made where the shopper reopened the step closes it.
    if (outcome.status === 'done') setEditing((current) => (current === step ? null : current))
    return outcome
  }

  // Any change asks for «ادامه» again: a receiver is done only as it was checked.
  const setReceiver = useCallback(
    (changes: Partial<GuestReceiver>) => {
      // The API's message on a field goes once the field changes.
      setReceiverErrors((current) => {
        const fields = Object.keys(changes).filter((field) => field in current)
        if (fields.length === 0) return current
        const next = { ...current }
        for (const field of fields) delete next[field as GuestField]
        return next
      })
      setDraft((current) => ({ values: { ...current.values, ...changes }, confirmed: false }))
    },
    [setDraft],
  )

  const setDestinationByAddress = async (id: number) =>
    after(await destination.setDestination({ address: id }), 'receiver')
  // The choices made for the shopper, in the page's own code (their steps' bodies load only if
  // the shopper is asked after all); only while there is a purchase to make.
  const active =
    !!cart && !cart.is_empty && checkoutBlock(cart, false) !== CHECKOUT_ISSUES && !halted
  const autoDestination = useAutoDestination({
    active,
    signedIn,
    cart,
    pending: destination.isPending,
    post: setDestinationByAddress,
  })
  const autoShipping = useAutoShipping({
    active,
    cart,
    ready: done.receiver,
    pending: shipping.isPending,
    select: shipping.select,
  })

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
    setDestinationByAddress,
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
      setReceiverErrors({})
      setDraft((current) => ({ ...current, confirmed: true }))
      setEditing((current) => (current === 'receiver' ? null : current))
    },
    receiverErrors,
    reopenReceiver: (errors) => {
      setReceiverErrors(errors)
      setDraft((current) => ({ ...current, confirmed: false }))
      setEditing(null)
    },
    autoDestination,
    autoShipping,
  }
}

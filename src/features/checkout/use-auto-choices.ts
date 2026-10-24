'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { addressApi } from '@/features/account/addresses/address-api'
import { ADDRESSES_KEY } from '@/features/account/addresses/use-addresses'
import { THROTTLED_MESSAGE } from '@/features/account/lists/list-error'
import { ApiError } from '@/lib/api/errors'
import type { Cart } from '@/lib/api/types/cart'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { withSessionExpiry } from '@/lib/session/with-session-expiry'
import { defaultOption } from './shipping-labels'
import { isOptionGone, isThrottled, type WriteOutcome } from './use-checkout-writes'
import { optionsSignature, retryOnce, useShippingOptions } from './use-shipping-options'

// The choices the checkout makes for the shopper (cart digest §6.6–6.8): a signed-in cart
// without a saved address as its destination gets the book's default (its first), and a cart
// without a shipping choice gets the operator's default option (the first available,
// sender-paid one in the API's order, never with COD). They run in the page's own code, not in
// the steps' bodies (Task 3's amendment): a step being completed for the shopper shows its
// heading over a skeleton, and its body (the address picker, the options) loads only if the
// shopper is asked after all (an empty book, no default, a refusal). A signed-in shopper's
// first visit goes from the cart to the review loading the review's body alone.

/** A refusal of a choice made for the shopper: said in the step's body, which then shows. */
export interface AutoFailure {
  message: string
  error: unknown
  /** When the answer came (a 429's wait starts then). */
  at: number
}

export interface AutoChoice {
  /** Being made (its data on its way, or its write): the step's body waits. */
  working: boolean
  failure: AutoFailure | null
}

const fail = (message: string, error: unknown): AutoFailure => ({ message, error, at: Date.now() })

/** True until a 429's `retry_after` is over (then the choice is made again). */
function useThrottleWait(failure: AutoFailure | null): boolean {
  const error = failure?.error
  const until =
    failure && error instanceof ApiError && isThrottled(error)
      ? failure.at + (error.retryAfter ?? 0) * 1000
      : 0
  const [over, setOver] = useState(0)
  useEffect(() => {
    if (until === 0) return
    const timer = setTimeout(() => setOver(until), Math.max(0, until - Date.now()))
    return () => clearTimeout(timer)
  }, [until])
  return until > 0 && over < until
}

export interface DestinationInput {
  /** A purchase to make: a cart with lines that can be ordered, not placed yet. */
  active: boolean
  signedIn: boolean
  cart: Cart | undefined
  pending: boolean
  post: (id: number) => Promise<WriteOutcome>
}

/**
 * Signed in, a cart without a saved address as its destination: the book's first address is
 * posted for the shopper, once per address (a throttled one again once the wait is over).
 */
export function useAutoDestination(input: DestinationInput): AutoChoice {
  const { cart, pending, post } = input
  const signedIn = input.active && input.signedIn
  const cartAddress = cart?.destination?.address?.id ?? null
  // The address book's own query (`useAddresses`), read only while a destination is wanted.
  const expire = useSessionExpired()
  const read = withSessionExpiry(addressApi.list, expire)
  const book = useQuery({
    queryKey: ADDRESSES_KEY,
    queryFn: ({ signal }) => read(signal),
    enabled: signedIn && cart !== undefined && cartAddress === null,
    retry: retryOnce,
  })
  const addresses = book.data?.results
  const [tried, setTried] = useState<number[]>([])
  const [failure, setFailure] = useState<AutoFailure | null>(null)
  const waiting = useThrottleWait(failure)
  const first = addresses?.[0]
  // One at a time: set as the choice is decided, until its answer.
  const inFlight = useRef(false)

  const choose = async (address: { id: number; title: string }) => {
    setTried((current) => [...current, address.id])
    setFailure(null)
    try {
      const outcome = await post(address.id)
      if (outcome.status === 'done') announce(`آدرس «${address.title}» برای ارسال انتخاب شد.`)
      if (outcome.status !== 'failed' || !outcome.message) return
      const throttled = isThrottled(outcome.error)
      // A throttled default is chosen again once the wait is over.
      if (throttled) setTried((current) => current.filter((id) => id !== address.id))
      setFailure(fail(throttled ? THROTTLED_MESSAGE : outcome.message, outcome.error))
    } finally {
      inFlight.current = false
    }
  }
  const run = useEffectEvent(() => {
    if (!signedIn || !cart || !first || cartAddress !== null || pending || inFlight.current) return
    if (waiting || tried.includes(first.id)) return
    inFlight.current = true
    // After this effect: its state changes are the choice's, not the render's.
    queueMicrotask(() => void choose(first))
  })
  useEffect(() => run(), [signedIn, addresses, cartAddress, waiting, pending, tried])

  const loading = book.data === undefined && !book.isError
  const working =
    signedIn &&
    cart !== undefined &&
    cartAddress === null &&
    failure === null &&
    (loading || pending || (first !== undefined && !tried.includes(first.id)))
  return { working, failure }
}

export interface ShippingInput {
  /** A purchase to make: a cart with lines that can be ordered, not placed yet. */
  active: boolean
  cart: Cart | undefined
  /** The receiver step is done (the destination set, the guest's receiver confirmed). */
  ready: boolean
  pending: boolean
  select: (code: string, cashOnDelivery: boolean) => Promise<WriteOutcome>
}

/**
 * A cart without a shipping choice: the operator's default is chosen for the shopper. An option
 * the API refused as gone is not tried again for this cart (the next default is); a throttled one
 * goes again once the wait is over; any other failure stops the choosing for this cart (no loop:
 * the shopper chooses, its reason on screen).
 */
export function useAutoShipping({
  active,
  cart,
  ready,
  pending,
  select,
}: ShippingInput): AutoChoice {
  const wanted = active && ready && cart !== undefined && !cart.shipping.is_selected
  const options = useShippingOptions(cart, wanted)
  const list = options.data
  const signature = cart ? optionsSignature(cart) : ''
  const [state, setState] = useState({ cart: '', gone: [] as string[], held: false })
  const current = state.cart === signature ? state : { cart: signature, gone: [], held: false }
  const [failure, setFailure] = useState<AutoFailure | null>(null)
  const waiting = useThrottleWait(failure)
  const pick = list && !current.held ? defaultOption(list.options, new Set(current.gone)) : null
  // One at a time: set as the choice is decided, until its answer.
  const inFlight = useRef(false)

  const choose = async (option: { code: string; title: string }) => {
    // Held for good after a failure that is neither a refusal nor a 429.
    setState({ ...current, held: true })
    setFailure(null)
    try {
      const { status, error, message } = await select(option.code, false)
      if (status === 'superseded') return
      if (status === 'done') {
        announce(`روش ارسال پیش\u{200C}فرض فروشگاه، «${option.title}»، انتخاب شد.`)
        return
      }
      if (message) setFailure(fail(isThrottled(error) ? THROTTLED_MESSAGE : message, error))
      if (isOptionGone(error)) {
        setState((now) => ({ ...now, gone: [...now.gone, option.code], held: false }))
      } else if (isThrottled(error)) {
        setState((now) => ({ ...now, held: false }))
      }
    } finally {
      inFlight.current = false
    }
  }
  const run = useEffectEvent(() => {
    if (!wanted || !pick || options.isFetching || pending || waiting || inFlight.current) return
    inFlight.current = true
    // After this effect: its state changes are the choice's, not the render's.
    queueMicrotask(() => void choose(pick))
  })
  useEffect(() => run(), [cart, list, wanted, options.isFetching, pending, waiting, pick?.code])

  const loading = list === undefined && !options.isError
  const working =
    wanted && (pending || (failure === null && (loading || (pick !== null && !waiting))))
  return { working, failure }
}

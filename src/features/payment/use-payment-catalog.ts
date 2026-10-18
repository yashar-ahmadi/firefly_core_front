'use client'

import { useState } from 'react'
import type { GatewayOption, PaymentMethodOption, PaymentRoute } from '@/lib/api/types/payment'
import { paymentApi } from './reads'
import type { PaymentCatalog, PaymentMethodView } from './catalog'

// The payment catalog in the browser: the server's cached copy (props, the route texts already
// sanitised there), read again through the BFF only after a refusal says it is out of date
// (`gateway_unknown`, `gateway_amount_not_supported`: the gateways; a route switched off or gone:
// the methods), since the lists share the 240/h `payment_status` budget. A fresh method list
// brings its availability only: the texts stay the server's sanitised ones (a route the server
// did not list shows its label alone), so no operator HTML ever renders unsanitised. Routes the
// shop proved it cannot run now are withdrawn for this page (`withdraw`). A gateway list that
// could not be read (the server's copy, or a read here) is said as such (`gatewaysFailed`): the
// bank's state is then unknown, not «unavailable».

export interface PaymentCatalogState {
  /** null: the server could not read them (the step offers to read them again). */
  methods: PaymentMethodView[] | null
  /** The gateways this page may still use (those it withdrew left out). */
  gateways: GatewayOption[]
  withdrawn: readonly PaymentRoute[]
  withdraw: (routes: readonly PaymentRoute[]) => void
  /**
   * A gateway the shop lists but could not use (`gateway_unknown`; `gateway_amount_not_supported`
   * for the order's amount): left out for this page, never tried again.
   */
  withdrawGateway: (code: string) => void
  /** Resolves true once read (false: the read failed; the page keeps what it had). */
  refreshMethods: () => Promise<boolean>
  refreshGateways: () => Promise<boolean>
  /** The gateway list could not be read (the server's copy, or the last read here). */
  gatewaysFailed: boolean
  /** The lists that could not be read, read through the BFF: «تلاش دوباره». */
  retry: () => Promise<void>
  retrying: boolean
  /** A list that read failed again (the methods, or the gateways): said politely; the button stays. */
  retryFailed: boolean
}

function merge(
  views: PaymentMethodView[] | null,
  fresh: PaymentMethodOption[],
): PaymentMethodView[] {
  return fresh.map((method) => {
    const known = views?.find((view) => view.route === method.route)
    return {
      ...method,
      description: known?.description ?? null,
      instruction: known?.instruction ?? null,
    }
  })
}

export function usePaymentCatalog(initial: PaymentCatalog): PaymentCatalogState {
  const [methods, setMethods] = useState(initial.methods)
  const [gateways, setGateways] = useState<GatewayOption[]>(initial.gateways ?? [])
  const [withdrawn, setWithdrawn] = useState<readonly PaymentRoute[]>([])
  const [unusable, setUnusable] = useState<readonly string[]>([])
  const [gatewaysFailed, setGatewaysFailed] = useState(initial.gateways === null)
  const [retrying, setRetrying] = useState(false)
  const [retryFailed, setRetryFailed] = useState(false)
  // The server's copy again (its props changed: a refresh of the page): it is the newest.
  const [source, setSource] = useState(initial)
  if (source !== initial) {
    setSource(initial)
    setMethods(initial.methods)
    setGateways(initial.gateways ?? [])
    setGatewaysFailed(initial.gateways === null)
  }
  // A failed read keeps what the page had: the refusal on screen says what to do.
  const refreshMethods = () =>
    paymentApi.methods().then(
      (fresh) => {
        setMethods((current) => merge(current, fresh))
        return true
      },
      () => false,
    )
  const refreshGateways = () =>
    paymentApi.gateways().then(
      (fresh) => {
        setGateways(fresh)
        setGatewaysFailed(false)
        return true
      },
      () => {
        setGatewaysFailed(true)
        return false
      },
    )
  return {
    methods,
    gateways: gateways.filter((gateway) => !unusable.includes(gateway.code)),
    withdrawn,
    withdraw: (routes) => setWithdrawn((current) => [...new Set([...current, ...routes])]),
    withdrawGateway: (code) =>
      setUnusable((current) => (current.includes(code) ? current : [...current, code])),
    refreshMethods,
    refreshGateways,
    gatewaysFailed,
    retry: async () => {
      setRetrying(true)
      setRetryFailed(false)
      // Only what could not be read (the lists share the 240/h `payment_status` budget).
      const reads = await Promise.all([
        methods === null ? refreshMethods() : true,
        gatewaysFailed ? refreshGateways() : true,
      ])
      setRetrying(false)
      setRetryFailed(reads.includes(false))
    },
    retrying,
    retryFailed,
  }
}

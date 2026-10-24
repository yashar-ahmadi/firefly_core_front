'use client'

import { useState } from 'react'
import type { GatewayOption, PaymentMethodOption, PaymentRoute } from '@/lib/api/types/payment'
import { paymentApi } from './reads'
import type { PaymentCatalog, PaymentMethodView } from './catalog'
import type { GatewayRefusal } from './routes'

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
  /** The gateways this page may still use (those it withdrew for any amount left out). */
  gateways: GatewayOption[]
  /** The gateways withdrawn, each at the amount it refused (for any without one). */
  refused: readonly GatewayRefusal[]
  withdrawn: readonly PaymentRoute[]
  withdraw: (routes: readonly PaymentRoute[]) => void
  /**
   * A gateway the shop lists but could not use: left out for this page (`gateway_unknown`), or
   * only at `amount`, the one it refused (`gateway_amount_not_supported`: another amount offers
   * it again).
   */
  withdrawGateway: (code: string, amount?: number) => void
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

/** The refusal of `code` at `amount` (none: for any amount). */
const refusal = (code: string, amount?: number) => (r: GatewayRefusal) =>
  r.code === code && r.amount === amount

export function usePaymentCatalog(initial: PaymentCatalog): PaymentCatalogState {
  const [methods, setMethods] = useState(initial.methods)
  const [gateways, setGateways] = useState<GatewayOption[]>(initial.gateways ?? [])
  const [withdrawn, setWithdrawn] = useState<readonly PaymentRoute[]>([])
  const [refused, setRefused] = useState<readonly GatewayRefusal[]>([])
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
    gateways: gateways.filter((g) => !refused.some(refusal(g.code))),
    refused,
    withdrawn,
    withdraw: (routes) => setWithdrawn((current) => [...new Set([...current, ...routes])]),
    withdrawGateway: (code, amount) =>
      setRefused((current) =>
        current.some(refusal(code, amount)) ? current : [...current, { code, amount }],
      ),
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

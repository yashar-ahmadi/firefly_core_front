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
// shop proved it cannot run now are withdrawn for this page (`withdraw`).

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
  refreshGateways: () => Promise<void>
  /** Both lists read through the BFF (the server's copy failed): «تلاش دوباره». */
  retry: () => Promise<void>
  retrying: boolean
  /** That read failed too: said (politely), the button stays. */
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
  const [retrying, setRetrying] = useState(false)
  const [retryFailed, setRetryFailed] = useState(false)
  // The server's copy again (its props changed: a refresh of the page): it is the newest.
  const [source, setSource] = useState(initial)
  if (source !== initial) {
    setSource(initial)
    setMethods(initial.methods)
    setGateways(initial.gateways ?? [])
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
  const refreshGateways = () => paymentApi.gateways().then(setGateways, () => undefined)
  return {
    methods,
    gateways: gateways.filter((gateway) => !unusable.includes(gateway.code)),
    withdrawn,
    withdraw: (routes) => setWithdrawn((current) => [...new Set([...current, ...routes])]),
    withdrawGateway: (code) =>
      setUnusable((current) => (current.includes(code) ? current : [...current, code])),
    refreshMethods,
    refreshGateways,
    retry: async () => {
      setRetrying(true)
      setRetryFailed(false)
      const [read] = await Promise.all([refreshMethods(), refreshGateways()])
      setRetrying(false)
      setRetryFailed(!read)
    },
    retrying,
    retryFailed,
  }
}

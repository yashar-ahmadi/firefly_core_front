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
  gateways: GatewayOption[]
  withdrawn: readonly PaymentRoute[]
  withdraw: (routes: readonly PaymentRoute[]) => void
  refreshMethods: () => Promise<void>
  refreshGateways: () => Promise<void>
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
  return {
    methods,
    gateways,
    withdrawn,
    withdraw: (routes) => setWithdrawn((current) => [...new Set([...current, ...routes])]),
    // A failed read keeps what the page had: the refusal on screen says what to do.
    refreshMethods: () =>
      paymentApi.methods().then(
        (fresh) => setMethods((current) => merge(current, fresh)),
        () => undefined,
      ),
    refreshGateways: () => paymentApi.gateways().then(setGateways, () => undefined),
  }
}

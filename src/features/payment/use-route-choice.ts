'use client'

import { useState } from 'react'
import { useFeature } from '@/features/settings/feature-context'
import type { PaymentRoute } from '@/lib/api/types/payment'
import type { PaymentMethodView } from './catalog'
import {
  availableRoutes,
  defaultGateway,
  defaultRoute,
  gatewayCodeFor,
  isBankRoute,
  isWalletRoute,
  walletLoginOffered,
  type RouteChoice,
} from './routes'
import type { PaymentCatalogState } from './use-payment-catalog'
import { useWalletBalance } from './use-wallet'

// The route the shopper pays with, for given amounts: the cart's before placement (A, D), the
// order's after it. The routes come from the rules (`availableRoutes`); the one used is the
// shopper's own choice while the rules allow it, otherwise (nothing chosen yet) the shop's
// default (the first enabled non-wallet route in the operator's order). A choice the rules no
// longer allow is never swapped silently: the step asks again (`stale`). The bank's gateway is
// the shopper's when the chooser shows, the shop's default otherwise. While the gateway list
// could not be read, no route is chosen for the shopper (the bank's state is unknown).

export interface RouteAmounts {
  /** What is owed online now (A before placement, O after). */
  online: number
  onDelivery: number
  /** The full online amount a route's ceiling is compared with (A); default `online`. */
  charged?: number
}

export interface RouteChoiceState {
  routes: RouteChoice<PaymentMethodView>[]
  /** The route that would be used now, or null (none allowed, or the shopper's is not). */
  chosen: RouteChoice<PaymentMethodView> | null
  /** The shopper's own choice, which the rules no longer allow. */
  stale: boolean
  /** The gateway shown chosen in the chooser. */
  gateway: string | null
  /** The `gateway_code` to send (none: the server's default). */
  gatewayCode: string | undefined
  choose: (route: PaymentRoute) => void
  chooseGateway: (code: string) => void
  /** A guest is offered «ورود برای استفاده از کیف پول». */
  walletLogin: boolean
  /** The wallet's balance (signed in), for the wallet route's line. */
  balance: number | null
  /** The wallet's balance is still being read: its routes wait (not a refusal). */
  pending: boolean
}

export function useRouteChoice({
  catalog,
  amounts,
  isGuest,
  initial = null,
}: {
  catalog: PaymentCatalogState
  amounts: RouteAmounts | null
  isGuest: boolean
  /** A route chosen before (the one placed with). */
  initial?: { route: PaymentRoute; gateway: string | null } | null
}): RouteChoiceState {
  const features = {
    online_payment: useFeature('online_payment'),
    wallet: useFeature('wallet'),
    pay_on_delivery: useFeature('pay_on_delivery'),
  }
  const methods = catalog.methods ?? []
  const walletWanted =
    !isGuest && features.wallet.enabled && methods.some((method) => isWalletRoute(method.route))
  const wallet = useWalletBalance(walletWanted)
  const [own, setOwn] = useState(initial)

  const input = amounts && {
    methods,
    isGuest,
    wallet: wallet.data ?? null,
    walletPending: walletWanted && wallet.isPending,
    gateways: catalog.gateways,
    features,
    withdrawn: catalog.withdrawn,
    refused: catalog.refused,
    ...amounts,
  }
  const routes = input ? availableRoutes(input) : []
  const mine = own ? routes.find((choice) => choice.route === own.route) : undefined
  const bankUnknown = catalog.gatewaysFailed && routes.some((choice) => isBankRoute(choice.route))
  const chosen = mine ? (mine.enabled ? mine : null) : bankUnknown ? null : defaultRoute(routes)
  const gateways = chosen?.gateways ?? []
  const gateway =
    gateways.find(({ code }) => code === own?.gateway)?.code ??
    defaultGateway(gateways)?.code ??
    null
  return {
    routes,
    chosen,
    stale: !!mine && !mine.enabled,
    gateway,
    gatewayCode: chosen ? gatewayCodeFor(chosen, gateway, catalog.gateways) : undefined,
    choose: (route) => setOwn((current) => ({ route, gateway: current?.gateway ?? null })),
    chooseGateway: (code) =>
      setOwn((current) => ({
        route: current?.route ?? chosen?.route ?? 'bank_gateway',
        gateway: code,
      })),
    walletLogin: input ? walletLoginOffered(input) : false,
    balance: wallet.data?.balance ?? null,
    pending: walletWanted && wallet.isPending,
  }
}

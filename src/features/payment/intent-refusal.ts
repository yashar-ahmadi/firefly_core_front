import type { FeatureKey } from '@/lib/api/types/common'
import type { PaymentRoute } from '@/lib/api/types/payment'
import type { IntentError } from './api'
import { BANK_ROUTES } from './routes'
import type { PaymentCatalogState } from './use-payment-catalog'

// What a refused intent changes on the page's payment routes (order digest §5.4–5.6, §8.3),
// whichever door it went through (the checkout's placed order, the payment link's page): the
// routes the shop proved it cannot run are withdrawn, a gateway it lists but cannot use is left
// out, stale lists are read again, a closed switch is marked, the wallet is read again. What the
// page then shows is its own. Pure apart from the callbacks.

const WALLET_ROUTES: readonly PaymentRoute[] = ['wallet', 'wallet_and_gateway']

export interface RefusalDeps {
  catalog: PaymentCatalogState
  markFeatureDisabled: (feature: FeatureKey, detail: string) => void
  /** The wallet's balance (and the account summary) read again. */
  walletMoved: () => void
  /** Chooses a route for the shopper (`payment_wallet_covers_full_amount` → the wallet). */
  suggest: (route: PaymentRoute) => void
}

export function applyIntentRefusal(
  error: IntentError,
  gatewayCode: string | undefined,
  { catalog, markFeatureDisabled, walletMoved, suggest }: RefusalDeps,
): void {
  switch (error.problem) {
    case 'gateway_broken':
      catalog.withdraw(BANK_ROUTES)
      return
    case 'gateway_refresh': {
      // The gateway tried (no code: the shop's default) is left out for this page, and the list
      // read again; with none left, the bank routes close with their reason.
      const tried =
        gatewayCode ??
        (catalog.gateways.find((gateway) => gateway.is_default) ?? catalog.gateways[0])?.code
      if (tried) catalog.withdrawGateway(tried)
      void catalog.refreshGateways()
      return
    }
    case 'feature_off':
      if (error.feature) markFeatureDisabled(error.feature, error.detail)
      void catalog.refreshMethods()
      return
    case 'method_refresh':
      void catalog.refreshMethods()
      return
    case 'card_unavailable':
      catalog.withdraw(['card_transfer'])
      return
    case 'wallet_short':
    case 'wallet_frozen':
      walletMoved()
      return
    case 'use_wallet':
      suggest('wallet')
      return
    case 'forbidden':
      // Another account's order (the link door): this account's wallet cannot pay it.
      catalog.withdraw(WALLET_ROUTES)
      return
  }
}

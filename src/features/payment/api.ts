import { bffFetch } from '@/lib/api/client'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { FeatureKey } from '@/lib/api/types/common'
import type {
  OpenAttempt,
  PaymentIntent,
  PaymentIntentRequest,
  PaymentRoute,
} from '@/lib/api/types/payment'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { bankUrl, UnsafeHandoffError } from './handoff-url'

// The payment intents the browser opens through the BFF (order digest §3.2.3–3.2.4; the lists
// and the wallet are read in ./reads). An intent
// goes through the signed-in door (`payment/order/<uuid>/intent/`, the owner's) or the link
// (`payment/link/<token>/intent/`, a guest's; anyone may pay but wallet routes need the account),
// with the click's Idempotency-Key, resent with that same key while the server says the click's
// first request is still starting. Every refusal becomes what the page does about it
// (`IntentError.problem`, digest §8.3). The order uuid, link token and payment uuid are bearer
// credentials: only in the path, never in a log.

export type PaymentDoor = { kind: 'uuid'; orderUuid: string } | { kind: 'link'; token: string }

export interface StartPaymentInput {
  door: PaymentDoor
  route: PaymentRoute
  gatewayCode?: string
  /** One per click (`newIdempotencyKey`). */
  key: string
}

export type PaymentIntentResult = PaymentIntent

export type IntentProblem =
  /** 409 `payment_attempt_open`: an attempt is still open (`openAttempt`). */
  | 'attempt_open'
  /** Still starting after the retries. */
  | 'starting'
  /** `payment_idempotency_conflict`: the key's attempt finished; a new click, a new key. */
  | 'conflict'
  /** The route is off or gone: read the method list again. */
  | 'method_refresh'
  | 'amount_exceeded'
  /** `payment_no_active_bank_card`: card transfer cannot be offered. */
  | 'card_unavailable'
  | 'cod_unavailable'
  | 'online_outstanding'
  /** `payment_wallet_covers_full_amount`: pay with the wallet alone. */
  | 'use_wallet'
  /** `wallet_insufficient_funds`: read the balance again. */
  | 'wallet_short'
  | 'wallet_login'
  | 'forbidden'
  | 'wallet_frozen'
  /** `gateway_unknown`: that gateway left out for the page, the gateways read again. */
  | 'gateway_refresh'
  /** `gateway_amount_not_supported`: that gateway left out at that amount, the gateways read again. */
  | 'gateway_amount'
  /** 502: the bank said no; another gateway or route, no automatic retry. */
  | 'gateway_rejected'
  /** 503: the bank did not answer; later, with a new key. */
  | 'gateway_unavailable'
  /** 503 `gateway_not_configured`/`gateway_result_url_invalid`: no bank route; support. */
  | 'gateway_broken'
  /** 410: a replayed key's handoff expired; a new key, a new intent. */
  | 'token_expired'
  /** The order can no longer be paid (deadline, link): place it again. */
  | 'unpayable'
  /** Nothing is owed online any more. */
  | 'settled'
  /** `order_stock_reservation_failed`: an item sold out meanwhile. */
  | 'stock'
  /** 503 `feature_disabled`: that route's switch is off (`feature`). */
  | 'feature_off'
  | 'throttled'
  | 'session'
  | 'other'

const PROBLEMS: Record<string, IntentProblem> = {
  payment_attempt_open: 'attempt_open',
  payment_attempt_starting: 'starting',
  payment_idempotency_conflict: 'conflict',
  payment_method_disabled: 'method_refresh',
  payment_method_not_found: 'method_refresh',
  payment_method_amount_exceeded: 'amount_exceeded',
  payment_no_active_bank_card: 'card_unavailable',
  payment_cod_not_available: 'cod_unavailable',
  payment_online_charge_outstanding: 'online_outstanding',
  payment_wallet_covers_full_amount: 'use_wallet',
  wallet_insufficient_funds: 'wallet_short',
  payment_wallet_required_authentication: 'wallet_login',
  payment_forbidden: 'forbidden',
  wallet_frozen: 'wallet_frozen',
  gateway_unknown: 'gateway_refresh',
  gateway_amount_not_supported: 'gateway_amount',
  gateway_rejected: 'gateway_rejected',
  gateway_unavailable: 'gateway_unavailable',
  gateway_not_configured: 'gateway_broken',
  gateway_result_url_invalid: 'gateway_broken',
  gateway_token_expired: 'token_expired',
  order_hold_expired: 'unpayable',
  order_payment_link_expired: 'unpayable',
  order_payment_link_invalid: 'unpayable',
  order_not_payable: 'unpayable',
  order_amendment_not_allowed: 'unpayable',
  order_already_settled: 'settled',
  order_collected_on_delivery: 'settled',
  order_stock_reservation_failed: 'stock',
  order_out_of_stock: 'stock',
}

export class IntentError extends Error {
  readonly problem: IntentProblem
  /** The API's Persian detail (or a sentence of ours). */
  readonly detail: string
  readonly openAttempt: OpenAttempt | null
  readonly feature: FeatureKey | null
  readonly retryAfter: number | null

  constructor(problem: IntentProblem, cause: unknown) {
    const api = cause instanceof ApiError ? cause : null
    const detail = api?.detail ?? GENERIC_ERROR_DETAIL
    super(detail, { cause })
    this.name = 'IntentError'
    this.problem = problem
    this.detail = detail
    this.openAttempt = (api?.data.open_attempt as OpenAttempt | undefined) ?? null
    this.feature = api?.feature ?? null
    this.retryAfter = api?.retryAfter ?? null
  }
}

function problemOf(error: unknown): IntentError {
  // First: a session gone is never a branch of its own code.
  if (isSessionExpiredError(error)) return new IntentError('session', error)
  if (!(error instanceof ApiError)) return new IntentError('other', error)
  const known = PROBLEMS[error.code]
  if (known) return new IntentError(known, error)
  if (error.status === 429) return new IntentError('throttled', error)
  if (error.isFeatureDisabled()) return new IntentError('feature_off', error)
  return new IntentError('other', error)
}

/** `payment_attempt_starting`: the click's first request is still being opened. */
export const STARTING_RETRY_MS = 2_000
export const STARTING_RETRIES = 3

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const intentPath = (door: PaymentDoor) =>
  door.kind === 'uuid'
    ? `payment/order/${door.orderUuid}/intent/`
    : `payment/link/${door.token}/intent/`

/**
 * Opens a payment attempt; throws `IntentError` for every refusal. A handoff that leads to no
 * bank's page (`bankUrl`: not https) is the bank not answering (`gateway_unavailable`): the
 * caller saves nothing and goes nowhere.
 */
export async function startPayment(input: StartPaymentInput): Promise<PaymentIntentResult> {
  const body: PaymentIntentRequest = { route: input.route }
  if (input.gatewayCode) body.gateway_code = input.gatewayCode
  for (let attempt = 0; ; attempt++) {
    let intent: PaymentIntent
    try {
      const answer = await bffFetch<PaymentIntent>(intentPath(input.door), {
        method: 'POST',
        idempotencyKey: input.key,
        body,
      })
      intent = answer.data
    } catch (error) {
      const starting = error instanceof ApiError && error.code === 'payment_attempt_starting'
      if (!starting || attempt >= STARTING_RETRIES) throw problemOf(error)
      await sleep(STARTING_RETRY_MS)
      continue
    }
    if (intent.handoff && !bankUrl(intent.handoff.url)) {
      throw new IntentError('gateway_unavailable', new UnsafeHandoffError())
    }
    return intent
  }
}

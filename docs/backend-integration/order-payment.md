# Firefly Core — Order, Payment & Wallet: Storefront Integration Digest

Scope: `docs/order-api.txt` (read in full), the storefront-relevant parts of `docs/order-payment-backend.txt`,
backend code (`order/`, `payment/`, `gateways/`, `wallet/`, `firefly_core/settings.py`), the OpenAPI schema,
and **live calls against the dev server** (2026-10-15). Everything marked **[live]** was observed on
`http://localhost:8000`; **[code]** was read from source; **[doc]** comes from the Persian guide only.

Dev-server test artefacts created (safe to ignore/delete): guest orders `5155098178` (card-transfer receipt
awaiting review), `5381185545` and `7301204983` (cancelled); shirin.tehrani orders `7573331679` (paid by wallet,
processing), `0404614013` (COD w/ online freight paid by wallet, processing), `5182812244` (cancelled); one
withdrawal request (cancelled). Wallet balance of shirin was debited 530,000 by those two orders.

---------------------------------------------------------------------------------------------------------

## 0. TL;DR — the 15 things that will bite you

1. **The bank comes back to the STOREFRONT domain, not the API.** Callback URL =
   `STOREFRONT_URL + /api/v1/payment/gateway/callback/<GATEWAY_CODE>/<callback_token>/` [code:
   `payment/services/intent.py:332-338`]. The Next.js host **must proxy that exact path (GET *and* POST, form body,
   trailing slash preserved) to the Django backend**, otherwise the customer lands on a 404 and — contrary to the
   deployment guide — the payment is **never** booked: the reconciliation cron only re-verifies round trips whose
   browser came back; un-returned ones are expired after 15 min without asking the bank (§11 #15).
2. **The result page path is NOT hard-coded** — it is the admin setting `GatewaySetting.result_url`
   ("آدرس نتیجهٔ پرداخت"), frozen onto each transaction at intent time; host must be in
   `GATEWAY_RESULT_URL_ALLOWED_HOSTS` (default: `SITE_DOMAIN` + host of `STOREFRONT_URL`). Seed value:
   `https://firefly-core.ir/payment/callback/` (fixture), test-suite value `https://firefly-core.ir/pay/result`.
   → Implement **`/payment/callback/`** and have ops set result_url to `${STOREFRONT_URL}/payment/callback/`.
   Query added by backend: `result=success|failed|pending`, `payment=<uuid>` (absent only for unknown token),
   `code=<error code>` (on failed/pending, except unexpected crash). Same page serves order payments **and** wallet
   top-ups.
3. **Payment link page `/order/pay/<token>`** (no trailing slash in the SMS URL) must exist on the storefront
   [code: `order/services/payment_link.py:127`]. It is the guest's only door back to pay/cancel/resume.
4. Never conclude from the redirect params; always `GET /api/v1/payment/<uuid>/status/` (240/h shared budget →
   poll ≥15 s with backoff).
5. **Persist context before redirecting to the bank** (payment uuid → order_code, order uuid or link token, kind).
   The status endpoint does not return the link token, and guests have no history.
6. **Pure pay-on-delivery orders (amount_charged_online == 0) are NOT confirmed by placement.** You must call the
   intent with `route: "pay_on_delivery"` right after placement, or the order sits in `awaiting_payment` and is
   auto-cancelled after 72 h. For such an order `is_payable === false` in list/detail [live-computed] — show a
   "تأیید سفارش" action instead of "پرداخت".
7. `pay_on_delivery` route is only valid when `amount_charged_online === 0`. Any non-zero online share (freight,
   packaging, deposit) must be paid online first (bank/wallet/card); the order then auto-advances to `processing`.
8. Lists (`method/list`, `gateway/list`) are **paginated**: read `data.results`, not `data`.
9. Idempotency-Key: placement (logged-in only way to recognise a retry; ≤64 chars), intents and top-up
   (one key per user click; reuse on double-click/retry of *the same* attempt; new key for a genuine retry).
10. One open online attempt per order. 409 `payment_attempt_open` carries `data.open_attempt` → offer
    "continue" / "abandon" (`POST /payment/<uuid>/cancel/`).
11. Replay of a card-transfer intent (same key) returns `destination_cards: []` [live bug] → always load cards via
    `GET /payment/<uuid>/card-transfer/`.
12. `wallet_and_gateway`: wallet part is *reserved*, not paid, until the bank settles; show "کنار گذاشته شد".
13. Guest receipts: guests can only see `failed` + `failure_reason: payment_receipt_rejected`, never the
    reason text; while the receipt is under review the link page answers 409 `order_not_payable`.
14. Images: some URLs are absolute, some relative (`/static/…`, `/media/…`) → always run through `absUrl()`.
15. Throttles are per-IP for anonymous calls: SSR/BFF calls must forward client IP via a trusted proxy
    (`TRUSTED_PROXY_IPS`), otherwise all guests share e.g. the 240/h `payment_status` and 30/h `payment_attempt`
    budgets.

---------------------------------------------------------------------------------------------------------

## 1. Cross-cutting conventions (as they apply to this scope)

### 1.1 Headers

| Header | When |
|---|---|
| `X-API-Key: <key>` | Every request in production (disabled in dev). Only exception: the bank callback route. Missing → 401 `api_key_missing`, bad → 401 `api_key_invalid`. |
| `Authorization: Bearer <access>` | "logged-in" endpoints. Access token lives 15 min. |
| `X-Cart-Token: <token>` | Guest placement only (and cart calls). **Drop the guest token after login** — sending a stale guest token with a Bearer token merges carts and placement answers 409 `order_cart_changed`. |
| `Idempotency-Key: <≤64 chars>` | Optional on `POST order/place/`, both intent endpoints, `POST wallet/top-up/`. |
| `Content-Type: application/json` | Everything except receipt upload (`multipart/form-data`). |

### 1.2 Envelope [live]
Success: `{ "msg": "<HTTP-status sentence>", "code": <http>, "data": <payload> }`.
Error: `{ "msg": "...", "code": <http>, "data": { "type": "client_error"|"validation_error"|"server_error", "errors": [{ "code", "detail", "attr" }], ...extras } }`.
- Branch on `data.errors[].code`, show `detail` (Persian). `msg` is just the HTTP status sentence — except two
  endpoint-specific msgs: attempt-cancel of a parked capture (§3.2.6) and purchase-review 201.
- Extras live **beside** `type`/`errors` inside `data`: `open_attempt`, `items`, `adjustments`,
  `unknown_statuses/known_statuses`, `unknown_status_groups/known_status_groups`, `feature/feature_name`,
  `retry_after` (429).
- 5xx gateway errors come with `type: "server_error"` [live: `gateway_not_configured`].
- Validation errors: `type: "validation_error"`, `attr` = field name (nested: `receiver.mobile`). Several can come at
  once [live: receipt upload returned 3 field errors together].
- **Unmatched routes** (order code not exactly 10 digits, payment id not a UUID) are rejected by the URL resolver:
  in DEBUG you get Django's **HTML** 404 page [live]; prod uses `handler404 = not_found` (JSON). Validate params
  client-side (`/^\d{10}$/`, UUID regex) before calling.

### 1.3 Identifiers — never mix them

| Id | Shape | Use |
|---|---|---|
| `order_code` | string, exactly 10 digits, may start with `0` (e.g. `0404614013`) [live] — keep as string | URL of order detail/cancel/qr/review, tracking, history filter, shown to customer. |
| order `uuid` | UUID | **Only** for `POST /payment/order/<uuid>/intent/` (logged-in). |
| payment `uuid` | UUID | status / cancel / card-transfer / receipt / history detail. **Bearer credential** — never log/analytics it. |
| payment-link token | 43-char url-safe string | tail of `payment_url`; guest credential for `/order/pay/<t>/…` and `/payment/link/<t>/intent/`. Cutting it out of `payment_url` and using it as an order uuid does not work. |
| `callback_token` | 43 chars | internal to the bank callback path; storefront never handles it. |

### 1.4 Money, time, pagination, images
- All amounts are **integer Toman**. No Rial anywhere in responses. `money.tax_rate` is a decimal string `"10.00"`.
- All datetimes ISO-8601 at `+03:30`; **may contain microseconds** (`2026-10-15T22:52:28.503080+03:30`) [live].
  Date filters take Gregorian `YYYY-MM-DD`, inclusive.
- Paginated envelope (7 keys): `count, total_pages, current_page, page_size, next, previous, results`.
  Query: `?page=` and `?limit=` (default 20, max 100; over-max is capped). Out-of-range page → 404 `not_found`
  ("صفحه نامعتبر") [live]. `next/previous` are absolute **backend** URLs (`http://localhost:8000/…`) — build your own
  pager from `current_page/total_pages/page_size`.
- Image URLs [live]: absolute for order lines / item_preview / awaiting-review products
  (`http://localhost:8000/media/CACHE/…`); **relative** for payment-method `icon`, gateway `logo`/`logo_thumbnail`,
  bank card `bank_logo_thumbnail`, receipt `image_thumbnail` (`/static/defaults/default.png`, `/media/…`). A missing
  image degrades to the default placeholder URL, never null in practice (schema says nullable).
- Strings that are "empty" are `""` not null: `failure_reason`, `instruction`, `rejection_reason`,
  `payout_reference`, `reason`, `settlement_reference`, `card_pan_masked`, manual `terminal_reference`, etc.
  (schema marks `failure_reason` nullable; observed always `""` when nothing failed).

### 1.5 Feature switches that affect this scope
503 `feature_disabled` with `data.feature` ∈ `online_payment | pay_on_delivery | wallet | guest_checkout |
product_comments`, `data.feature_name` (Persian), `detail` = operator's text or default sentence, header
`Retry-After` (default 300 s; advisory; not readable by browser JS cross-origin). Read current state via
`GET /api/v1/global/feature-status/` (settings digest) or from `is_available/reason` on `payment/method/list/`.

| switch | closes |
|---|---|
| `online_payment` | `bank_gateway`, gateway leg of `wallet_and_gateway`, wallet top-up |
| `pay_on_delivery` | `pay_on_delivery` route (and cart COD selection) |
| `wallet` | `wallet`, `wallet_and_gateway`, top-up, withdrawal request (balance/ledger stay readable) |
| `guest_checkout` | guest `POST order/place/` only |
| `product_comments` | `POST order/<code>/review/` (awaiting list stays readable) |
`online_payment` and `pay_on_delivery` can never both be off (panel refuses).

### 1.6 Throttles (scopes) [code: settings.py `DEFAULT_THROTTLE_RATES`]
Counted per user when authenticated, per client IP when anonymous (IP from `X-Forwarded-For` **only** if the peer is
in `TRUSTED_PROXY_IPS`; otherwise the TCP peer = your Next.js server). 429 → `code: "throttled"`,
`data.retry_after` (seconds, >0) + `Retry-After` header.

| scope | rate | endpoints |
|---|---|---|
| `order_place` | 10/min | POST order/place/ |
| `order_tracking` | 20/min | POST order/track/ |
| `order_payment_link` | 30/min | GET order/pay/<t>/, POST order/pay/<t>/cancel/ |
| `payment_attempt` | 30/hour | both intent endpoints + POST payment/<uuid>/cancel/ (shared) |
| `payment_status` | 240/hour | payment/<uuid>/status/, payment/<uuid>/card-transfer/, payment/method/list/, payment/gateway/list/ (shared!) |
| `payment_receipt_upload` | 10/hour | receipt upload |
| `wallet_top_up` | 10/min | POST wallet/top-up/ |
| `wallet_withdrawal` | 5/hour, success-only | POST wallet/withdrawal/request/ |
| `wallet_withdrawal_cancel` | 20/hour | POST wallet/withdrawal/<uuid>/cancel/ |
| `purchase_review_submit` | 30/hour, success-only | POST order/<code>/review/ |
| `anon` / `user` | 2000/h / 5000/h | everything else |
| (none) | — | bank callback is never throttled |
→ Cache `method/list` and `gateway/list` server-side (e.g. 60 s revalidate) so they don't eat the 240/h budget.

---------------------------------------------------------------------------------------------------------

## 2. TypeScript types (verified against schema components + live payloads)

```ts
// ===== envelope =====
export interface ApiSuccess<T> { msg: string; code: number; data: T }
export interface ApiErrorEntry { code: string; detail: string; attr: string | null }
export interface ApiErrorData {
  type: 'client_error' | 'validation_error' | 'server_error';
  errors: ApiErrorEntry[];
  open_attempt?: OpenAttempt;                       // only with payment_attempt_open
  items?: OrderItemUnavailable[];                   // only with order_item_unavailable
  adjustments?: CartAdjustment[];                   // only with order_cart_changed
  unknown_statuses?: string[]; known_statuses?: OrderStatus[];                 // order_status_filter_unknown
  unknown_status_groups?: string[]; known_status_groups?: OrderStatusGroup[];  // order_status_group_filter_unknown
  feature?: 'online_payment' | 'pay_on_delivery' | 'wallet' | 'guest_checkout' | 'product_comments' | string;
  feature_name?: string;                            // feature_disabled
  retry_after?: number;                             // throttled
}
export interface ApiError { msg: string; code: number; data: ApiErrorData }
export interface Paginated<T> {
  count: number; total_pages: number; current_page: number; page_size: number;
  next: string | null; previous: string | null; results: T[];
}
export type ISODateTime = string;  // "+03:30", may include microseconds
export type Toman = number;        // integer

// ===== enums (treat unknown values gracefully) =====
export type OrderStatus = 'awaiting_payment' | 'awaiting_review' | 'processing' | 'packing'
  | 'sent' | 'delivered' | 'cancelled' | 'returned';
export type OrderStatusGroup = 'awaiting_payment' | 'in_progress' | 'delivered' | 'returned' | 'cancelled';
export type OrderChannel = 'website' | 'social_media' | 'store';
export type ProgressStepState = 'completed' | 'current' | 'upcoming';
export type ReviewState = 'reviewed' | 'awaiting' | 'unavailable';
export type CouponDiscountType = 'percentage' | 'fixed_amount' | 'free_shipping';
export type PaymentRoute = 'bank_gateway' | 'wallet' | 'wallet_and_gateway' | 'card_transfer' | 'pay_on_delivery';
export type PaymentMethodName = 'bank_gateway' | 'wallet' | 'card_transfer' | 'pay_on_delivery'
  | 'pos' | 'cash' | 'manual_transfer';                         // "method" = instrument actually used
export type PaymentStatus = 'pending' | 'awaiting_review' | 'settled' | 'failed' | 'cancelled' | 'refunded';
export type PaymentAppliesTo = 'online_charge' | 'delivery_collection' | 'wallet_topup' | 'refund_out';
export type GatewayCode = 'ASANPARDAKHT' | 'BAHAMTA' | 'BMI' | 'IDPAY' | 'IRANDARGAH' | 'MELLAT' | 'SEP'
  | 'ZARINPAL' | 'ZIBAL';
export type ReceiptStatus = 'awaiting_review' | 'approved' | 'rejected';
export type ReceiptRejectionCode = 'amount_mismatch' | 'image_unreadable' | 'not_in_statement' | 'duplicate' | 'other';
export type WalletDirection = 'credit' | 'debit';
export type WalletCause = 'top_up' | 'order_payment' | 'order_payment_reversal' | 'refund' | 'amendment_credit'
  | 'withdrawal' | 'withdrawal_reversal' | 'admin_adjustment';
export type WithdrawalStatus = 'requested' | 'approved' | 'rejected' | 'paid' | 'cancelled';
// failure_reason values a payment can carry (not errors; stored on the row):
export type FailureReason = '' | 'payment_attempt_expired' | 'payment_attempt_abandoned'
  | 'payment_attempt_order_cancelled' | 'payment_receipt_rejected' | 'gateway_rejected'
  | 'gateway_capture_not_bookable' | 'gateway_unavailable' | 'payment_delivery_collection_voided' | string;

// ===== order placement =====
export interface OrderReceiverInput {
  first_name: string;            // ≤200
  last_name: string;             // ≤200
  mobile: string;                // Iranian mobile 09xx… or +989xx… ; landline/foreign → invalid_iranian_mobile
  email?: string;
  address: string;               // ≤1000, without plaque/unit
  plaque?: string;               // ≤20, Persian digits normalised
  unit?: string;                 // ≤20
  postal_code: string;           // 10 digits; "12345-67890" and Persian digits accepted
  latitude?: number | null;      // -90..90
  longitude?: number | null;     // -180..180
}
export interface OrderPlacementInput {
  receiver?: OrderReceiverInput;  // REQUIRED when cart has no saved address (all guests); FORBIDDEN when it has one
  customer_mobile?: string;       // buyer's own number (gift); only read together with receiver
  customer_note?: string;         // ≤1000
  expected_total?: number;        // integer ≥0; mismatch → 409 order_total_changed
}
export interface OrderPlacementResult {
  uuid: string;
  order_code: string;
  status: OrderStatus;                 // always 'awaiting_payment' on 201
  status_display: string;
  placed_at: ISODateTime;
  item_count: number;
  total: Toman;
  amount_charged_online: Toman;        // includes prepayment
  amount_to_collect_on_delivery: Toman;
  prepayment: Toman;                   // already inside amount_charged_online — never add it again
  requires_online_payment: boolean;    // === amount_charged_online > 0
  payment_url: string | null;          // `${STOREFRONT_URL}/order/pay/<token>`; null only after cancellation
  payment_expires_at: ISODateTime | null; // default placed_at + 72h
}
export interface OrderItemUnavailable {   // data.items of order_item_unavailable
  variant_id: number; product_name: string;
  issue: 'unavailable' | 'insufficient_stock' | 'above_order_limit' | 'below_order_limit' | string;
  available_quantity: number;
}
export interface CartAdjustment {         // data.adjustments of order_cart_changed (cart serializer)
  variant_id: number; product_name: string; requested: number; applied: number; was_dropped: boolean;
}

// ===== order list / detail =====
export interface ProgressStep { status: OrderStatus; label: string; state: ProgressStepState; reached_at: ISODateTime | null }
export interface Progress { is_terminal: boolean; steps: ProgressStep[] }
export interface OrderLinePreview { product_name: string; variant_name: string | null; image: string | null }
export interface OrderSummaryBase {
  uuid: string;
  order_code: string;
  status: OrderStatus;
  status_display: string;              // delivered → «تکمیل شده», returned → «مسترد شده»
  status_group: OrderStatusGroup;
  progress: Progress;
  address_summary: string;             // "province، city، address" (no plaque/unit/postal code)
  placed_at: ISODateTime;
  paid_at: ISODateTime | null;         // online money fully arrived; null for confirmed pure-COD
  is_confirmed: boolean;               // status ∈ processing|packing|sent|delivered
  is_fully_paid: boolean;              // online AND door collected (see §11 for amendment caveat)
  total: Toman;
  item_count: number;
  shipping_method_title: string;
  postal_tracking_code: string | null;
  is_payable: boolean;                 // owes online money now (does NOT check deadline)
  payment_url: string | null;          // present until cancelled, even after payment/expiry
  can_cancel: boolean;                 // status === awaiting_payment
}
export interface OrderListItem extends OrderSummaryBase { item_preview: OrderLinePreview[] } // ≤3 lines
export interface OrderMilestones {
  confirmed_at: ISODateTime | null; packed_at: ISODateTime | null; dispatched_at: ISODateTime | null;
  delivered_at: ISODateTime | null; cancelled_at: ISODateTime | null; returned_at: ISODateTime | null;
}
export interface OrderMoney {
  goods_subtotal: Toman; item_discount: Toman; goods_total: Toman; coupon_discount: Toman; goods_payable: Toman;
  shipping_cost: Toman; packaging_cost: Toman; shipping_discount: Toman;  // >0 only from a free_shipping coupon
  tax_rate: string;      // "10.00"
  tax_amount: Toman; cod_fee: Toman; total: Toman; total_savings: Toman;
  prepayment: Toman; amount_charged_online: Toman; amount_to_collect_on_delivery: Toman;
  amount_settled_online: Toman; amount_settled_on_delivery: Toman;
  amount_outstanding_online: Toman;     // what the pay button charges (incl. amendment delta); not zeroed on cancel
}
export interface OrderCoupon {          // always present; all null when no coupon
  code: string | null; title: string | null; discount_type: CouponDiscountType | null; max_discount_amount: Toman | null;
}
export interface OrderDestination {
  receiver_full_name: string; receiver_mobile: string;  // E.164 "+989121234501" [live]
  receiver_email: string | null; province_name: string; city_name: string; address: string;
  plaque: string | null; unit: string | null;           // may contain Persian digits (saved-address orders) [live]
  postal_code: string | null;
  latitude: string | null; longitude: string | null;    // "35.756400" — strings!
}
export interface OrderLine {
  product_name: string; variant_name: string | null; sku: string | null; brand_name: string | null;
  unit_name: string | null; product_slug: string | null;  // null when the variant was deleted
  image: string | null; quantity: number;
  unit_price: Toman; unit_discount: Toman; unit_final_price: Toman;
  line_subtotal: Toman; line_discount: Toman; line_total: Toman;
  weight_grams: number | null; review_state: ReviewState;
}
export interface OrderTimelineEntry { to_status: OrderStatus; to_status_display: string; created: ISODateTime }
export interface OrderDetail extends OrderSummaryBase {
  channel: OrderChannel;
  customer_note: string | null;
  delivery_min_days: number | null; delivery_max_days: number | null;  // business days
  freight_paid_by_recipient: boolean;   // پس‌کرایه
  cash_on_delivery: boolean;            // COD order
  milestones: OrderMilestones;
  money: OrderMoney;
  coupon: OrderCoupon;
  receiver: OrderDestination;
  lines: OrderLine[];
  timeline: OrderTimelineEntry[];       // oldest→newest; includes receipt-rejection & corrections
}
// NOTE: detail has NO item_preview, NO payment deadline, NO payments (use payment/history?order_code=)

export interface OrderQRCode { order_code: string; encoded_value: string; content_type: 'image/png'; qr_code: string /* data:image/png;base64,… */ }
export interface OrderCancelInput { reason?: string } // ≤500; operator-only visibility

export interface OrderTrackingInput { mobile_number: string; order_code: string } // buyer's or receiver's mobile
export interface OrderTrackingResult {
  order_code: string; status: OrderStatus; status_display: string; placed_at: ISODateTime;
  paid_at: ISODateTime | null; packed_at: ISODateTime | null; dispatched_at: ISODateTime | null;
  delivered_at: ISODateTime | null; cancelled_at: ISODateTime | null; returned_at: ISODateTime | null;
  postal_tracking_code: string | null; item_count: number; total: Toman;
}

// ===== payment link page =====
export interface OrderPaymentLink {
  order_code: string; status: OrderStatus; status_display: string; placed_at: ISODateTime;
  item_count: number; total: Toman; prepayment: Toman;
  amount_charged_online: Toman; amount_to_collect_on_delivery: Toman;
  amount_settled_online: Toman; amount_outstanding_online: Toman;
  is_payable: boolean; can_cancel: boolean;
  expires_at: ISODateTime | null;       // == payment_expires_at; null after cancel
  open_attempt: OpenAttempt | null;
}

// ===== reviews =====
export interface AwaitingReviewProduct { id: number; name: string; slug: string; image: string; has_other_review: boolean }
export interface AwaitingReviewOrder { order_code: string; placed_at: ISODateTime; delivered_at: ISODateTime | null; products: AwaitingReviewProduct[] }
export interface PurchaseReviewInput {
  product_id: number; rating: 1 | 2 | 3 | 4 | 5; review: string;   // review ≤4096, non-blank
  title?: string | null;                                             // ≤255
  positive_points?: string[]; negative_points?: string[];            // ≤10 each, each ≤255, de-duplicated
}

// ===== payment catalogue =====
export interface PaymentMethodOption {
  route: PaymentRoute; label: string; description: string;
  instruction: string;                 // sanitised HTML or ""
  icon: string;                        // URL, maybe relative; default placeholder when none
  max_amount: Toman | null;
  requires_authentication: boolean;    // true for wallet & wallet_and_gateway today
  display_order: number;
  is_available: boolean; reason: string | null;   // feature-switch closed → false + Persian reason
}
export interface GatewayOption {
  code: GatewayCode; title: string; logo: string | null; logo_thumbnail: string | null;
  is_default: boolean; minimum_amount: Toman; maximum_amount: Toman | null;   // null = no ceiling
}
export interface BankCard {
  id: number; holder_name: string; bank_name: string; bank_logo_thumbnail: string | null;
  card_number: string;  // "6104-3378-1234-5678"
  sheba: string; account_number: string;
}

// ===== intents =====
export interface PaymentIntentInput { route: PaymentRoute | string /* case-insensitive, trimmed */; gateway_code?: GatewayCode | '' }
export interface PaymentStatusInfo {   // GET payment/<uuid>/status/ and nested objects
  uuid: string; applies_to: PaymentAppliesTo; method: PaymentMethodName; status: PaymentStatus;
  amount: Toman; order_code: string | null;        // null for wallet top-up
  failure_reason: FailureReason;                   // "" while nothing failed
  settled_at: ISODateTime | null;
}
export interface RedirectPayload {
  gateway_code: GatewayCode; gateway_title: string;
  url: string;                       // https
  method: 'GET' | 'POST';
  params: Record<string, string>;    // GET → append as query; POST → auto-submitted form fields
  expires_at: ISODateTime | null;    // handoff lifetime (default 15 min)
}
export interface PaymentIntent {
  payment: PaymentStatusInfo | null;   // null only: free order confirmed via pay_on_delivery
  status: PaymentStatus | null;        // mirrors payment.status
  handoff: RedirectPayload | null;     // bank_gateway / wallet_and_gateway / top-up
  destination_cards: BankCard[];       // card_transfer only; [] otherwise (and [] on key replay!)
  delivery_collection: PaymentStatusInfo | null; // door-share row (see §11 for wallet caveat)
}
export interface OpenAttempt {
  payment: string;                     // payment uuid
  method: 'bank_gateway' | 'card_transfer' | PaymentMethodName;   // bank_gateway also for wallet+gateway pair
  status: 'pending' | 'awaiting_review' | PaymentStatus;
  amount: Toman;
  expires_at: ISODateTime | null;      // null = bank answered, verification in progress
  handoff: RedirectPayload | null;     // only while still valid
  destination_cards: BankCard[];
}

// ===== card transfer =====
export interface CardTransferInstruction {
  amount: Toman; instruction: string /* sanitised HTML or "" */; destination_cards: BankCard[];
  expires_at: ISODateTime | null;      // ORDER payment deadline, not the attempt's (use open_attempt.expires_at)
}
// multipart/form-data fields:
// image: File (JPEG/PNG/WEBP, ≤5 MiB, ≥300×300, ≤6000 per side, ≤40 MP)
// payer_name: string ≤200; payer_card_last_digits: exactly 4 digits (Persian/Arabic ok)
// paid_at: ISO datetime, not in future (+5 min skew); destination_card: BankCard.id; bank_reference?: string ≤100
export interface CardTransferReceipt {
  uuid: string; status: ReceiptStatus; paid_at: ISODateTime; image_thumbnail: string | null; // relative URL
  rejection_reason_code: ReceiptRejectionCode | null; rejection_reason: string /* "" until rejected */;
  reviewed_at: ISODateTime | null;
}

// ===== history =====
export interface PaymentReceipt {     // bank receipt of a captured+booked card payment
  gateway_title: string; tracking_code: string /* digits, keep leading zeros */;
  settlement_reference: string; card_pan_masked: string /* "6087****9827" */;
}
export interface ManualPayment { terminal_reference: string; card_last_digits: string; payout_reference: string; received_at: ISODateTime }
export interface PaymentHistoryItem {
  uuid: string; method: PaymentMethodName; method_display: string; status: PaymentStatus; status_display: string;
  applies_to: PaymentAppliesTo; applies_to_display: string; amount: Toman;
  order_code: string | null; settled_at: ISODateTime | null; created: ISODateTime;
  receipt: PaymentReceipt | null;
}
export interface PaymentHistoryDetail extends PaymentHistoryItem {
  failure_reason: FailureReason; card_transfer_receipt: CardTransferReceipt | null; manual_payment: ManualPayment | null;
}

// ===== wallet =====
export interface WalletBalance {
  balance: Toman; is_frozen: boolean; freeze_message: string | null;   // non-empty plain text iff frozen
  is_top_up_enabled: boolean; minimum_top_up_amount: Toman; maximum_top_up_amount: Toman;
  daily_top_up_limit: Toman; remaining_daily_top_up: Toman;
  is_withdrawal_enabled: boolean; minimum_withdrawal_amount: Toman; withdrawal_processing_days: number;
  pending_withdrawal_amount: Toman;    // already deducted from balance
}
export interface WalletTransaction {
  created: ISODateTime; direction: WalletDirection; direction_display: string;
  cause: WalletCause; cause_display: string; amount: Toman /* always positive */; balance_after: Toman;
  reason: string; order_code: string | null; payment_uuid: string | null; withdrawal_uuid: string | null;
}
export interface WalletTopUpInput { amount: number /* ≥1 */; gateway_code?: GatewayCode | '' }
export interface WithdrawalInput {
  amount: number;                       // ≥1, ≥ minimum_withdrawal_amount, ≤ balance
  account_holder_name: string;          // ≤120
  iban: string;                         // "IR" + 24 digits; spaces/dashes/Persian digits stripped
  card_number?: string;                 // optional, 16 digits Luhn-valid; cross-check only
}
export interface WithdrawalRequest {
  uuid: string; amount: Toman; status: WithdrawalStatus; status_display: string;
  account_holder_name: string; iban: string /* normalised 26 chars */; card_number: string /* 16 digits or "" */;
  bank_name: string /* derived from IBAN; "" if unknown */; rejection_reason: string;
  reviewed_at: ISODateTime | null; paid_at: ISODateTime | null; payout_reference: string; created: ISODateTime;
}
```

### 2.1 Persian labels (server provides `*_display`; use these for tabs/badges only where no display field exists)
- Order status (`status_display`): awaiting_payment «در انتظار پرداخت», awaiting_review «در انتظار بررسی», processing
  «در حال انجام», packing «بسته‌بندی», sent «ارسال شده», delivered «تکمیل شده», cancelled «لغو شده», returned «مسترد شده».
- Status group (tab labels — NOT returned by the API, hard-code from doc): awaiting_payment «در انتظار پرداخت»,
  in_progress «جاری», delivered «تحویل داده شده», returned «مرجوعی», cancelled «لغو شده». Tab order as listed.
- Route `label`: bank_gateway «درگاه بانکی», wallet «کیف پول», wallet_and_gateway «کیف پول و درگاه بانکی»,
  card_transfer «کارت به کارت», pay_on_delivery «پرداخت در محل».
- Payment `method_display`: + pos «کارتخوان», cash «نقدی», manual_transfer «انتقال دستی».
- Payment `status_display`: pending «در انتظار پرداخت», awaiting_review «در انتظار بررسی», settled «تسویه شده»,
  failed «ناموفق», cancelled «لغو شده», refunded «بازگردانده شده».
- `applies_to_display`: online_charge «پرداخت آنلاین سفارش», delivery_collection «دریافت در محل», wallet_topup
  «شارژ کیف پول», refund_out «عودت وجه».
- Receipt status (no display field!): awaiting_review «در انتظار بررسی», approved «تأیید شده», rejected «رد شده».
  Rejection codes: amount_mismatch «مغایرت مبلغ», image_unreadable «تصویر ناخوانا», not_in_statement «در صورت‌حساب
  بانکی یافت نشد», duplicate «رسید تکراری», other «سایر» (+ free text `rejection_reason`).
- Wallet `direction_display`: credit «واریز», debit «برداشت». `cause_display`: top_up «شارژ از درگاه», order_payment
  «پرداخت سفارش», order_payment_reversal «برگشت پرداخت سفارش», refund «بازگشت وجه», amendment_credit «اعتبار اصلاحیه
  سفارش», withdrawal «برداشت به حساب بانکی», withdrawal_reversal «برگشت درخواست برداشت», admin_adjustment «اصلاح دستی».
- Withdrawal `status_display`: requested «در انتظار بررسی», approved «تأیید شده», rejected «رد شده», paid «پرداخت شده»,
  cancelled «لغو شده».

---------------------------------------------------------------------------------------------------------

## 3. Endpoint reference (27 routes; base `/api/v1/`)

Legend: **Auth** `public` = AllowAny (credential may be a token in the URL), `user` = Bearer required (401
`not_authenticated` otherwise). "404 not_found" on owner-scoped routes = "not yours or doesn't exist" (identical).

### 3.1 Order

#### 3.1.1 `POST /api/v1/order/place/` — place order from current cart
- Auth: public (guest needs `X-Cart-Token`; logged-in uses account cart). Throttle `order_place` 10/min.
- Headers: `X-Cart-Token` (guest), `Idempotency-Key` (optional, ≤64 chars, trimmed; >64 → 400
  `order_idempotency_key_invalid`).
- Body: `OrderPlacementInput`. There is **no** payment method / shipping / coupon / amount in the body — all come from
  the cart (COD is chosen in the cart via `cart/shipping/select/ {cash_on_delivery:true}`).
- 201 → `OrderPlacementResult` (new). **200 → same shape = replay of an already-placed order** (only way to tell).
  Replay rules [code `order/views.py`]:
  - logged-in: the `Idempotency-Key` is looked up **first**, scoped to the account; a key that already created an
    order returns that order (200) even if you now have a live cart → never reuse a key for the next purchase.
  - guest: the cart token is looked up only when no live cart is behind the request (placement closes the cart).
    [live] replaying with the same token after success → 200 same order; `GET /cart/` with that token now returns
    an empty cart with `token: ""`.
  - no key + logged-in + no cart → 404 `cart_not_found` [live].
- Side effects: freezes prices; reserves stock for the **short window** (`reservation_ttl_minutes`, default 30 min) —
  not until the payment deadline; reserves coupon slot; closes cart; sends SMS `order_awaiting_payment` with
  payment link (also for pure COD). Payment deadline `payment_expires_at` = now + 72 h (default).
- Errors (in check order roughly): 503 `feature_disabled` (feature=`guest_checkout`, guest only → send to login);
  400 validation (`receiver.*`, e.g. `invalid_iranian_mobile`, postal code `invalid`); 400 `order_idempotency_key_invalid`;
  404 `cart_not_found`; 409 `order_cart_changed` (+`data.adjustments`); 409 `order_cart_empty`;
  409 `order_destination_required`; 409 `order_shipping_method_required`; 409 `order_shipping_method_unavailable`;
  400 `order_receiver_required`; 400 `order_receiver_forbidden` [live]; 409 `order_coupon_no_longer_valid`;
  400 `coupon_usage_limit_reached` / `coupon_user_limit_reached` (race); 409 `order_item_unavailable` (+`data.items`);
  409 `order_out_of_stock`; 409 `order_unpaid_limit_reached` (default max 3 unpaid = awaiting_payment+awaiting_review
  per buyer mobile; show `detail` verbatim — 3 variants); 409 `order_stock_reservation_failed`;
  409 `order_total_changed` [live]; 500 `order_money_snapshot_invalid`; 500 `order_code_unavailable` (retry).
- Notes: wholesale prices (`major_price`) never apply. Guest orders are never attached to an account created later.
  Logged-in with saved address: send `{}` (+ optional note/expected_total); `customer_mobile` is ignored without a
  receiver block.

#### 3.1.2 `GET /api/v1/order/list/` — my orders
- Auth: user. Paginated `Paginated<OrderListItem>`; default sort newest first.
- Query (all optional):
  - `status` (repeatable names; unknown → 400 `order_status_filter_unknown` + `data.unknown_statuses/known_statuses`
    [live]; blank values ignored)
  - `status_group` (repeatable: awaiting_payment|in_progress|delivered|returned|cancelled; unknown (even a status
    name like `sent`) → 400 `order_status_group_filter_unknown` + lists [live]); AND-ed with `status`
  - `is_confirmed` (true/false), `placed_after`, `placed_before` (YYYY-MM-DD inclusive), `min_total`, `max_total`,
    `has_postal_tracking_code` (true/false), `search` (order-code prefix | full postal tracking code | words of a line's
    product name; Persian digits ok), `sort` = `date-desc` (default) | `date-asc` | `total-desc` | `total-asc`
    (other → 400 validation `invalid_choice` attr `sort` [live]), `page`, `limit`.

#### 3.1.3 `GET /api/v1/order/<order_code>/` — order detail
- Auth: user (owner-scoped; 404 `not_found` otherwise). → `OrderDetail` [live shape matches §2].

#### 3.1.4 `POST /api/v1/order/<order_code>/cancel/` — customer cancel
- Auth: user. Body `{ reason?: string ≤500 }` (operator-only; not in timeline). → 200 full `OrderDetail` with
  `status:'cancelled'`, `payment_url:null`, `can_cancel:false` [live].
- Allowed only in `awaiting_payment` (`can_cancel`). Errors: 409 `order_already_cancelled` [live],
  409 `order_receipt_pending` (receipt under review), 409 `order_cancellation_not_allowed` [live on processing order],
  404 `not_found`.
- Effects: releases stock hold + coupon, revokes link, closes open attempts not yet at the bank
  (`payment_attempt_order_cancelled`), wallet leg of a combined attempt refunded to wallet automatically, SMS
  `order_cancelled`. An attempt already at the bank returns later as `gateway_capture_not_bookable` (bank auto-refunds).
  Money already settled is **not** auto-refunded (operator action) → copy: «درخواست بازگشت وجه ثبت شد و پشتیبانی آن را
  انجام می‌دهد», never "refunded within minutes".

#### 3.1.5 `GET /api/v1/order/<order_code>/qr-code/`
- Auth: user. → `OrderQRCode`; encodes the bare order code (not a URL) [live].

#### 3.1.6 `GET /api/v1/order/review/awaiting/list/` — purchases awaiting review
- Auth: user. Paginated `Paginated<AwaitingReviewOrder>`; newest delivery first, `delivered_at:null` last. Only
  delivered orders with ≥1 published, not-yet-reviewed product. One entry per product per order (variants merged).
- Not gated by `product_comments` (only submission is).

#### 3.1.7 `POST /api/v1/order/<order_code>/review/` — review one product of a delivered order
- Auth: user. Throttle `purchase_review_submit` 30/h (success-only). Feature `product_comments`.
- Body `PurchaseReviewInput` (rating required 1-5). Unknown fields (e.g. `is_verified_buyer`) ignored.
- 201 `{ msg: "نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.", code: 201, data: {} }` [doc].
- Errors (order): 400 validation (`rating` max_value, `review` blank [live]); 401; 404 `not_found` (not your order
  [live]); 404 `order_review_product_not_in_order` [live]; 409 `order_review_not_eligible` (not delivered / unpublished);
  409 `order_review_already_submitted` (one review per order+product, forever, even if withdrawn/rejected);
  503 `feature_disabled` (`product_comments`); 429.
- Review enters moderation; gets "verified buyer" badge immediately; also closes the purchase in the awaiting list.

#### 3.1.8 `POST /api/v1/order/track/` — guest tracking
- Auth: public. Throttle `order_tracking` 20/min per IP → no per-keystroke calls.
- Body `{ mobile_number, order_code }`: mobile = buyer's or receiver's (Persian digits / +98 ok); code exactly 10
  digits (Persian ok) [live]. Bad shapes → 400 validation (`mobile_number` invalid, `order_code` `invalid_code`) [live].
- 200 `OrderTrackingResult` (no address/name/items, by design). Miss (wrong pair or nonexistent) → 404
  `order_tracking_not_found` [live].
- Works for logged-in users too. Guest orders: only this + the payment link exist (no list, no detail).

#### 3.1.9 `GET /api/v1/order/pay/<token>/` — payment-link page data
- Auth: public (token). Throttle `order_payment_link` 30/min. → `OrderPaymentLink` [live]. Pure read, opens nothing.
- Refusals in this order [code `resolve_payment_link`]: 404 `order_payment_link_invalid` (unknown/malformed token, or
  cancelled order — token revoked) → 410 `order_payment_link_expired` (deadline passed — **checked before "already
  paid"**, so an old paid order's link also says expired [live]) → opens if status `awaiting_payment` and
  (online not fully settled OR amount_charged_online==0 [pure COD confirm]) or an amendment top-up is pending →
  else 409 `order_already_settled` | `order_collected_on_delivery` | `order_not_payable` (incl. receipt under review [live]).

#### 3.1.10 `POST /api/v1/order/pay/<token>/cancel/` — guest cancel via link
- Auth: public (token). Throttle `order_payment_link`. Body `{ reason? }`.
- 200 → `OrderPaymentLink` with `status:'cancelled'`, `is_payable:false`, `can_cancel:false`, `expires_at:null`,
  `open_attempt:null` (note `amount_outstanding_online` keeps its value) [live].
- Errors: same link refusals first (404/410/409 above; receipt-under-review → `order_not_payable`, never
  `order_receipt_pending`), then 409 `order_cancellation_not_allowed`. Second call → 404 `order_payment_link_invalid` [live].

### 3.2 Payment

#### 3.2.1 `GET /api/v1/payment/method/list/`
- Auth: public. Throttle `payment_status` (shared 240/h). Paginated `Paginated<PaymentMethodOption>` sorted by
  `display_order` [live: 5 routes; COD max 20,000,000; card_transfer max 50,000,000].
- Routes switched off by a feature switch are present with `is_available:false` + `reason`; routes the operator
  disabled in the route settings are absent.

#### 3.2.2 `GET /api/v1/payment/gateway/list/`
- Auth: public. Throttle `payment_status`. Paginated `Paginated<GatewayOption>` [live: ZARINPAL (default, min 10,000),
  ZIBAL (min 10,000, max 500,000,000)]. Effective floor = max(minimum_amount, 1,000 Toman adapter floor).
- If only one gateway → don't show a chooser; omit `gateway_code` (server picks default, then first usable).
- Caveat: list filters by `is_active` only; a listed gateway with unreadable/missing credentials is refused at intent
  time (`gateway_unknown` if named, `gateway_not_configured` if defaulted) [live in dev] — see §11.

#### 3.2.3 `POST /api/v1/payment/order/<order_uuid>/intent/` — open attempt (logged-in owner)
- Auth: user (owner-scoped via queryset; other's/unknown uuid → 404 `not_found` [live]). Throttle `payment_attempt`
  30/h (shared with link intent and cancel). Header `Idempotency-Key` optional.
- Body `PaymentIntentInput`. `route` outside the 5 → 400 validation `invalid_choice` attr `route` [live];
  `gateway_code` read only for bank_gateway / wallet_and_gateway.
- **Always 201** (also when an open attempt is replayed by key) → `PaymentIntent`. Per route:
  | route | response | order effect |
  |---|---|---|
  | bank_gateway | `payment` pending (method bank_gateway), `handoff`, `delivery_collection` if door share | stays awaiting_payment until bank settles |
  | wallet | `payment` **settled** immediately [live], no handoff | → processing at once (SMS payment_succeeded) |
  | wallet_and_gateway | `payment` = **gateway leg** (pending) + `handoff`; wallet leg (pending) is debited now and not shown | → processing when bank settles both legs |
  | card_transfer | `payment` pending (method card_transfer), `destination_cards` [live] | awaiting_review after receipt upload |
  | pay_on_delivery | `payment` = delivery_collection row (pending, method pay_on_delivery) or `null` (free order); `delivery_collection` same | → processing immediately (no paid_at, no "paid" SMS) |
- Server-side order of checks [code `payment/services/intent.py`]: feature switch(es) of the route → lock order →
  route setting exists (404 `payment_method_not_found`) / enabled (409 `payment_method_disabled`) → close this order's
  stale attempts → payability (409 `order_already_settled` | `order_collected_on_delivery` | `order_not_payable`;
  pay_on_delivery is allowed for awaiting_payment+online==0) → amendment applicable (409 `order_amendment_not_allowed`
  / `order_out_of_stock`) → deadline (409 `order_hold_expired`) → route ceiling `max_amount` vs amount_charged_online
  (or amount_to_collect for COD) (409 `payment_method_amount_exceeded`) → wallet routes need auth (403
  `payment_wallet_required_authentication`) and ownership (403 `payment_forbidden`) → re-take stock hold (409
  `order_stock_reservation_failed`) → idempotent replay (open → same attempt 201; finished → 409
  `payment_idempotency_conflict`) → one-open-attempt rule (409 `payment_attempt_open` + `data.open_attempt` [live]) →
  route-specific: COD (409 `payment_cod_not_available` [live], 409 `payment_online_charge_outstanding` [live]),
  wallet (403 `wallet_frozen`, 409 `wallet_insufficient_funds`), combined (409 `wallet_insufficient_funds` when balance 0,
  409 `payment_wallet_covers_full_amount` when balance ≥ owed [live]), card (409 `payment_no_active_bank_card`), gateway
  (400 `gateway_unknown` [live], 503 `gateway_not_configured` [live], 400 `gateway_amount_not_supported`,
  503 `gateway_result_url_invalid`) → bank token request after commit (503 `gateway_unavailable` → attempt failed;
  502 `gateway_rejected` → attempt failed; 409 `payment_attempt_starting` for a double-click racing the first;
  410 `gateway_token_expired` replaying a key whose handoff expired).
- Idempotency: server key = sha256(order uuid | route | outstanding amount | client key). Same client key with another
  route or after the outstanding amount changed = a new request. No key = always a new attempt.
- Holds: bank/wallet/combined re-take a 30-min hold from now; card_transfer/COD hold until the payment deadline.

#### 3.2.4 `POST /api/v1/payment/link/<token>/intent/` — open attempt via payment link (guest or anyone)
- Auth: public (token); Bearer optional. Same body/response/errors as 3.2.3, plus link refusals:
  404 `order_payment_link_invalid`, 410 `order_payment_link_expired` (instead of `order_hold_expired`).
- Guest + wallet routes → 403 `payment_wallet_required_authentication` [live]. Logged-in caller may use own wallet on
  own order or on a guest order, not on another account's order (403 `payment_forbidden`). Non-wallet routes have no
  ownership check (anyone with the link can pay).

#### 3.2.5 `GET /api/v1/payment/<payment_uuid>/status/` — poll one payment
- Auth: public (uuid is the credential). Throttle `payment_status` 240/h shared. → `PaymentStatusInfo` [live].
  Works for any purpose (order charge, door collection, top-up). **Does not include the receipt** (card transfer).
- Errors: 404 `payment_not_found` [live]; 403 `payment_forbidden` when a *signed-in* caller asks for another account's
  payment — an **anonymous** request for the same uuid gets 200 [live] (see §11).

#### 3.2.6 `POST /api/v1/payment/<payment_uuid>/cancel/` — abandon an attempt
- Auth: public (uuid). Throttle `payment_attempt`. No body. → 200 `PaymentStatusInfo` with `status:'cancelled'`,
  `failure_reason:'payment_attempt_abandoned'` [live]. Already-finished attempts: 200 with current state (idempotent) [live].
- Combined attempt cancelled as a whole; wallet leg refunded (`order_payment_reversal` ledger row).
- Parked capture (bank took money, shop could not book): still 200 but `msg` = «این تلاش بسته شد. مبلغی که بانک برای آن
  برداشته روی سفارش ثبت نشده و فروشگاه آن را پیگیری می‌کند.» → show that, not "pay again".
- Cancelling an attempt the bank hasn't answered **sends the customer a "payment failed" SMS** with the link — explain
  this on screen when the user is merely switching method.
- Errors: 400 `payment_target_invalid` (not an order online charge — e.g. delivery_collection [live] or top-up uuid [code]);
  409 `payment_under_review` (receipt in queue [live]); 403 `payment_forbidden`; 404 `payment_not_found`.

#### 3.2.7 `GET /api/v1/payment/<payment_uuid>/card-transfer/` — transfer instructions
- Auth: public (uuid). Throttle `payment_status`. → `CardTransferInstruction` [live]. Pure read, active cards only.
- `expires_at` is the **order** deadline; the attempt itself closes earlier (route TTL; dev fixture 24 h) — read
  `open_attempt.expires_at` (link page / 409 body) for the real cut-off.
- Errors: 400 `payment_target_invalid` (not card_transfer / not order charge [live]), 403, 404.

#### 3.2.8 `POST /api/v1/payment/<payment_uuid>/card-transfer/receipt/` — upload slip (multipart)
- Auth: public (uuid). Throttle `payment_receipt_upload` 10/h. Fields in §2. → 201 `CardTransferReceipt`
  (`status:'awaiting_review'`) [live]. Payment → `awaiting_review`; order `awaiting_payment` → `awaiting_review`;
  stock hold + deadline extended to now+168 h.
- Errors [live]: 400 `payment_receipt_image_too_small` (client_error, attr null); 400 `payment_receipt_image_invalid`
  (decodable but not JPEG/PNG/WEBP, e.g. GIF, or >6000 px side / >40 MP); 400 validation `invalid_image` attr `image`
  (bytes that are not an image at all — DRF's own code); 413 `payment_receipt_image_too_large` (>5 MiB); 400 validation
  `invalid_code` attr `payer_card_last_digits`; 400 validation `payment_receipt_paid_at_in_future` attr `paid_at`;
  400 validation `does_not_exist` attr `destination_card` (no such id); 400 `payment_destination_card_invalid`
  (inactive card); 409 `payment_receipt_already_submitted` [live]; 400 `payment_target_invalid` (not card transfer / no
  longer open → open a new intent); 403/404.

#### 3.2.9 `GET /api/v1/payment/history/` — my payments
- Auth: user. Paginated `Paginated<PaymentHistoryItem>`, newest first; includes order charges (each leg), door
  collections, top-ups, refunds (`refund_out`) [live: charges/door-collection/top-up rows seen; refund_out from code].
- Query: `status`, `method`, `applies_to` (names, repeatable; unknown name → empty page, no error), `created_after`,
  `created_before` (YYYY-MM-DD), `order_code` (exact 10 digits), `page`, `limit`.
- Wallet page top-up history = `?applies_to=wallet_topup` (includes never-settled attempts).

#### 3.2.10 `GET /api/v1/payment/history/<payment_uuid>/`
- Auth: user. → `PaymentHistoryDetail` [live]. Other's/unknown → 404 `not_found` (generic, not payment_*).
- `card_transfer_receipt` here is the only place a logged-in user reads receipt outcome + rejection text.

#### 3.2.11 `GET|POST /api/v1/payment/gateway/callback/<GATEWAY_CODE>/<callback_token>/` — bank return leg
- Not called by the storefront; reached by the customer's browser **on the storefront host** (must be proxied).
  No X-API-Key, no throttle, CSRF-exempt. Always **302** to `<result_url>?result=…&payment=…&code=…` (uses `&` if
  result_url already has `?`). Unknown token → `?result=failed&code=gateway_callback_invalid` (no payment) [live].
- Callback methods per gateway [code adapters]: ZARINPAL/ZIBAL/BAHAMTA GET; MELLAT/BMI POST only;
  ASANPARDAKHT/IDPAY/IRANDARGAH/SEP POST or GET.

### 3.3 Wallet (all `user`)

#### 3.3.1 `GET /api/v1/wallet/` → `WalletBalance` [live]. Never creates a wallet (zero-balance answer if none).
`remaining_daily_top_up` = limit − settled top-ups in last 24 h (≥0). Max offer in top-up box =
`min(remaining_daily_top_up, maximum_top_up_amount)`; show box only if `is_top_up_enabled && !is_frozen` (and
feature `wallet` + `online_payment` on).

#### 3.3.2 `GET /api/v1/wallet/transaction/list/` → `Paginated<WalletTransaction>` [live]
- Query: `direction` (credit|debit, repeatable), `cause` (repeatable; unknown name → empty page), `created_after`,
  `created_before`, `min_amount`, `max_amount` (non-numeric → 400), `search` (order-code **prefix**; Persian digits ok;
  never matches top-ups/withdrawals), `ordering` = `created|-created|amount|-amount` (default -created; other → 400
  `invalid_choice` attr `ordering` [live]).
- Only money that actually moved (settled top-ups; abandoned top-ups are not here).

#### 3.3.3 `POST /api/v1/wallet/top-up/`
- Throttle `wallet_top_up` 10/min. Header `Idempotency-Key` optional (key scoped to wallet + amount).
- Body `WalletTopUpInput`. → 201 `PaymentIntent` (`payment.applies_to:'wallet_topup'`, `order_code:null`, `handoff`).
  Then identical bank redirect/return as orders (same result page).
- Errors in order: 503 `feature_disabled` (wallet / online_payment); 403 `wallet_frozen` (detail = freeze_message);
  [new attempts only] 400 `wallet_top_up_disabled`, 400 `wallet_top_up_below_minimum` [live], 400
  `wallet_top_up_above_maximum` [live], 400 `wallet_top_up_daily_limit_exceeded`; gateway: 400 `gateway_unknown` [live],
  400 `gateway_amount_not_supported`, 503 `gateway_not_configured` [live], 503 `gateway_unavailable`, 502
  `gateway_rejected`; replays: 409 `payment_idempotency_conflict`, 410 `gateway_token_expired`, 409
  `payment_attempt_starting`. Amount ≤0 → 400 validation `min_value` attr `amount` [live].
- A top-up attempt cannot be abandoned via `/payment/<uuid>/cancel/` (target_invalid); it expires by sweep.

#### 3.3.4 `POST /api/v1/wallet/withdrawal/request/`
- Throttle `wallet_withdrawal` 5/h success-only. Feature `wallet`. Body `WithdrawalInput`.
- 201 → `WithdrawalRequest` `status:'requested'` [live]; money is debited **now** (ledger `withdrawal`), shows in
  `pending_withdrawal_amount` → re-read balance.
- Errors: 400 validation `iban_invalid` attr `iban` [live], `card_number_invalid` attr `card_number` (Luhn) [live],
  `max_length` attr `account_holder_name` (>120), `min_value` attr `amount`; 400 `wallet_withdrawal_disabled`;
  400 `wallet_withdrawal_below_minimum` [live]; 409 `wallet_withdrawal_pending_exists` (one open request at a time)
  [live]; 409 `wallet_insufficient_funds`; 403 `wallet_frozen`; 503 `feature_disabled`.

#### 3.3.5 `GET /api/v1/wallet/withdrawal/list/` → `Paginated<WithdrawalRequest>` [live]
- Query: `status` (repeatable; unknown → empty page), `created_after`, `created_before`, `ordering`
  (`created|-created|amount|-amount`).

#### 3.3.6 `POST /api/v1/wallet/withdrawal/<uuid>/cancel/`
- Throttle `wallet_withdrawal_cancel` 20/h. No body. → 200 `WithdrawalRequest` `status:'cancelled'`; money returned
  immediately (ledger `withdrawal_reversal`, reason «لغو توسط مشتری») [live].
- Only from `requested`; else 409 `wallet_withdrawal_not_cancellable` [live]; not yours → 404 `not_found`.

---------------------------------------------------------------------------------------------------------

## 4. Storefront paths & infrastructure the backend expects

| Storefront URL | Why | Source |
|---|---|---|
| `${STOREFRONT_URL}/order/pay/<token>` (SMS has **no trailing slash**) | payment-link page: guest pay/resume/cancel, COD confirm, amendment top-up | `order/services/payment_link.py:127`; SMS events `order_awaiting_payment`, `payment_failed`, `order_amendment_payment_required` |
| `${STOREFRONT_URL}/api/v1/payment/gateway/callback/<CODE>/<token>/` → **reverse-proxy to backend** (GET+POST, body, trailing slash) | bank return leg — if it doesn't reach Django the payment is never verified (§11 #15) | `payment/services/intent.py:_absolute_callback_url`; `docs/deployment.txt:294` |
| `GatewaySetting.result_url` (admin «تنظیمات درگاه پرداخت» → «آدرس نتیجهٔ پرداخت»); seed `https://firefly-core.ir/payment/callback/` → implement **`/payment/callback/`** | result page for orders **and** wallet top-ups | `gateways/models.py`, `fixtures/11_payment_config.json` |
| (other digests) `/s/<code>`, `/sitemap.xml`, product/blog paths | not this scope | settings.py |

Env facts [code/live]: `STOREFRONT_URL` = env or `https://SITE_DOMAIN` (dev: `http://localhost:3000`, `SITE_DOMAIN=localhost`).
`GATEWAY_RESULT_URL_ALLOWED_HOSTS` default = {SITE_DOMAIN, host(STOREFRONT_URL)} → in dev only `localhost`, so the
seeded result_url (`firefly-core.ir`) would be refused with 503 `gateway_result_url_invalid` once gateway credentials
work; set result_url to `http://localhost:3000/payment/callback/` in the admin for local end-to-end tests. Dev gateway
credentials are not decryptable → every bank intent in dev = `gateway_not_configured`/`gateway_unknown` [live].

### 4.1 Proxying the callback in Next.js (requirements)
- Must forward **GET and POST** (MELLAT and BMI only POST `application/x-www-form-urlencoded`).
- Must preserve the **trailing slash**: Django routes end with `/`; a slash-less POST hits `APPEND_SLASH`, which
  turns POST into a GET redirect (prod) or raises (DEBUG), losing the bank's form fields. Either `trailingSlash: true`
  (also needed for sitemap-compatible routes) or `skipTrailingSlashRedirect: true` with an explicit slash in the
  destination.
- Use a `beforeFiles` rewrite (so it wins over any app `/api/*` route handlers / middleware), e.g.
  ```js
  // next.config.js (sketch — verify with curl -X POST -d 'a=b' that Django sees …/<token>/ with the body)
  trailingSlash: true,
  async rewrites() { return { beforeFiles: [{
    source: '/api/v1/payment/gateway/callback/:code/:token/',
    destination: `${process.env.BACKEND_ORIGIN}/api/v1/payment/gateway/callback/:code/:token/`,
  }]}; }
  ```
  Simpler alternative in prod: route that prefix at the edge proxy (Traefik/nginx) straight to Django.
- Do not let middleware add auth/locale redirects or consume the body on that path. The backend answers 302; pass it
  through untouched (the `Location` points to the result page on the storefront).

### 4.2 Result page `/payment/callback/` contract
Query from backend: `result` ∈ success|failed|pending; `payment` (uuid; missing only for unknown token);
`code` on failed/pending (missing on unexpected server crash). Possible `code`s: `gateway_rejected`,
`gateway_verification_pending` (with result=pending), `gateway_capture_not_bookable`, `gateway_capture_parked`,
`gateway_amount_mismatch`, `gateway_callback_invalid`, `gateway_transaction_state_invalid`, `gateway_capture_refunded`,
and any other gateway code (e.g. `gateway_not_configured`) → treat unknown as generic failure. Algorithm in §5.10.

---------------------------------------------------------------------------------------------------------

## 5. Flows, step by step

Notation: **A** = `amount_charged_online`, **O** = `amount_outstanding_online`, **D** = `amount_to_collect_on_delivery`,
**P** = `prepayment` (already inside A). `total = A + D`.

### 5.0 Money model to render (cart → order → link page all use the same names)
- The online/door split is decided in the **cart** (shipping method, `cash_on_delivery` flag, freight payer,
  prepayment %): `A = amount_payable_online + P`, `D = amount_due_on_delivery − P`. Door share = `cod_fee` + (freight +
  packaging if پس‌کرایه) + (goods + tax if COD). [live] COD via `peyk-tehran` on a 240,000 item: total 359,000,
  A = 70,000 (freight 65,000 + packaging 5,000 paid online!), D = 289,000 (goods 240,000 + tax 24,000 + cod_fee 25,000).
- Review step shows: «پرداخت آنلاین: A» and, if D>0, «پرداخت هنگام تحویل: D». Never show P as an extra line to add.
- After placement the pay button charges **O** (= A − settled, or an amendment delta). Visibility of the pay button =
  `is_payable`; amount = `O`.

### 5.1 Logged-in checkout
1. Cart ready (cart digest): items, destination = saved address id (preferred) or province/city, shipping method
   (+`cash_on_delivery`), coupon. Never send a stale guest `X-Cart-Token` with the Bearer token (→ merge → 409
   `order_cart_changed`; call `/cart/merge/` explicitly at login instead, per cart digest).
2. Create `placementKey = crypto.randomUUID()` when the user lands on the review step; keep it until a 200/201 arrives
   (so a lost response can be retried safely); create a new one for the next purchase. Never reuse.
3. `POST /order/place/` with `Idempotency-Key: placementKey`, body `{ expected_total: cart.total, customer_note? }`
   (+ `receiver` only if the cart has no saved address). Handle 409 `order_total_changed` → re-read cart, show new total,
   ask again (new click, same key is fine since nothing was created).
4. On 201/200 store `{orderUuid, orderCode, paymentUrl, paymentExpiresAt, A, D}`; clear the cart badge.
5. If `requires_online_payment === false` (A == 0, i.e. pure COD or free order) → immediately
   `POST /payment/order/<uuid>/intent/ {route:'pay_on_delivery'}` (own Idempotency-Key) → success page
   «سفارش شما تأیید شد؛ مبلغ D هنگام تحویل پرداخت می‌شود» (or «رایگان» if `payment === null`). If this call fails, the
   order stays `awaiting_payment`; give a retry button (and the same action in My Orders, see §6.3).
6. Else → payment step (§5.3), door = `POST /payment/order/<uuid>/intent/`.

### 5.2 Guest checkout
1. Cart with `X-Cart-Token`; destination province/city; shipping method.
2. `POST /order/place/` with `X-Cart-Token`, body `{ receiver: {...}, customer_mobile?, customer_note?, expected_total }`.
   If 503 `feature_disabled` (`guest_checkout`) → redirect to login/register with the cart preserved.
3. On 201/200: token = last path segment of `payment_url`. Save `{orderCode, linkToken, paymentUrl, expiresAt, A, D,
   placedAt}` in localStorage ("recent guest orders"), drop the cart token. Thank-you page must show: order code,
   the payment link, the deadline, and "track with order code + mobile" — never "you'll see it in your account later"
   (guest orders are never linked to accounts).
4. Pure COD/free (A==0) → `POST /payment/link/<token>/intent/ {route:'pay_on_delivery'}`; else payment step with door
   `POST /payment/link/<token>/intent/`. Wallet routes are `requires_authentication` → hide for guests (or offer
   "login to use wallet"; a logged-in user may pay a guest order from their wallet via the link door).

### 5.3 Payment step — which routes to offer
Inputs: order money (A, O, D, status), `GET payment/method/list/` (cached), wallet balance (logged-in),
`GET payment/gateway/list/` (cached).

| Condition | Offer |
|---|---|
| status `awaiting_payment` and A == 0 | only «تأیید سفارش» = `pay_on_delivery` (no chooser) |
| O > 0 | online routes only; **hide `pay_on_delivery`** (it can only answer `payment_online_charge_outstanding` / `payment_cod_not_available`) |
| route `is_available:false` | show disabled + `reason` under it |
| `requires_authentication` and guest | hide or "ورود برای استفاده از کیف پول" |
| `wallet` | logged-in, `!is_frozen`, `balance >= O` |
| `wallet_and_gateway` | logged-in, `!is_frozen`, `0 < balance < O`, and `O − balance` ≥ gateway floor |
| `bank_gateway` | O within chosen gateway `[max(minimum_amount,1000), maximum_amount ?? ∞]`; small O (e.g. 5,000) → offer card/wallet instead |
| `card_transfer` | always offerable; `max_amount` is compared by the server with **A** (not O) |
| `max_amount` (route) | server compares A (D for COD) — pre-disable with reason «سقف این روش …» |
Render `description` and `instruction` (sanitised HTML) per route; `icon` via `absUrl()`.

### 5.4 `bank_gateway` (same for both doors)
1. If >1 gateway: chooser (logo, title, default preselected). Otherwise omit `gateway_code`.
2. On click: `key = crypto.randomUUID()` (one per click; keep for retries of that click).
   `POST …/intent/ {route:'bank_gateway', gateway_code?}` with `Idempotency-Key: key`.
3. 201 → persist `pendingPayment[payment.uuid] = {kind:'order', orderCode, orderUuid | linkToken, route, amount,
   startedAt}` in localStorage **before** navigating, then:
   ```ts
   function goToBank(h: RedirectPayload) {
     if (h.method === 'GET') {
       const u = new URL(h.url);
       for (const [k, v] of Object.entries(h.params)) u.searchParams.set(k, v); // e.g. BMI {Token}
       window.location.assign(u.toString());
     } else { // MELLAT {RefId,…}, SEP {Token, GetMethod}, ASANPARDAKHT {RefId}
       const f = document.createElement('form'); f.method = 'POST'; f.action = h.url;
       for (const [k, v] of Object.entries(h.params)) {
         const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i);
       }
       document.body.appendChild(f); f.submit();
     }
   }
   ```
   Show «در حال انتقال به {gateway_title}…» + a manual button; the handoff dies at `handoff.expires_at` (15 min).
4. Error handling: 409 `payment_attempt_open` → §5.9 resume UI; 409 `payment_attempt_starting` → wait ~2 s, resend
   **same key** (a 2nd tab can just be ignored); 502 `gateway_rejected` → «بانک تراکنش را نپذیرفت» + suggest another
   gateway/route (do not auto-retry); 503 `gateway_unavailable` → «درگاه پاسخ نداد؛ کمی بعد دوباره» (new key); 400
   `gateway_amount_not_supported` / `gateway_unknown` → re-read gateway list / pick another; 503
   `gateway_not_configured` / `gateway_result_url_invalid` → shop misconfiguration: hide bank routes, show support;
   410 `gateway_token_expired` → new key, new intent; 409 `order_stock_reservation_failed` → item sold out meanwhile,
   send to cart/support; 409 `order_hold_expired` (uuid door) / 410 `order_payment_link_expired` (link door) → order
   can no longer be paid (place again).
5. Customer pays → bank → storefront proxy → backend verifies server-to-server → 302 to result page (§5.10).

### 5.5 `wallet`
- `POST …/intent/ {route:'wallet'}` → 201 with `payment.status === 'settled'` [live] → order is `processing`
  immediately → success page; refresh wallet balance (ledger row `order_payment`).
- Errors: 409 `wallet_insufficient_funds` (re-read balance), 403 `wallet_frozen` (show `detail` = freeze_message),
  403 `payment_forbidden` (paying another account's order via its link), 503 `feature_disabled` (wallet).

### 5.6 `wallet_and_gateway`
- Show split before confirming: «از کیف پول: min(balance, O) — کنار گذاشته می‌شود» / «از درگاه: rest».
- 201: `payment` is the **gateway leg** (+ `handoff`); the wallet leg (method wallet, pending) is already debited.
  Redirect like 5.4. On settle both legs settle together; on decline/abandon/expiry/order-cancel both close and the
  wallet part returns automatically (ledger `order_payment_reversal`; wallet leg `failed` or `cancelled`, never
  `refunded`). Never label the wallet part "paid" before the group settles.
- Errors: 409 `wallet_insufficient_funds` (balance 0 → use bank_gateway), 409 `payment_wallet_covers_full_amount`
  (→ use wallet) [live], plus all bank errors.
- History shows two rows (wallet + bank_gateway) for the order.

### 5.7 `card_transfer`
1. `POST …/intent/ {route:'card_transfer'}` → 201 `{payment(pending), destination_cards}` [live]. Persist payment
   uuid (guests: localStorage — it's their only handle to the receipt outcome).
2. Always (re)load cards with `GET /payment/<uuid>/card-transfer/` (key replays return `destination_cards: []`).
   Render each card: bank name/logo, holder, card number (copy), sheba (copy), account number; amount = `payment.amount`
   (= O); `instruction` HTML. Deadline: attempt closes at `open_attempt.expires_at` (read from link page
   `GET /order/pay/<token>/` — works for logged-in too via `payment_url`), not `card-transfer.expires_at` (order deadline).
3. Upload form → `POST /payment/<uuid>/card-transfer/receipt/` (multipart). Validate client-side: MIME jpeg/png/webp,
   size ≤ 5 MiB, 300×300 ≤ dims ≤ 6000 per side, ≤ 40 MP; `payer_card_last_digits` 4 digits; `paid_at` not in future
   (send ISO with `+03:30`; convert from Jalali picker); `destination_card` = selected card id; `bank_reference` optional
   (speeds review).
4. 201 → «رسید ثبت شد و در صف بررسی است». Order → `awaiting_review` (tab «جاری»); cannot be cancelled or paid now;
   stock held up to 168 h.
5. Outcome: approved → payment `settled`, order `processing`, SMS. Rejected → payment `failed` +
   `failure_reason:'payment_receipt_rejected'`, order back to `awaiting_payment` (timeline shows it), SMS with reason,
   deadline extended to now+168 h, link stays valid → customer opens a **new** intent (new key).
   - Logged-in: reason via `GET /payment/history/<uuid>/` → `card_transfer_receipt.rejection_reason_code` + text.
   - Guest: only `GET /payment/<uuid>/status/` → `failed`/`payment_receipt_rejected`; no reason text (SMS has it) →
     say so honestly and show support contact.
6. Abandon before upload: `POST /payment/<uuid>/cancel/` (sends "payment failed" SMS). After upload → 409
   `payment_under_review`.

### 5.8 `pay_on_delivery`
- **Pure COD / free (A == 0)**: confirmation only. `POST …/intent/ {route:'pay_on_delivery'}` → 201 with `payment` =
  delivery-collection row (`applies_to:'delivery_collection'`, `method:'pay_on_delivery'`, `status:'pending'`, amount D)
  or `payment:null` when D == 0 too. Order → `processing`, `paid_at` stays null, `is_fully_paid:false` until courier
  remits. UI: «سفارش تأیید شد — D تومان هنگام تحویل». Don't show "pending payment".
  Errors: 409 `payment_cod_not_available` (shipping neither COD nor پس‌کرایه), 409 `payment_method_amount_exceeded`
  (D > COD route max), 503 `feature_disabled` (`pay_on_delivery` switched off after placement → order can only be
  cancelled), 409 `order_hold_expired` / 410 link expired.
- **Mixed (A > 0, D > 0)** (COD with online freight, deposit/بیعانه, پس‌کرایه): pay A online by any online route; when
  it settles the order goes to `processing` automatically; D is collected by the courier later. `pay_on_delivery`
  route answers 409 `payment_online_charge_outstanding` [live].
- The delivery-collection row is not an attempt: no expiry, never sweep-closed, `/cancel/` → 400 `payment_target_invalid`.

### 5.9 Open-attempt resume UI (409 `payment_attempt_open` body or link page `open_attempt`)

| open_attempt | Show |
|---|---|
| `method:'bank_gateway'`, `handoff != null` | «یک پرداخت نیمه‌تمام دارید» → [ادامه در {gateway_title}] = goToBank(handoff) · [انصراف] |
| `method:'bank_gateway'`, `handoff == null`, `expires_at != null` | handoff expired; attempt will close at expires_at → [انصراف و پرداخت دوباره] (cancel then new intent) |
| `expires_at == null` | bank answered; verification running (or parked capture) → «پرداخت قبلی در حال بررسی است» + poll status; do not send to bank; cancel allowed but if parked the money is not returned automatically |
| `method:'card_transfer'`, `status:'pending'` | cards (`destination_cards`) + upload form + [انصراف] |
| `status:'awaiting_review'` | receipt under review (only seen for amendment top-ups) → wait |
"انصراف" = `POST /payment/<open_attempt.payment>/cancel/` then a fresh intent with a **new** key.

### 5.10 Result page (`/payment/callback/` = admin result_url) algorithm
1. Parse `result`, `payment`, `code`. Look up `pendingPayment[payment]` from localStorage (may be missing: other device).
2. If no `payment`: «بازگشت از بانک نامعتبر بود» (`gateway_callback_invalid`) → link to orders / tracking. Stop.
3. `GET /payment/<payment>/status/` (with Bearer if logged in; on 403 `payment_forbidden` retry **without** Bearer —
   see §11). Branch on `status` (truth), use `code` only to choose wording:

| status / failure_reason (+code) | Copy (Persian) | Actions |
|---|---|---|
| `settled`, applies_to `online_charge` | «پرداخت با موفقیت انجام شد. سفارش {order_code} در حال انجام است.» | link to order (user) / tracking (guest); clear pendingPayment |
| `settled`, `wallet_topup` | «کیف پول شما شارژ شد.» | refresh `GET /wallet/`; link to wallet |
| `failed` + `gateway_rejected` | «بانک تراکنش را نپذیرفت. سفارش هنوز قابل پرداخت است.» | [پرداخت دوباره] (new key) / other route |
| `failed` + `gateway_capture_not_bookable` | exactly: «پرداخت روی سفارش ثبت نشد. اگر مبلغی از حساب شما کسر شده، بانک حداکثر ظرف ۷۲ ساعت آن را برمی‌گرداند.» | no "pay again" push; show order state |
| `failed` + `gateway_unavailable` (intent-time failure; seen in history, not via callback) | «درگاه پاسخ نداد؛ مبلغی کسر نشده.» | retry later |
| `pending` + code `gateway_verification_pending` (result=pending) | «در حال بررسی نتیجهٔ پرداخت…» | poll (§5.11); never resend to bank |
| `pending` + code `gateway_capture_parked` / `gateway_amount_mismatch` | «پرداخت شما دریافت شد ولی روی سفارش ثبت نشد؛ پشتیبانی پیگیری می‌کند.» + order_code + payment id | no pay-again (new intent → `payment_attempt_open` until abandoned/resolved) |
| result=failed with no `code` (unexpected server error on callback) and status still `pending` | «نتیجه نامشخص است؛ در حال بررسی…» | poll as for pending |
| `cancelled` + `payment_attempt_expired` after a pending return | «نتیجهٔ پرداخت مشخص نشد. اگر مبلغی کسر شده با پشتیبانی تماس بگیرید.» | link to support |
| `cancelled` + `payment_attempt_abandoned` / `payment_attempt_order_cancelled` | attempt closed / order cancelled | show order state |
| `refunded` (+ code `gateway_capture_refunded`) | «مبلغ این پرداخت به شما بازگردانده شده است.» | — |
| result=failed + `gateway_callback_invalid`/`gateway_transaction_state_invalid` with payment | read status as above; don't resend to bank | — |
4. "Pay again" needs the door: logged-in → `orderUuid` (from pendingPayment, or `GET /order/<order_code>/` → `uuid`);
   guest → `linkToken` from pendingPayment/recent-orders (status never returns it). Always a new Idempotency-Key.

### 5.11 Polling policy (status / card-transfer outcome)
- Budget: 240/h per user (or per IP for guests) shared with method/gateway lists and card-transfer GET.
- Schedule: 15 s ×4 → 30 s ×4 → 60 s … stop after ~15 min with «نتیجه هنوز مشخص نیست؛ بعداً در سفارش‌ها/پیگیری ببینید».
  Pause when `document.hidden`. Server re-asks the bank via cron every 15 min (backoff 5 min, max 8 tries, gives up
  after 120 min → attempt closed `payment_attempt_expired`, no SMS, operator queue).
- On 429 honor `data.retry_after`.

### 5.12 Wallet top-up
1. `GET /wallet/`: show box iff `is_top_up_enabled && !is_frozen`; bounds `[minimum_top_up_amount,
   min(maximum_top_up_amount, remaining_daily_top_up)]`; also ≥ gateway floor.
2. `POST /wallet/top-up/ {amount, gateway_code?}` + `Idempotency-Key` (new per click) → 201 `PaymentIntent` → persist
   `pendingPayment[uuid] = {kind:'topup', amount}` → goToBank.
3. Return lands on the same result page; branch on `applies_to === 'wallet_topup'`.
4. History: `GET /payment/history/?applies_to=wallet_topup` (all attempts incl. failed/cancelled, with bank `receipt`);
   ledger shows only settled top-ups. A pending top-up can't be abandoned by API; it expires by sweep.

### 5.13 Amendment top-up (operator edited a paid order upward) — customer-visible effects only
- No customer endpoint for amendments. Customer gets SMS «پرداخت اصلاحیه سفارش» with amount (delta) + payment link;
  window = 48 h (re-sets the link deadline).
- Order list/detail: status stays `processing`/`packing`, `is_payable: true`, `money.amount_outstanding_online = delta`
  [live: order 7330195771], `is_fully_paid` stays `true`(!), `can_cancel:false`. Pay with any online route via either door
  (link page opens for it). Card-transfer receipt for the delta doesn't change order status.
- After settlement: order money & lines are replaced (new figures), status unchanged, **no timeline row**, SMS
  «اصلاح سفارش». Once the order is `sent`, top-up refused: 409 `order_amendment_not_allowed` → support.
- Downward amendment → credit released by operator: wallet ledger `amendment_credit` (account) or bank transfer
  (`refund_out` row in payment history).
- Expired window: still `is_payable:true` but every attempt → 409 `order_hold_expired` / 410 link expired (§11).

### 5.14 Cancellation, refunds, returns (customer view)
- Customer can cancel only `awaiting_payment` (both doors). Everything later → contact support.
- Refunds are always manual (operator): appear as wallet ledger `refund` (account holders) and/or payment-history row
  `applies_to:'refund_out'` (method `manual_transfer`), original payment may become `refunded` (fully returned to wallet)
  or stay `settled` (partial). Returned orders (`returned`) are set by the operator; no customer return endpoint.
- Re-buy: `POST /api/v1/cart/reorder/ {order_code}` (cart digest; any status; logged-in only).

---------------------------------------------------------------------------------------------------------

## 6. Order statuses, groups, actions, and detail rendering

### 6.1 Status → group → allowed customer actions

| status | status_display | group (tab) | Pay | Cancel | Review | Notes |
|---|---|---|---|---|---|---|
| awaiting_payment | در انتظار پرداخت | awaiting_payment «در انتظار پرداخت» | if `is_payable` → pay O; if `!is_payable && payment_url` (A==0) → «تأیید سفارش» (pay_on_delivery) | `can_cancel` (true) | no | auto-cancelled by sweep after deadline (≤30 min lag); `is_payable` stays true until then |
| awaiting_review | در انتظار بررسی | in_progress «جاری» | no | no (`order_receipt_pending`) | no | receipt in queue; link page = `order_not_payable` |
| processing | در حال انجام | in_progress | only if amendment top-up (`is_payable`) | no | no | `is_confirmed` true |
| packing | بسته‌بندی | in_progress | same | no | no | |
| sent | ارسال شده | in_progress | no | no | no | `postal_tracking_code` set (show + carrier `shipping_method_title`) |
| delivered | تکمیل شده | delivered «تحویل داده شده» | no | no | per line `review_state` | returns via support |
| cancelled | لغو شده | cancelled «لغو شده» | no | no | no | `payment_url:null`; refunds manual |
| returned | مسترد شده | returned «مرجوعی» | no | no | no (`reviewed` stays) | |
"Reorder" (cart/reorder) is valid for every status. Keep the group table in one place in code; tolerate unknown keys.
Status can move backwards (receipt rejected: awaiting_review→awaiting_payment; operator corrections, e.g.
sent→packing, cancelled→processing) — don't assume monotonic progress.

### 6.2 Progress bar (`progress`) — draw exactly what the server sends
- `steps[]` in order; `state` completed/current/upcoming (exactly one current); `reached_at` null for upcoming and for
  `awaiting_review` always. `is_terminal` true for cancelled/returned: path cut after the last reached stage + final
  step (state current) [live: cancelled order → [awaiting_payment completed, cancelled current]].
- `awaiting_review` step appears only if the order went through receipt review; `sent` omitted for in-store
  (`channel:'store'`) orders never dispatched [live: store-channel order 6270624849 → steps awaiting_payment,
  processing, packing, delivered; a `website` pickup order still gets a `sent` step].
- Step `label` = status_display (returned final step «مسترد شده», not the tab label «مرجوعی»).

### 6.3 My Orders list card (`OrderListItem`)
order_code, `status_display` badge, `placed_at` (Jalali), `total`, `item_count`, up to 3 thumbnails (`item_preview`),
`address_summary`, `shipping_method_title`, `postal_tracking_code` (copy), mini progress; buttons:
- Pay: `is_payable` → logged-in intent on `uuid` (or navigate to `payment_url`).
- Confirm COD: `status==='awaiting_payment' && !is_payable && payment_url` → pay_on_delivery intent on `uuid`.
- Cancel: `can_cancel` → confirm dialog → `POST /order/<code>/cancel/`.
- The list has no money breakdown and **no payment deadline** (neither does the detail).
Tabs: `?status_group=<key>`; counters likely from `GET /api/v1/dashboard/summary/` (dashboard digest).

### 6.4 Order detail page (`OrderDetail`)
- Header: code (+ QR via `/qr-code/`), status, `channel`, placed_at, `paid_at`, `is_confirmed`, `is_fully_paid`.
- Progress + `timeline` (factual history incl. rejections/corrections; first row is awaiting_payment; operator notes
  excluded) + `milestones` (confirmed/packed/dispatched/delivered/cancelled/returned timestamps).
- Receiver block (`receiver`): full name, mobile, email, province/city/address, plaque, unit, postal code, map point
  (lat/lng are strings). `customer_note`.
- Delivery: `shipping_method_title`, `delivery_min_days`–`delivery_max_days` business days, `freight_paid_by_recipient`
  (پس‌کرایه badge), `cash_on_delivery` (COD badge), `postal_tracking_code`.
- Lines: name, variant, sku, brand, unit, image, qty, unit_price/unit_discount/unit_final_price, line totals,
  `product_slug` (null if variant deleted → no link), review button per `review_state`.
- Money (`money`), in order: goods_subtotal, −item_discount, goods_total, −coupon_discount (with `coupon.code/title`),
  goods_payable, shipping_cost (+«رایگان» if 0; show «صرفه‌جویی ارسال» only if shipping_discount > 0), packaging_cost,
  tax (`tax_rate`% → tax_amount), cod_fee, **total**, total_savings; split: A (online, incl. P), D (door);
  settled online / on delivery; outstanding O.
- Payments are NOT embedded → `GET /payment/history/?order_code=<code>` (methods, statuses, bank receipts:
  gateway_title, tracking_code (keep as string), settlement_reference, card_pan_masked). Unknown `method`s (pos, cash,
  manual_transfer) are legitimate operator-recorded payments.
- No invoice/PDF endpoint exists for customers (invoices are panel-only).

### 6.5 Reviews
- Line `review_state`: `awaiting` → «ثبت نظر» button; `reviewed` → «نظر شما ثبت شده»; `unavailable` → nothing.
- "Write reviews" page = awaiting list; `has_other_review` → label «ثبت نظر جدید». After submit, remove product (and
  order when empty) locally or re-fetch. Disable submit (not the list) when `product_comments` is off.

---------------------------------------------------------------------------------------------------------

## 7. Wallet — rules & flows
- Account-only; guests have no wallet. Balance never negative; every movement is a ledger row with `balance_after`
  (no client-side summing needed). `amount` always positive; sign from `direction`.
- Frozen wallet (`is_frozen`): show `freeze_message` banner (plain text, non-empty iff frozen); spending, withdrawals and
  new top-ups refused (403 `wallet_frozen`, `detail` = same text); credits (refunds, a top-up already at the bank) still land.
- Top-up limits (from `GET /wallet/`, shop-wide): per-charge `[minimum_top_up_amount, maximum_top_up_amount]`
  (dev: 50,000–50,000,000; model defaults 10,000–50,000,000), rolling-24 h `daily_top_up_limit` (100,000,000) with
  `remaining_daily_top_up`; abandoned attempts don't consume the daily budget; replays of a key are never judged by limits.
- Withdrawal: one open request at a time (`requested`/`approved`); amount ≥ `minimum_withdrawal_amount` (dev 200,000;
  default 100,000) and ≤ balance; money leaves balance at request time (`pending_withdrawal_amount`); IBAN (sheba) with
  `IR` prefix required, paste-friendly (spaces/dashes/Persian digits stripped), normalised to 26 chars; optional card
  number 16 digits Luhn-checked, cross-check only; `bank_name` derived from IBAN (may be ""); processing ETA
  `withdrawal_processing_days` (3).
- Withdrawal statuses: requested (cancellable by customer) → approved → paid (`payout_reference`, `paid_at`) | rejected
  (`rejection_reason`, money returned via `withdrawal_reversal`) | cancelled (customer; money returned).
- Ledger causes to label: top_up, order_payment, order_payment_reversal (combined attempt undone), refund,
  amendment_credit, withdrawal, withdrawal_reversal, admin_adjustment. `order_code` filled for order-related rows,
  `payment_uuid`/`withdrawal_uuid` for links to history detail / withdrawal row.
- Wallet use at checkout: `wallet` (full) or `wallet_and_gateway` (partial) — see §5.5/5.6.

---------------------------------------------------------------------------------------------------------

## 8. Error codes the UI must handle distinctly (code → HTTP → what to do)

Always switch on `data.errors[0].code`; show `detail` unless a fixed sentence is prescribed below. Generic codes
(`not_found`, `not_authenticated` 401, `throttled` 429 w/ `data.retry_after`, `api_key_*`, `validation_error` types)
come from the API overview.

### 8.1 Placement

| code | HTTP | UI |
|---|---|---|
| order_cart_empty | 409 | back to cart |
| order_destination_required | 409 | ask province/city (cart destination) |
| order_shipping_method_required | 409 | shipping step |
| order_shipping_method_unavailable | 409 | re-read shipping options, re-select |
| order_receiver_required | 400 | show receiver form (guest / no saved address) |
| order_receiver_forbidden | 400 | client bug: don't send receiver when cart has saved address |
| order_coupon_no_longer_valid | 409 | re-read cart (coupon removed + reason), show new total |
| coupon_usage_limit_reached / coupon_user_limit_reached | 400 | race: re-read cart, show new total |
| order_item_unavailable | 409 | mark `data.items[]` lines in cart with their `issue` |
| order_out_of_stock | 409 | re-read cart |
| order_stock_reservation_failed | 409 | "last unit just sold" → re-read cart |
| order_total_changed | 409 | re-read cart, re-confirm new total |
| order_cart_changed | 409 | drop guest token, re-read cart, re-select shipping, re-confirm (`data.adjustments`) |
| order_unpaid_limit_reached | 409 | show `detail` verbatim (3 variants) + link to unpaid orders; no pay/cancel buttons when all are under review |
| order_idempotency_key_invalid | 400 | client bug (key >64) |
| cart_not_found | 404 | back to shop |
| order_money_snapshot_invalid / order_code_unavailable | 500 | retry once; then support |
| feature_disabled (guest_checkout) | 503 | redirect to login/register |

### 8.2 Order actions / link / tracking / reviews

| code | HTTP | UI |
|---|---|---|
| not_found | 404 | "سفارش پیدا نشد" (not yours or doesn't exist) |
| order_cancellation_not_allowed | 409 | hide cancel; "contact support" |
| order_already_cancelled | 409 | refresh order |
| order_receipt_pending | 409 | "رسید در حال بررسی؛ امکان لغو نیست" |
| order_payment_link_invalid | 404 | "لینک معتبر نیست" (also: order cancelled) → tracking page |
| order_payment_link_expired | 410 | "مهلت پرداخت تمام شده" — may also be an old *paid* order → offer tracking |
| order_already_settled | 409 | "پرداخت آنلاین این سفارش انجام شده" (if D>0 add "مبلغ تحویل را به پیک بپردازید") |
| order_collected_on_delivery | 409 | "سفارش تأیید شده؛ مبلغ هنگام تحویل" |
| order_not_payable | 409 | "سفارش فعلاً قابل پرداخت نیست" (receipt under review, cancelled, returned…) → tracking |
| order_hold_expired | 409 | deadline passed (logged-in door) → place a new order |
| order_amendment_not_allowed | 409 | top-up no longer accepted (shipped) → support |
| order_tracking_not_found | 404 | "سفارشی با این شماره و کد پیدا نشد" (same for wrong pair) |
| order_status_filter_unknown / order_status_group_filter_unknown | 400 | client bug; `data.known_*` |
| order_review_product_not_in_order | 404 | re-read awaiting list |
| order_review_not_eligible | 409 | hide review button |
| order_review_already_submitted | 409 | mark reviewed, re-read list |
| feature_disabled (product_comments) | 503 | disable review submit |

### 8.3 Payment intents / attempts

| code | HTTP | UI |
|---|---|---|
| payment_attempt_open | 409 | resume/abandon UI from `data.open_attempt` (§5.9) |
| payment_attempt_starting | 409 | wait 2 s, resend same key |
| payment_idempotency_conflict | 409 | previous attempt finished → new key, re-submit if user wants |
| payment_method_disabled | 409 | re-read method list |
| payment_method_not_found | 404 | re-read method list |
| payment_method_amount_exceeded | 409 | "مبلغ بیش از سقف این روش" → other route |
| payment_no_active_bank_card | 409 | hide card_transfer |
| payment_cod_not_available | 409 | hide COD; this shipping method doesn't collect at door |
| payment_online_charge_outstanding | 409 | pay online share first |
| payment_wallet_covers_full_amount | 409 | switch to `wallet` |
| wallet_insufficient_funds | 409 | re-read balance; wallet_and_gateway with 0 balance → bank_gateway |
| payment_wallet_required_authentication | 403 | login to use wallet |
| payment_forbidden | 403 | intent: can't pay another account's order with your wallet; status/cancel: see §11 (retry anonymously) |
| wallet_frozen | 403 | show `detail` (= freeze_message) |
| gateway_unknown | 400 | re-read gateways / omit code |
| gateway_amount_not_supported | 400 | other gateway / route |
| gateway_token_expired | 410 | new key, new intent |
| gateway_rejected | 502 | bank said no; offer other bank/route; don't auto-retry |
| gateway_unavailable | 503 | bank didn't answer; try later (attempt already failed, wallet leg returned) |
| gateway_not_configured / gateway_result_url_invalid | 503 | shop config error; hide bank routes; support |
| feature_disabled (online_payment / pay_on_delivery / wallet) | 503 | hide that route, re-read method list |
| order_* payability codes (§8.2) | 409/410 | as above |
| payment_not_found | 404 | stale uuid; clear local state |
| payment_target_invalid | 400 | wrong row (door collection/top-up/closed attempt) → new intent |
| payment_under_review | 409 | receipt in queue; can't abandon |

### 8.4 Receipt upload

| code | HTTP | UI (pre-validate client-side) |
|---|---|---|
| payment_receipt_image_too_large | 413 | ≤5 MiB |
| payment_receipt_image_too_small | 400 | ≥300×300 |
| payment_receipt_image_invalid | 400 | JPEG/PNG/WEBP, ≤6000 px side, ≤40 MP |
| invalid_image (validation, attr image) | 400 | not an image file |
| payment_receipt_paid_at_in_future (validation, attr paid_at) | 400 | check date/time |
| invalid_code (attr payer_card_last_digits) | 400 | exactly 4 digits |
| payment_destination_card_invalid | 400 | card deactivated → reload cards |
| does_not_exist (attr destination_card) | 400 | reload cards |
| payment_receipt_already_submitted | 409 | show "already submitted" |

### 8.5 Wallet

| code | HTTP | UI |
|---|---|---|
| wallet_top_up_disabled | 400 | hide box |
| wallet_top_up_below_minimum / above_maximum | 400 | clamp input to limits |
| wallet_top_up_daily_limit_exceeded | 400 | show `remaining_daily_top_up` |
| wallet_withdrawal_disabled | 400 | hide form |
| wallet_withdrawal_below_minimum | 400 | show minimum |
| wallet_withdrawal_pending_exists | 409 | show existing request (+cancel) |
| wallet_withdrawal_not_cancellable | 409 | refresh list |
| iban_invalid / card_number_invalid (validation) | 400 | field errors |
| wallet_frozen | 403 | banner text |
| wallet_not_found / wallet_amount_invalid | 404/400 | practically unreachable |

### 8.6 Non-error `failure_reason` values (on payment rows)
`payment_attempt_expired` (cancelled; combined pair → failed), `payment_attempt_abandoned` (cancelled),
`payment_attempt_order_cancelled` (cancelled), `gateway_rejected` (failed), `gateway_capture_not_bookable` (failed;
fixed 72 h sentence), `gateway_unavailable` (failed), `payment_receipt_rejected` (failed),
`payment_delivery_collection_voided` (cancelled door row, operator correction).

---------------------------------------------------------------------------------------------------------

## 9. Timers, deadlines, sweeps (defaults; dev fixture in brackets)

| What | Default | Effect for storefront |
|---|---|---|
| Payment deadline (`payment_expires_at` / link `expires_at`) | placement + 72 h | after it: link 410, intent 409 `order_hold_expired`; sweep `expire_stale_orders` cancels `awaiting_payment` orders at :05 and :35 each hour (SMS) |
| Short stock hold | 30 min (`reservation_ttl_minutes`) from placement; re-taken at each bank/wallet/combined intent | expired hold silently re-taken; fails only if units gone (`order_stock_reservation_failed`) |
| Hold for card_transfer / COD intents | until payment deadline | — |
| Receipt review horizon | upload/rejection + 168 h (deadline & hold extended) | awaiting_review orders are never auto-cancelled |
| Amendment top-up window | 48 h (resets link deadline) | after it payments refused but `is_payable` stays true |
| Attempt TTL per route (`attempt_ttl_minutes`) | column default 30 min; seed card_transfer 2880 [fixture: bank 30, wallet 15, combined 30, card 1440, COD 4320] | sweep `expire_payment_attempts` hourly at :00 and on every new intent for that order → `payment_attempt_expired`; read real cut-off from `open_attempt.expires_at` |
| Bank handoff | 15 min (`handoff.expires_at`) | resend → 410 `gateway_token_expired` |
| Bank verification retries | cron every 15 min, backoff 5 min, max 8, give up after 120 min | then attempt closed without SMS; operator "needs action" |
| Unpaid orders per buyer mobile | 3 (awaiting_payment + awaiting_review) | `order_unpaid_limit_reached` |
| Bank auto-refund for unverified captures | ≤72 h (bank side) | fixed copy for `gateway_capture_not_bookable` |
| Access token | 15 min | refresh before long payment pages; result page may need re-auth |

---------------------------------------------------------------------------------------------------------

## 10. Implementation checklist
- [ ] API client: envelope unwrap; typed `ApiError` with `code`; handle HTML 404 (dev) for malformed route params;
      validate order code `/^\d{10}$/` and UUIDs before calling.
- [ ] `absUrl()` for every image/icon URL (relative `/static/`, `/media/` vs absolute).
- [ ] Date parsing tolerant to microseconds; display Jalali; send filters as Gregorian `YYYY-MM-DD`; receipt `paid_at`
      as ISO with `+03:30`.
- [ ] Keep money as integers; format with Persian digits and «تومان».
- [ ] Pagination from `current_page/total_pages/page_size`; read `data.results` for **all 7 lists** incl. method & gateway lists.
- [ ] Server-side cache (≈60 s) for `payment/method/list/` and `payment/gateway/list/`.
- [ ] Forward real client IP to the API (backend `TRUSTED_PROXY_IPS` + `X-Forwarded-For`) for SSR/BFF calls, or call
      throttled endpoints from the browser; otherwise all guests share per-IP budgets.
- [ ] Next.js: `trailingSlash: true` (or equivalent) + `beforeFiles` rewrite/proxy of
      `/api/v1/payment/gateway/callback/:code/:token/` (GET+POST) to Django; verify with a POST curl.
- [ ] Pages: `/order/pay/[token]` (link page), `/payment/callback` (result page = admin result_url), checkout
      review/payment/thank-you, `/track` (guest tracking), profile: orders list (5 tabs), order detail, payments history
      (+detail), awaiting reviews, wallet (balance, ledger, top-up, withdrawals).
- [ ] Ops: set admin «آدرس نتیجهٔ پرداخت» to `${STOREFRONT_URL}/payment/callback/`; host must be in
      `GATEWAY_RESULT_URL_ALLOWED_HOSTS`; set `STOREFRONT_URL` correctly (it builds SMS links and the bank callback).
- [ ] Placement: `expected_total` always; Idempotency-Key per checkout (logged-in); guest uses cart token; 200 vs 201.
- [ ] Drop guest cart token on login (merge explicitly) and after successful placement.
- [ ] Pure COD (A==0): auto-call `pay_on_delivery` intent after placement; "Confirm order" button in My Orders when
      `awaiting_payment && !is_payable && payment_url`.
- [ ] Payment step built from method list (`is_available/reason`, `requires_authentication`, `max_amount`), wallet balance,
      gateway ranges; hide `pay_on_delivery` when A>0.
- [ ] Idempotency-Key per click for intents/top-up; same key for retries of that click; new key after failure.
- [ ] Handoff GET (query params) vs POST (auto-submit form); persist `pendingPayment` before redirect.
- [ ] `payment_attempt_open` resume/abandon UI; link page shows `open_attempt`.
- [ ] Result page: never trust query; poll status ≥15 s with backoff; distinct copy per §5.10 incl. fixed
      `gateway_capture_not_bookable` sentence and parked-capture message; 403→retry anonymous.
- [ ] Wallet+gateway: show wallet part as «کنار گذاشته شد» until settled.
- [ ] Card transfer: load cards via GET `/card-transfer/`; client-side image checks; keep payment uuid (guests);
      outcome via history detail (user) or status (guest, no reason text).
- [ ] Switching payment method = cancel attempt (triggers "payment failed" SMS) + new intent; warn the user.
- [ ] Cancel buttons from `can_cancel`; copy for refunds = "support will process".
- [ ] Order detail: money breakdown order (§6.4), progress from server, timeline, milestones, receiver, lines with
      review_state; payments via `payment/history/?order_code=`.
- [ ] Guest "recent orders" in localStorage (code, link token, deadline); tracking page with debounced submit + 429 copy.
- [ ] Wallet page: limits from `GET /wallet/`, frozen banner, ledger filters, top-up history via
      `payment/history/?applies_to=wallet_topup`, withdrawal form (IBAN paste-friendly) + list + cancel.
- [ ] Feature switches: on 503 `feature_disabled` hide the control and show `detail`; respect `Retry-After` advisory.
- [ ] Don't log/analytics payment UUIDs or link tokens (bearer credentials); strip them from referrers (result page
      URL contains the payment uuid → `Referrer-Policy: same-origin`/no third-party scripts there).

---------------------------------------------------------------------------------------------------------

## 11. Suspected backend bugs / inconsistencies (verified)

1. **Card-transfer intent replay drops the cards** [live]. Re-POSTing `route:'card_transfer'` with the same
   `Idempotency-Key` returns 201 with the same pending payment but `destination_cards: []` (first response had 2
   cards). Cause: replay path builds `PaymentIntent(payment, status)` only (`payment/services/intent.py`
   `_open_order_attempt` → `_replayed_attempt`), so `destination_cards` and `delivery_collection` are empty/null on
   every replay (bank replays do rebuild `handoff`). Doc promises the replay returns "the same attempt".
   Workaround: always `GET /payment/<uuid>/card-transfer/`.
2. **`wallet` route never creates/returns the delivery-collection row** [live: order 0404614013, COD with 70,000 online
   freight paid by wallet → `delivery_collection: null`, history has no `delivery_collection` row]. `bank_gateway`,
   `card_transfer`, `wallet_and_gateway` call `_open_delivery_collection`, `_open_wallet` does not. The API doc says any
   order with a door share has that row in `delivery_collection`. Workaround: render door amount from
   `money.amount_to_collect_on_delivery`, not from `delivery_collection`.
3. **Gateway list ≠ usable gateways** [live in dev]. `GET payment/gateway/list/` filters `is_active` only
   (`GatewayConfig.objects.usable()`), while intents require adapter + readable credentials
   (`gateways/services/accounts.py::_is_usable`). Listed ZARINPAL → intent with `gateway_code:'ZARINPAL'` = 400
   `gateway_unknown`; without code = 503 `gateway_not_configured`. A storefront can offer a bank that can never work.
4. **Paid orders' links answer "expired, contact support to pay"** [live: delivered order 6270624849 → 410
   `order_payment_link_expired`, detail «…برای پرداخت با پشتیبانی تماس بگیرید»]. `resolve_payment_link` checks the
   deadline before `order_already_settled`, so after 72 h every old SMS link of a *paid* order shows a misleading
   "pay via support" message. Within 72 h the same link says `order_already_settled` [live 7573331679].
5. **`order_already_settled` for orders that still owe money at the door** [live: 0404614013 — online share paid,
   289,000 still due at door, link answers «برای این سفارش مبلغ پرداخت‌نشده‌ای باقی نمانده است»]. The CHK-19 fix
   only covers A==0. Storefront must add its own wording when D>0.
6. **Expired amendment top-up keeps `is_payable: true` forever** [live: order 7330195771 (user j.abbasi), processing,
   `is_payable:true`, `amount_outstanding_online: 3,814,182`, intent → 409 `order_hold_expired`, link → 410]. No sweep
   touches non-`awaiting_payment` orders and `is_payable` ignores the deadline; also `is_fully_paid:true` while a delta
   is owed. And neither list nor detail publishes the payment deadline, so the client cannot hide the dead button
   (only the link page's `expires_at` / placement's `payment_expires_at` expose it).
7. **Signing in reduces access to a payment** [live]. `GET /payment/<uuid>/status/` for another account's payment:
   with Bearer → 403 `payment_forbidden`; anonymous → 200 (`payment/services/access.py`). Since non-wallet routes let
   any logged-in user pay someone else's order via its link, that payer's result page polling with their token gets
   403. Workaround: retry without Authorization on 403.
8. **Idempotency doc vs behaviour**: replaying a key after its attempt settled the order returns
   409 `order_already_settled` (payability check runs before the replay lookup), not `payment_idempotency_conflict`
   as documented [live: shirin wallet key `pay-w-1`]. Handle both.
9. **Receipt "not an image" code**: non-image bytes → 400 `validation_error` `invalid_image` (attr `image`, DRF's code),
   not the documented `payment_receipt_image_invalid` (that one only for decodable non-JPEG/PNG/WEBP e.g. GIF) [live].
10. **Two independent COD ceilings** [code]: cart accepts COD up to the *shipping method's* `cod_max_amount`
    (`cart/services/checkout.py:122`); the `pay_on_delivery` route's `max_amount` (PaymentMethodSetting, 20,000,000 in
    fixtures) is only checked when confirming (`payment/services/intent.py` step 5). If an operator sets the route max
    lower than a method's cod_max, a pure-COD order can be placed but never confirmed (409
    `payment_method_amount_exceeded`), and it auto-cancels after 72 h. Likewise card_transfer `max_amount` is compared
    with the order's full `amount_charged_online`, not the outstanding amount (e.g. a small amendment delta on a large
    order is refused).
11. **Dev config cannot run a bank payment**: fixture `result_url` = `https://firefly-core.ir/payment/callback/` but dev
    `SITE_DOMAIN=localhost` → allowed hosts = {localhost}; and gateway credentials don't decrypt → every bank intent in
    dev fails (`gateway_not_configured` [live]); after fixing credentials it would fail with `gateway_result_url_invalid`
    [code]. Not a prod bug; needs admin edits for local E2E.
12. **Inconsistent URL absoluteness** [live]: order line/preview/awaiting-product images absolute; payment method
    `icon`, gateway `logo/logo_thumbnail`, card `bank_logo_thumbnail`, receipt `image_thumbnail` relative.
    Schema marks `icon`/logos nullable but they are always a URL (placeholder fallback).
13. **Minor**: `failure_reason` declared nullable in schema but always `""`; refusal texts mix digit styles (top-up
    minimum "50000" Latin vs withdrawal minimum «۲۰۰٬۰۰۰»); timestamps sometimes carry microseconds; `next/previous`
    pagination links are absolute backend URLs; `.env.example` claims STOREFRONT_URL only builds the payment link
    (it also builds the bank callback URL — acknowledged in deployment doc).
14. **Doc claims vs code on gateway result-URL check order**: doc says `gateway_result_url_invalid` is refused "before
    anything"; code checks gateway resolution and amount range first (`gateways/services/checkout.py:107-110`), so a
    misconfigured shop may surface `gateway_unknown`/`gateway_amount_not_supported` first. Cosmetic.
15. **A payment whose browser never returns is never verified** [code]. `reconcile_gateway_transactions` re-verifies
    only `VERIFIABLE_STATUSES` = RETURN_FROM_BANK, ERROR (`gateways/services/reconciliation.py::_rows_to_verify`);
    rows still `REDIRECT_TO_BANK` (customer paid then closed the tab, 3-DS finished in another browser, or the
    storefront callback proxy is broken) are just flipped to `EXPIRE_GATEWAY_TOKEN` once the 15-min handoff expires
    (`_expire_unused_handoffs`, docstring: "No money moved"). Adapters' `inquire()` is never called anywhere. The
    attempt then expires (`payment_attempt_expired`); Iranian PSPs normally auto-reverse unverified captures, so the
    customer is refunded by the bank and the order stays unpaid. `docs/deployment.txt:294` and the module docstring
    ("Finishing the payments whose customers never came back") claim the cron would book it. Storefront impact: the
    callback proxy is mission-critical; after a lost return the UI should say "if money was taken, the bank returns it
    within 72 h; please pay again".

## 12. Open questions for the backend team
- Can `OrderList`/`OrderDetail` expose `payment_expires_at` (and can `is_payable` honour it / amendment windows)?
- Should card-transfer (and any) intent replays rebuild `destination_cards`/`delivery_collection` (bug 1)?
- Should `_open_wallet` open the delivery-collection row like the other online routes (bug 2)?
- Should `gateway/list` use the same `_is_usable` predicate as intents (bug 3)?
- Order of link refusals: settled before expired (bug 4)? Distinct copy when D>0 (bug 5)?
- Is the anonymous-200 / authenticated-403 asymmetry on `/payment/<uuid>/status/` intended (bug 7)?
- Which exact result path will production use (`/payment/callback/` seed vs `/pay/result` tests)? Please fix one.
- Is there any plan for a customer invoice/receipt PDF endpoint? (None today.)
- Should reconciliation inquire `REDIRECT_TO_BANK` rows (adapter `inquire()`) before expiring them, so a customer who
  paid but never came back is booked (bug 15)? Until then the callback proxy must be bullet-proof.

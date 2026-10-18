# Plan 4 — Cart, Checkout, Payment, Orders and Wallet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Shoppers can review the cart and apply coupons.
- They can check out as a guest or signed in, on one progressive page, and pay with every route the backend offers: bank gateway, wallet, wallet plus gateway, card-to-card with receipt upload, or pay on delivery.
- They land on a truthful payment result page, can pay through SMS payment links, and guests can track orders.
- Signed-in customers manage orders (list, detail, cancel, pay, buy again, QR), purchase reviews and the wallet (top-up, ledger, withdrawals, payment history).

**Architecture:**
- Cart, checkout and payment are client components over the BFF. TanStack Query holds the `['cart']` cache, and every response re-renders from the API.
- The checkout is one route with progressive sections. The order of operations is: destination → shipping → payment route → place → intent.
- The payment context is persisted in `localStorage` before any bank redirect.
- The result page polls `payment/<uuid>/status/` within the backend's budget.

**Tech Stack:** As before. No new runtime dependencies; a Jalali date picker for the receipt's `paid_at` is built from the Plan 1 primitives with Intl.

**Spec:** `docs/superpowers/specs/2026-10-15-storefront-design.md` (§8.6–8.8, §8.10 orders, wallet and awaiting review). API contracts: `docs/backend-integration/cart-address.md` (all), `order-payment.md` (all, especially §0, §5, §6, §8, §10), `blog-faq-dashboard-notification.md` §3.2–3.3 (account list conventions).

## Global Constraints

Everything in Plans 1–3's Global Constraints, plus:

- Account pages live under `src/app/(shop)/account/…` (Plan 3 ruling P3-R1: inside the shop layout; the account layout adds the session guard and `AccountShell`). Orders, reviews and the wallet replace the «به‌زودی» placeholders already at `src/app/(shop)/account/orders/`, `reviews/` and `wallet/`. Never create `src/app/account/…`.
- Every new per-visitor query key (orders, an order's detail, awaiting reviews, the wallet and its lists, payment history…) is registered in `SESSION_QUERIES` (`src/lib/session/viewer-queries.ts`), or sits under a prefix already there, so login and logout remove it. Read it with `useAccountQuery` (which refuses an unregistered key outside production) or, for another session-only hook, `withSessionExpiry` with `enabled: hasSession`, and add its key to `tests/unit/session/session-query-keys.test.tsx`. A key read by guests too whose answer depends on the viewer goes in `VIEWER_AWARE_QUERIES`.
- Forms use the shared parts: `AuthForm`, `SubmitButton`, `FormAlert`, `useFormFocus` and the code timers in `src/components/form/`, the waits and `useCountdown` in `src/lib/forms/`; a list or section that cannot be read shows `ListError` (`src/features/account/lists/list-error.tsx`, `frame="inline"` inside a card), which honours a 429's `retry_after`.
- Address wording is «آدرس» (never «نشانی»): «آدرس‌های من», «افزودن آدرس جدید», «آدرس کامل».

- Money shown in cart, checkout and orders comes **only** from API fields. Never add amounts in the client.
- Placement sends `expected_total` = the cart's `total` and an `Idempotency-Key` created when the review section is reached. The key is kept until a 2xx arrives and is new for the next purchase.
- Every payment intent and wallet top-up gets a **new** `Idempotency-Key` per user click, reused only for automatic retries of that same click (for example `payment_attempt_starting`).
- Before any navigation to a bank, persist `pendingPayment[payment.uuid] = { kind: 'order' | 'topup', orderCode?, orderUuid?, linkToken?, route, amount, startedAt }` in `localStorage` (`ff-pending-payments`, entries older than 7 days pruned).
- A pure pay-on-delivery order (`amount_charged_online === 0`) is confirmed right after placement with intent `route: 'pay_on_delivery'`.
- `pay_on_delivery` is offered only when the online amount is 0.
- Shipping selection must be re-checked (`shipping.is_selected && shipping.is_available`) before placing an order. Item, coupon, destination and merge changes clear it.
- Result-page truth comes from `GET payment/<uuid>/status/`. Query parameters only pick the wording.
- Polling: 15 s ×4, then 30 s ×4, then 60 s. Stop after 15 min. Pause when `document.hidden`. Honour `retry_after`.
- Guest orders are never shown as "in your account". The thank-you page shows the order code, the payment link, the deadline and tracking instructions. The last 10 guest orders are kept in `localStorage` (`ff-guest-orders`).
- Routes `/cart/`, `/checkout/`, `/payment/callback/`, `/order/pay/[token]/` and `/order/track/` are `noindex` and dynamic.

## Review Focus

1. **The total changes between review and place** (`409 order_total_changed`) or the shipping selection is cleared. The UI re-reads the cart, shows the new amounts, and requires a new confirmation without losing the receiver form. Test in Task 3.
2. **A double click on "pay"** sends one intent. `payment_attempt_open` shows the resume UI instead of an error. Test in Task 4.
3. **The result page opened on another device** (no `pendingPayment` entry), with `result=success` but status still `pending`. It shows "checking", polls, and never claims success early. Test in Task 5.
4. **Card-to-card receipt validation:** a file over 5 MiB, the wrong type, `paid_at` in the future, or a last-4 field with Persian digits. Each is caught client-side with a Persian message, and server errors map to fields. Test in Task 6.
5. **The wallet with `is_frozen: true` or an insufficient balance.** Wallet routes are hidden or disabled with the backend reason, and top-up and withdrawal controls are hidden while frozen. Test in Task 9.

---

### Task 1: Cart page

**Files:**
- Create: `src/app/(shop)/cart/page.tsx`, and in `src/features/cart/components/`: `cart-page.tsx`, `cart-line.tsx`, `cart-summary.tsx`, `coupon-box.tsx`, `cart-notices.tsx`, `empty-cart.tsx`
- Modify: `src/features/cart/hooks.ts` (add `useApplyCoupon`, `useRemoveCoupon`, `useClearCart`)
- Test: `tests/unit/cart/cart-summary.test.tsx`, `tests/unit/cart/coupon-box.test.tsx`, `tests/unit/cart/cart-notices.test.tsx`

**Interfaces:**
- `CartSummary({ cart: Cart, variant: 'cart' | 'checkout' })` renders the rows of `cart-address.md` §5.3 from API fields only:
  - goods total;
  - product discounts;
  - coupon discount (with the code chip);
  - shipping (or «پس از انتخاب روش ارسال»);
  - shipping discount;
  - tax;
  - total;
  - «سود شما از این خرید» when savings > 0;
  - online versus on-delivery split when relevant.
- `CouponBox`: an input with apply and remove. It is hidden when the `coupons` feature is off. `coupon_*` errors show their detail inline. A free-shipping coupon (`coupon_discount` 0) shows «ارسال رایگان پس از انتخاب روش ارسال اعمال می‌شود».
- `CartNotices`: renders the once-only `adjustments`, `coupon.detached_reason` and line `issue` values as dismissible alerts.
- Cart line: image, name linked to the product, `variant_name`, unit price (with strike-through), stepper (debounced), remove (with undo toast re-adding), and the line total.
- Layout: lines at the start with the summary sticky at the end (`lg`). Mobile shows a fixed bottom bar with the total and «ادامهٔ خرید».
- The empty state uses an illustration and links to the home page.

- [ ] **Step 1: Write failing tests** with a cart fixture captured live (`GET /api/v1/cart/` with an item and a coupon; save to `tests/fixtures/cart-*.json`):
  - The summary prints the API's `total` and never a client-computed sum.
  - The coupon box shows the `coupon_minimum_not_met` detail inline.
  - Notices render `adjustments` text.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: cart page with coupon, notices and API-driven summary`.

### Task 2: Checkout — receiver, destination and shipping

**Files:**
- Create: `src/app/(checkout)/layout.tsx` (minimal header: logo, «خرید امن», a back-to-cart link; no mega menu, no bottom nav), `src/app/(checkout)/checkout/page.tsx`, and in `src/features/checkout/`: `checkout-page.tsx`, `use-checkout.ts` (state machine), `receiver-section.tsx`, `address-picker.tsx`, `guest-receiver-form.tsx`, `shipping-section.tsx`, `shipping-option.tsx`, `step-header.tsx`
- Test: `tests/unit/checkout/use-checkout.test.tsx`, `tests/unit/checkout/shipping-section.test.tsx`

**Interfaces:**
- `useCheckout()` returns `{ cart, step: 'receiver' | 'shipping' | 'payment' | 'review', destinationReady: boolean, shippingReady: boolean, setDestinationByAddress(id), setDestinationByCity(provinceId, cityId), selectShipping(methodId, cashOnDelivery: boolean), receiver, setReceiver }`.
- A signed-in user picks among saved addresses (default preselected; «افزودن آدرس جدید» opens the Plan 3 `AddressSheet`). Picking an address posts `cart/destination/ { address }`.
- Guest: the receiver form (name, mobile, province, city, address, plaque, unit, postal code, which is required here) and an optional `customer_mobile`. The destination posts `{ province, city }`, and the receiver is kept for placement. If the `guest_checkout` feature is off, show «برای ادامه وارد شوید» with login and register buttons carrying `next=/checkout/`.
- Shipping:
  - list `cart/shipping/option/list/`;
  - each option shows title, carrier logo, cost (a fare collected at the door is labelled «پس‌کرایه» and never «رایگان»), ETA «تحویل ۲ تا ۴ روز کاری», and a COD toggle when offered;
  - when nothing is selected, auto-select the operator's default: the first option in the API's order that is available and whose sender pays (`freight_payer === 'sender'`), not one the API refused for this cart. If there is none, select nothing and ask the shopper. Never silently pick a free pickup or a door-paid fare (controller ruling, Task 2 fix round 1);
  - a 409 COD-ceiling error on select shows its detail and falls back to prepaid.

- [ ] **Step 1: Write failing tests.**
  - `useCheckout` goes to `shipping` after a destination succeeds.
  - The operator's default (the first available, sender-paid option) is auto-selected; with none, nothing is selected and the shopper is asked.
  - A tipax-like option with cost 0 and door payment renders «پس‌کرایه», not «رایگان».
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: checkout receiver, destination and shipping sections`.

### Task 3: Checkout — payment route choice, review and placement

**Files:**
- Create in `src/features/checkout/`: `payment-section.tsx`, `payment-route-option.tsx`, `gateway-chooser.tsx`, `review-section.tsx`, `place-order.ts`, `idempotency.ts`
- Create in `src/features/payment/`: `api.ts`, `routes.ts` (route availability rules), `pending-payments.ts`, `go-to-bank.ts`
- Create: `src/features/orders/guest-orders.ts`, `src/app/(checkout)/checkout/thanks/[code]/page.tsx` (client; reads the guest or user order context)
- Test: `tests/unit/payment/routes.test.ts`, `tests/unit/payment/pending-payments.test.ts`, `tests/unit/checkout/place-order.test.ts`

**Interfaces:**
- `availableRoutes(input: { methods: PaymentMethod[]; isGuest: boolean; wallet: { balance: number; is_frozen: boolean } | null; online: number /* A or O */; onDelivery: number; gateways: Gateway[]; features }): RouteChoice[]`. It encodes the table in `order-payment.md` §5.3. Every route comes back with `{ route, enabled, reason?: string }`.
- `goToBank(handoff: RedirectPayload): void`, exactly the algorithm in `order-payment.md` §5.4: GET builds the URL; POST builds and submits a form.
- `savePending(uuid, ctx)`, `getPending(uuid)` and `prunePending(now)`.
- `newIdempotencyKey(): string` (`crypto.randomUUID()`).
- `placeOrder({ isGuest, receiver?, customerMobile?, note?, expectedTotal, key }): Promise<PlacedOrder>`. It handles `409 order_total_changed` by throwing a typed error that the UI turns into the "total changed" dialog.
- `startPayment({ door: { kind: 'uuid'; orderUuid } | { kind: 'link'; token }, route, gatewayCode?, key }): Promise<PaymentIntentResult>`.
- Flow after the click on «ثبت سفارش و پرداخت»:
  1. place;
  2. save the guest order when a guest;
  3. clear the cart cache;
  4. if `requires_online_payment === false`, run the `pay_on_delivery` intent and go to the thanks page;
  5. otherwise, per the chosen route: bank (save pending, then `goToBank`), wallet (go to thanks), card transfer (go to `/payment/card-transfer/<uuid>/`), wallet plus gateway (save pending, then `goToBank`).
- The review section shows a compact line list, the receiver and shipping summary, `CartSummary` with the online versus door split, an optional customer note, and the checkboxes for `accept_terms_text` and `confirm_legal_age` from settings (required when the text is non-empty).

- [ ] **Step 1: Write failing tests.**
  - `availableRoutes` hides `pay_on_delivery` when online > 0.
  - It hides wallet for guests.
  - It disables wallet when frozen, with a reason.
  - It enables `wallet_and_gateway` only when `0 < balance < online`.
  - `goToBank` with POST builds a form with hidden inputs and calls `submit`.
  - `placeOrder` maps a 409 `order_total_changed` to `TotalChangedError`.
  - `prunePending` drops entries older than 7 days.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: checkout payment choice, review and order placement`.

### Task 4: Open-attempt resume and the payment-link page

**Files:**
- Create: `src/features/payment/open-attempt.tsx`, `src/app/(checkout)/order/pay/[token]/page.tsx`, `src/features/payment/pay-link-page.tsx`
- Test: `tests/unit/payment/open-attempt.test.tsx`

**Behaviour:** As in `order-payment.md` §5.9 and the link-page sections.
- `OpenAttempt` renders the table rows (continue at bank, cancel and retry, verifying, card-transfer pending, receipt under review). «انصراف» means cancel, then a new intent with a new key.
- `/order/pay/<token>`: summary, money split, deadline countdown, lines, route choice (reusing `availableRoutes`), and cancel order (confirm dialog). An expired or unpayable link shows the backend detail and links to tracking and support.

- [ ] **Step 1: Write failing tests.** An open attempt with a handoff shows «ادامه در …» and calls `goToBank`. An attempt without a handoff and with `expires_at` shows «انصراف و پرداخت دوباره».
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: payment-link page and open-attempt resume`.

### Task 5: Payment result page and polling

**Files:**
- Create: `src/app/(checkout)/payment/callback/page.tsx`, and in `src/features/payment/`: `result-page.tsx`, `use-payment-status.ts`, `result-copy.ts`
- Test: `tests/unit/payment/result-copy.test.ts`, `tests/unit/payment/use-payment-status.test.tsx`

**Interfaces:**
- `resultCopy(status: PaymentStatusView, code: string | null): { tone: 'success' | 'pending' | 'error' | 'info'; title: string; body: string; actions: ResultAction[] }`. The Persian copy and actions are copied verbatim from the table in `order-payment.md` §5.10.
- `usePaymentStatus(uuid: string | null)`: the polling policy from the Global Constraints. It tries with the session; on `403 payment_forbidden` it retries without the session through the BFF query flag `?anon=1`. This requires a small BFF addition: when `anon=1` is present on `payment/<uuid>/status/`, don't attach `Authorization` and strip the flag.
- The page:
  - a large animated status icon (check, spinner or alert), then the title, body, order code and amount;
  - actions: order detail (user), tracking (guest), pay again (new key, using the door from `pendingPayment` or from the order), wallet (top-up);
  - success clears the pending entry and fires a subtle confetti animation (reduced-motion safe).

- [ ] **Step 1: Write failing tests.**
  - `resultCopy` for `failed` plus `gateway_capture_not_bookable` returns the exact sentence «پرداخت روی سفارش ثبت نشد. اگر مبلغی از حساب شما کسر شده، بانک حداکثر ظرف ۷۲ ساعت آن را برمی‌گرداند.»
  - Polling schedule with fake timers: 4 calls 15 s apart, then 30 s, and it stops after 15 min.
  - A 403 then an anonymous retry.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (including the BFF `anon` flag, with a test in `tests/unit/bff/handler.test.ts`). **Step 4:** PASS. **Step 5:** Commit: `feat: payment result page with status polling`.

### Task 6: Card-to-card transfer and receipt upload

**Files:**
- Create: `src/app/(checkout)/payment/card-transfer/[uuid]/page.tsx`, and in `src/features/payment/card-transfer/`: `card-transfer-page.tsx`, `destination-card.tsx`, `receipt-form.tsx`, `validate-receipt.ts`, `src/components/ui/jalali-date-time-input.tsx`
- Test: `tests/unit/payment/validate-receipt.test.ts`, `tests/unit/ui/jalali-date-time-input.test.tsx`

**Behaviour:** `order-payment.md` §5.7.
- Cards are always loaded with `GET payment/<uuid>/card-transfer/`. They show bank, holder, a copyable card number (grouped in fours, LTR), sheba, the amount and the instruction HTML.
- Receipt form: image (preview), `payer_card_last_digits`, `paid_at` (Jalali date and time input converting to ISO `+03:30`), `destination_card`, optional `bank_reference`.
- `validateReceipt(input, now): Record<string, string>` covers the rules in §5.7 step 3, with Persian messages.
- Submit is multipart through the BFF. 201 → «رسید ثبت شد و در صف بررسی است» with links to the order or tracking.
- Cancel before upload is available.

- [ ] **Step 1: Write failing tests.**
  - A 6 MiB file → «حجم تصویر نباید بیشتر از ۵ مگابایت باشد».
  - `image/gif` is rejected.
  - Future `paid_at` is rejected.
  - Last digits «۱۲۳۴» normalise to `1234` and pass.
  - The Jalali input for 1405/07/23 15:00 produces `2026-10-15T15:00:00+03:30`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: card-to-card transfer with receipt upload`.

### Task 7: Guest order tracking

**Files:**
- Create: `src/app/(shop)/order/track/page.tsx`, `src/features/orders/track/track-form.tsx`, `src/features/orders/track/track-result.tsx`, `src/features/orders/components/order-timeline.tsx`, `src/features/orders/components/order-progress.tsx`, `src/features/orders/components/order-lines.tsx`
- Test: `tests/unit/orders/order-progress.test.tsx`, `tests/unit/orders/track-form.test.tsx`

**Behaviour:**
- `POST order/track/ { order_code, mobile }` (digits normalised).
- The result shows the progress bar (`order-payment.md` §6), the timeline, lines, money, shipping and tracking code, and a payment link when payable.
- «سفارش‌های اخیر شما» lists local guest orders for one-tap tracking.
- Error codes show their details.

- [ ] **Step 1: Write failing tests.** `OrderProgress` marks the steps up to `sent` as done for status `sent`, and shows a distinct cancelled state. The track form normalises «۰۹۱۲…».
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: guest order tracking`.

### Task 8: Account orders and awaiting reviews

**Files:**
- Create: `src/app/(shop)/account/orders/page.tsx` (replaces the placeholder), `src/app/(shop)/account/orders/[code]/page.tsx`, `src/app/(shop)/account/reviews/page.tsx` (replaces the placeholder), and in `src/features/orders/account/`: `orders-page.tsx`, `order-card.tsx`, `order-detail-page.tsx`, `order-actions.tsx`, `qr-dialog.tsx`, `cancel-dialog.tsx`, `src/features/orders/reviews/awaiting-reviews-page.tsx`, `src/features/orders/reviews/purchase-review-form.tsx`
- Modify: remove the «به‌زودی» placeholders for orders and reviews.
- Test: `tests/unit/orders/order-actions.test.tsx`, `tests/unit/orders/purchase-review-form.test.tsx`

**Behaviour:**
- Tabs come from `summary.orders.groups` (labels as given; `?group=` in the URL). The list is `order/list/?status_group=…&sort=…`, paginated.
- Order card: code, Jalali date, status pill (`status_display`), item thumbnails (up to 4, plus «+n»), total, and a primary action.
- Detail: progress, timeline, lines, receiver, shipping, money split, payments list, and actions:
  - «پرداخت» (`is_payable`; route choice via `availableRoutes` with the uuid door);
  - «تأیید سفارش» (pure COD awaiting payment);
  - «لغو سفارش» (`can_cancel`);
  - «خرید دوباره» (`cart/reorder/` → toast with skipped items → `/cart/`);
  - «کد QR» (`order/<code>/qr-code/`).
- Awaiting review: a list of (order, product) pairs with a review form per item: rating, title, text, positive and negative points. It uses `POST order/<code>/review/`, then refreshes the list and summary.

- [ ] **Step 1: Write failing tests.**
  - `OrderActions` shows «تأیید سفارش» for `awaiting_payment` with online 0 and `is_payable: false`.
  - It shows «پرداخت» when `is_payable`.
  - It hides cancel when `can_cancel` is false.
  - The review form requires a rating per the backend contract and maps errors.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: account orders, order detail actions and purchase reviews`.

### Task 9: Wallet

**Files:**
- Create: `src/app/(shop)/account/wallet/page.tsx` (replaces the placeholder), and in `src/features/wallet/`: `wallet-page.tsx`, `balance-card.tsx`, `top-up-form.tsx`, `transactions-list.tsx`, `withdrawals.tsx`, `withdrawal-form.tsx`, `payment-history.tsx`, `payment-history-detail.tsx`, `api.ts`
- Modify: remove the wallet placeholder.
- Test: `tests/unit/wallet/top-up-form.test.tsx`, `tests/unit/wallet/withdrawal-form.test.tsx`

**Behaviour** (`order-payment.md` §7 and §5.12):
- Balance card: the balance in large Persian digits; when frozen, a frozen badge and `freeze_message`.
- Top-up: preset chips plus a custom amount. Bounds come from `GET wallet/`. A gateway chooser appears when there is more than one gateway. Then save pending and `goToBank`.
- Transactions: filters for direction and cause, and ordering.
- Withdrawals: request (amount and sheba or IBAN per backend fields, with validation messages), list with status pills, and cancel while pending.
- Payment history: filters for status, method and `applies_to`, plus detail, including the card-transfer rejection reason.
- Everything wallet-related is hidden when the `wallet` feature is off, except the read-only balance and ledger.

- [ ] **Step 1: Write failing tests.**
  - The top-up form rejects an amount below `minimum_top_up_amount` with the bound in Persian digits.
  - The top-up form is hidden when `is_frozen`.
  - The withdrawal form normalises Persian digits in the sheba.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit: `feat: wallet balance, top-up, ledger, withdrawals and payment history`.

### Task 10: Checkout and orders quality gate

**Files:**
- Create: `tests/e2e/checkout/guest-cod.spec.ts`, `tests/e2e/checkout/user-wallet.spec.ts`, `tests/e2e/checkout/card-transfer.spec.ts`, `tests/e2e/checkout/orders.spec.ts`

- [ ] **Step 1: e2e against the dev backend.** Use the accounts and shipping methods listed in `cart-address.md` §9 and `order-payment.md` (sample data).
  - A guest adds a product, applies coupon `TEA30` or `FREESHIP` where valid, sets the Tehran destination, selects a COD-capable method with COD, places the order, and sees the thanks page with order code and payment link. Tracking with code and mobile finds it.
  - A signed-in user with wallet balance places an order paid by wallet; the order appears in `/account/orders/` under «در حال پردازش».
  - Card-to-card: a guest places an order, chooses card transfer, sees destination cards, uploads a 400×400 PNG receipt fixture, and sees «در صف بررسی».
  - Bank gateway: the dev backend returns `gateway_not_configured`. Assert the UI shows the misconfiguration message and does not navigate. Bank redirect itself is covered by unit tests.
  - The payment result page with `?result=failed&payment=<uuid of a cancelled attempt>` shows the correct copy.
  - Orders: buy again on a delivered order shows a toast and fills the cart; cancel on an awaiting-payment order works.
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e` all pass.
- [ ] **Step 3: Visual pass.** Cart, checkout (each section), thanks, result (success, pending, failed), card transfer, tracking, orders list and detail, and wallet, at 375, 768 and 1440 px. Fix issues.
- [ ] **Step 4:** Commit: `test: checkout, payment and orders e2e gate`. Push to `origin main`.

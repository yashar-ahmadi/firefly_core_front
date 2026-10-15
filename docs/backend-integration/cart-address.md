# Firefly Core: Cart, Address Book, Geography: Frontend Integration Digest

Scope: `cart-api.txt` (12 cart endpoints), `address-api.txt` (6 address endpoints), `transportation-api.txt` (2 geography endpoints), plus the storefront-relevant facts from `shipping-coupon-backend.txt`. All three API guides were read end to end.

**Verification.** Every endpoint below was run against the dev server (`http://localhost:8000`, 2026-10-15) with sample data. I ran guest carts (add/PUT/DELETE/clear, all coupon error codes, FREESHIP and TEA30, destination errors and success, option listing, COD selection, prepayment, the COD ceiling, empty-cart behaviour, unknown and expired tokens), logged in as `javad.abbasi` (who already had a cart, so this was a real merge with a clamp) and `kamran.yazdi` (no cart, so the guest cart was adopted), and tested destination-by-address, the address-book CRUD with its cart side effects, reorder plus its throttle, the transportation lists, and CORS. Every TypeScript interface matches live JSON. Anything I could **not** exercise live is marked *(doc-only)*. In practice that is feature toggles turned off, `issue != null` lines, `reorder_skipped`, and `detached` coupons through expiry.

Sample accounts: password `Firefly@1234`. Log in with `POST /api/v1/account/auth/login/` and body `{"login_method":"phone","login_identifier":"09391234512","password":"..."}`. The tokens are in `data.tokens.access` / `data.tokens.refresh`. The access token lives about 15 minutes.

---

## 0. TL;DR for the implementer

1. **Every successful cart call returns the whole priced cart.** After any write, render straight from the response. Never add money fields together yourself. Every displayable amount already has its own field.
2. **Guest identity is `X-Cart-Token`.** It is issued only by the first successful `POST /cart/item/add/` (also by merge and reorder, but those require login). Read it from `data.token`, not from the header. Store it unless it is `""`. Update it after *every* successful response.
3. **Logged-in users:** send the guest token **once** right after login (ideally on `POST /cart/merge/`), show `adjustments`, then delete the stored token and never send it again.
4. **An expired or invalid access token makes cart calls silently anonymous** (GET returns an empty cart with `token:""`). Refresh the access token proactively before cart calls. Only `merge` (401 `cart_token_required`) and `reorder` (401 `token_not_valid`) tell you.
5. **Checkout order:** destination, then `GET shipping/option/list/`, then `POST shipping/select/`, then re-read the cart, then place the order with `expected_total`. These all **clear the shipping selection**: any item change (even a no-op PUT), applying or removing a coupon, changing the destination, a real merge, reorder, and editing or deleting the address that is the destination (when the province or city changes).
6. **Money sent to the gateway is `amount_charged_online`.** Use neither `total` nor `amount_payable_online`. If `amount_charged_online === 0`, place the order as pay-on-delivery and do not redirect to a gateway.
7. **Tax is non-zero in the sample data (10%).** Never hard-code a rate; display `tax_amount`.
8. **Things that come back only once:** `coupon.detached_reason`, `adjustments` (merge, implicit merge, reorder) and `reorder_skipped`. Surface them from the response that carries them.

---

## 1. Shared conventions (cart, address, transportation)

### 1.1 Envelope

```ts
interface ApiEnvelope<T> { msg: string; code: number; data: T }   // code === HTTP status
interface ApiErrorItem { code: string; detail: string; attr: string | null }
interface ApiErrorData {
  type: 'validation_error' | 'client_error' | 'server_error';
  errors: ApiErrorItem[];          // validation_error may have many (even several per field)
  retry_after?: number;            // 429 only; integer seconds, never 0
  feature?: string;                // 503 feature_disabled only (doc-only)
  feature_name?: string;           // Persian name of the toggle (doc-only)
}
```

- Error `msg` is always the **generic** Persian sentence for the status, for example 400 `درخواست ارسالی معتبر نیست.`, 404 `موردی با این مشخصات پیدا نشد.`, 401 `برای این درخواست باید احراز هویت کنید.`, 405 `این متد برای این آدرس مجاز نیست.` and 429 `تعداد درخواست‌های شما بیش از حد مجاز است.`. The user-facing reason is `data.errors[0].detail`, and the branching key is `data.errors[0].code`.
- `cart_*`, `coupon_*` and `address_*` business errors are `type: "client_error"` with `attr: null` and **exactly one** error. Input-shape errors (`required`, `null`, `invalid`, `does_not_exist`, `incorrect_type`, `min_value`, `max_value`, `max_length`, `max_digits`, `invalid_code`, `invalid_iranian_mobile`, `invalid_choice`) are `validation_error` with `attr = field`.
- Persian numbers inside `detail` use Persian digits with the `٬` separator (`۲۰٬۰۰۰٬۰۰۰ تومان`). Display them as-is and never parse them.
- **Cart success `msg` values (verified):**
  - add: `کالا به سبد خرید اضافه شد.`
  - DELETE item: `کالا از سبد خرید حذف شد.`
  - clear: `سبد خرید خالی شد.`
  - coupon apply: `کوپن تخفیف اعمال شد.`
  - coupon remove: `کوپن تخفیف حذف شد.`
  - shipping select: `روش ارسال انتخاب شد.`
  - reorder: `اقلام قابل خرید این سفارش به سبد خرید اضافه شد.` when `added_lines > 0`, otherwise `هیچ‌کدام از اقلام این سفارش در حال حاضر قابل خرید نیست.`
  - GET cart, PUT quantity, destination, option list and merge use the generic `درخواست با موفقیت انجام شد.`
- **Address `msg`:** create returns 201 `با موفقیت ایجاد شد.`. Delete returns **204 with no body**: handle it before calling `response.json()`.
- **Bad JSON** returns 400 `parse_error` (`ساختار JSON ارسالی معتبر نیست.`). Form-encoded bodies are accepted too. Numeric strings such as `"2"` are accepted for integer fields, while `2.5` gets `invalid`.
- **Non-numeric path ids** (`/cart/item/abc/`, `/address/abc/`) do not match any route. The dev server (DEBUG) answers with an HTML 404; production answers with a JSON 404 `not_found`.

### 1.2 Headers

| Header | Cart | Address | Transportation |
|---|---|---|---|
| `X-API-Key` | required in prod (401 `api_key_missing` / `api_key_invalid`); disabled in this dev env | required | required |
| `Authorization: Bearer <access>` | optional; binds the cart to the account. Invalid or expired means **silently guest** (except merge and reorder) | **required** (401 `not_authenticated` / `token_not_valid`) | ignored; an invalid token is not rejected |
| `X-Cart-Token` | guest: on every cart call; logged in: only on the first cart call after login | n/a | n/a |
| `Content-Type: application/json` | POST/PUT | POST/PUT/PATCH | n/a |

### 1.3 CORS (verified from settings and preflight)
- `CORS_ALLOWED_ORIGINS` = `http://localhost:3000`, `http://127.0.0.1:3000`, `:8000` variants, plus `https://{SITE_DOMAIN}` / `http://{SITE_DOMAIN}`. A storefront on any other origin is **silently refused** by the browser. Either deploy on `SITE_DOMAIN`, ask for the origin to be added, or proxy through the Next.js server.
- Allowed request headers: the defaults plus `X-API-Key`, `X-Cart-Token`, `Idempotency-Key`. `Access-Control-Allow-Credentials: true`. Preflight max-age is 86400.
- **Exposed response headers: only `X-Cart-Token`.** `Retry-After` is **not** readable cross-origin, so use `data.retry_after`.

### 1.4 Throttles (live-verified for reorder)
- Global: anonymous 2000/hour per IP, user 5000/hour per account. Scoped: coupon apply 20/min (guest by IP, user by account, **all** attempts count) and reorder 10/min per account (all attempts count). These are configurable through `THROTTLE_*` env vars.
- 429 body: `{type:"client_error", errors:[{code:"throttled", detail:"… 55 ثانیه …"}], retry_after: 55}` plus header `Retry-After: 55`. Disable the button for `retry_after` seconds.
- **SSR/BFF gotcha (Next.js).** Anonymous throttling uses the connection IP. `X-Forwarded-For` is honoured only when `REMOTE_ADDR` is in `TRUSTED_PROXY_IPS` (exact match, `TRUSTED_PROXY_HOPS` from the right). If Next.js route handlers or server actions call the cart API on behalf of guests without being a trusted proxy, **all guests share one 2000/h budget and one 20/min coupon budget.** Either call cart endpoints from the browser, or get the Next server's IP into `TRUSTED_PROXY_IPS` and forward the client IP in `X-Forwarded-For`.
- **Absolute URLs follow the request `Host`.** `CartLine.image` and pagination `next`/`previous` are built from the Host header (verified: `Host: 127.0.0.1:8000` produced `http://127.0.0.1:8000/media/...`). If the Next server calls the API through an internal hostname, image URLs will point at that internal host. Call the API through its public host, or rewrite the URLs.

### 1.5 Caching
- Cart and transportation responses carry **no** `Cache-Control`, `ETag` or `Last-Modified` (verified). Cart calls in Next.js must use `cache: 'no-store'`. Never cache cart responses, because prices are recomputed live on every read.
- Provinces and cities: cache on the client, keyed by province id, with about a 24 h TTL (see section 7).

### 1.6 Feature toggles relevant to checkout (doc-only behaviour; `GET /api/v1/global/feature-status/` verified shape)

`GET /api/v1/global/feature-status/` returns a paginated list `{feature_key, display_name, is_enabled, disable_reason}`. The keys are `blog`, `blog_comments`, `product_comments`, `wallet`, `pay_on_delivery`, `guest_checkout`, `registration`, `online_payment`, `stock_notifications` and `coupons`. All were enabled in dev. This endpoint is never gated.

| Toggle off | Effect on storefront |
|---|---|
| `coupons` | `POST /cart/coupon/apply/` returns **503 `feature_disabled`** (`type:"server_error"`, `data.feature`, `data.feature_name`; `detail` may be the operator's own sentence, so show it). The check runs after the throttle and **before** the cart lookup, so even a cart-less call gets 503. `DELETE /cart/coupon/remove/` stays open. Already-applied coupons keep being re-validated. |
| `pay_on_delivery` | No option disappears. Options report `supports_cash_on_delivery:false`, `cod_fee:0`, `cod_max_amount:null`. Selecting with `cash_on_delivery:true` returns 503 `feature_disabled` (`feature:"pay_on_delivery"`) before anything is written. A cart that had already chosen COD comes back with `shipping.is_selected:true, is_available:false, reason:"پرداخت هنگام تحویل در حال حاضر غیرفعال است. این روش ارسال را با پرداخت آنلاین انتخاب کنید، یا روش دیگری برگزینید."` and `POST /order/place/` returns 409 `order_shipping_method_unavailable`. |
| `guest_checkout` | Every cart endpoint keeps working for guests. Only `POST /order/place/` without a valid login returns 503. **Read the toggle before offering "continue as guest".** |

---

## 2. X-Cart-Token lifecycle (verified)

### 2.1 Rules
| Situation | Server behaviour (verified) | Client action |
|---|---|---|
| `GET /cart/` with no token and no auth | 200, empty cart, `token:""`, **no** `X-Cart-Token` header, **no DB row** | Render the empty state from `is_empty`. Do not store `""`. |
| First successful `POST /cart/item/add/` | Creates the cart. Returns `data.token` (43-char URL-safe) and the header `X-Cart-Token` | Store `data.token` (localStorage or a first-party cookie, never in a URL). |
| Failed add (any 4xx) with no cart | Nothing created, no token (one transaction) | Nothing to store. |
| Unknown, expired or deactivated token on **GET** | 200, empty cart, `token:""` (verified with a bogus token and with the expired fixture token `WOxRj…`) | Drop the stored token. |
| Same token on **add** | Creates a **new** cart with a **new** token | Always overwrite the stored token with `data.token`. |
| Same token on the other **writes** and the option list | 404 `cart_not_found` (verified on PUT, DELETE item, clear, coupon apply/remove, destination, option list, select) | Clear the token, show the empty cart, **do not replay** the user's action. |
| `cart_token_invalid`, `cart_expired`, `cart_empty` | Defined but **never emitted** | Do not branch on them. |
| Logged in + valid access token | The cart is found by **account**. `data.token` and the header carry the **user cart's** token (verified). That token is **useless anonymously**: a GET with it and no auth returns an empty cart (verified). | Do not store it as a guest token. |
| Logged in + `X-Cart-Token` of a live **guest** cart | **Merge or adoption happens on that request**, even a plain GET or the option list (verified on GET) | Send it once only (preferably on `POST /cart/merge/`), then delete it. |
| Logged in + another *user's* cart token | Ignored (verified: kamran sending javad's token got kamran's own cart, nothing merged) | n/a |
| Logged in + guest token on every request | Responses are unchanged, but every cart write costs about 20 extra queries | Stop sending it after the first post-login call. |
| Expired or garbage access token on the 11 public cart endpoints | Treated as a guest (verified: GET gives an empty cart with `token:""`). Add would create a **new guest cart**. | Refresh the token before cart calls. Treat 401 `cart_token_required` from merge as "refresh the token". |
| Logged-in user with **no** cart, GET | 200, empty, `token:""`, no row | n/a |
| After logout | The user cart token is useless anonymously | The next add creates a new guest cart. Store its `data.token`. |

### 2.2 Expiry
- Guest carts expire 30 days after the last interaction; user carts after 180 days. Both are configurable.
- Expiry is extended by: add, PUT, DELETE item, clear, destination, select, coupon apply and remove (when there is something to remove), merge and adoption.
- **Not** extended by: GET cart and the option list.
- Expiry is checked on lookup only for **guest** carts. The periodic sweeper deletes any expired cart (guest or user) unless it holds live reservations or a pending card-to-card receipt.

### 2.3 Reference client (adapted from the guide)
```ts
async function cartFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = isSignedIn() ? pendingGuestTokenForMerge() : readGuestToken(); // see 2.1
  const res = await fetch(API + path, {
    ...init, cache: 'no-store',
    headers: { 'X-API-Key': KEY, ...(token ? { 'X-Cart-Token': token } : {}),
               ...(accessToken() ? { Authorization: `Bearer ${accessToken()}` } : {}),
               ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const payload = await res.json();
  if (!res.ok) {
    const e = payload.data?.errors?.[0] ?? {};
    if (e.code === 'cart_not_found') clearGuestToken();
    throw Object.assign(new Error(e.detail), { status: res.status, code: e.code, attr: e.attr,
      retryAfter: payload.data?.retry_after ?? null, all: payload.data?.errors ?? [] });
  }
  const data = payload.data;
  if (isSignedIn()) clearGuestToken();             // never keep a token while signed in
  else if (data?.token) storeGuestToken(data.token); // never store ""
  if (data?.coupon?.detached_reason) notifyCouponDetached(data.coupon);   // once-only
  if (data?.adjustments?.length) notifyAdjustments(data.adjustments);     // once-only
  return data;
}
```

---

## 3. Cart endpoint reference

All paths are under `/api/v1/cart/`. "Public" means no login is required. **Every endpoint except the option list returns the full `Cart`.** Reorder returns `CartReorderResult` (a `Cart` plus 2 fields).

| # | Method | Path | Auth | Creates cart? | Body | Success |
|---|---|---|---|---|---|---|
| 1 | GET | `/cart/` | public | no | — | 200 `Cart` |
| 2 | POST | `/cart/item/add/` | public | **yes** | `{variant:int, quantity?:int=1}` | 200 `Cart` |
| 3 | PUT | `/cart/item/{variant_id}/` | public | no (404) | `{quantity:int}` | 200 `Cart` |
| 4 | DELETE | `/cart/item/{variant_id}/remove/` | public | no (404) | — | 200 `Cart` |
| 5 | DELETE | `/cart/clear/` | public | no (404) | — | 200 `Cart` |
| 6 | POST | `/cart/coupon/apply/` | public, 20/min | no (404) | `{code:string≤30}` | 200 `Cart` |
| 7 | DELETE | `/cart/coupon/remove/` | public | no (404) | — | 200 `Cart` |
| 8 | POST | `/cart/destination/` | public | no (404) | `{address?}` or `{province?, city}` | 200 `Cart` |
| 9 | GET | `/cart/shipping/option/list/` | public | no (404) | — | 200 `{options, adjustments}` |
| 10 | POST | `/cart/shipping/select/` | public | no (404) | `{code:slug, cash_on_delivery?:bool=false}` | 200 `Cart` |
| 11 | POST | `/cart/merge/` | **login** | yes, if the user has none | — | 200 `Cart` |
| 12 | POST | `/cart/reorder/` | **login**, 10/min | yes, if the user has none | `{order_code:string}` | 200 `CartReorderResult` |

Any other method gets 405 `method_not_allowed`. For example, PUT item answers `Allow: PUT, OPTIONS` and PATCH there gives 405; POST on `coupon/remove/` gives 405 (both verified). OPTIONS returns 200 everywhere, and HEAD works on the GETs. Nothing is paginated.

### 3.1 GET `/cart/`
No params. No endpoint-specific errors (only 401 api-key, 405, 429). Empty and "no cart" have the same shape; the only difference is `token:""` and the missing header.

### 3.2 POST `/cart/item/add/`
- `variant` (required int): a **variant id**, not a product id. An unknown id or a variant of an unpublished/draft product gives 400 `does_not_exist` with `attr:"variant"` (verified with draft product variant 10137). Non-numeric gives `incorrect_type`. `null` gives `null`. Missing gives `required`.
- `quantity` (optional int, default 1, 1..10000): `0` gives `min_value`, `10001` gives `max_value`, `"x"` and `2.5` give `invalid`, `null` gives `null`.
- **Additive:** it adds to the existing line (one line per variant), and limits are checked on the **sum**. It is not idempotent, so never auto-retry it.
- Business errors (400 `client_error`, verified):
  - `cart_item_out_of_stock`: the variant is not sellable (stock flag off, warehouse 0, or no warehouse row). For example `چیپس خانواده طعم پنیری در حال حاضر موجود نیست.`. Variant 10004 has stock 0 and gets this. UI: mark "ناموجود" and disable add.
  - `cart_item_insufficient_stock`: some stock exists but not this much. For example `موجودی … تنها ۵۴ عدد است.`, where the number equals the line's max (`available_quantity`). UI: suggest the lower number and re-read, because this number changes.
  - `cart_item_limit_exceeded`: the variant's `order_limit_max`/`order_limit_min`, or the 10,000-per-line sum. For example `سقف تعداد سفارش برای … ۲ عدد می باشد.`. UI: clamp the stepper, because this number is static.
- Adding to a cart does **not reserve stock**. Verified: two guest carts both added the only unit of variant 10039 and both lines show `issue:null`. Reservation happens at order placement and payment.
- Line order equals insertion order. Re-adding does not move a line.

### 3.3 PUT `/cart/item/{variant_id}/`
- `quantity` (required int, 0..10000) is the **absolute** final quantity. `0` removes the line. `-1` gives `min_value`, a missing field gives `required`.
- The line lookup comes first: a variant not in the cart, or a variant that does not exist at all (999999), gives 400 `cart_item_not_found` (`این کالا در سبد خرید شما نیست.`), **even for `quantity:0`**. On a "remove" action, treat `cart_item_not_found` as success and re-render.
- The same stock and limit errors as add apply, but `quantity:0` bypasses stock checks.
- Repeating the same quantity is idempotent for the quantity, **but it still clears the shipping selection and COD** (verified; see section 10).

### 3.4 DELETE `/cart/item/{variant_id}/remove/`
No body. A missing line gives 400 `cart_item_not_found`; treat that as success.

### 3.5 DELETE `/cart/clear/`
- Removes **lines, the coupon and the shipping selection**. The **destination survives** (verified). The token stays valid.
- Clearing an already-empty cart returns 200. The only specific error is 404 `cart_not_found`.
- This is the only operation that silently drops the coupon.

### 3.6 POST `/cart/coupon/apply/`
- `code`: required string, max 30 characters (31 gives `max_length`). It is trimmed and upper-cased (`" tea30 "` matched `TEA30`, verified). `""` passes input validation and returns `coupon_invalid` with `کد تخفیف را وارد کنید.`. `null` gives `null`, missing gives `required`.
- The coupon is validated **against this cart before saving**, so a coupon that would discount nothing is rejected rather than applied.
- **Applying replaces** any existing coupon (verified: ONLYONE, then TEA30, then FREESHIP). Only one coupon is allowed per cart.
- **Applying clears the shipping selection and COD** (verified). After success, re-fetch the options and force a new choice.
- Error codes are checked in this order, first failure wins:

| Code | Live detail |
|---|---|
| `coupon_invalid` | `کد تخفیف معتبر نیست.` / `کد تخفیف را وارد کنید.` |
| `coupon_inactive` | `این کوپن تخفیف فعال نیست.` |
| `coupon_not_started` | `این کوپن تخفیف هنوز شروع نشده است.` |
| `coupon_expired` | `مهلت استفاده از این کوپن تخفیف به پایان رسیده است.` |
| `coupon_usage_limit_reached` | `ظرفیت استفاده از این کوپن تخفیف تکمیل شده است.` |
| `coupon_user_limit_reached` | `شما پیش از این از این کوپن تخفیف استفاده کرده‌اید.` |
| `coupon_first_order_only` | `این کوپن تخفیف فقط برای اولین سفارش قابل استفاده است.` (verified for kamran, who has a paid order) |
| `coupon_min_spend_not_met` | `حداقل مبلغ سبد خرید برای این کوپن ۲۰٬۰۰۰٬۰۰۰ تومان است.` |
| `coupon_max_spend_exceeded` | `حداکثر مبلغ سبد خرید برای این کوپن ۱۵٬۰۰۰٬۰۰۰ تومان است.` |
| `coupon_not_applicable` | `این کوپن تخفیف شامل هیچ‌کدام از کالاهای سبد خرید شما نمی‌شود.` (also returned on an empty cart) |

- Notes on the per-customer and first-order checks:
  - Min and max spend are compared with `goods_total` (after item discounts, before the coupon). Both bounds are inclusive.
  - For **guests**, the per-customer and first-order checks can only use the cart token at apply time (first-order cannot reject a guest at all). The final say is at `POST /order/place/`, which checks the buyer's mobile number. If the quota is spent there, the order is rejected with 409 `order_coupon_no_longer_valid`, the coupon is removed from the cart, and the next attempt succeeds at the correct price.
  - Registering does not reset quotas, because they are tied to the normalized mobile number.
- There is no endpoint that lists active coupons, by design.
- When the `coupons` toggle is off, apply returns 503 `feature_disabled` (doc-only).

### 3.7 DELETE `/cart/coupon/remove/`
- Idempotent: 200 even with no coupon (verified).
- Clears the shipping selection when there was a coupon. The only specific error is 404 `cart_not_found`.
- Never gated by the `coupons` toggle.

### 3.8 POST `/cart/destination/`
- Body: at least one of these. Each accepts `null`, and `""` is treated as absent.
  - `address` (int): a saved address id of the **requesting user**. If present it **wins**: `province` and `city` in the same body are only checked for existence and then ignored. Verified: `{address:10018, province:4, city:301}` gave 200 with Meybod, while `{address, province:9999}` gave `does_not_exist`.
  - `province` + `city` (ints): the guest path. City only is fine, and the province is auto-filled (verified with `{city:301}`, which gave province 8 Tehran). Province only returns `cart_city_required`.
- Errors (verified):

| Status | Code | When |
|---|---|---|
| 400 | `cart_destination_required` (`client_error`, `attr:null`, `مقصد ارسال را انتخاب کنید.`) | `{}`, all three null, or all three `""` |
| 400 | `cart_city_required` (`شهر مقصد را انتخاب کنید.`) | province only |
| 400 | `cart_city_not_in_province` (`شهر انتخاب‌شده متعلق به این استان نیست.`) | the pair does not match |
| 400 | `does_not_exist` (`validation_error`, attr `address`, `province` or `city`) | unknown id, **someone else's address, or a guest sending an address**. All three look the same by design. |
| 400 | `incorrect_type` | non-numeric |
| 404 | `cart_not_found` | no cart |

- The cart stores **either** an address **or** a raw province/city pair; setting one clears the other. `destination.province_id` and `city_id` are filled in both modes.
- **Changing the destination clears the shipping selection and COD.** Re-fetch the options.
- `destination.address` (in logged-in mode) is a full `Address` object, so it contains PII. According to the guide, every destination call clears the selection, even one that re-sends the same destination (not separately verified).

### 3.9 GET `/cart/shipping/option/list/`
- No params. Returns `{options: ShippingOption[], adjustments: Adjustment[]}`. It is the only read that requires a cart (404 `cart_not_found`). It sends the `X-Cart-Token` header.
- **All active methods are returned, including unavailable ones**, in the admin's `display_order` then title order. Inactive methods (for example `post-vije`) never appear, and `post-vije` returns `cart_shipping_method_not_found` on select.
- Unavailable rows: `is_available:false`, `reason` (the operator's sentence, or the default `برای مقصد یا سبد خرید شما نرخی تعریف نشده است.`), and `price = packaging_cost = total = 0`. **Zero price does not mean "free"; only `is_available` matters.** Available rows with `total:0` (for example `hozouri` in Tehran) really are free.
- Empty cart: every option comes back with `is_available:false` and `reason:"سبد خرید شما خالی است."` (verified).
- Without a destination, only zone-less rules match. Verified: before a destination, `peyk-tehran` and `hozouri` were unavailable while `post-*` and `tipax` priced nationally. **Always set the destination first.**
- With a valid **free-shipping coupon**, every available option has `price:0`, but `packaging_cost` is kept and `total = packaging_cost` (verified). The list does **not** show the original fare. The saving appears as `shipping_discount` only after selection.
- With `pay_on_delivery` off, the COD fields are neutralised (see 1.6).
- `supports_cash_on_delivery:true` does **not** mean COD will pass the ceiling. The list never pre-checks `cod_max_amount` against this cart (verified: `peyk-tehran` was advertised as COD-capable on a cart whose door amount was over 20M, and select then failed). The UI may pre-warn by comparing `goods_payable + tax_amount + cod_fee (+ total if freight_payer==='recipient')` with `cod_max_amount`, but the server decides.
- This endpoint can also perform the implicit post-login merge, so read `data.adjustments` here too.

### 3.10 POST `/cart/shipping/select/`
- `code` (required, slug `^[-a-zA-Z0-9_]+$`; `"a b"` gives `invalid` with `attr:"code"`). `cash_on_delivery` (bool, default false; `"maybe"` gives `invalid`).
- The server rebuilds the option list itself; stale client data cannot lock in an old price.
- Errors, in order (verified):
  1. 503 `feature_disabled` if `cash_on_delivery:true` and the toggle is off (doc-only).
  2. 400 `cart_shipping_method_not_found` (`روش ارسال انتخاب‌شده معتبر نیست.`): an unknown or inactive code.
  3. 400 `cart_shipping_method_unavailable`: `detail` equals the option's `reason` (for example `برای این وزن روش های ارسال ارزان تری در دسترس است.`, or `سبد خرید شما خالی است.` on an empty cart).
  4. 400 `cart_cod_not_supported` (`این روش ارسال، پرداخت وجه کالا در محل را پشتیبانی نمی‌کند.`).
  5. 400 `cart_cod_limit_exceeded` (`مبلغ قابل دریافت در محل برای این روش ارسال حداکثر ۲۰٬۰۰۰٬۰۰۰ تومان است.`). The **whole request rolls back** (verified: the cart was left unselected). Suggest continuing without COD.
  6. 404 `cart_not_found`.
- None of the failures change the cart. Verified: failed add, coupon and destination calls all kept the existing selection.

### 3.11 POST `/cart/merge/` (login required)
- No body. Send `Authorization` plus the guest `X-Cart-Token`. Verified outcomes:
  - **The user already has a cart (real merge, javad):**
    - Lines are summed and each one is re-validated and clamped. `adjustments` reported `[{variant_id:10005, product_name:"گوشی موبایل اپل آیفون ۱۶ پرو مکس", requested:3, applied:2, was_dropped:false}]`.
    - **The user's coupon wins.** The guest's coupon moves over only if the user had none.
    - **The shipping selection and COD are cleared.**
    - **The user cart's destination is kept, and the guest destination is discarded even when the user cart has none** (verified with kamran; this is undocumented).
    - The guest cart is deactivated.
    - `data.token` is the **user cart's** token.
  - **The user has no cart (adoption, kamran via a plain GET):** the guest cart is re-owned with the **same token**. Coupon, shipping selection and destination are all kept, the expiry moves to 180 days, and `adjustments:[]`.
  - Authenticated with no guest token: returns the user's cart (creating one if needed), no error.
  - Authenticated with a stale or merged guest token: returns the user's cart, `adjustments:[]`, no error.
  - No auth, or an expired or garbage bearer: **401 `cart_token_required`** (`برای ادغام سبد خرید ابتدا وارد حساب کاربری خود شوید.`). Treat it as "refresh the access token / go to login".
- After a merge the guest token is dead. GET returns an empty cart with `token:""`, writes return 404, and add creates a new cart.
- A line present in both carts that is **unorderable** at merge time gets `applied:0, was_dropped:true` and is removed from the **user's** cart too.
- `adjustments` is never stored. Call merge explicitly right after login so you control when it is shown.

### 3.12 POST `/cart/reorder/` (login required, 10/min)
- `order_code`: 10 digits, Latin or Persian (`"۹۲۴۶۸۶۸۵۰۲"` gave 200, verified). Errors (verified):
  - Wrong length or contains spaces: `invalid_code` (`کد باید دقیقاً ۱۰ رقم باشد.`).
  - `""` gives `blank`, missing gives `required`, `null` gives `null`. All of these are `validation_error` with `attr:"order_code"`.
  - Not one of *this user's* orders (including other people's orders and guest orders): 404 `cart_reorder_order_not_found` (`سفارشی با این کد برای شما پیدا نشد.`).
  - No auth: 401 `not_authenticated`. A bad bearer: 401 `token_not_valid` (unlike the rest of the cart).
  - 429 `throttled` after 10 attempts per minute (verified: `Retry-After: 55` and `retry_after:55`).
- Works on orders in any status, including cancelled or returned ones.
- Each item gets order quantity plus the current cart quantity, clamped like add. A partial clamp shows up in `adjustments`, and a full drop shows `was_dropped:true` and also removes the existing line. Deleted variants and unpublished products go to `reorder_skipped` (name only), shown as "no longer sold".
- Never returns `cart_item_*`. The coupon is kept, the **shipping selection is cleared** (verified), and the request is one transaction.
- Verified: reordering `9246868502` gave `added_lines:2` and 2 new lines.
- **Not idempotent.** Disable the button while in flight, and after a timeout re-read the cart instead of retrying.
- `added_lines` = the number of variants whose quantity increased. Build the UI sentence from it, never from `msg`.

---

## 4. TypeScript interfaces (verified against live JSON and OpenAPI)

```ts
type Toman = number;                       // always integer toman, never null in money fields
type CartChannel = 'website' | 'social_media' | 'store';
type LineIssue = 'unavailable' | 'insufficient_stock' | 'above_order_limit' | 'below_order_limit';
type CouponDiscountType = 'percentage' | 'fixed_amount' | 'free_shipping';
type CouponErrorCode =
  | 'coupon_invalid' | 'coupon_inactive' | 'coupon_not_started' | 'coupon_expired'
  | 'coupon_usage_limit_reached' | 'coupon_user_limit_reached' | 'coupon_first_order_only'
  | 'coupon_min_spend_not_met' | 'coupon_max_spend_exceeded' | 'coupon_not_applicable';

interface CartLine {
  variant_id: number;              // use for PUT/DELETE paths
  product_id: number;
  product_name: string;
  product_slug: string;            // build PDP link
  variant_name: string | null;     // e.g. "وزن بسته: ۵۰۰ گرم | طعم: کلاسیک"; null for simple product
  sku: string | null;
  image: string;                   // absolute URL, NEVER null (variant → product → /static/defaults/default.png)
  unit_name: string | null;        // "عدد", "کیلوگرم"
  quantity: number;                // ≥ 1
  unit_price: Toman;               // before catalogue discount
  unit_discount: Toman;            // active discount only (expired window → 0)
  unit_final_price: Toman;         // unit_price - unit_discount → show big; equals product API final_price
  line_subtotal: Toman;            // unit_price × qty (strike-through)
  line_discount: Toman;            // unit_discount × qty
  line_total: Toman;               // unit_final_price × qty (pre-coupon)
  weight_grams: number | null;     // null → store default weight (800 g in sample data)
  in_stock: boolean;               // manual availability flag only; NOT a quantity guarantee
  available_quantity: number;      // max qty this line can have now; never null; ≤ order_limit_max (if set) and ≤ 10000
  issue: LineIssue | null;         // why the line can't be ordered as-is; null = OK
  order_limit_max: number;         // 0 = unlimited
  order_limit_min: number;         // 1 = no floor; stepper starts here
}

interface CouponBlock {            // never null; empty = all nulls / 0
  code: string | null;             // presence of code = "coupon on cart" (NOT coupon_discount > 0)
  title: string | null;
  discount_type: CouponDiscountType | null;  // null when detached
  amount: Toman;                   // == top-level coupon_discount; 0 for free_shipping
  max_discount_amount: Toman | null;          // cap for percentage coupons (TEA30 → 200000)
  detached_reason: CouponErrorCode | null;    // ONE-SHOT: present only in the response that detached it
}

interface ShippingBlock {          // never null
  code: string | null;
  title: string | null;
  is_selected: boolean;
  is_available: boolean;           // selected && !available → stale: force re-selection, show reason
  price: Toman;                    // == shipping_cost
  packaging_cost: Toman;           // == top-level packaging_cost
  reason: string | null;
  freight_paid_by_recipient: boolean; // property of the method (پس‌کرایه)
  cash_on_delivery: boolean;       // user asked for COD AND method supports it
  cod_fee: Toman;
}

interface Address {                // same object as address book (section 6)
  id: number; title: string;
  receiver_first_name: string; receiver_last_name: string; receiver_full_name: string;
  receiver_mobile: string;         // E.164 "+989…"
  province: number; province_name: string; city: number; city_name: string;
  address: string; plaque: string | null; unit: string | null;
  full_address: string;            // "استان، شهر، نشانی، پلاک X، واحد Y" (no postal code / receiver)
  postal_code: string;             // "" or 10 Latin digits; never null
  latitude: number | null; longitude: number | null;  // both or neither; JSON numbers, 6 dp
  is_default: boolean;
  created: string; updated: string; // ISO 8601 with +03:30
}

interface CartDestination {
  address: Address | null;         // null for guests / raw pair
  province_id: number | null;
  province_name: string | null;
  city_id: number | null;          // null only if the city was deleted → ask again
  city_name: string | null;
}

interface CartAdjustment {
  variant_id: number;
  product_name: string;
  requested: number;               // sum both carts (merge) / order qty + existing (reorder)
  applied: number;                 // always < requested
  was_dropped: boolean;            // applied === 0, line removed entirely
}

interface Cart {
  token: string;                   // "" when no cart
  channel: CartChannel;            // always "website" from this API (operator carts may differ)
  item_count: number;              // Σ quantities → badge
  is_empty: boolean;               // lines.length === 0
  is_orderable: boolean;           // no line has an issue (true for empty cart too)
  lines: CartLine[];
  goods_subtotal: Toman;
  item_discount: Toman;
  goods_total: Toman;              // = subtotal - item_discount; coupon min/max spend basis
  coupon: CouponBlock;
  coupon_discount: Toman;
  goods_payable: Toman;            // max(0, goods_total - coupon_discount); tax basis + shipping-rule money basis
  shipping: ShippingBlock;
  shipping_cost: Toman;
  packaging_cost: Toman;
  shipping_discount: Toman;        // fare waived by free-shipping coupon (only when method selected & available)
  tax_amount: Toman;               // percentage_of(goods_payable, tax_rate); sample data 10%
  cod_fee: Toman;
  total: Toman;
  amount_payable_online: Toman;    // online share BEFORE prepayment (informational)
  amount_due_on_delivery: Toman;   // door share BEFORE prepayment (informational)
  prepayment: Toman;               // moved from door → online
  amount_charged_online: Toman;    // ← GATEWAY AMOUNT
  amount_to_collect_on_delivery: Toman; // ← what the courier collects
  total_savings: Toman;            // item_discount + coupon_discount + shipping_discount
  total_weight_grams: number;
  destination: CartDestination | null;
  adjustments: CartAdjustment[];   // almost always []
}

interface ReorderSkippedLine { product_name: string; variant_name: string | null } // from frozen order
interface CartReorderResult extends Cart { added_lines: number; reorder_skipped: ReorderSkippedLine[] }

interface ShippingOption {
  code: string;                    // send to /shipping/select/
  title: string;
  description: string | null;      // plain text
  is_available: boolean;           // ONLY enable/disable criterion
  reason: string | null;
  price: Toman;                    // 0 when unavailable or free-shipping coupon
  packaging_cost: Toman;
  total: Toman;                    // price + packaging_cost → show next to the name
  delivery_min_days: number | null;// business days; may be 0; null → hide ETA
  delivery_max_days: number | null;
  freight_payer: 'sender' | 'recipient'; // recipient = پس‌کرایه (fare not in online invoice)
  supports_cash_on_delivery: boolean;    // false → don't render COD checkbox
  cod_fee: Toman;
  cod_max_amount: Toman | null;    // null = no ceiling
  prepayment_percentage: number;   // 0..100; read amount from cart.prepayment
}
interface ShippingOptionList { options: ShippingOption[]; adjustments: CartAdjustment[] }

// Requests
interface CartItemAddRequest { variant: number; quantity?: number }       // 1..10000, default 1
interface CartItemQuantityRequest { quantity: number }                     // 0..10000 (0 = remove)
type DestinationRequest =
  | { address: number }                                                    // signed-in only
  | { province?: number; city: number };                                   // guest (city alone OK)
interface ShippingSelectionRequest { code: string; cash_on_delivery?: boolean }
interface CouponApplyRequest { code: string }                              // ≤ 30 chars
interface CartReorderRequest { order_code: string }                        // 10 digits (Latin/Persian)
```

Live sample values: an empty `CouponBlock` is `{code:null,title:null,discount_type:null,amount:0,max_discount_amount:null,detached_reason:null}`. An empty `ShippingBlock` is `{code:null,title:null,is_selected:false,is_available:false,price:0,packaging_cost:0,reason:null,freight_paid_by_recipient:false,cash_on_delivery:false,cod_fee:0}`. An empty cart has `is_orderable:true` and `destination:null`.

---

## 5. Pricing pipeline and what to display

### 5.1 Pipeline (runs on every read and write; nothing price-related is stored)
```
unit_final_price = unit_price - unit_discount          (active discount only)
line_subtotal = unit_price×q ; line_discount = unit_discount×q ; line_total = unit_final_price×q
goods_subtotal = Σ line_subtotal ; item_discount = Σ line_discount ; goods_total = subtotal - item_discount
coupon_discount = coupon on ELIGIBLE lines' line_total (percentage → half-up, capped by max_discount_amount, never > eligible base; fixed → amount ≤ eligible base; free_shipping → 0)
goods_payable = max(0, goods_total - coupon_discount)
shipping: selected method re-quoted (weight, goods_payable, destination zone, channel, now) → shipping_cost, packaging_cost
free_shipping coupon (still valid) → shipping_cost = 0 (packaging untouched); shipping_discount = quoted fare (0 if method unavailable)
tax_amount = percentage_of(goods_payable, tax_rate)          (goods only; not freight/packaging/COD fee)
total = goods_payable + shipping_cost + packaging_cost + tax_amount + cod_fee
amount_due_on_delivery = cod_fee + (freight_paid_by_recipient ? shipping_cost + packaging_cost : 0) + (cash_on_delivery ? goods_payable + tax_amount : 0)
amount_payable_online = max(0, total - amount_due_on_delivery)
prepayment = round_half_up(amount_due_on_delivery × prepayment_percentage / 100)
amount_charged_online = amount_payable_online + prepayment
amount_to_collect_on_delivery = amount_due_on_delivery - prepayment
total_savings = item_discount + coupon_discount + shipping_discount
```
- Invariants to assert in tests: `total === amount_payable_online + amount_due_on_delivery === amount_charged_online + amount_to_collect_on_delivery`, and `goods_subtotal - item_discount - coupon_discount === goods_payable`.
- Rounding is half-up and happens once per division. Don't recompute; display the fields.
- **Wholesale (`major_price`) is never applied** in the cart or order, whatever the quantity.
- **Two thresholds, two bases.** Coupon min/max spend use `goods_total`. Shipping-rule money thresholds use `goods_payable` (after the coupon). A coupon can therefore cost the customer free shipping.

### 5.2 Live-verified numeric examples
- **Coupon TEA30** (30% of the Ahmad Tea brand, capped at 200,000). Cart: tea ×2 (1,240,000) and coffee ×1 (890,000). Result: `goods_total 2,130,000`, `coupon_discount 200,000` (30% of 1,240,000 is 372,000, capped at 200,000), `goods_payable 1,930,000`, `tax 193,000`.
- **Plus peyk-tehran with COD** (Tehran/Tehran). Shipping 65,000, packaging 5,000, `cod_fee 25,000`, so `total 2,218,000`. Then `amount_due_on_delivery 2,148,000` (25,000 + 1,930,000 + 193,000), `amount_payable_online 70,000`, prepayment 0, `amount_charged_online 70,000`, `amount_to_collect_on_delivery 2,148,000`.
- **javad's fixture cart** (TEA30, post-sefareshi, Qom): `shipping 73,120` (52,000 + 16,000 × 1.32 kg), packaging 6,000, `total 2,202,120`. This exactly matches the backend doc's worked example.
- **FREESHIP + post-pishtaz** (1,600 g). Options showed `price:0, packaging 8,000`. After select: `shipping_cost 0`, `packaging 8,000`, `shipping_discount 113,200` (78,000 + 22,000 × 1.6), `total_savings 113,200`, `coupon_discount 0`, `coupon.amount 0`.
- **Prepayment (bar-sangin, recipient-pays, 30%)**, fridge 98 kg: `price 0`, `packaging 30,000`, `freight_paid_by_recipient:true`. That gives `amount_due_on_delivery 30,000`, `prepayment 9,000`, `amount_charged_online 84,599,000` and `amount_to_collect_on_delivery 21,000`.
- **tipax (recipient-pays, in-system fare 0, packaging 15,000):** `amount_due_on_delivery 15,000`. The actual carrier fare is collected off-system by Tipax, so label it "پس‌کرایه: کرایه هنگام تحویل دریافت می‌شود", not "رایگان".

### 5.3 Display mapping (cart and checkout summary)
| UI row | Field | Notes |
|---|---|---|
| Badge count | `item_count` | not `lines.length` |
| Line big price | `unit_final_price`; struck `unit_price` if `unit_discount>0` | |
| Line total | `line_total` (struck `line_subtotal` if `line_discount>0`) | |
| Quantity stepper | min `order_limit_min`, max `available_quantity` | send the absolute value via PUT |
| Line warning | `issue` mapped to a Persian message; also `!in_stock` | |
| Subtotal (strike) | `goods_subtotal` | |
| Product discounts | `item_discount` | |
| Coupon row | show when `coupon.code != null`; amount `coupon_discount`; label `coupon.title` | free_shipping has amount 0, so show "ارسال رایگان" |
| Goods after coupon | `goods_payable` | |
| Shipping | `shipping.is_selected && shipping.is_available` → `shipping_cost` (0 with a coupon means free); recipient-pays → "پس‌کرایه" | stale selection: show `shipping.reason` and force re-select |
| Packaging | `packaging_cost` | separate row; free_shipping does not waive it |
| Tax | `tax_amount` | always a row; never hard-code the % (the rate is not published) |
| COD fee | `cod_fee` | only when COD is chosen |
| Total | `total` | |
| Pay now (gateway) | `amount_charged_online` | 0 means place as pay-on-delivery; no gateway |
| Pay at door | `amount_to_collect_on_delivery` | |
| Prepayment note | `prepayment` (when > 0) | "بیعانه" |
| Your savings | `total_savings` | breakdown: `item_discount`, `coupon_discount`, `shipping_discount` |
| Weight (optional) | `total_weight_grams` | |
| "Ship to" | `destination.city_name`, `destination.province_name` (+ `address.full_address`) | |

### 5.4 Warnings and how the API expresses them (no "price changed" flag exists)
- **Price changed since the item was added:** there is no field for it. Prices are live on every read. Options: diff against your last cart snapshot client-side, and always send `expected_total` (from the last `total`) to `POST /order/place/`. A mismatch gives 409 `order_total_changed`; re-read the cart and confirm again.
- **Out of stock / not enough stock / outside limits:** `line.issue`. The quantity is **not auto-clamped**. Offer "reduce to `available_quantity`" (PUT) or remove. `is_orderable:false` means placement will 409 `order_item_unavailable` (its `data.items[]` has `variant_id`, `product_name`, `issue`, `available_quantity`). Stock is not reserved by the cart, so another shopper can take the last unit before you place the order.
- **Quantity clamped during merge or reorder:** `adjustments[]` (once only) and `reorder_skipped[]`.
- **Coupon no longer valid:** `coupon.detached_reason` (once only). Show for example "کوپن SAVE10 دیگر روی سبد شما اعمال نمی‌شود" plus the coupon error message. Verified: removing items took FREESHIP below its min spend. The response showed `discount_type:null` and `detached_reason:"coupon_min_spend_not_met"`, and the next GET showed `code:null`.
- **Shipping became invalid:** `shipping.is_selected && !shipping.is_available` with a `reason`. The reason can be the method was withdrawn (`این روش ارسال دیگر ارائه نمی‌شود.`), the COD ceiling was exceeded (for example after a coupon expires), COD was switched off, or the rules no longer match. All four money fields are 0 and the fare is excluded from `total`.
- **Shipping selection silently cleared** (after an item change, coupon change, destination change, merge, reorder or address edit): `shipping.is_selected:false`. The UI must return to the shipping step.
- **Free-shipping progress bar:** the API publishes **no threshold**. Rules are hidden, and the only hint is the free-text `announcement` in settings (for example "ارسال رایگان برای سفارش های بالای ۱۰ میلیون تومان."). If you build one, the threshold is a hard-coded or CMS value and must be measured against `goods_payable`, not `goods_total`. Prefer showing the real per-option prices from the option list.

---

## 6. Checkout preparation flow (UI order)

1. **Bootstrap:** `GET /global/feature-status/` (cache it briefly). Note `guest_checkout`, `pay_on_delivery` and `coupons`.
2. **Cart page:** `GET /cart/`. Render from `is_empty`. Show line issues and the `is_orderable` banner.
3. **Edit cart:** `POST item/add/` (additive), `PUT item/{id}/` (absolute; debounce steppers and send the final value), `DELETE item/{id}/remove/`, `DELETE clear/`. Re-render from each response. **Mark the shipping step as "needs re-selection"** after every item change.
4. **Coupon (optional):** `POST coupon/apply/`. On success show `coupon.title` and `coupon_discount` (or "ارسال رایگان"). On error show the detail under the field and keep the input. On 429 disable for `retry_after`. Shipping is cleared.
5. **Login decision:**
   - If guest checkout is disabled, or the user chooses to log in: log in, then `POST /cart/merge/` with the guest token, show `adjustments`, then drop the token. The merge may have **dropped the guest destination and the shipping selection**, so restart from step 6.
   - Guest: continue.
6. **Destination:**
   - Signed in: `GET /account/address/list/` and preselect `results[0]` (the default is always first) or the cart's current `destination.address.id`. Then `POST /cart/destination/ {address:id}`. Allow "add new address" through the address form (section 7), then set it.
   - Guest: province selector, then city selector (section 8). `POST /cart/destination/ {province, city}`. Collect the receiver details (name, mobile, address text, **postal code, which is required at placement for guests**, optional plaque, unit and lat/lng) in local state. They are sent only at `POST /order/place/` as `receiver`.
7. **Shipping options:** `GET /cart/shipping/option/list/`. Render every option:
   - title, description, `total`, ETA from `delivery_min_days`–`delivery_max_days` (business days; hide when null; 0 means "same day");
   - a "پس‌کرایه" badge if `freight_payer==='recipient'`, and a prepayment note if `prepayment_percentage>0`;
   - a COD checkbox only if `supports_cash_on_delivery`, with `cod_fee` and `cod_max_amount` shown;
   - unavailable options disabled with their `reason`.
   Also read `adjustments`.
8. **Select:** `POST /cart/shipping/select/ {code, cash_on_delivery}`. Handle `cart_shipping_method_unavailable` (refresh the list), `cart_cod_limit_exceeded` (offer non-COD) and 503 (COD off).
9. **Review:** re-read with `GET /cart/` right before payment, because prices can change. Check `is_orderable`, `shipping.is_selected && shipping.is_available`, and `coupon.detached_reason`. Display the section 5.3 rows.
10. **Place** (order guide; context only):
    - `POST /api/v1/order/place/` with `X-Cart-Token` (guest) or `Authorization` + `Idempotency-Key` (signed in, unique per purchase, at most 64 chars).
    - Body: `{receiver?, customer_mobile?, customer_note?, expected_total: cart.total}`. The receiver is **required** when the cart has no saved address (every guest) and is **forbidden** when it has one (400 `order_receiver_forbidden`).
    - Cart-derived rejections: 409 `order_cart_empty`, `order_destination_required`, `order_shipping_method_required`, `order_shipping_method_unavailable`, `order_coupon_no_longer_valid`, `order_item_unavailable`, `order_total_changed`, `order_cart_changed` (a stale guest token sent alongside auth triggered a merge), `order_out_of_stock`. Also 400 `coupon_usage_limit_reached` or `coupon_user_limit_reached` (race at placement), and 503 `feature_disabled` for `guest_checkout`.
    - 201 means new, 200 means a replay of the already-placed order.
    - Pay `amount_charged_online`. If it is 0 there is no gateway (pay on delivery).

---

## 7. Address book (`/api/v1/account/address/…`): all endpoints require login

### 7.1 Endpoints
| Method | Path | Success | Notes |
|---|---|---|---|
| GET | `/address/list/` | 200 paginated `Address[]` | `?page` (from 1; out of range or non-numeric gives 404 `not_found` "صفحه نامعتبر"), `?limit` (default 20, max 100; invalid falls back to 20). **Order: default first, then `-created`**. No search, filter or ordering params (unknown ones are ignored). An empty book gives 200 with `count:0`, `total_pages:1`. |
| POST | `/address/create/` | **201** `Address` | |
| GET | `/address/{id}/` | 200 `Address` | Only for deep links; the list has the same data. |
| PUT / PATCH | `/address/{id}/update/` | 200 `Address` | **Not** `/address/{id}/` (PATCH there gives 405, verified). |
| DELETE | `/address/{id}/delete/` | **204, empty body** | |
| POST | `/address/{id}/set-default/` | 200 target `Address` | No body. Idempotent (no write; `updated` unchanged when it is already the default, verified). GET gives 405. |

- Someone else's address, or an id that does not exist, returns **404 `not_found` (`یافت نشد.`), never 403** (verified with javad's 10015 as kamran). The ownership check runs before body validation.
- There is no `user` field in or out. `user`, `id`, `full_address` and the other read-only keys are silently ignored on write (verified).
- The pagination envelope is `{count, total_pages, current_page, page_size, next, previous, results}`.

### 7.2 Fields and validation (`AddressWriteRequest`; verified live)
| Field | POST | PUT | PATCH | Rules |
|---|---|---|---|---|
| `title` | req | req | opt | ≤ 50, not unique |
| `receiver_first_name` / `receiver_last_name` | req | req | opt | ≤ 200 each; independent of the account (gift orders). Offer a "گیرنده خودم هستم" toggle that fills these from `GET /account/profile/me/` (`first_name`, `last_name`, `phone_number`). |
| `receiver_mobile` | req | req | opt | **Iranian mobile only.** Accepts `09121234567`, `+989121234567` and Persian digits `۰۹۱۲۱۲۳۴۵۶۷`. Always returned as E.164 `+989121234567`. A landline (`02188776655`) or foreign number (`+14155552671`) gives `invalid_iranian_mobile` (`شمارهٔ موبایل ایران را وارد کنید؛ تلفن ثابت و شمارهٔ خارجی پذیرفته نمی‌شود.`). A partial number (`0912123`) gives **two** errors on the field: `invalid` (`شماره تماس وارد شده معتبر نیست.`) and `invalid_iranian_mobile`. |
| `province`, `city` | req | req | opt | Integer ids from transportation. Unknown gives `does_not_exist` (`موردی با شناسهٔ «999» یافت نشد.`); non-numeric gives `incorrect_type`. A pair that does not match gives **`address_city_not_in_province`** (`client_error`, **attr:null**). On PATCH the missing half is read from the stored row, so **always send province and city together** when the province changes. Verified: PATCH `{city:127}` on a Tehran address returned that error. |
| `address` | req | req | opt | Free text, no length limit, plain text (escape it on render). |
| `postal_code` | opt | opt | opt | **Optional.** `""` or an omitted key means none (stored and returned as `""`, never null). `null` gives the `null` error. If given, it must be exactly 10 digits after stripping dashes and spaces. `12345-67890` and Persian digits are accepted and returned as `1234567890` (verified). 11 digits gives two errors: `invalid` (`کد پستی باید دقیقاً ۱۰ رقم باشد.`) and `max_length`. PATCH `""` clears it. |
| `plaque`, `unit` | opt | opt | opt | ≤ 20, string (`12/1` and `۱۲ب` are fine), stored **as typed** (no digit conversion). `null` and `""` are both allowed and returned as sent (`""` stays `""`). |
| `latitude`, `longitude` | opt | opt | opt | **Both or neither** in the final row. Range ±90 / ±180 (`min_value`/`max_value`). More than 3 integer digits gives `max_digits` (`بیشتر از 9 رقم نباید وجود داشته باشد.`). Extra decimals are **rounded half-up to 6 dp**, not rejected (verified: `"۳۵٫۶۸۹۱۹۸۳۲۱۵۳۳۲"` stored as `35.689198`). Persian digits and the `٫` separator are accepted, numeric strings are accepted, and the response is always a JSON number. Sending only one on create gives **`address_location_incomplete`** (`client_error`, attr:null, `عرض و طول جغرافیایی باید با هم فرستاده شوند.`). On update the absent half is taken from the row: PATCH `{latitude:35.7}` on an address with a pin works, `{latitude:null}` alone is rejected, and `{latitude:null, longitude:null}` clears the pin (all verified). Never send `0,0` for "unknown"; omit both keys instead. |
| `is_default` | opt | opt | opt | Bool (`"maybe"` gives `invalid`). See 7.3. |

- PUT semantics: the 7 required fields must be present (`required` per missing field). Omitting optional fields **does not clear them**. Clear `plaque` or `unit` with `null` or `""`, `postal_code` with `""`, and coordinates with both set to `null`.
- **Error order on create:** field validation first, then province/city match, then coordinates (not checked when province/city fail), then the per-user limit, which is checked last. So `address_limit_reached` appears only after the form is otherwise valid.
- **The limit:** admin-configured (default 10; 0 means unlimited) and **not published anywhere**. Do not hard-code it. On `address_limit_reached` (`حداکثر تعداد آدرس‌های قابل ثبت N عدد است.`) show the detail and suggest deleting one. Editing is never limited.
- A 400 on an empty body lists 7 `required` errors (postal code is not required). Walk the whole `errors[]`, because one field can have several errors.
- **Where errors go:** errors with an `attr` go under that field. The four `address_*` codes have **no attr**, so give the form a general error area.

### 7.3 The default rule (enforced by a DB unique constraint)
| Event | Result |
|---|---|
| First address | It becomes the default regardless of `is_default` (even `false`). Show the default toggle disabled and on. |
| Later address without `is_default` | `is_default:false`; the previous default is unchanged. |
| Later address with `is_default:true` | The flag moves to the new address (one transaction). |
| `set-default` / PATCH `is_default:true` | The flag moves. set-default on the current default is a no-op. PATCH true on the current default bumps `updated` (verified). |
| PATCH `is_default:false` on the default | The **newest other address** (by `created`) becomes the default. If it is the only address: **`address_last_is_default`** (`تنها آدرس ثبت‌شده باید پیش‌فرض باقی بماند.`, verified). Disable the toggle when `count === 1`. |
| PATCH `is_default:false` on a non-default | No-op on the flag; other fields are saved. |
| Delete the default | The newest remaining address is silently promoted (verified: 10018 became the default again). Tell the user. |
| Delete the last address | The book is empty. This is the only allowed zero-default state. Deleting the only address gives **no** error. |

**After every create, update, delete and set-default, re-fetch `/address/list/`.** The responses never tell you which *other* address lost or gained the flag. If you patch state locally, set every item's `is_default` to false and then set the returned id to true.

### 7.4 How addresses tie into the cart and the order
- **Cart destination:** a signed-in shopper sets `POST /cart/destination/ {address:id}`. The cart then returns the full `Address` in `destination.address`.
- **Editing that address:**
  - Changing `province` or `city` keeps the destination pointing at the address but **clears the cart's shipping selection and COD** (verified: city 301 to 313 cleared the selection and the options were repriced).
  - Editing other fields (title, receiver, mobile, postal code, text, coordinates) does **not** clear the selection (verified with a title change).
- **Deleting that address:** the cart's `destination` becomes **null** and the shipping selection is cleared (verified). Warn before deleting the address that is in use at checkout, and after the delete re-read both the list and the cart.
- **Order placement:** when the cart has a saved address, `POST /order/place/` must **not** include `receiver`. The address is **copied** onto the order, so later edits or deletes never change past orders. Guests always send `receiver` (`first_name`, `last_name`, `mobile`, `address` ≤ 1000, **`postal_code` required**, plus optional `email`, `plaque`, `unit`, `latitude`, `longitude`). The guest's province and city come from the cart destination.
- **Postal code asymmetry:** it is optional in the address book but **required in the guest `receiver`**.
- Geography rows used by an address cannot be deleted (PROTECT), so `province_name` and `city_name` are always present on addresses. A *raw* cart destination can lose its city (SET_NULL), which makes `city_id` null; ask for the destination again.

---

## 8. Provinces and cities (`/api/v1/transportation/`): public, API key only

| Method | Path | Query | Result item |
|---|---|---|---|
| GET | `/transportation/province/list/` | `search`, `page`, `limit` | `{id, name}` |
| GET | `/transportation/city/list/` | `province` (id), `search`, `page`, `limit` | `{id, name, province, province_name}` |

```ts
interface Province { id: number; name: string }
interface City { id: number; name: string; province: number; province_name: string }
interface Paginated<T> { count: number; total_pages: number; current_page: number; page_size: number;
  next: string | null; previous: string | null; results: T[] }
```

- **Page size:** default **100**, max **1500** (verified: `limit=1500` returned `page_size:1500`). OpenAPI says 100; that is wrong. Read `page_size`. An invalid `limit` falls back silently to 100.
- **Paging:** `page=last` works. Page 0, negative, non-numeric or out of range gives 404 `not_found` "صفحه نامعتبر". `next` and `previous` are **absolute URLs built from the request host** (`previous` for page 2 omits `page`). Prefer page numbers.
- **Sample data vs production:**
  - Sample DB: **31 provinces, 180 cities** (unfiltered cities have `total_pages:2` at the default size, so loop or send `limit=1500`). Tehran province `id:8` has 7 cities (291 اسلامشهر, 298 پاکدشت, **301 تهران**, 305 دماوند, 308 رباط کریم, 313 شهریار, 331 ورامین). Isfahan is province 4 (city 127 اصفهان, 188 کاشان), Qom is 19/712, Yazd is 31.
  - Full national fixture: 1,110 cities, with up to 98 per province (Isfahan).
  - **Never hard-code ids from the guides** (see the bugs section).
- **Ordering:** Persian alphabetical (آ before ا; non-letters first; ties by id). Not changeable; `ordering` is ignored.
- **Search:** substring, case-insensitive. Arabic and Persian letters are normalised (`كرمان` found کرمان and کرمانشاه, `اذربایجان` found both آذربایجان rows, verified). A ZWNJ counts as a space, but spaces are not removed (`نجفآباد` does not find `نجف آباد`). Substring matches can surprise (`ری` matches `شهریار`); filter "starts with" client-side if you need it. An empty `search` means no filter. No match gives 200 with `count:0`.
- **City names are not unique nationally** (for example `صالح آباد` in 4 provinces). Always show `province_name` in nationwide search results, and key by `id`.
- **Errors:**
  - `?province=9999` or `?province=tehran` gives 400 `invalid_choice` (`validation_error`, `attr:"province"`). Treat this as a **stale cache**: invalidate it, reload both lists and reset the selection. Do not show the message under the field.
  - 401 for the API key, 405 for POST/PUT/PATCH/DELETE (GET, HEAD and OPTIONS are allowed), 406 when `Accept` excludes JSON (verified with `Accept: text/html`), 429 against the global budget.
- **Caching:** no server cache headers. Cache provinces per session (or in localStorage with a timestamp), cache cities per province id, use a TTL of about 24 h, and also invalidate on `invalid_choice` or on `does_not_exist` for `province`/`city` from the address or destination endpoints. Debounce city search by about 300 ms.
- **Form behaviour:** disable the city select until a province is chosen, and **reset the city when the province changes**. Otherwise you get `address_city_not_in_province` or `cart_city_not_in_province`, which have no attr and are confusing.
- **Zone resolution:** shipping zones look at the **city first**; if the city is in no zone, they fall back to the province. That is why both ids matter.

---

## 9. Shipping and coupon backend facts that affect display

- **Method properties:** `code` (slug), `title`, `description`, `delivery_min_days`/`delivery_max_days` (business days, nullable, min ≤ max), `freight_payer` (`sender` or `recipient`), `supports_cash_on_delivery`, `cod_fee` (only on COD-capable methods), `cod_max_amount` (null means no cap), `prepayment_percentage` (0–100; only acts on the door amount), `display_order`. There are **no delivery time slots or date pickers** in the API. Same-day cut-offs (for example "orders by 14:00 ship same day") exist only inside free-text `description`.
- **Rule outcomes** (hidden from clients; you only see the result): fixed price, per-weight (`base + round_half_up(price_per_kg × grams / 1000)`), free (packaging still charged), and unavailable (with the operator's reason).
  - Conditions: zone (city beats province), weight band (min inclusive, max exclusive), `goods_payable` band (both inclusive), channel, validity window, and product, category, brand or content-type include/exclude/contains rules (for example "liquids cannot go by post").
  - The first matching rule by priority wins. No match means unavailable with `برای مقصد یا سبد خرید شما نرخی تعریف نشده است.`.
  - Items without a weight use the store default weight (800 g in sample data). A weight of 0 is real.
- **Sample data methods** (for manual QA): 6 active plus 1 inactive.
  - `peyk-tehran` (Tehran **city 301** only): COD supported, fee 25,000, ceiling 20,000,000. Free from `goods_payable` ≥ 5,000,000, otherwise 65,000 + 5,000 packaging. Unavailable over 20 kg or outside Tehran (`پیک موتوری تنها در شهر تهران فعال است.`).
  - `post-pishtaz`: 78,000 + 8,000 under 1 kg, otherwise 78,000 + 22,000/kg. Free from 10,000,000. Unavailable with liquids or fragile items (`content_type 2`) or over 20 kg.
  - `post-sefareshi`: 52,000 + 16,000/kg plus 6,000 packaging. Unavailable with liquids or over 10 kg.
  - `tipax`: recipient-pays, fare 0 in the system, packaging 15,000. Unavailable over 30 kg.
  - `bar-sangin`: recipient-pays, 30% prepayment, packaging 30,000. Only for 20 kg and over.
  - `hozouri`: free in-store pickup in Tehran city only.
  - `post-vije`: inactive, never listed.
  - Zones: "شهر تهران" (city 301), "تهران و البرز" (provinces 5 and 8), "کلانشهرها" (provinces 1, 4, 11, 13, 17, 19, 26, 27).
- **Coupon types:**
  - `percentage` (1–100, optional `max_discount_amount` cap)
  - `fixed_amount` (≥ 1 toman, capped at the eligible base)
  - `free_shipping` (waives the fare of the selected available method; packaging is still charged; requires at least one eligible line)
  - Shared constraints: active flag, `valid_from`/`valid_to`, `min_spend`/`max_spend` on `goods_total`, total usage limit (reserved plus confirmed redemptions), per-customer limit, first-order-only (meaning a previous **paid** order), and include/exclude product, category (whole subtree) or brand lists. Excludes beat includes, and brandless products fail `include_brands`.
  - Codes are stored upper-case. The percentage base is the eligible lines' `line_total` (after item discounts, so discounts do not stack on list price). A coupon lowers the tax base.
- **Sample coupons (status on 2026-10-15):**
  - **TEA30**: works; 30% Ahmad Tea, cap 200k, expires 2026-10-28.
  - **FREESHIP**: works; min 2,000,000, expires 2026-11-12, 3 per customer.
  - **MIDRANGE**: works; 250k fixed, spend 2M–15M.
  - **ONLYONE**: works; 300k, min 1M, total limit 1.
  - **AUTUMN20**: should be active now per its fixture dates (not applied live); 20%, min 2M, ends 2026-10-23.
  - **WELCOME10**: 10%, cap 500k, min 1M, first order only.
  - **VIP1M**: min 20M.
  - Expired: NOWRUZ25, SUMMER500, DIGITAL15. Inactive: DISABLED5. There is currently no "not started" coupon.
- **Placement-time coupon semantics:** quotas are checked again under a row lock at placement. A free-shipping coupon records the waived fare as its redemption amount.

---

## 10. Invalidation matrix (what clears what)

| Change | Coupon | Shipping selection + COD | Destination |
|---|---|---|---|
| add / PUT (**even same quantity**, verified) / DELETE item | kept, re-validated (may detach) | **cleared** | kept |
| failed write (any 4xx) | unchanged | unchanged (verified) | unchanged |
| apply or remove coupon | replaced or removed | **cleared** | kept |
| set destination (any) | kept | **cleared** | replaced |
| edit destination address: province or city | kept | **cleared** | kept (still points to the address) |
| edit destination address: other fields | kept | kept | kept |
| delete destination address | kept | **cleared** | **null** |
| clear cart | **removed** | **cleared** | **kept** (verified) |
| real merge (user had a cart) | user's wins (guest's moves only if user had none) | **cleared** | **user's kept; guest's discarded even if user had none** (verified) |
| adoption (user had no cart) | kept | kept | kept |
| reorder | kept | **cleared** | kept |
| expired coupon, rule change, method disabled, COD toggle off (on read) | detached (once) | becomes `is_available:false` with a reason; fees zeroed | kept |

---

## 11. Error catalogue and UI reactions

### 11.1 Cart
| Code | HTTP | Source | UI |
|---|---|---|---|
| `cart_not_found` | 404 | writes and option list without a live cart | Clear the token, show the empty cart, don't replay the action. |
| `cart_item_not_found` | 400 | PUT, DELETE item | On remove: treat as success. Otherwise re-read (stale UI). |
| `cart_item_out_of_stock` | 400 | add, PUT | Mark "ناموجود", disable add. |
| `cart_item_insufficient_stock` | 400 | add, PUT | Show the detail (remaining count), suggest the lower quantity, re-read. |
| `cart_item_limit_exceeded` | 400 | add, PUT | Show the detail and clamp the stepper (static limit or the 10,000-per-line cap). |
| `cart_item_invalid_quantity` | 400 | service layer | Programming error; input validation normally catches it first. |
| `cart_destination_required` | 400 | destination | Require a selection. |
| `cart_city_required` | 400 | destination | Make city required and load the cities of that province. |
| `cart_city_not_in_province` | 400 | destination | Reset the city select and reload cities. |
| `cart_shipping_method_not_found` | 400 | select | Re-fetch options. |
| `cart_shipping_method_unavailable` | 400 | select | Re-fetch and show the reason (the detail). |
| `cart_cod_not_supported` | 400 | select | UI bug: only show COD when `supports_cash_on_delivery`. |
| `cart_cod_limit_exceeded` | 400 | select | Show the detail and offer online payment (the cart is untouched). |
| `cart_token_required` | 401 | merge | Refresh the access token or go to login. |
| `cart_reorder_order_not_found` | 404 | reorder | Show the message (separate branch from `cart_not_found`). |
| `cart_expired`, `cart_empty`, `cart_token_invalid` | — | never emitted | No branch. |

### 11.2 Coupon
These come from apply (400) and also appear in `coupon.detached_reason`. Use one message map for both: invalid/inactive "کد تخفیف معتبر نیست" (keep the input for editing), not_started "این کد هنوز فعال نشده است", expired, usage_limit "ظرفیت این کد تکمیل شده است", user_limit "شما قبلاً از این کد استفاده کرده‌اید", first_order_only (don't suggest retrying), min_spend (show how much more is needed, against `goods_total`), max_spend, not_applicable "این کد شامل کالاهای سبد شما نمی‌شود". You can also just show the server `detail`, which is already good Persian.

### 11.3 Address
| Code | HTTP | Field? | UI |
|---|---|---|---|
| `address_limit_reached` | 400 | no | Show the detail (contains the limit) and suggest deleting an address. |
| `address_city_not_in_province` | 400 | no | Form-level message; reset the city. |
| `address_last_is_default` | 400 | no | Prevent it: disable the toggle when `count===1`. |
| `address_location_incomplete` | 400 | no | Client bug; send both coordinates or neither. |
| `required`, `blank`, `null`, `max_length`, `invalid`, `invalid_iranian_mobile`, `does_not_exist`, `incorrect_type`, `min_value`, `max_value`, `max_digits` | 400 | yes (`attr`) | Under the field; walk all errors. |
| `not_found` | 404 | — | "این آدرس دیگر وجود ندارد"; re-fetch the list. Never say "access denied". |
| `not_authenticated` / `token_not_valid` | 401 | — | Login, or refresh once and retry. |

### 11.4 Generic and geography
`api_key_missing`/`api_key_invalid` (401: a configuration problem, do **not** log the user out), `method_not_allowed` (405), `not_acceptable` (406), `parse_error` (400), `throttled` (429, `data.retry_after`), `feature_disabled` (503; `data.feature`, show the detail, disable that control), `invalid_choice` (400, city list province: stale cache), `not_found` (404, bad page), `invalid_code` (400, reorder), and 500 `error` (generic).

---

## 12. Implementation checklist (combined from the three guides plus findings)

**Network layer**
- [ ] `X-API-Key` on every request. 401 api-key errors never trigger logout.
- [ ] Guests send `X-Cart-Token` on every cart call. Signed-in users send it only on the first cart call after login (merge), then delete it.
- [ ] Read the token from `data.token`. Update it after every success. Never store `""`.
- [ ] `cart_not_found` clears the token and shows the empty cart, without replaying.
- [ ] Branch on `data.errors[0].code`, never on Persian text. Walk all `errors[]` for forms.
- [ ] Refresh the access token proactively before cart calls (an expired token silently means guest).
- [ ] Handle 204 before JSON parsing (address delete).
- [ ] Use `cache:'no-store'` for cart calls. If calling server-side, solve trusted-proxy IP forwarding and the public Host (images).
- [ ] Use `data.retry_after` for 429 (the header is not CORS-exposed).

**Cart page**
- [ ] Empty state comes from `is_empty` (no-cart and empty-cart are the same branch). The badge comes from `item_count`.
- [ ] Re-render from every write response; no follow-up GET.
- [ ] No client-side money arithmetic; every number comes from its field.
- [ ] Steppers send the **absolute** quantity with PUT (debounced). Min `order_limit_min`, max `available_quantity`. Use `order_limit_max` (0 means none) for messaging.
- [ ] Remove via DELETE or PUT 0. `cart_item_not_found` on remove counts as success.
- [ ] Separate handling for out_of_stock, insufficient_stock and limit_exceeded.
- [ ] Line `issue` and the `is_orderable` banner; offer "set to available_quantity".
- [ ] Render `image` directly (never null). Remove any client-side image fallback for cart lines.
- [ ] "سود شما" comes from `total_savings`.

**Coupon**
- [ ] Coupon presence is detected from `coupon.code`, not `coupon_discount > 0`.
- [ ] `detached_reason` is shown when received (once only) and uses the same message map as the apply errors.
- [ ] After apply or remove, re-fetch options and force a shipping re-selection.
- [ ] 429 disables the apply button for `retry_after`. Enforce the 30-char limit in the input.
- [ ] Hide or disable coupon entry when the `coupons` toggle is off; handle the 503.

**Destination and shipping**
- [ ] Order: destination, then options, then select.
- [ ] Signed in: address picker preselects `results[0]`. Guest: province, then city (reset city on province change).
- [ ] Show unavailable options disabled with their `reason`. Never treat `price:0` as free unless `is_available`.
- [ ] Option price comes from `total`. Show a "پس‌کرایه" badge for `freight_payer:'recipient'` and a prepayment note for `prepayment_percentage>0`. The ETA comes from min/max days (hide when null).
- [ ] COD checkbox only where `supports_cash_on_delivery`; show `cod_fee` and the ceiling.
- [ ] Clear the UI selection after any item, coupon or destination change, merge or reorder (the server already did).
- [ ] Detect `is_selected && !is_available` and force re-selection with the reason.
- [ ] Read `adjustments` from the option list too.

**Checkout**
- [ ] Re-read the cart right before payment and send `expected_total` with the order placement.
- [ ] The gateway amount is `amount_charged_online`. If it is 0, place as pay-on-delivery (no gateway).
- [ ] Show `amount_to_collect_on_delivery` as "پرداخت در محل" and `prepayment` as "بیعانه".
- [ ] Test both total invariants. Never hard-code the tax rate.
- [ ] Guests send the full `receiver` (postal code required). Signed-in users with a saved-address destination send **no** receiver.
- [ ] Check `guest_checkout` before showing "continue without account".

**Login, merge, reorder**
- [ ] Call `POST /cart/merge/` right after login and show `adjustments` (`was_dropped` explained separately).
- [ ] After merge, re-check the destination (it may be gone) and the shipping selection (cleared).
- [ ] After logout, expect no cart; the first add creates one.
- [ ] Show reorder only to signed-in users. Disable the button while in flight; on timeout read the cart instead of retrying.
- [ ] Show `adjustments` and `reorder_skipped` before navigating to the cart. The count comes from `added_lines`.
- [ ] Separate branches for `cart_reorder_order_not_found` and `cart_not_found`. Handle the 10/min throttle.

**Address book**
- [ ] Edit at `/address/{id}/update/` (PATCH with changed fields only), delete at `/delete/`, and use POST `/set-default/` (no body) for the "make default" button.
- [ ] Re-fetch the list after every write. Exactly one default badge.
- [ ] First-address form: default toggle disabled and on. `count===1`: the default toggle cannot be turned off.
- [ ] Tell the user when deleting the default promoted another address.
- [ ] After deleting an address, re-read the cart (the destination may be null). Warn if it is the checkout address.
- [ ] Postal code optional (send `""` or omit, never null). Dashes and Persian digits are fine.
- [ ] Mobile in `09…` or `+989…` form; display the returned E.164.
- [ ] Length limits in the form: title 50, names 200, plaque and unit 20.
- [ ] Don't disable "add address" based on a hard-coded count; react to `address_limit_reached`.
- [ ] Use `full_address` for summaries, showing postal code and receiver separately.
- [ ] Coordinates are both-or-neither, sent as JSON numbers, unrounded. Geolocation denial means omit both keys (never `0,0`). Clear with both null. The map handles `null`.
- [ ] A form-level error slot for the four attr-less `address_*` codes.

**Geography**
- [ ] Read `data.results`. Use `count===0` for "no results". Check `total_pages>1`, or request `limit=1500` for the full city table.
- [ ] Store ids, not names. Show `province_name` in nationwide city search.
- [ ] Debounce search. Cache with a TTL. Invalidate on `invalid_choice` or `does_not_exist` (province/city).

---

## 13. Suspected backend bugs / inconsistencies (each verified live or against schema and fixtures)

1. **A no-op PUT clears the shipping selection.** The guide calls PUT absolute and "safe to repeat". Live, `PUT /cart/item/10123/ {quantity:2}` on a line that was already 2 reset `shipping.is_selected` to false and dropped `cash_on_delivery`, and a GET confirmed it. A stepper that re-sends the same value, or a network retry, silently un-selects shipping. *Mitigation:* never send a PUT when the quantity is unchanged, and always re-check `shipping.is_selected` before payment.
2. **A real merge discards the guest cart's destination even when the user cart has none.** Verified with kamran: the guest cart had Isfahan/Isfahan, the user cart had `destination:null`, and after the merge the destination was `null`. The guides' invalidation table and merge section never mention the destination (they cover only coupon and shipping). *Mitigation:* after login and merge, re-run the destination step.
3. **The guides' example IDs are wrong for this dataset** (and for the national fixture):
   - The cart guide shows `"city_id": 315, "city_name": "تهران"`, but 315 is **صباشهر**; Tehran city is **301**.
   - The address guide uses `province 1 = تهران`, `city 1 = ری`, `2 = شهریار`, `3 = کاشان`, and lists "اصفهان (2)". Live, province 1 is **آذربایجان شرقی**, 2 is آذربایجان غربی, Tehran is 8, Isfahan is 4, شهریار is 313, کاشان is 188, and city 2 is اهر.
   - Never copy ids from the guides into seeds or tests.
4. **OpenAPI `CartReorderRequest.order_code` has `pattern: [0-9]{10}`**, but the server accepts Persian digits (`"۹۲۴۶۸۶۸۵۰۲"` gave 200, verified), as the guide also says. Schema-generated validators (for example zod from OpenAPI) would reject valid input. Normalise digits client-side or relax the generated schema.
5. **OpenAPI `AddressWriteRequest.postal_code` (and `OrderReceiverRequest.postal_code`) has `maxLength: 10`**, while the server accepts the printed form `12345-67890` (11 chars; verified 201, stored `1234567890`). The order schema's own description even says the dash form is accepted. Generated validators would reject it, so strip dashes before validating client-side.
6. **The OpenAPI `limit` description on transportation lists says "capped at 100".** The real cap is 1500 (verified `page_size:1500`). The guide acknowledges this. Trust `page_size`.
7. **The OpenAPI `Address` read schema omits `plaque`, `unit`, `postal_code` and `is_default` from `required`**, though they are always present (verified), and it marks `latitude`/`longitude` `readOnly` there. Generated TS types will make these optional. Use the hand-written interface in section 4 or override the type.
8. **Typo in the Persian `null` validation message:** `"این مقدار نباید توهی باشد."` should be «تهی». It is seen on `variant`, `quantity`, `code`, `order_code` and `postal_code`. It is cosmetic and appears only for programming errors, but don't surface it raw.
9. **The cart and option-list OpenAPI declares `400`/`404` responses for `GET /cart/`**, which never returns them (live 200 even with a bogus token). This is harmless noise for generated clients.
10. **COD ceiling not reflected in the option list (UX gap, not strictly a bug).** `peyk-tehran` is advertised with `supports_cash_on_delivery:true` and `cod_max_amount:20000000` even when this cart's door amount clearly exceeds it, and only select rejects it (verified with a 118M iPhone). The guide does not say the list pre-filters, so this is consistent but worth handling in the UI.
11. **`tipax` sample data** is recipient-pays with in-system fare 0, so `shipping_cost:0`, and the only door amount is packaging (15,000). This is consistent with the rules, but a naive UI shows "free shipping". Label recipient-pays as "پس‌کرایه".
12. **No line-item discounts are active in the sample data right now.** Every fixture discount window has expired, and the product API `has_discount` is false everywhere. `unit_discount`, `item_discount` and the strike-through UI cannot be exercised against this DB without admin changes. This is a data observation, not a code bug.

Everything else I tested matched the guides exactly. That includes token lifecycle and expiry, every error code and message listed above, merge clamping (requested 3, applied 2), user-coupon precedence, the adoption path, one-shot `detached_reason`, the free-shipping math (`shipping_discount 113,200`), the prepayment split, the COD ceiling rollback, the clear-cart semantics, the address default rules, the coordinate pairing and rounding, postal and mobile normalisation, 404-not-403 for others' addresses, the 204 delete, the transportation search normalisation, `invalid_choice`, `page=last`, and the CORS exposure of `X-Cart-Token`.

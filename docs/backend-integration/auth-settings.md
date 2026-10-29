# Firefly Core — Auth + Global Settings: Storefront Integration Digest

Scope: the guides `auth-api` (registration, login, Google, sessions, passwords, profile, contact change, TOTP)
and `settings-api` (`/api/v1/global/*`: settings, auth-settings, socials, languages/translations,
version-check, extra-snippets, content-page-types, dynamic-content, feature-status/toggles) plus `/sitemap.xml`.

Both guides were read end to end. Everything below was checked against the OpenAPI schema
(`scratchpad/schema.yaml`) and, where it could be done without writing to the dev database, against the
live dev server at `http://localhost:8000`.

Verification tags used throughout:

- **[LIVE]**: observed on the dev server in this session.
- **[CODE]**: confirmed by reading backend source (read-only).
- **[SCHEMA]**: taken from the OpenAPI schema.
- **[DOC]**: stated only by the guide. I could not exercise it without writing to the dev DB, for example by
  sending an OTP, enabling TOTP or toggling a feature.

## Update 2026-10-29 (backend `new-requests`; settings-api §3, auth-api §1)

| change | storefront |
|---|---|
| `/global/settings/` adds **`primary_color`, `secondary_color`** (`#rrggbb` lowercase or `null`, tab «رنگ‌بندی قالب»). | The shop's colours: panel → env → preset, darkened until readable (§8.1). |
| `/global/settings/` adds **`sales_phone`, `sales_phone2`** (E.164 or `null`, «تلفن مشاوره و فروش ۱/۲»). | «مشاوره و فروش» in the footer, the contact page, the `contact_info` block and the buy box (§8.1). |
| **OTP sandbox** (`OTP_SANDBOX=True` with `DEBUG`): sends answer 200 and SMS is offered, but no code leaves the server; read it in the panel. | Nothing to change (§11). |

Dev-server facts that matter when you test against it:

- `DEBUG=True` with the API-key gate off.
- `SITE_DOMAIN=localhost` and `STOREFRONT_URL=http://localhost:3000`.
- **Google, SMS and Telegram are all OFF.** Only email OTP and email registration are offered (unless the
  OTP sandbox is on, §11, which advertises SMS too without sending anything).
- Demo accounts from `fixtures/README.md` all use the password `Firefly@1234`:
  - `sara.ahmadi@example.com` / `+989121234501`: a normal customer with both identifiers verified.
  - `leila.rahimi@example.com`: a disabled account.
  - `maryam.s@example.com`: no phone number.
- Email OTP delivery needs an SMTP row configured in the panel. The fixtures contain none, so every OTP send
  on the dev server will most likely return `503 auth_otp_send_failed` [CODE, not exercised].

---

## 0. TL;DR gotchas

1. **A `200` from login, OTP-verify or Google does not always mean "signed in".**
   - If `data.requires_totp === true`, then `user` and `tokens` are `null`.
   - Re-send the **same request** plus `totp_code`, and repeat the same `remember_me`.
   - For OTP login, also re-send the same `otp_code`. It is not consumed on the TOTP challenge.
2. **The refresh token does NOT rotate.** `/auth/token/refresh/` returns only `{access}` [LIVE].
   - Keep the original refresh token.
   - A refresh does not extend the session: it hard-expires 7 days after login, or 30 days with `remember_me: true` [LIVE: TTLs 604800 and 2592000; access token 900].
3. **Change-password returns a NEW token pair** and revokes every other refresh token. Replace the stored pair or the user is logged out.
   - Password reset revokes everything and returns no tokens.
4. **Read error messages and codes from `data.errors[0]`, never from `msg`.**
   - Show `data.errors[0].detail`. Branch on `data.errors[0].code`.
   - `msg` is a generic per-HTTP-status sentence.
   - Some codes reuse the same name with different HTTP statuses:
     - `auth_token_invalid` is 400 on most endpoints but 401 on refresh.
     - `auth_google_token_invalid` is 401 or 503.
5. **`429` always carries `data.retry_after`, an integer of at least 1** [LIVE].
   - The `Retry-After` header is **not CORS-exposed** (only `X-Cart-Token` is) [LIVE]. A browser on another origin must read the body.
6. **Build the login and registration UI only from `auth`** (inside `/global/settings/`, or `/global/auth-settings/`).
   - `default_otp_methods.phone` can be **absent**.
   - `registration_methods` does **not** reflect the `registration` feature switch. Also check `/global/feature-status/registration/`, or handle `503 feature_disabled` on `register/start`.
7. **OTP input**
   - Exactly 6 digits. Persian and Arabic digits and surrounding whitespace are accepted server-side [LIVE].
   - The schema pattern `[0-9]{6}` is stricter than the server, so normalise digits client-side before validating.
   - Use `expires_in` and `resend_after` from the response for timers (300 s and 120 s). Never hard-code them.
8. **`auth_identifier_invalid` comes as `type: client_error` with `attr: null`** [LIVE]. The guide nevertheless says to show it under the identifier field, so map it to that field manually.
9. **`503 feature_disabled` must be excluded from any generic "retry 5xx with backoff" logic.**
   - Hide the control and re-read feature-status.
   - Show `data.errors[0].detail`, which is the operator's text.
10. **Trailing slashes are mandatory on API calls.**
    - A POST without the slash returns an HTML **500** in dev (Django APPEND_SLASH RuntimeError) [LIVE].
    - In dev, unknown paths return HTML 404 pages, not JSON [LIVE]. Guard `JSON.parse`.
11. **Rate limits are per client IP for anonymous calls.** The IP is taken from the TCP peer; `X-Forwarded-For` is honoured only from `TRUSTED_PROXY_IPS` [CODE].
    - If Next.js server code (SSR or route handlers acting as a BFF) calls `/auth/*`, every user shares the **20/min `auth_attempt`** and **10/min `auth_otp_request`** buckets.
    - Call auth endpoints from the browser, or get the backend to trust the storefront server as a proxy.
    - SSR reads of `/global/*` share the 2000/hour anonymous budget, so cache them.
12. **The sitemap lives on the API host** but lists storefront URLs. The storefront must:
    - proxy `/sitemap.xml`, or put a `Sitemap:` line pointing at the API host in robots.txt, and
    - implement exactly these routes, with trailing slash: `/product/<slug>/`, `/product-category/<path...>/`, `/product/list/<slug>/`, `/brand/<slug>/`, `/blog/<slug>/`, `/blog/category/<path...>/`, `/page/<slug>/`.
13. **Rich-text and relative-URL fields need client-side handling.**
    - `footer`, `announcement`, `accept_terms_text`, `confirm_legal_age`, dynamic-content `content` and version `changes` are raw operator HTML. Relative URLs inside them are not absolutised: prefix `/…` with the API origin, then sanitise.
    - `languages[].icon` is a **relative** path. Every other file field is an absolute URL.

---

## 1. Shared conventions

### 1.1 Base, headers, auth classes

- The base path is `/api/v1/`. Sitemap is the exception: it sits at `/sitemap.xml` on the API host root.
- Headers:
  - `X-API-Key: <project key>` is **required on every `/api/v1/` request in production**. It is checked before the bearer token.
    - Missing: `401 api_key_missing`. Bad or disabled: `401 api_key_invalid`.
    - Validation is cached for 60 s, so a just-disabled key may still pass for up to a minute.
    - Swagger "Authorize" uses `apiKeyAuth` (key) and `jwtAuth` (bearer).
    - Off in dev [LIVE: a bogus key still returned 200].
  - `Content-Type: application/json`. Avatar upload uses `multipart/form-data`. `version-check` also accepts form-encoded bodies [LIVE].
  - `Authorization: Bearer <access>`. Only "JWT" endpoints read it:
    - Public endpoints **ignore** a bad or expired token and answer as a guest [LIVE].
    - Login, registration, refresh, logout and reset endpoints authenticate **only** with the API key and never read the bearer [CODE: `KeyOnlyAuthenticationMixin`].
    - A header prefix other than `Bearer` is ignored, which yields `not_authenticated` on JWT endpoints [LIVE].
    - `Bearer a b`, i.e. not exactly two parts, gives `401 bad_authorization_header` [LIVE].
- Accept-Language is ignored. All `msg`, `detail` and content values are Persian.
- CORS [LIVE, dev]:
  - Allowed origins include `http://localhost:3000` and `http(s)://SITE_DOMAIN`. `www.` and other domains are **not** included (see api-overview).
  - Allowed headers include `X-API-Key`, `Authorization`, `Content-Type`, `X-Cart-Token` and `Idempotency-Key`.
  - Credentials are allowed.
  - `Access-Control-Expose-Headers` lists **only** `X-Cart-Token`.

### 1.2 Envelope (all responses)

```ts
interface ApiSuccess<T> { msg: string; code: number; data: T }   // code mirrors HTTP status

type ErrorType = 'validation_error' | 'client_error' | 'server_error';
interface ApiErrorItem { code: string; detail: string; attr: string | null }
interface ApiErrorData {
  type: ErrorType;
  errors: ApiErrorItem[];          // validation_error may contain several (one per field)
  retry_after?: number;            // integer seconds, on every 429 (throttled, auth_otp_*, auth_totp_locked) [LIVE]
  reasons?: string[];              // only with auth_password_weak (sibling of errors) [LIVE]
  feature?: FeatureKey;            // only with feature_disabled
  feature_name?: string;           // only with feature_disabled (Persian label)
}
interface ApiError { msg: string; code: number; data: ApiErrorData }
```

- `validation_error`:
  - `attr` is the field name, or `"non_field_errors"`.
  - Codes are DRF's: `required`, `invalid`, `null`, `blank`, `min_length`, `max_length`, `invalid_choice`, `min_value`.
  - The API adds its own codes: `invalid_code` (OTP or TOTP that is not exactly 6 digits), and `invalid_image`, `image_invalid` and `image_too_large` (avatar).
  - The details for `required`, `null` and similar are DRF Persian text and not meant for end users.
- `client_error` is a business error. `attr` is `null`.
- `server_error` is a 5xx. In this scope it is always 503: `auth_otp_send_failed`, `auth_google_token_invalid` (Google unreachable), or `feature_disabled`.
- Example successful bodies with no payload return `data: {}`. This covers logout, logout-all, totp enable and disable, and password-reset confirm [LIVE for logout].
  - The schema types these as `Record<string, any>`.

### 1.3 Pagination (shared)

Seven list endpoints are paginated: `socials`, `extra-snippets`, `content-page-types`, `dynamic-content`, `dynamic-content-grouped`, `feature-status` and `feature-toggles`.

```ts
interface Paginated<T> {
  count: number; total_pages: number /* 1 when empty */; current_page: number; page_size: number;
  next: string | null; previous: string | null;   // absolute URLs (built on request host)
  results: T[];
}
```

- Query `page` is 1-based. Query `limit` defaults to 20 and is capped at 100.
  - `limit=500` gives `page_size` 100 [LIVE]. `limit=abc` or `limit=0` gives 20 [LIVE].
- A page that is out of range or `page=0` returns `404 not_found` with detail "صفحه نامعتبر" [LIVE].
- `previous` for page 2 omits `page=` (it is `…?limit=2`) [LIVE]. This is standard DRF.

---

## 2. Rate limits, OTP budgets, token lifetimes

### 2.1 Throttle buckets [CODE `account/views.py` throttle_scope; DOC table matches]

| Bucket (env var, default) | Keyed by | Endpoints |
|---|---|---|
| `auth_attempt` (`THROTTLE_AUTH_ATTEMPT`, **20/min**) | IP for anonymous callers; user for JWT callers | `auth/login/`, `auth/register/verify/`, `auth/login/otp/verify/`, `auth/google/`, `auth/logout/`, `auth/password-reset/verify-otp/`, `auth/password-reset/confirm/`, `profile/password/change/`, `profile/contact/verify/`, `profile/totp/enable/`, `profile/totp/disable/` |
| `auth_otp_request` (`THROTTLE_AUTH_OTP_REQUEST`, **10/min**) | same | `auth/register/start/`, `auth/register/resend-otp/`, `auth/login/otp/request/`, `auth/password-reset/request/`, `profile/contact/request/` |
| `anon` (`THROTTLE_ANON`, **2000/hour**) | IP | every anonymous request to the whole API |
| `user` (`THROTTLE_USER`, **5000/hour**) | account | every authenticated request |

- There is no dedicated bucket (only the background limits) for:
  - `auth/register/complete/`, `auth/token/refresh/` (intentionally), `auth/logout-all/`
  - `profile/me/` (GET and PATCH), `profile/totp/status/`, `profile/totp/setup/`
  - every `/global/*` endpoint
- `/sitemap.xml` is not throttled at all.
- On overflow:
  - The response is `429` with `type: client_error`, `code: throttled` and `data.retry_after`. A `Retry-After` header with the same value is also sent [LIVE].
  - The detail is DRF's sentence, with Latin digits.
  - The window is sliding, so `retry_after: 1` may be followed by another 429 [LIVE].
- When the backend has no Redis, counters are per process. The real limit is then multiplied by the number of processes.
- Treat all numbers as deployment-specific. Drive waits from `retry_after`.

### 2.2 OTP limits (per destination = one email address or phone number, shared across all OTP actions) [DOC + CODE]

| Rule | Value | Error |
|---|---|---|
| Code TTL | 300 s (`expires_in`) | `auth_otp_expired` (400) |
| Resend cooldown per destination | 120 s (`resend_after`); hard-coded constant | `429 auth_otp_throttled` + `retry_after` |
| Daily cap per destination | `OTP_DAILY_LIMIT_PER_DESTINATION`, default **10** per rolling 24 h | `429 auth_otp_daily_limit` + `retry_after` (until oldest send leaves window) |
| Failed attempts per code | 5, then the code is void | `429 auth_otp_too_many_attempts` + `retry_after` (= rest of the 120 s cooldown, min 1) |
| New code issued | previous unused code for same destination+action invalidated | — |
| Send failure | nothing recorded, no cooldown or daily budget spent, **but the previous code is already invalidated** | `503 auth_otp_send_failed` |

- The cooldown is shared across actions: login-OTP, reset and contact-change to the same address share one 120 s cooldown.
- Telegram codes are generated by the Telegram Gateway and are not stored locally.
- `throttled` counts the sender, by IP or account, and is the only limit that resets when the IP changes. The `auth_otp_*` and `auth_totp_locked` limits count a destination, a code or an account.

### 2.3 TOTP limits [DOC + CODE]

- One time step either side of now is accepted, so roughly a 90 s window.
- A step that has been accepted once cannot be reused. Reuse returns `400 auth_totp_invalid`, so tell the user "enter the next code".
- 5 wrong codes within a 5-minute window, measured from the first wrong code, lock the account's second factor until the window ends.
  - The response is `429 auth_totp_locked` with `retry_after`.
  - While locked, even a correct code is refused.
  - The counter is per **account** and shared by password login, OTP login, Google, contact change and TOTP enable/disable.
  - The counter is stored in cache (`TOTP_LOCK_SECONDS = 300`).

### 2.4 Token and session lifetimes

| Token | Lifetime | Notes |
|---|---|---|
| `access` (JWT) | **15 min** [LIVE exp-iat=900] | Unchanged by `remember_me` |
| `refresh` (JWT) | **7 d**, or **30 d** with `remember_me: true` [LIVE 604800 / 2592000] | Non-rotating, and refreshing does not extend it (hard session cap) |
| `registration_token` | 30 min | For the 3 registration steps |
| `reset_token` | 10 min, single use | Password reset confirm |

- JWT claims present are `exp`, `iat`, `jti`, `token_type` and `user_id` [LIVE].
- **Only `exp` is part of the contract.** The `tokens` object carries no `expires_in`.
- Either schedule a refresh from `exp`, or refresh once on a 401 `token_not_valid` and retry once.

Events that end sessions:

| Event | Effect |
|---|---|
| `logout` | Only the refresh token sent is revoked. Other devices are untouched. |
| `logout-all` | Every refresh token is revoked and every push device is unregistered. |
| Change password in dashboard | Every refresh token is revoked. **A new pair is returned for this device and must replace the old one.** The new refresh is 7 d even if the old session was a 30 d one. |
| Password reset confirm | Every refresh token is revoked. No tokens are returned, so the user goes to login. |
| Admin "logout all devices" | Same as `logout-all`. The admin's bulk "revoke sessions" revokes only the selected refresh tokens and does not touch push devices. |
| Account disabled or deleted | Refresh returns `401 user_inactive` or `401 user_not_found`. Existing access tokens live up to 15 min. |

- **Access tokens are never revoked server-side.** After logout, an access token still worked: `GET /profile/me/` returned 200 [LIVE].
- On logout, clear client state immediately.

Recommended request wrapper:

```text
send(req with Bearer access)
if 401:
  code = data.errors[0].code
  if code in {token_not_valid, authentication_failed} and not alreadyRetried:
      r = POST /auth/token/refresh/ {refresh}
      if r.ok: store r.data.access (KEEP refresh), retry req once
      else (auth_token_invalid | user_not_found | user_inactive): clear tokens -> /login
  elif code in {user_not_found, user_inactive}: clear tokens -> /login (inactive: show "contact support"); never refresh
  elif code == not_authenticated: -> /login
  elif code in {api_key_missing, api_key_invalid, bad_authorization_header}: config bug, do NOT show login
if 503 and code == feature_disabled: hide control, refetch feature-status, show detail; no auto-retry
if 429: wait data.retry_after (never immediate retry)
```

---

## 3. Shared TypeScript types — auth

Types were verified against live responses for login, profile and refresh, and against the schema.

```ts
type ContactType = 'email' | 'phone';           // register_method / login_method / contact_type
type OtpMethod   = 'email' | 'sms' | 'telegram'; // otp_method / reset_method

interface UserProfile {
  uuid: string;                 // UUID
  username: string;             // NOT the email/phone; never changes on contact change - don't display as identifier
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;         // null -> show "Add email"
  phone_number: string | null;  // E.164 "+98912…" -> format for display; null -> "Add phone"
  is_email_verified: boolean;
  is_phone_verified: boolean;
  avatar_picture: string | null;// ABSOLUTE URL (server-renamed file)
  created: string;              // ISO-8601 with Tehran offset, e.g. "2025-09-18T15:00:00+03:30"
  is_totp_enabled: boolean;
  has_usable_password: boolean; // false => Google-created account without password ("Set password")
}
interface AuthTokens { access: string; refresh: string }

// Every "signed in" response: register/complete (201), login, login/otp/verify, google (200/201)
interface AuthenticatedResponse {
  user: UserProfile | null;     // null only when requires_totp
  tokens: AuthTokens | null;    // null only when requires_totp
  requires_totp: boolean;
  remember_me: boolean;         // echo; always false when requires_totp, and always false for register/complete & google
}
interface GoogleAuthResponse extends AuthenticatedResponse {
  is_new_user: boolean | null;  // null when requires_totp
}

interface OtpSent { otp_method: OtpMethod; expires_in: number; resend_after: number }   // seconds
interface RegistrationStarted extends OtpSent { registration_token: string }
interface RegistrationVerified { registration_token: string; register_method: ContactType }
interface AccessTokenResponse { access: string }
interface PasswordResetToken { reset_token: string; expires_in: number /* 600 */ }
interface PasswordChanged { tokens: AuthTokens }
interface TotpStatus { is_totp_enabled: boolean }
interface TotpSetup { secret: string; qr_code: string /* data:image/png;base64,… */; provisioning_uri: string /* otpauth://totp/… */ }
type Empty = Record<string, never>;   // {}
```

---

## 4. Auth endpoint reference

In production every endpoint also needs `X-API-Key`.

- "Public" means the API key only.
- "JWT" means the API key plus `Authorization: Bearer`.

### 4.1 `POST /api/v1/account/auth/register/start/`: Public, bucket `auth_otp_request`

Body:

| field | type | rules |
|---|---|---|
| `first_name` | string | required, 1–200 |
| `last_name` | string | required, 1–200 |
| `register_method` | `'email' \| 'phone'` | required |
| `email` | string(email) | required if method=email (case-insensitive) |
| `phone_number` | string | required if method=phone; `09121234567` or `+989121234567` |
| `otp_method` | `OtpMethod` | optional; must match method (email→email; phone→sms\|telegram); default = `auth.default_otp_methods[method]` |

- Response 200 is `RegistrationStarted`, with msg "کد تأیید ارسال شد.".
- Keep `registration_token`. It is valid for 30 min and is the key for the next steps.

Errors:

- `auth_email_already_exists` / `auth_phone_already_exists` (400): suggest login.
- `auth_otp_throttled` / `auth_otp_daily_limit` (429).
  - The previous token stays valid.
  - **A restart for the same identifier replaces the previous pending registration only after a code has actually been sent.**
- `auth_otp_send_failed` (503): retry is allowed.
- `auth_otp_channel_unavailable` (400, client_error, attr null) [LIVE]:
  - Returned for SMS or Telegram when the channel is not configured.
  - Also returned for `register_method: phone` without `otp_method` when neither channel exists.
- `validation_error`:
  - `attr: otp_method`, code `invalid`: an incompatible channel, e.g. sms for email [LIVE].
  - `attr: email` or `phone_number`, code **`invalid`** (not `required`), when missing [LIVE: "وارد کردن ایمیل الزامی است."]. The same attrs carry `invalid` for a bad format.
  - Missing `first_name`, `last_name` or `register_method` gives `required` [LIVE].
- `feature_disabled` (503):
  - `data.feature = "registration"`, plus a `Retry-After` header (300, advisory only).
  - **Login is unaffected.** `register/verify` and `register/complete` stay open.

### 4.2 `POST /api/v1/account/auth/register/verify/`: Public, `auth_attempt`

- Body: `registration_token` (string, required) and `otp_code` (6 digits; Persian/Arabic digits OK [LIVE]).
- Response 200 is `RegistrationVerified`.
  - msg is "ایمیل با موفقیت تأیید شد." for email, or "شماره تلفن با موفقیت تأیید شد." for phone.
  - The token is unchanged.
- **Idempotent.** Repeating it after success returns 200 without re-checking the code [CODE], so it is safe to retry after a network error.
- Errors:
  - `auth_otp_invalid` (retype).
  - `auth_otp_expired` / `auth_otp_not_found`: offer resend.
  - `429 auth_otp_too_many_attempts`: a new code is needed.
  - `auth_token_invalid` [LIVE] / `auth_token_expired`: restart at step 1.
  - `invalid_code` (validation, attr `otp_code`) [LIVE].

### 4.3 `POST /api/v1/account/auth/register/resend-otp/`: Public, `auth_otp_request`

- Body: `registration_token` (required) and optional `otp_method`. Omit `otp_method` to reuse the previous channel.
- Response 200 has the same shape as start (`RegistrationStarted`), with msg "کد تأیید مجدداً ارسال شد.".
- Keep the resend button disabled for `resend_after` seconds.
- Errors:
  - `auth_already_verified`: already verified, so go to complete.
  - `auth_otp_throttled` and `auth_otp_daily_limit`.
  - `auth_token_invalid` [LIVE] and `auth_token_expired`.
  - `auth_otp_channel_unavailable` and `auth_otp_send_failed`.
  - `feature_disabled` when registration is switched off.
- **WARNING (backend bug, see §13):** this endpoint does **not** validate channel compatibility. The sent `otp_method` is **persisted before sending**.
  - Only send `email` for email registrations, and `sms` or `telegram` (from `available_otp_methods`) for phone registrations.

### 4.4 `POST /api/v1/account/auth/register/complete/`: Public, no dedicated bucket

- Body: `registration_token`, `password` (minimum 8) and `confirm_password` (must equal `password`).
- Response **201** is an `AuthenticatedResponse` with msg "ثبت نام با موفقیت انجام شد.".
  - `requires_totp` is false.
  - **`remember_me` is always false**, so the refresh token lives 7 d. This endpoint does not accept `remember_me`.
- The user is logged in immediately.
- The new account has only the chosen identifier, which is verified. The other identifier is `null`.
- Errors:
  - `auth_not_verified`: step 2 was not done.
  - `auth_token_expired`: 30 min have passed.
  - `auth_token_invalid` [LIVE]: unknown token, or the registration was already completed.
  - `auth_password_weak` (client_error): show `data.reasons[]` under the password field.
  - `auth_email_already_exists` / `auth_phone_already_exists`: the identifier was taken in the meantime.
  - `validation_error`:
    - `min_length` on `password` and `confirm_password` [LIVE].
    - `invalid` on `confirm_password` when the two don't match.

### 4.5 `POST /api/v1/account/auth/login/`: Public, `auth_attempt`

Body:

| field | type | rules |
|---|---|---|
| `login_method` | `'email' \| 'phone'` | required |
| `login_identifier` | string | required. Email is case-insensitive [LIVE]. Phone accepts `09…`, `+98…` and Persian digits [LIVE: `۰۹۱۲…` worked] |
| `password` | string | required |
| `remember_me` | boolean | optional, default false. **Sets refresh TTL: 7 d or 30 d** [LIVE] |
| `totp_code` | string(6 digits) | optional; send only after `requires_totp` |

Response 200 is an `AuthenticatedResponse` with msg "ورود با موفقیت انجام شد." [LIVE]. The TOTP challenge is also a 200:

```json
{ "msg": "کد تأیید Google Authenticator الزامی است.", "code": 200,
  "data": { "user": null, "tokens": null, "requires_totp": true, "remember_me": false } }
```

Errors:

- `auth_identifier_invalid` (400, client_error, attr null; "فرمت ایمیل نامعتبر است." / "شماره تلفن معتبر نیست.") [LIVE]. No user lookup was done; show it under the identifier field.
- `auth_invalid_credentials` (401) [LIVE]. The same message is returned for an unknown user and for a wrong password; show it as a form-level error.
- `auth_account_disabled` (403) [LIVE]. It is checked **before** the password, so a wrong password on a disabled account still returns 403.
- `auth_totp_invalid` (400) and `auth_totp_locked` (429 with `retry_after`).
- `invalid_code` on `totp_code` [LIVE] and `required` on the three base fields [LIVE].

### 4.6 `POST /api/v1/account/auth/login/otp/request/`: Public, `auth_otp_request`

- Body: `login_method`, `login_identifier`, and optional `otp_method` (must match `login_method`; defaults to `default_otp_methods`).
- Response 200 is `OtpSent`, with msg "کد ورود ارسال شد.".
- The identifier must already be **verified** on the account.
- Errors:
  - `auth_user_not_found` (**404**) [LIVE: "کاربری با این ایمیل یافت نشد."]. This endpoint deliberately reveals that the account does not exist; suggest registration.
  - `auth_identifier_invalid` (400).
  - `auth_not_verified` (400): the identifier is not verified on the account.
  - `auth_account_disabled` (403) [LIVE].
  - `auth_otp_channel_unavailable`, `auth_otp_throttled`, `auth_otp_daily_limit` and `auth_otp_send_failed`.

### 4.7 `POST /api/v1/account/auth/login/otp/verify/`: Public, `auth_attempt`

- Body: `login_method`, `login_identifier` (same values as the request), `otp_code`, optional `remember_me` (7 d or 30 d) and optional `totp_code`.
- Response 200 is an `AuthenticatedResponse`.
- If TOTP is enabled, `totp_code` is missing and the OTP is **correct**, the response is `requires_totp: true` and the OTP is **not consumed**. Resend with the same `otp_code` plus `totp_code`.
- Errors:
  - `auth_otp_invalid`, `auth_otp_expired`.
  - `auth_otp_not_found`: no active code, so go back to the request step.
  - `429 auth_otp_too_many_attempts`.
  - Because the account is resolved again from the identifier, the request-step errors can also appear: `auth_user_not_found` (404) [LIVE], `auth_not_verified`, `auth_account_disabled` and `auth_identifier_invalid`.
  - `auth_totp_invalid` and `auth_totp_locked`.

### 4.8 `POST /api/v1/account/auth/google/`: Public, `auth_attempt`

- Body: `id_token`, the GIS `credential` (preferred), **or** `access_token` (OAuth2 flow), plus optional `totp_code`.
- If both tokens are sent, `id_token` wins [CODE].
- Neither token gives `validation_error`, `attr: "non_field_errors"`, code `invalid`, detail "ارسال توکن گوگل الزامی است." [LIVE].
- Responses:
  - **201** for a new user, with msg "ثبت نام با موفقیت انجام شد.", `is_new_user: true` and `has_usable_password: false`.
  - **200** for an existing user, with `is_new_user: false`.
- `remember_me` is always false, so the refresh token lives 7 d. This endpoint does not accept `remember_me`.
- An existing account with the same email (registered normally) is linked, and its email is marked verified. No duplicate account is created.
- TOTP: the response is 200 `{user:null, tokens:null, is_new_user:null, requires_totp:true, remember_me:false}`. Resend with `totp_code`.
  - A newly created account never gets `requires_totp`.
- Errors:
  - `auth_google_disabled` (400) [LIVE on dev]. Hide the button and re-read settings.
  - `auth_google_token_invalid`:
    - **401**: the token is bad, expired, for another client, or has no email. Get a new token and retry once.
    - **503**: Google could not be reached for `access_token` validation. Retry later.
  - `auth_google_email_unverified` (400): suggest email or phone registration.
  - `auth_account_disabled` (403).
  - `feature_disabled` (503): the email has no account and registration is off. Existing users still log in.
  - `auth_totp_invalid` (400) and `auth_totp_locked` (429).
- Initialise Google Identity Services with `auth.google_client_id`. It is `null` when Google is disabled.

### 4.9 `POST /api/v1/account/auth/token/refresh/`: Public, no dedicated bucket

- Body: `{ refresh: string }`. Other keys are ignored [LIVE].
- Response 200: `{ access: string }` [LIVE]. There is **no new refresh token**, and the same refresh token can be reused repeatedly [LIVE].
- Errors:
  - `401 auth_token_invalid` for an invalid, expired or blacklisted token, or when an access token is sent as `refresh` [LIVE]. Go to login.
  - `401 user_not_found`, `401 user_inactive`. Clear tokens and go to login. Never retry the refresh.
  - `400 required` when `refresh` is missing [LIVE].

### 4.10 `POST /api/v1/account/auth/logout/`: Public, `auth_attempt`

- Body: `{ refresh: string, registration_id?: string }`.
  - `registration_id` is the FCM or push token this device registered. It unsubscribes that device too.
  - A push token that belongs to another account is silently ignored.
- **No access token is needed.** It works even after the access token has expired.
- Response 200: `data: {}`, msg "با موفقیت خارج شدید." [LIVE].
- Only that refresh token is revoked [LIVE: a refresh afterwards returns 401].
- Errors:
  - `400 auth_token_invalid` for an invalid, expired or already-revoked token. The same response is used for all three on purpose [LIVE].
  - `400 required` [LIVE].
- Clear both tokens client-side regardless of the result.

### 4.11 `POST /api/v1/account/auth/logout-all/`: JWT, no body

- Response 200: `data: {}`, msg "از همهٔ دستگاه‌ها خارج شدید.".
- Revokes all refresh tokens for the account and unregisters all its push devices.
- Errors: `401 not_authenticated` [LIVE] and `401 token_not_valid`.

### 4.12 `POST /api/v1/account/auth/password-reset/request/`: Public, `auth_otp_request`

- Body: `reset_method` (`OtpMethod`, required) and `login_identifier`. The identifier is an email for `email`, or a phone number for `sms` or `telegram`.
- Response 200 is `OtpSent`, with msg "کد بازیابی رمز عبور ارسال شد.".
- The code is sent only to an identifier **verified** on the account. A phone-only user cannot reset via email and vice versa, so restrict the method choice to match what the user typed.
- Errors:
  - `auth_user_not_found` (404) [LIVE]. It is deliberately revealed.
  - `auth_not_verified`.
  - `auth_identifier_invalid`: for example an email sent with `reset_method: sms` gives "فرمت شماره تلفن نامعتبر است." [LIVE].
  - `auth_account_disabled` (403).
  - `auth_otp_channel_unavailable`, `auth_otp_throttled`, `auth_otp_daily_limit` and `auth_otp_send_failed`.

### 4.13 `POST /api/v1/account/auth/password-reset/verify-otp/`: Public, `auth_attempt`

- Body: `reset_method`, `login_identifier` (same as the request) and `otp_code`.
- Response 200: `{ reset_token, expires_in: 600 }`, msg "کد تأیید صحیح است. اکنون می‌توانید رمز عبور خود را تغییر دهید.".
- Errors: `auth_otp_invalid`, `auth_otp_expired`, `auth_otp_not_found` and `auth_otp_too_many_attempts`.
- An unknown identifier gives **`auth_otp_not_found`**, not `auth_user_not_found` [LIVE: "درخواست بازیابی رمز عبور یافت نشد…"].

### 4.14 `POST /api/v1/account/auth/password-reset/confirm/`: Public, `auth_attempt`

- Body: `reset_token`, `password` (minimum 8, must differ from the current password) and `confirm_password`.
- Response 200: `data: {}`, msg "رمز عبور با موفقیت تغییر کرد.".
- **No tokens are returned, and every session is revoked.** Redirect to login.
- Errors:
  - `auth_token_invalid` [LIVE] (unknown or already used) and `auth_token_expired` (10 min passed; restart).
  - `auth_password_weak` (with `reasons`) or `auth_password_unchanged`. **The token is NOT consumed**, so the user can try another password.
  - Validation errors on `password` and `confirm_password`.

### 4.15 `POST /api/v1/account/profile/password/change/`: JWT, `auth_attempt`

- Body:
  - `current_password`: required unless `has_usable_password === false`.
  - `password` (minimum 8) and `confirm_password`.
- Response 200: `{ tokens: AuthTokens }`, msg "رمز عبور با موفقیت تغییر کرد.".
  - **Replace the stored pair.** The new refresh token is 7 d.
  - Every other refresh token is revoked.
  - To keep a 30-day session, do an explicit login with `remember_me: true` afterwards.
- UI:
  - Show "Set password" without the current-password field when `has_usable_password` is false.
  - Otherwise show "Change password" with the field.
- Errors [all LIVE]:
  - `auth_password_required`: no current password, but the account has one.
  - `auth_password_invalid`: wrong current password.
  - `auth_password_unchanged`. No session is closed.
  - `auth_password_weak`: the detail is all reasons joined, and `data.reasons` is `string[]`. Observed reasons:
    - "این رمز عبور بسیار رایج است."
    - "رمز عبور نمی‌تواند فقط از عدد تشکیل شده باشد."
    - "این رمز عبور بسیار شبیه نام کاربری می‌باشد."
  - `validation_error` with `invalid` on `confirm_password` ("رمز عبور و تکرار آن یکسان نیستند.").
- Password rules (the same for register/complete and reset/confirm):
  - minimum 8 characters
  - not a common password
  - not all digits
  - not too similar to the email, username, or first or last name

### 4.16 `GET|PATCH /api/v1/account/profile/me/`: JWT

- GET returns `UserProfile` directly in `data` [LIVE].
- PATCH accepts only the changed fields:
  - `first_name` and `last_name`: 1–200 each.
  - `avatar_picture`: a file, sent as multipart.
    - JPEG, PNG or WEBP only, decided by the content. SVG is rejected. Maximum 5 MB.
    - The schema also allows `null`, which probably clears the avatar. This is undocumented [SCHEMA].
- PATCH response: the full updated `UserProfile` **directly in `data`** (no `user` key), with msg "پروفایل با موفقیت بروزرسانی شد.".
- `email` and `phone_number` sent here are **silently ignored**.
- The stored avatar file is renamed with a random id plus the detected extension. Always use the returned absolute URL.
- Avatar errors are `validation_error` on `avatar_picture`:
  - `invalid_image`: the file is not an image.
  - `image_invalid`: another image format.
  - `image_too_large`: more than 5 MB.

### 4.17 `POST /api/v1/account/profile/contact/request/`: JWT, `auth_otp_request`

Body:

| field | type | rules |
|---|---|---|
| `contact_type` | `ContactType` | required |
| `email` / `phone_number` | string | the one matching `contact_type` (new value) |
| `otp_method` | `OtpMethod` | optional, compatible with contact_type; default `default_otp_methods` |
| `password` | string | required **iff** the current identifier of that type is verified **and** `has_usable_password` |
| `totp_code` | 6 digits | required **iff** password is required **and** `is_totp_enabled` |

Response 200 is `OtpSent`, with msg "کد تأیید ارسال شد.". Nothing on the account changes yet.

UI rule from the profile, for contact_type=email:

- If `is_email_verified && has_usable_password`, show the password field.
- If `is_totp_enabled` is also true, show the TOTP field too.
- Apply the same rule for phone using `is_phone_verified`.
- Google-only accounts, with no usable password, need neither.

Errors [LIVE unless marked]:

- `auth_password_required` ("برای تغییر این اطلاعات، وارد کردن رمز عبور فعلی الزامی است.")
- `auth_password_invalid`
- `auth_totp_required` / `auth_totp_invalid` [DOC]
- `auth_email_already_exists` / `auth_phone_already_exists`
- `auth_contact_unchanged` ("این مقدار همان اطلاعات فعلی و تأیید شده شما است.")
- `auth_otp_channel_unavailable`, `auth_otp_throttled`, `auth_otp_daily_limit` and `auth_otp_send_failed`
- validation `invalid` on `otp_method` when it is incompatible ("برای تأیید ایمیل فقط روش «ایمیل» قابل استفاده است."), and on `email` or `phone_number`

### 4.18 `POST /api/v1/account/profile/contact/verify/`: JWT, `auth_attempt`

- Body: `contact_type` (the same as in the request) and `otp_code`.
- Response 200: the updated `UserProfile` **directly in `data`**. msg is, for example, "شماره تلفن با موفقیت ثبت و تأیید شد.".
  - Replace the client's user state with it.
  - `username` does not change.
- Errors:
  - `auth_otp_invalid`, `auth_otp_expired` and `auth_otp_too_many_attempts`.
  - `auth_otp_not_found` [LIVE], including when `contact_type` differs from the request.
  - `auth_email_already_exists` / `auth_phone_already_exists`: the value was taken in the meantime.

### 4.19 TOTP: JWT

| Endpoint | Body | Response `data` | Errors |
|---|---|---|---|
| `GET /api/v1/account/profile/totp/status/` | — | `{ is_totp_enabled }` [LIVE] | 401s |
| `POST /api/v1/account/profile/totp/setup/` (no bucket) | none | `TotpSetup`, msg "کد QR را با اپلیکیشن Google Authenticator اسکن کنید." | `auth_already_verified` if already enabled (disable first) |
| `POST /api/v1/account/profile/totp/enable/` (`auth_attempt`) | `{ totp_code }` | `{}`, msg "احراز هویت دو مرحله‌ای با موفقیت فعال شد." | `auth_not_verified` (setup not called) [LIVE: "ابتدا درخواست فعال‌سازی احراز هویت دو مرحله‌ای را ارسال کنید."], `auth_already_verified`, `auth_totp_invalid`, `auth_totp_locked` |
| `POST /api/v1/account/profile/totp/disable/` (`auth_attempt`) | `{ totp_code }` (no password needed) | `{}`, msg "احراز هویت دو مرحله‌ای با موفقیت غیرفعال شد."; secret wiped | `auth_not_verified` if not enabled [LIVE: "احراز هویت دو مرحله‌ای فعال نیست."], `auth_totp_invalid`, `auth_totp_locked` |

- Use `qr_code` directly as `<img src>`.
- Show `secret` as text for manual entry.
- `provisioning_uri` is for mobile deep links.
- **Each setup call generates a new secret.** Only the latest QR code works for enable.
- TOTP is not active until enable succeeds.
- To re-enable after disabling, start again from setup.

---

## 5. Auth flows step by step

Branches that depend on auth-settings are marked **[AS]**. Branches that depend on feature-status are marked **[FS]**.

### F0. Bootstrap the login and registration pages

1. `GET /global/settings/` and use `data.auth`. Alternatively call `GET /global/auth-settings/`; both are built by the same function and are identical.
2. **[AS]** Configure the page from `auth`:
   - Show the Google button only if `google_login_enabled`. Initialise GIS with `google_client_id`.
   - Registration identifier tabs come from `registration_methods`. `phone` appears only when SMS or Telegram is configured. **Dev: only `['email']`.**
   - OTP channel radios come from `available_otp_methods`. Its order is always email, then sms, then telegram, as available.
   - Preselect `default_otp_methods[identifierType]`. **Handle a missing `phone` key**, e.g. `{ "email": "email" }` [LIVE].
   - For a phone identifier, offer only `sms` and `telegram` ∩ `available_otp_methods`. For an email identifier, offer only `email`.
3. **[FS]** Read `GET /global/feature-status/registration/`. If `is_enabled === false`:
   - Hide or disable sign-up and show `disable_reason`, or a default sentence if it is null.
   - Login stays available.

### F1. Registration (3 steps)

1. Start.
   - Request: `POST register/start/ {first_name, last_name, register_method, email|phone_number, otp_method?}`.
   - On 200, store `registration_token` (30 min) and `otp_method`. Start countdowns from `expires_in` (300) and `resend_after` (120).
   - `auth_email_already_exists` / `auth_phone_already_exists`: switch to login.
   - 503 `feature_disabled` [FS]: hide registration.
2. Verify.
   - Request: `POST register/verify/ {registration_token, otp_code}`.
   - It is safe to repeat.
   - On wrong code, expiry or too many attempts, offer resend.
   - On token invalid or expired, restart from step 1.
3. Resend, optional.
   - Request: `POST register/resend-otp/ {registration_token, otp_method?}` once `resend_after` has elapsed.
   - The user may switch the channel here, e.g. sms to telegram, **only among channels compatible with the identifier** [AS].
4. Complete.
   - Request: `POST register/complete/ {registration_token, password, confirm_password}`.
   - **201** gives tokens and user. Store them and the user is logged in.
   - The refresh token lives 7 d; `remember_me` is not accepted here.
5. The second identifier is added later via F9.

### F2. Password login, plus the TOTP challenge

1. Request: `POST login/ {login_method, login_identifier, password, remember_me}`. Show a "remember me" checkbox with an explanation: 7 days vs 30 days.
2. If `requires_totp`:
   - Show a 6-digit Authenticator field.
   - Re-send the **same body** plus `totp_code`, keeping the same `remember_me`.
   - On `auth_totp_invalid`, say "enter the next code / check device clock".
   - On `auth_totp_locked`, lock the field for `retry_after` seconds.
3. On success, store `tokens` and `user`.

### F3. OTP login ("login with code")

1. Request: `POST login/otp/request/ {login_method, login_identifier, otp_method?}` [AS: channel choice as in F0].
   - On 404 `auth_user_not_found`, suggest registration.
   - On `auth_not_verified`, say this identifier is not verified and suggest password login or the other identifier.
2. Request: `POST login/otp/verify/ {login_method, login_identifier, otp_code, remember_me}`.
3. If `requires_totp`, re-send with the same `otp_code` plus `totp_code`.

### F4. Google login [AS: only if `google_login_enabled`]

1. Get a GIS `credential` (id_token) and call `POST google/ {id_token}`.
2. A 201 with `is_new_user` is a new account. Optionally show onboarding: add a phone number, set a password.
3. If `requires_totp`, re-send with `totp_code`. `is_new_user` is null at that point.
4. On 503 `feature_disabled` [FS registration], tell the user that new sign-ups are closed.

### F5. Session maintenance

- Use the access token everywhere it is needed. Refresh with `POST token/refresh/ {refresh}`, either before `exp` or on 401 `token_not_valid` (single retry).
- **Never discard the refresh token after a refresh.**
- On a refresh 401 with `auth_token_invalid`, `user_not_found` or `user_inactive`, clear tokens and redirect to login.
- Seven or thirty days after login, the refresh fails regardless of activity.

### F6. Logout

- Single device: `POST logout/ {refresh, registration_id?}`, then clear both tokens. Clear them even on error; do not block the UI on the server.
- All devices: `POST logout-all/` with the bearer token. Other devices keep valid access tokens for up to 15 min.

### F7. Forgot password

1. Request: `POST password-reset/request/ {reset_method, login_identifier}`.
   - The method must match the typed identifier: email gives `email`; a phone number gives `sms` or `telegram` [AS].
2. Request: `POST password-reset/verify-otp/ {reset_method, login_identifier, otp_code}`. Store `reset_token` (10 min, single use).
3. Request: `POST password-reset/confirm/ {reset_token, password, confirm_password}`.
   - On a weak or unchanged password, the user retries with the same token.
   - On success, all sessions are revoked: **redirect to login** (no tokens are returned).

### F8. Change or set password (dashboard)

- Use `has_usable_password` to decide the button label and whether to show the current-password field.
- Request: `POST profile/password/change/`. **Replace the stored tokens with `data.tokens`.**

### F9. Add or change email or phone

1. From the profile, decide whether `password` and `totp_code` are needed (rule in §4.17).
2. Request: `POST profile/contact/request/ {contact_type, email|phone_number, otp_method?, password?, totp_code?}`. A phone needs SMS or Telegram enabled [AS].
3. Request: `POST profile/contact/verify/ {contact_type, otp_code}`. Replace the user state with `data`.
4. Profile buttons:
   - When the value is `null`, show "Add". Otherwise show "Change".
   - Show a verified badge from `is_*_verified`.

### F10. TOTP setup, enable and disable

- To enable: setup (show the QR and the secret), then enable with `{totp_code}`.
- To disable: call disable with `{totp_code}`.
- Refresh the profile, or `totp/status`, afterwards.

### F11. Profile edit

- Send `PATCH profile/me/` as JSON for names, or as multipart for the avatar.
- Replace the user state with `data`.

---

## 6. Auth error-code catalogue (`data.errors[].code`)

| code | HTTP | type | Where | UI action |
|---|---|---|---|---|
| `api_key_missing` | 401 | client_error | any | Config bug (add header). NOT a "please log in". |
| `api_key_invalid` | 401 | client_error | any | Config bug; key disabled/unknown (60 s cache). |
| `not_authenticated` | 401 | client_error | JWT endpoints, no/foreign-scheme token | Go to login. |
| `token_not_valid` | 401 | client_error | JWT endpoints, bad/expired access | Refresh once, retry once; then login. |
| `authentication_failed` | 401 | client_error | generic token-layer failure | Same as `token_not_valid`. |
| `bad_authorization_header` | 401 | client_error | `Bearer` header malformed | Config bug. |
| `user_not_found` | 401 | client_error | refresh / JWT endpoints, account deleted | Clear tokens → login. Never refresh. |
| `user_inactive` | 401 | client_error | refresh / JWT endpoints, account disabled | Clear tokens; "contact support". Never refresh. |
| `auth_token_invalid` | 400 (401 on refresh) | client_error | registration/reset/refresh/logout tokens | Restart that flow / go to login. |
| `auth_token_expired` | 400 | client_error | registration (30 min) / reset (10 min) token | "Time is up", restart at step 1. |
| `auth_otp_invalid` | 400 | client_error | any OTP verify | Error under code field; allow retype. |
| `auth_otp_expired` | 400 | client_error | any OTP verify | Enable "Resend". |
| `auth_otp_not_found` | 400 | client_error | any OTP verify (also reset-verify with unknown id; contact-verify with other type) | Back to request step. |
| `auth_otp_too_many_attempts` | 429 | client_error | any OTP verify | Clear+lock field, offer resend after `retry_after`. |
| `auth_otp_throttled` | 429 | client_error | any OTP send | Countdown from `retry_after`. |
| `auth_otp_daily_limit` | 429 | client_error | any OTP send | Show wait (`retry_after`); suggest another channel/identifier or password login. |
| `auth_otp_send_failed` | 503 | server_error | any OTP send | "Temporary problem, try again"; previous code is already void. |
| `auth_otp_channel_unavailable` | 400 | client_error | any OTP send | Should not happen if UI built from `auth`; refetch settings. |
| `auth_not_verified` | 400 | client_error | complete before verify; login-OTP/reset with unverified identifier; totp enable without setup; totp disable when off | Route to the missing step / explain. |
| `auth_already_verified` | 400 | client_error | resend after verify; totp setup/enable when on | Re-read state from server. |
| `auth_email_already_exists` | 400 | client_error | register start/complete, contact request/verify | Under email field; offer login. |
| `auth_phone_already_exists` | 400 | client_error | same | Under phone field. |
| `auth_contact_unchanged` | 400 | client_error | contact request | Informational. |
| `auth_identifier_invalid` | 400 | client_error (attr null) | login, login-OTP, reset | Under identifier field (map manually). |
| `auth_invalid_credentials` | 401 | client_error | password login | Form-level error. |
| `auth_user_not_found` | 404 | client_error | login-OTP request/verify, reset request | Suggest registration. |
| `auth_password_weak` | 400 | client_error + `data.reasons[]` | register complete, reset confirm, password change | Show each reason under password field. |
| `auth_password_unchanged` | 400 | client_error | reset confirm, password change | "Choose a new password". |
| `auth_account_disabled` | 403 | client_error | login, login-OTP, reset, Google | Message + support contact. |
| `auth_password_required` | 400 | client_error | password change, contact request | Show current-password field. |
| `auth_password_invalid` | 400 | client_error | password change, contact request | Under current-password field. |
| `auth_totp_required` | 400 | client_error | contact request | Show TOTP field. |
| `auth_totp_invalid` | 400 | client_error | any TOTP | Under TOTP field; "enter next code / sync clock". |
| `auth_totp_locked` | 429 | client_error + retry_after | any TOTP | Lock field for `retry_after`. |
| `auth_google_disabled` | 400 | client_error | Google | Hide button; refetch settings. |
| `auth_google_token_invalid` | 401 / 503 | client_error / server_error | Google | 401: new token, retry once. 503: retry later. |
| `auth_google_email_unverified` | 400 | client_error | Google | Suggest email/phone sign-up. |
| `throttled` | 429 | client_error + retry_after | any | Wait `retry_after`; no immediate retry. |
| `feature_disabled` | 503 | server_error + feature, feature_name | register start/resend, Google new-account (and other apps) | Hide control, show detail, refetch feature-status; **no auto-retry**. |
| `request_too_large` | 413 | client_error | body > 2.5 MiB (files not counted) | Client bug. |
| `bad_request` | 400 | client_error | too many form fields | Client bug. |
| `parse_error` | 400 | client_error | malformed JSON [LIVE on version-check] | Client bug. |
| `unsupported_media_type` | 415 | client_error | wrong Content-Type [LIVE] | Client bug. |
| `method_not_allowed` | 405 | client_error | wrong verb [LIVE] | Client bug. |

- Validation codes are listed in §1.2.
- The schema's error enums are a **project-wide union per HTTP status**, not per endpoint. For example, the 400 enum on login also lists cart and coupon codes, so it cannot be used to generate an exhaustive per-endpoint switch.

---

## 7. Global endpoints reference (`/api/v1/global/*`)

- All are GET except `version-check` (POST).
- All are public (key only) except `feature-toggles` (staff JWT).
- None has a dedicated throttle; only the 2000/h anonymous and 5000/h user limits apply.
- There are no `Cache-Control`, `ETag` or `Last-Modified` headers and no server-side cache. Changes in the panel are visible on the next request.
- Every `msg` is the generic "درخواست با موفقیت انجام شد.".
- A wrong method gives `405 method_not_allowed` [LIVE: POST on settings, GET on version-check].

### 7.1 `GET /api/v1/global/settings/`: no params, no pagination. It never returns 404 and returns defaults on a fresh install.

```ts
interface SiteSettings {
  name: string;                       // "" (not null) on unconfigured install
  slogan: string | null;
  copyright: string | null;           // plain text, footer bottom line
  footer: string | null;              // HTML (rich text); relative URLs NOT absolutised
  announcement: string | null;        // HTML; null/"" => hide top bar
  logo: string | null;                // absolute URL; may be SVG
  logo2: string | null;               // absolute URL; alternative logo (dark bg / print)
  favicon: string | null;             // absolute URL; square >= 32x32
  phone: string | null;               // E.164 "+982191000000" -> tel: as-is; format for display
  phone2: string | null;
  sales_phone: string | null;         // 2026-10-29: «مشاوره و فروش» line, E.164 like phone; null = none
  sales_phone2: string | null;        // 2026-10-29: independent of sales_phone (either may be set alone)
  response_time: string | null;       // display as-is
  email: string | null;               // customer contact email
  address: string | null;             // plain text, may be multi-line
  postal_code: string | null;         // free text in practice (schema claims 10 digits, not enforced)
  map: string | null;                 // panel asks for Google Maps <iframe> embed; NOT validated; demo = plain URL
  accept_terms_text: string | null;   // HTML; display-only beside pay button
  confirm_legal_age: string | null;   // HTML; null => don't ask; display-only
  app_store_download_link: string | null;
  ios_application_download_link: string | null;
  google_play_download_link: string | null;
  android_application_download_link: string | null;
  web_application_link: string | null;  // PWA link
  support_link: string | null;          // support/chat URL; null => hide support button
  primary_color: string | null;         // 2026-10-29: "#rrggbb" lowercase (panel normalises #fff/#FFF); null = store theme
  secondary_color: string | null;       // 2026-10-29: same format; independent of primary_color
  auth: AuthSettings;                   // always present; identical to /global/auth-settings/
}
```

- File URLs are built on the **request host** [LIVE: `http://localhost:8000/media/...`]. In production they will be on the API host.
- Live demo values:
  - `logo`: `…/media/categories/26/09/13/site-logo.png`
  - `announcement` and `footer`: plain text without tags
  - `map`: `https://maps.google.com/?q=35.7564,51.4100`
  - `support_link`: `https://firefly-core.ir/contact-us/`
  - `web_application_link`: `https://firefly-core.ir`
  - all four app-store links are null
- Not published here:
  - the Metabase link
  - the per-user address limit, which is only visible through the address-creation error
  - the default languages, which come from `/global/languages/`

### 7.2 `GET /api/v1/global/auth-settings/`

```ts
interface AuthSettings {
  google_login_enabled: boolean;      // true only if switch on AND client id set
  google_client_id: string | null;    // null when disabled; secret never exposed
  sms_otp_enabled: boolean;           // active OTP SMS template + usable provider account
  telegram_otp_enabled: boolean;      // telegram switch on + API token set
  available_otp_methods: OtpMethod[]; // ['email', ('sms')?, ('telegram')?]  email always first
  registration_methods: ContactType[];// ['email', ('phone' iff sms||telegram)]
  default_otp_methods: { email: 'email'; phone?: 'sms' | 'telegram' };  // phone key ABSENT when no sms/telegram
}
```

- Live dev value: `{google_login_enabled:false, google_client_id:null, sms_otp_enabled:false, telegram_otp_enabled:false, available_otp_methods:["email"], registration_methods:["email"], default_otp_methods:{"email":"email"}}`.
- **The `registration` feature switch is not reflected here.**

### 7.3 `GET /api/v1/global/socials/`: paginated, with no filter and no active flag

```ts
interface SocialAccount { id: number; name: string; username_or_id: string; logo: string | null; link: string }
```

- Results are ordered by `name` (Persian alphabetical), then `id` [LIVE: آپارات, اینستاگرام, تلگرام, لینکدین, واتساپ].
- There is no custom order. Sort client-side if needed.
- `name` is free text, so **don't pick icons by name**; use `logo`, an absolute URL that may be SVG.
- `username_or_id` has no fixed format and may or may not include `@`.
- `link` is always present.
- Demo data has 5 rows: Aparat, Instagram, Telegram, LinkedIn and WhatsApp.

### 7.4 `GET /api/v1/global/languages/?platform=web|ios|android|all`: no pagination

- The default platform is `web`.
- The value is case-insensitive [LIVE: `WEB` works], and empty means web.
- Any other value gives `400 validation_error`, `code: invalid`, `attr: "platform"`, detail "پلتفرم انتخاب شده معتبر نیست." [LIVE].

```ts
interface Languages {
  default_language: string;           // 'fa' if unset (and always for 'all'); NOT guaranteed to be in enabled_languages -> fall back to first
  enabled_languages: EnabledLanguage[]; // sorted by language_code ('en' before 'fa')
}
interface EnabledLanguage {
  language_code: 'fa' | 'en';         // only these two codes are possible
  language_name: string | null;       // null/"" if operator cleared it -> show code (schema says non-null)
  icon: string | null;                // RELATIVE path like "/media/languages/fa.png" -> prefix API origin
  is_rtl: boolean;                    // drives dir= of the whole UI
  translations: Record<string, unknown> | null;  // full dictionary (plural key here!)
}
```

- Live web: `default_language: "fa"`.
  - en has `is_rtl: false` and translations `{currency:"Toman", add_to_cart:"Add to cart"}`.
  - fa has `is_rtl: true` and translations `{currency:"تومان", add_to_cart:"افزودن به سبد خرید"}`.
  - Both icons are null.
- ios and android return only fa [LIVE].

### 7.5 `GET /api/v1/global/get-translation/<language_code>/`

```ts
interface Translation { language_code: 'fa' | 'en'; is_rtl: boolean; translation: Record<string, unknown> | null } // SINGULAR key
```

- Platform switches are ignored, so a language disabled everywhere still answers.
- An unknown code gives `404 not_found`, detail "یافت نشد." [LIVE: `de`].
- **The path is case-sensitive**: `FA` returns 404 [LIVE], although `platform` is case-insensitive.

Translation contract:

- The server defines no keys. The **storefront team owns the key list** and hands it to the operator, who edits a JSON object per language in the panel.
- Bundle default strings with the app and **merge** the server dictionary over them; server keys win.
- `null` means "nothing to merge".
- Only the UI chrome is translated. All API data (products, errors, content) is Persian only.
- The user's language choice is client-side only; the server stores nothing.
- New languages cannot be added from the panel (fa and en only).

### 7.6 `POST /api/v1/global/version-check/`: JSON or form body; GET returns 405

```ts
interface VersionCheckRequest { platform: 'ios' | 'android' | 'web'; current_version_code: number /* int >= 0; "24" ok */ }
interface VersionCheck {
  platform: 'ios' | 'android' | 'web';
  current_version_code: number;
  last_version: { version_name: string; version_code: number } | null;  // newest for platform; null => both flags false
  update_available: boolean;      // any release with version_code > current
  force_update: boolean;          // ANY newer release has force flag (not just latest)
  changes: Record<string, string | null>; // version_name -> HTML note, oldest->newest insertion order (don't rely on key order); {} if none
  download_links: {               // all five, regardless of platform; null if empty
    google_play_download_link: string | null; android_application_download_link: string | null;
    app_store_download_link: string | null; ios_application_download_link: string | null;
    web_application_link: string | null;
  };
}
```

- Live demo releases are android 2.5 (25, forced), ios 2.4 (24) and web 3.1 (31). [LIVE checks]:
  - android with code 20 gives `force_update: true` and changes `{ "2.5": … }`.
  - android with code 25 gives both flags false and `changes: {}`.
  - `"24"` as a string is accepted.
- Errors:
  - `required` for both fields when the body is `{}`.
  - `invalid_choice` for an uppercase platform, e.g. `"ANDROID"`.
  - `invalid` for `"2.4"` or `true`.
  - `min_value` for -1.
  - `null` for null values.
  - `parse_error` for bad JSON.
  - `415 unsupported_media_type` for `text/plain` [all LIVE].
- Do not cache this endpoint.
- A web storefront only needs it if it has a build number. If used, call it with `platform: 'web'`; `force_update` means "reload required".

### 7.7 `GET /api/v1/global/extra-snippets/`: paginated

- Query:
  - `position`: repeatable; one of `in_head`, `top_of_body`, `bottom_of_body`, `outside_of_body`.
  - `type`: repeatable; one of `style`, `link`, `script`, `meta`.
  - `page` and `limit`.
- Unknown values return an empty list, not an error, and empty values are ignored [LIVE: `position=bogus` gives count 0, `position=` gives all].

```ts
interface ExtraSnippet {
  id: number;
  description: string;   // operator note; NOT for display (could be emitted as an HTML comment)
  position: 'in_head' | 'top_of_body' | 'bottom_of_body' | 'outside_of_body';
  type: 'style' | 'link' | 'script' | 'meta';   // schema marks optional; always present live
  snippet: string;       // raw, unsanitised code exactly as typed
}
```

- Results are ordered alphabetically by `position` **string**, then `type`, then `id`, so `bottom_of_body` comes before `in_head` [LIVE]. Group by `position` and keep the response order within each group.
- Demo rows are full HTML that already contains its own `<script>` tag:
  - GA placeholder in `in_head`: `<!-- … --><script>window.dataLayer=…</script>`
  - eNamad placeholder in `bottom_of_body`
- **If `snippet` starts with `<`, treat it as complete HTML and do not wrap it in another tag.** The panel's help text implies `type` decides the wrapping tag, so agree the convention with the operator.
- Snippets run unsanitised in every customer's browser, by design: analytics must execute.

### 7.8 `GET /api/v1/global/content-page-types/`: paginated, active only, ordered by `title`

```ts
interface ContentPageType { id: number; key: string; title: string; description: string | null }
```

- Live keys: **`return-policy`** (id 10005, "رویه بازگرداندن کالا") and **`terms`** (id 10003, "قوانین و مقررات"). These are the only two in the demo data, each with one `warning`.
- A content page type is a **message slot**, not a page. It has no URL and is not in the sitemap.
- Storefront pages such as About and Terms come from `GET /api/v1/pages/<slug>/`, covered in the content guide.
- Keys are free-form: only uniqueness is checked.
  - Keys containing `/` cannot be reached via the detail route [LIVE: HTML 404 in dev].
  - Keys with spaces need `%20`.
  - Agree on slug-style keys.

### 7.9 `GET /api/v1/global/dynamic-content/<page_type_key>/`: no pagination

```ts
interface DynamicContent {
  id: number;
  page_type: number;
  page_type_detail: ContentPageType;
  content_type: 'description' | 'warning';
  title: string | null;     // optional heading
  content: string;          // HTML from rich-text editor; relative URLs NOT absolutised
}
interface DynamicContentGroup {
  page_type: number;
  page_type_key: string;
  page_display_name: string;     // = page type title
  descriptions: DynamicContent[];// content_type 'description', ordered by id
  warnings: DynamicContent[];    // content_type 'warning', ordered by id -> render as distinct alert box
}
```

- An active type with no active items returns 200 with two empty arrays.
- A missing key or an inactive type returns `404 not_found` ("یافت نشد."). **Leave the slot empty** [LIVE: `nope`].
- Live: `/dynamic-content/terms/` returns 1 warning, "کالاهای غیرقابل مرجوع". `/dynamic-content/return-policy/` returns 1 warning, "هزینه ارسال مرجوعی".

### 7.10 `GET /api/v1/global/dynamic-content/`: paginated flat list of `DynamicContent`

- Only active items whose page type is also active are included.
- Ordered by page-type title, then `content_type` (description before warning), then `id`.
- No filters.

### 7.11 `GET /api/v1/global/dynamic-content-grouped/`: paginated list of `DynamicContentGroup`

- Pagination is over **groups**, so `count` is the number of page types.
- Types with no active items are omitted.
- Ordered by page-type title.
- Good for loading every slot in one call at boot.

### 7.12 `GET /api/v1/global/feature-status/`: paginated, but always all 10 keys in a fixed order (they fit in one page)

```ts
type FeatureKey = 'blog' | 'blog_comments' | 'product_comments' | 'wallet' | 'pay_on_delivery'
                | 'guest_checkout' | 'registration' | 'online_payment' | 'stock_notifications' | 'coupons';
interface FeatureStatus {
  feature_key: FeatureKey;
  display_name: string;          // Persian label
  is_enabled: boolean;           // no stored row => enabled
  disable_reason: string | null; // operator text, ONLY when disabled; null when enabled or no text
}
```

- `GET /api/v1/global/feature-status/<feature_key>/` returns a single `FeatureStatus`. An unknown key gives 404 `not_found` with detail "ویژگی مورد نظر یافت نشد." [LIVE].
- `/global/*` itself is never feature-gated.
- Live: all ten are enabled.
- What each key closes [DOC table §10.3]:

| key | 503 on | stays open / other effects |
|---|---|---|
| `blog` | all 10 `/api/v1/blog/*` routes (home, post list/detail, comment list/submit, category list/detail, reading-list list, post reading-list POST/DELETE) | blog posts and categories are removed from the sitemap |
| `blog_comments` | `/blog/post/<slug>/comment/submit/` | reading approved comments |
| `product_comments` | `/product/detail/<slug>/comment/submit/` | reading comments |
| `wallet` | `/wallet/top-up/`, `/wallet/withdrawal/request/`, payment intents with `wallet` or `wallet_and_gateway` | balance, history, withdrawal list/cancel. `/payment/method/list/` marks those methods `is_available:false` with a `reason` |
| `pay_on_delivery` | `/cart/shipping/select/` with `cash_on_delivery:true`; intents with `pay_on_delivery` | shipping options remain but with `supports_cash_on_delivery:false` and `cod_fee:0` |
| `guest_checkout` | `/order/place/` for guests (no token or a bad token), after body validation | logged-in checkout and guest carts. **Refresh the token before placing an order** so a logged-in user is not treated as a guest |
| `registration` | `/account/auth/register/start/`, `/register/resend-otp/`, `/auth/google/` when it would create an account | login, `register/verify` and `register/complete` |
| `online_payment` | intents with `bank_gateway` or `wallet_and_gateway`; `/wallet/top-up/` | card-to-card and wallet payment |
| `stock_notifications` | `/product/detail/<slug>/notify/` | — |
| `coupons` | `/cart/coupon/apply/` | `/cart/coupon/remove/`; already-applied coupons stay valid |

- The panel never lets both `online_payment` and `pay_on_delivery` be off at the same time.
- Shape of the 503 response:

```json
{ "msg": "این سرویس موقتاً در دسترس نیست.", "code": 503,
  "data": { "type": "server_error",
            "errors": [{ "code": "feature_disabled", "detail": "<operator reason OR «<name>» در حال حاضر غیرفعال است. لطفاً بعداً دوباره تلاش کنید.>", "attr": null }],
            "feature": "coupons", "feature_name": "کد تخفیف" } }
```

- The response also carries a `Retry-After: 300` header. It is advisory, and no such number appears in the body.
- If `disable_reason` is null on a disabled key, show the default sentence: «<display_name>» در حال حاضر غیرفعال است. لطفاً بعداً دوباره تلاش کنید.

### 7.13 `GET /api/v1/global/feature-toggles/`: **staff JWT only.** The storefront must not use it.

```ts
interface FeatureToggle { id: number; feature_key: FeatureKey; feature_display_name: string; is_enabled: boolean; disable_reason: string | null }
```

- These are the stored rows only, so a missing key means **enabled**.
- `disable_reason` is returned even when the key is enabled.
- Errors: `401 not_authenticated` [LIVE], `401 token_not_valid` [LIVE], and `403 permission_denied` for a non-staff user.

---

## 8. How the storefront should use settings, socials, snippets, dynamic content, languages and features

### 8.1 Site shell (header and footer)

| Field | Use |
|---|---|
| `name` | Site title, brand text and `<title>` suffix. Fall back gracefully when it is `""`. |
| `slogan` | Short line under the name or in the header. |
| `logo` | Main header logo; also used on invoices. May be SVG. |
| `logo2` | Alternative logo for dark backgrounds, print or the footer. |
| `favicon` | `<link rel="icon">` via Next `metadata.icons`. Null means use a bundled default. |
| `announcement` | Top bar on **every page**. Null or `""` hides it. HTML: sanitise and absolutise `/media/` URLs. |
| `footer` | Footer rich-text block on every page. HTML: sanitise and absolutise. |
| `copyright` | Plain-text bottom line on every page. |
| `phone`, `phone2` | `tel:` links using the raw E.164 value. Display in a local format, optionally with Persian digits. |
| `sales_phone`, `sales_phone2` | The «مشاوره و فروش» line(s), separate from support. Storefront: a row in the footer contact block, the contact page and the `contact_info` page block (`contactDetails().salesPhones`, deduplicated against `phone`/`phone2`); and «مشاوره پیش از خرید» in the product buy box (`ConsultCall`). Not in the header. The wholesale call-to-order uses the first sales line, else `phone`. |
| `primary_color`, `secondary_color` | The panel's theme colours (tab «رنگ‌بندی قالب»). Storefront (`lib/theme/panel-colours.ts`, `features/settings/theme.ts`): panel colour → `THEME_PRIMARY`/`THEME_ACCENT` env → the store preset; `secondary_color` is the accent. A colour too light for white text (or too light on white) is darkened in OKLCH, hue kept, until the WCAG pairs pass. Used for the CSS variables, `theme-color`, the PWA manifest and the generated icons. |
| `email` | `mailto:` contact. |
| `response_time` | Shown next to the contact info as-is. |
| `address`, `postal_code` | Contact block. Preserve line breaks. |
| `map` | May be an `<iframe>` embed or a plain URL. Detect it: sanitise and embed an iframe, or render a "view on map" link. |
| `support_link` | Support or chat button. Null hides it. |
| `accept_terms_text` | Text next to the checkout pay button, as the terms-acceptance sentence. Display only; the order API does not check it. |
| `confirm_legal_age` | Legal-age confirmation text at checkout. Null means do not ask. Display only. |
| `app_store_download_link`, `ios_application_download_link`, `google_play_download_link`, `android_application_download_link`, `web_application_link` | App badges, for example in the footer. Hide each badge whose link is null. |
| `auth` | Login and registration page configuration (§5 F0). |

Every null field means "do not render that section". This is part of the guide's checklist.

### 8.2 Socials

- Footer and contact-page links come from `/global/socials/`.
- Render `logo` as the icon, `username_or_id` as the label and `link` as the href.
- Cache them together with settings.

### 8.3 Extra snippets in the HTML shell

- Fetch once while building the layout (the root `layout.tsx`).
- Group by `position`:
  - `in_head` goes inside `<head>`.
  - `top_of_body` goes right after `<body>` opens.
  - `bottom_of_body` goes just before `</body>`.
  - `outside_of_body` means "outside BODY". Since browsers re-parent such content, render it after `bottom_of_body` at the very end. This is our interpretation; the server only stores the label.
- Implementation hint (ours, not from the guide):
  - Raw `<script>` inside `dangerouslySetInnerHTML` executes only when the HTML is parsed on SSR.
  - That is acceptable in a persistent root layout.
  - For `<head>`, prefer parsing the snippet into `script`, `style`, `link` and `meta` elements, or use `next/script` for scripts.
  - Don't re-wrap content that already starts with `<`.
- Native apps should not call this endpoint.

### 8.4 Dynamic content (in-app message slots)

- For each UI slot (cart, checkout step, return-policy area, terms acceptance and so on), call `GET /global/dynamic-content/<key>/` with the key the operator created for that slot.
- **The key list is a contract the storefront defines** and gives to the operator. The demo has only `terms` and `return-policy`.
- Render:
  - `descriptions` as normal text.
  - `warnings` as visually distinct alert boxes.
  - `title`, when present, as each item's heading.
  - `page_display_name` as an optional section heading.
- A 404 means hide the slot.
- `content` is HTML: sanitise it and absolutise relative URLs.
- Alternatively, load all slots at boot with `dynamic-content-grouped/`.
- Do **not** use this for `/page/<slug>/` pages; those come from `GET /api/v1/pages/<slug>/`.

### 8.5 Languages

- At boot, call `GET /global/languages/?platform=web`.
- Pick the user's stored choice. Otherwise use `default_language` if it is in `enabled_languages`, else the first entry.
- Set `<html lang dir>` from `is_rtl`.
- Merge `translations` over the bundled strings.
- Refresh with `get-translation/<code>/` (note the singular `translation` key).
- The language switcher shows `language_name ?? language_code` and `icon` prefixed with the API origin.
- Persist the choice client-side, for example in a cookie or localStorage.

### 8.6 Feature gating

- At boot, read `feature-status/` and hide UI per §7.12:
  - blog links and menus
  - comment forms
  - wallet top-up and withdrawal
  - the COD option
  - guest checkout, which means requiring login
  - sign-up
  - online payment methods
  - "notify me when available"
  - the coupon input
- Refetch on app focus and after any `feature_disabled` response.

### 8.7 Caching (the server declares none; the guide recommends)

| Endpoint | When | Keep | Next.js suggestion (ours) |
|---|---|---|---|
| `settings/` | app start; SSR once for all visitors | a few minutes. The `auth` block changes when Google or SMS is toggled | `fetch(..., { next: { revalidate: 300, tags: ['global-settings'] } })` |
| `languages/` | app start, in the background | store on device and refresh each run | revalidate 300–3600 |
| `feature-status/` | start, on focus, after each `feature_disabled` | short, at most 300 s | revalidate ≤ 60; `revalidateTag` on 503 |
| `version-check/` | each run and each focus | **never cache** | `cache: 'no-store'` |
| `extra-snippets/` | layout build | minutes | revalidate 300–600 |
| `dynamic-content…` | when the slot renders | minutes | revalidate 300 |
| `socials/` | footer build | with settings | revalidate 300 |

- SSR shares one IP. **Do not hit `settings/` on every page view**, or the 2000/hour anonymous limit will be exhausted.

---

## 9. Sitemap and the storefront URL patterns the backend assumes

### 9.1 `GET /sitemap.xml` on the API host

- It is outside `/api/v1`, needs **no key and no token**, and is not throttled.
- `Content-Type: application/xml` [LIVE].
- Headers:
  - `Last-Modified`: the newest change across all URLs [LIVE].
  - `X-Robots-Tag: noindex, noodp, noarchive` [LIVE]: this is Django's default for the sitemap file itself, and URLs inside are still crawled.
- Query `p` gives the page number, with up to 50,000 URLs per section per page.
  - An out-of-range or non-numeric value returns 404 [LIVE: `p=2` and `p=abc` both 404].
  - Demo: **169 URLs**, one page [LIVE].
- It is a single `<urlset>` with no sitemap index. Sections appear in this order:

| Section | Rows | Storefront path | changefreq / priority | Live count |
|---|---|---|---|---|
| `blog_posts` | published posts whose scheduled time has passed, newest first. Empty if `blog` is off | `/blog/<slug>/` | weekly / 0.9 | 19 |
| `blog_categories` | published blog categories. Empty if `blog` is off | `/blog/category/<path>/` (slug chain, e.g. `buying-guide/appliance-blog`) | weekly / 0.8 | 7 |
| `products` | published products | `/product/<slug>/` | weekly / 0.9 | 74 |
| `product_categories` | published categories with no draft ancestor | `/product-category/<path>/` (slug chain, e.g. `tools-car/power-tools`) | weekly / 0.8 | 32 |
| `product_lists` | published product lists | `/product/list/<slug>/` | weekly / 0.8 | 2 |
| `product_brands` | published brands | `/brand/<slug>/` | weekly / 0.9 | 30 |
| `content_pages` | published `pages` app pages, ordered by slug | `/page/<slug>/` | monthly / 0.5 | 5 (`about-us`, `contact-us`, `privacy`, `return-policy`, `terms`) |

- `<lastmod>` is the row's last edit date (date only, Tehran time).
- Content page types (§7.8) are **not** in the sitemap.
- The `<loc>` host and scheme come from **`STOREFRONT_URL`**, not the request host [CODE + LIVE: `http://localhost:3000/...` in dev].
  - If it is empty, `https://SITE_DOMAIN` is used.
  - In production this is expected to be `https://firefly-core.ir`.
- **The storefront must**:
  1. Serve **exactly** these seven route patterns, **with trailing slash**. In Next.js set `trailingSlash: true` (see storefront-seo and content guides).
     - The category and blog-category paths are multi-segment, so use catch-all routes, e.g. `app/product-category/[...path]/page.tsx` and `app/blog/category/[...path]/page.tsx`.
     - Otherwise sitemap URLs return 404.
  2. Make the sitemap discoverable **from its own domain**, either:
     - by proxying `https://<storefront>/sitemap.xml` (and `?p=`) to `https://api.<domain>/sitemap.xml`, for example with a Next `rewrites()` to the external URL or a route handler that streams the XML and keeps the content-type; or
     - with a robots.txt line `Sitemap: https://api.<domain>/sitemap.xml`.
  - **However, the backend's robots API** (`GET /api/v1/robots/`, outside this scope) already advertises `Sitemap: {STOREFRONT_URL}/sitemap.xml` [LIVE: `"sitemaps":["http://localhost:3000/sitemap.xml"]`]. If you render robots.txt from that API, you **must** proxy `/sitemap.xml`.

### 9.2 Complete list of storefront URLs the backend assumes

Items are tagged with where I verified them.

| Storefront URL | Built by | Notes |
|---|---|---|
| `/product/<slug>/` | `product.Product.get_absolute_url` [CODE+LIVE] | also used in JSON-LD and breadcrumbs (product guide "frontend routes") |
| `/product-category/<path>/` | `product.Category.get_absolute_url` [CODE+LIVE] | `path` = slug chain from root |
| `/product/list/<slug>/` | `product.ProductList.get_absolute_url` [CODE+LIVE] | |
| `/brand/<slug>/` | `product.Brand.get_absolute_url` [CODE+LIVE] | |
| `/blog/<slug>/` | `blog.Post.get_absolute_url` [CODE+LIVE] | |
| `/blog/category/<path>/` | `blog.Category.get_absolute_url` [CODE+LIVE] | `path` = slug chain |
| `/page/<slug>/` | `pages.Page.get_absolute_url` [CODE+LIVE] | data comes from `GET /api/v1/pages/<slug>/` |
| `/blog/` and `/` | blog JSON-LD breadcrumb (`BLOG_INDEX_PATH='/blog/'`, root `{base}/`) [CODE] | blog index and home |
| `/sitemap.xml` | robots API `Sitemap:` line [CODE+LIVE] | proxy to the API host |
| `/order/pay/<token>` | `order/services/payment_link.py` [CODE] | **no trailing slash** in the generated URL. It is sent by SMS as `payment_url` (order guide). Its data comes from `/api/v1/order/pay/<token>/` |
| `/s/<code>` | `SHORT_LINK_BASE_URL` default `{STOREFRONT_URL}/s/` [CODE] | short-link redirector (storefront-seo guide: 302 per visit) |
| `/api/v1/payment/gateway/callback/<gateway_code>/<callback_token>/` **on the STOREFRONT host** | `payment/services/intent.py` `STOREFRONT_URL + reverse(...)` [CODE] | **The storefront must reverse-proxy this path to the backend.** Otherwise the bank redirect lands on a 404 (deployment guide) |
| `/cart/`, `/checkout/` | demo robots rules (operator data) [LIVE] | data-level, not code |
| `/contact-us/` | demo `settings.support_link` (operator data) [LIVE] | the contact page is actually at `/page/contact-us/`; see §13 |

---

## 10. Guide checklists (translated)

### 10.1 Auth guide checklist

- [ ] `X-API-Key` is set on all requests.
- [ ] Global settings are read before rendering login and registration. Google, SMS, Telegram and phone registration options are shown only when enabled.
- [ ] Registration: the user picks either email or phone, and only that one is verified.
- [ ] `expires_in` and `resend_after` are read from responses, not hard-coded.
- [ ] A 200 with `requires_totp: true` is not treated as a successful login.
- [ ] Error text comes from `data.errors[0].detail`, not `msg`.
- [ ] Branching uses `data.errors[0].code`, not Persian text.
- [ ] `validation_error` messages are shown under the field named by `attr`.
- [ ] The access token is refreshed before expiry. On 401, the user goes to login.
- [ ] The client knows refresh tokens don't rotate and keeps the old refresh token.
- [ ] "Remember me" is sent as `remember_me`, and the UI explains 7 vs 30 days.
- [ ] Every 429 (from `throttled` through `auth_otp_throttled`) is handled with `data.retry_after`, with no immediate retry.
- [ ] Logout calls `logout/` with this device's refresh token and clears both tokens. It works even when the access token has expired.
- [ ] After a password change, the new token pair replaces the old one.
- [ ] A 401 with `user_inactive` or `user_not_found` does not trigger another refresh.
- [ ] After a password reset, the user is sent to login.
- [ ] The profile shows "Add" or "Change" based on `email` and `phone_number`.
- [ ] The change-identifier form shows the password field only when the current identifier is verified.
- [ ] The "Set" or "Change" password label is chosen from `has_usable_password`.

### 10.2 Settings guide checklist

- [ ] `X-API-Key` is set on all `/api/v1/global/` requests.
- [ ] At start, `settings/`, `languages/?platform=…` and `feature-status/` are fetched in parallel. `auth-settings/` is not called separately when `auth` is already available.
- [ ] On the SSR server, responses are cached. A page view does not trigger a `settings/` request.
- [ ] Every null field (logo, announcement, download links, `support_link`, `confirm_legal_age`) means "don't show". An empty `name` does not break the page.
- [ ] Relative URLs inside rich-text HTML, and language icons, are prefixed with the API origin. HTML is sanitised before rendering.
- [ ] Login options are built only from `auth`. A missing `default_otp_methods.phone` is handled. The sign-up form also checks the `registration` feature key.
- [ ] The translation dictionary is merged over bundled strings, tolerates null, and the code accounts for `translations` vs `translation`.
- [ ] `default_language` is checked against `enabled_languages` before use.
- [ ] Apps send the build number (not the version name) as `current_version_code`. `force_update` blocks the app until updated. The platform-specific link is taken from `download_links`.
- [ ] Snippets are grouped by `position`, injected in the right place, and not re-wrapped.
- [ ] Each message slot reads `dynamic-content/<key>/` with its panel-defined key. Warnings are shown distinctly. A 404 leaves the slot empty. `/page/<slug>/` pages come from `GET /api/v1/pages/<slug>/`, not from this endpoint.
- [ ] A 503 `feature_disabled` is excluded from automatic 5xx retry. The control is hidden and feature-status is refreshed.
- [ ] All sitemap routes (`/product/…`, `/product-category/…`, `/product/list/…`, `/brand/…`, `/blog/…`, `/blog/category/…`, `/page/…`) exist on the storefront. The sitemap is announced from the storefront domain, via proxy or robots.txt.

---

## 11. Dev-environment notes (`localhost:8000`)

- The API-key gate is off. Accepting any key does not prove your key handling works.
- `DEBUG=True` behaviour:
  - Unknown paths return **HTML** 404 pages.
  - A POST without the trailing slash returns an **HTML 500** (APPEND_SLASH RuntimeError) [LIVE].
  - Production returns a JSON 404, and a 301 for a missing slash, which breaks POST bodies.
- Google, SMS and Telegram are all disabled, so phone registration, phone OTP, Telegram and Google cannot be tested here.
- There is no SMTP configuration in the fixtures. OTP sends to email most likely fail with 503 `auth_otp_send_failed` [CODE]. Use password login with the demo accounts.
- **OTP sandbox (2026-10-29, auth-api §1).** With `DEBUG=True` and `OTP_SANDBOX=True` in the backend's `.env`, every OTP send (email and SMS) answers the usual `200` and `sms` is advertised in `available_otp_methods`, but nothing is sent: read the code in the panel under **کاربران › کدهای یکبار مصرف**. The code never appears in any response. The 2-minute gap, the daily cap and the 5 attempts still apply; Telegram is unchanged. It is forced off when `DEBUG` is off. The storefront needs nothing for it: it already follows `available_otp_methods`, so phone registration and phone OTP login can be tested locally with it on [LIVE: `sms_otp_enabled: true`, methods `email, sms`].
- The `auth_attempt` bucket (20/min per IP) is shared by everything on 127.0.0.1. I tripped it once while probing [LIVE: `429 throttled`, `retry_after: 1`]. Expect occasional 429s while several people or agents test.
- `STOREFRONT_URL=http://localhost:3000` affects sitemap `<loc>`, the robots `Sitemap:` line, payment links, short links and the payment callback host.
- `SITE_DOMAIN=localhost` affects JSON-LD URLs, which become `https://localhost/...`.

---

## 12. Quick endpoint index (method, path, auth, bucket, success `data`)

| Method | Path | Auth | Bucket | 2xx `data` |
|---|---|---|---|---|
| POST | `/api/v1/account/auth/register/start/` | key | otp_request | `RegistrationStarted` |
| POST | `/api/v1/account/auth/register/resend-otp/` | key | otp_request | `RegistrationStarted` |
| POST | `/api/v1/account/auth/register/verify/` | key | auth_attempt | `RegistrationVerified` |
| POST | `/api/v1/account/auth/register/complete/` | key | — | 201 `AuthenticatedResponse` |
| POST | `/api/v1/account/auth/login/` | key | auth_attempt | `AuthenticatedResponse` |
| POST | `/api/v1/account/auth/login/otp/request/` | key | otp_request | `OtpSent` |
| POST | `/api/v1/account/auth/login/otp/verify/` | key | auth_attempt | `AuthenticatedResponse` |
| POST | `/api/v1/account/auth/google/` | key | auth_attempt | 200/201 `GoogleAuthResponse` |
| POST | `/api/v1/account/auth/token/refresh/` | key | — | `{access}` |
| POST | `/api/v1/account/auth/logout/` | key | auth_attempt | `{}` |
| POST | `/api/v1/account/auth/logout-all/` | JWT | — | `{}` |
| POST | `/api/v1/account/auth/password-reset/request/` | key | otp_request | `OtpSent` |
| POST | `/api/v1/account/auth/password-reset/verify-otp/` | key | auth_attempt | `PasswordResetToken` |
| POST | `/api/v1/account/auth/password-reset/confirm/` | key | auth_attempt | `{}` |
| GET | `/api/v1/account/profile/me/` | JWT | — | `UserProfile` |
| PATCH | `/api/v1/account/profile/me/` | JWT | — | `UserProfile` |
| POST | `/api/v1/account/profile/password/change/` | JWT | auth_attempt | `{tokens}` |
| POST | `/api/v1/account/profile/contact/request/` | JWT | otp_request | `OtpSent` |
| POST | `/api/v1/account/profile/contact/verify/` | JWT | auth_attempt | `UserProfile` |
| GET | `/api/v1/account/profile/totp/status/` | JWT | — | `TotpStatus` |
| POST | `/api/v1/account/profile/totp/setup/` | JWT | — | `TotpSetup` |
| POST | `/api/v1/account/profile/totp/enable/` | JWT | auth_attempt | `{}` |
| POST | `/api/v1/account/profile/totp/disable/` | JWT | auth_attempt | `{}` |
| GET | `/api/v1/global/settings/` | key | — | `SiteSettings` |
| GET | `/api/v1/global/auth-settings/` | key | — | `AuthSettings` |
| GET | `/api/v1/global/socials/` | key | — | `Paginated<SocialAccount>` |
| GET | `/api/v1/global/languages/?platform=` | key | — | `Languages` |
| GET | `/api/v1/global/get-translation/<code>/` | key | — | `Translation` |
| POST | `/api/v1/global/version-check/` | key | — | `VersionCheck` |
| GET | `/api/v1/global/extra-snippets/?position=&type=` | key | — | `Paginated<ExtraSnippet>` |
| GET | `/api/v1/global/content-page-types/` | key | — | `Paginated<ContentPageType>` |
| GET | `/api/v1/global/dynamic-content/` | key | — | `Paginated<DynamicContent>` |
| GET | `/api/v1/global/dynamic-content/<key>/` | key | — | `DynamicContentGroup` |
| GET | `/api/v1/global/dynamic-content-grouped/` | key | — | `Paginated<DynamicContentGroup>` |
| GET | `/api/v1/global/feature-status/` | key | — | `Paginated<FeatureStatus>` |
| GET | `/api/v1/global/feature-status/<key>/` | key | — | `FeatureStatus` |
| GET | `/api/v1/global/feature-toggles/` | staff JWT | — | `Paginated<FeatureToggle>` |
| GET | `/sitemap.xml?p=` | none | none | XML |

"key" means `X-API-Key`, which is enforced in production only.

---

## 13. Suspected backend bugs and inconsistencies (verified only)

1. **`register/resend-otp` accepts and persists an incompatible `otp_method`.** [CODE `account/services/registration.py::resend_registration_otp`; the guide itself admits it]
   - What happens:
     - `pending.otp_channel` is overwritten with whatever was sent, **before** delivery and without the compatibility check that `register/start` performs.
     - `email` on a phone registration calls `send_mail_now(to=None)`, which returns 0 without error. The result is **200 "code resent" with nothing delivered**, and the previous code is already invalidated.
     - `sms` or `telegram` on an email registration either fails (`auth_otp_channel_unavailable` or `auth_otp_send_failed`), or tries to send to a null phone. Either way the bad channel stays saved, so later resends without `otp_method` keep failing.
   - Expected: `400 validation_error` on `otp_method`, as in `register/start`.
   - Mitigation: the client only offers compatible channels.
2. **Schema vs code drift.** Generated clients and validators will be wrong in these places:
   - `EnabledLanguage.language_name`: the schema says `string`, non-null. The model allows `null` (`null=True, default=''`) and the guide says null is possible. [SCHEMA+CODE]
   - `VersionCheck.changes`: the schema says `Record<string, string>` (child `CharField`). `release_note` is nullable, so values can be `null`; the guide says so too. [SCHEMA+CODE]
   - `otp_code` and `totp_code`: the schema has `pattern: [0-9]{6}` and `maxLength: 6`, but the server accepts Persian and Arabic digits and trims whitespace.
     - A Persian-digit OTP passed format validation and reached token validation (`auth_token_invalid`) [LIVE].
     - Schema-generated validators would reject valid input. Normalise digits client-side.
   - `postal_code`: the schema says "Exactly ten digits when supplied". The guide says it is not enforced and should be treated as free text. [SCHEMA+DOC; not write-tested]
   - `ExtraSnippet.type`: the schema marks it optional, but it is always present [LIVE].
   - `logout`, `logout-all`, `totp/enable`, `totp/disable` and `password-reset/confirm` responses are typed `Record<string, any>`. The actual value is `{}`.
   - The error enums per status are global unions, not per endpoint [SCHEMA].
3. **`languages[].icon` is a relative path** (`language.icon.url`, e.g. `/media/languages/fa.png`). Every other file field in `/global/*` is absolute, and the schema describes it as "Flag image URL". [CODE + DOC; live icons are null so not observed]
4. **Sitemap and JSON-LD use different hosts.** [LIVE+CODE]
   - Sitemap `<loc>` uses `STOREFRONT_URL`, e.g. `http://localhost:3000/product/apple-iphone-15/`.
   - Product and blog JSON-LD and breadcrumbs (`product/services/structured_data.py`, `blog/services/structured_data.py`, `utils/absolute_urls.py`) use `https://{SITE_DOMAIN}`, giving `https://localhost/product/apple-iphone-15/` [LIVE in `/api/v1/product/detail/apple-iphone-15/`].
   - The settings guide says the sitemap URLs are "the same site paths the structured data points to". The paths match, but the **hosts and schemes differ whenever `STOREFRONT_URL` is not `https://SITE_DOMAIN`**.
   - The "back in stock" SMS link (`product/services/notifications.py`) also uses `SITE_DOMAIN`.
   - Storefront impact: canonical and JSON-LD URLs taken from the API can point to a different origin than the sitemap.
5. **Demo data points to a route that is not in the sitemap.** `settings.support_link = https://firefly-core.ir/contact-us/`, but the published contact page is `/page/contact-us/` [LIVE]. Either add a `/contact-us/` route or redirect on the storefront, or ask the operator to change the link.
6. **`auth_identifier_invalid` breaks the guide's field-error convention** [LIVE].
   - The guide says field errors carry `attr`, and tells the UI to show this one "under the identifier field".
   - The backend returns it as `type: client_error` with `attr: null`.
7. **Missing identifier at `register/start` returns `invalid`, not `required`** [LIVE: `attr: "email"`, code `invalid`, "وارد کردن ایمیل الزامی است."]. Don't rely on `required` to detect a missing identifier.
8. **Case-sensitivity is inconsistent** [LIVE]. `languages/?platform=` is case-insensitive, but `get-translation/<code>/` is not (`FA` returns 404).
9. **Same code, different statuses.**
   - `auth_token_invalid` is 400 on registration, reset and logout, and 401 on refresh [LIVE].
   - `auth_google_token_invalid` is 401 or 503 [CODE].
   - Clients must branch on the HTTP status as well as the code. This is documented, but easy to miss.
10. **Generic `throttled` detail uses Latin digits** [LIVE: "…در 1 ثانیه در دسترس باشد."]. The auth guide says the Persian 429 messages render the number in Persian digits. Cosmetic only: never parse the message; use `retry_after`.
11. **Dev-only HTML errors** [LIVE]. With DEBUG on, a missing trailing slash on POST gives an HTML 500 RuntimeError, and unknown `/api/v1/...` paths give an HTML 404 instead of the JSON envelope (`handler404` is bypassed under DEBUG). Not a production bug, but clients must not assume every response is JSON.
12. **`Retry-After` is not CORS-exposed** [LIVE]. The guide warns about this, but the auth guide's checklist still tells clients to read "data.retry_after **or** the Retry-After header". In a cross-origin browser, only the body value is readable.

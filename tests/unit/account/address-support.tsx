import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, expect, vi } from 'vitest'
import { AddressForm } from '@/features/account/addresses/address-form'
import { ApiError } from '@/lib/api/errors'
import type { UserProfile } from '@/lib/api/types/account'
import type { Address } from '@/lib/api/types/address'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { SARA } from '../auth/fixtures'
import { geoPage, ISFAHAN, ISFAHAN_CITIES, PROVINCES, TEHRAN, TEHRAN_CITIES } from '../geo/fixtures'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { addressPage, HOME, WORK } from './address-fixtures'

// The address book's tests share an API stand-in: the geography lists, sara's profile and her
// book (`book`), and the writes the test decides (`writes`), each recorded as `bffFetch` calls.

export interface ApiStub {
  book: Address[]
  /** Answers the writes (create, update, delete, set-default); unset ones fail the test. */
  write: (path: string, options: { method?: string; body?: unknown }) => Promise<unknown>
}

type Options = { method?: string; body?: unknown; query?: Record<string, unknown> }

export function stubApi(bffFetch: ReturnType<typeof vi.fn>, stub: ApiStub) {
  bffFetch.mockImplementation((path: string, options: Options = {}) => {
    if (path === 'transportation/province/list/') return Promise.resolve(geoPage(PROVINCES))
    if (path === 'transportation/city/list/') {
      const province = options.query?.province
      if (province === TEHRAN.id) return Promise.resolve(geoPage(TEHRAN_CITIES))
      if (province === ISFAHAN.id) return Promise.resolve(geoPage(ISFAHAN_CITIES))
      return Promise.resolve(geoPage([]))
    }
    if (path === 'account/profile/me/') return Promise.resolve({ data: SARA, msg: '', status: 200 })
    if (path === 'account/address/list/') return Promise.resolve(addressPage(stub.book))
    if (path === 'cart/') return new Promise(() => {})
    return stub.write(path, options)
  })
}

/** The calls made to `path` (their options). */
export const callsTo = (bffFetch: ReturnType<typeof vi.fn>, path: string) =>
  bffFetch.mock.calls.filter(([called]) => called === path).map(([, options]) => options as Options)

/** The answer of a successful write, as `bffFetch` resolves it. */
export const written = (data: unknown, status = 200) => ({ data, msg: 'انجام شد.', status })

/** A 400 with these errors. */
export function failure(
  errors: Array<{ code: string; detail: string; attr: string | null }>,
  status = 400,
): ApiError {
  return ApiError.fromBody(status, {
    msg: 'خطا',
    data: {
      type: errors.some((error) => error.attr) ? 'validation_error' : 'client_error',
      errors,
    },
  })
}

/**
 * Renders `ui` signed in as sara (her profile in `['me']`), with a user-event. `noRetry`: a
 * failed read of the book shows at once (the app retries server errors twice, with back-off).
 */
export function renderSignedIn(
  ui: ReactNode,
  { noRetry = false, me = SARA }: { noRetry?: boolean; me?: UserProfile } = {},
) {
  const providers = authProviders({ hasSession: true })
  providers.client.setQueryData(ME_KEY, me)
  if (noRetry) providers.client.setQueryDefaults(['addresses'], { retry: false })
  const user = userEvent.setup()
  const view = render(ui, { wrapper: providers.wrapper })
  return { user, client: providers.client, ...view }
}

export const field = {
  title: () => screen.getByRole('textbox', { name: /^عنوان آدرس/ }),
  province: () => screen.getByRole('combobox', { name: /^استان/ }),
  city: () => screen.getByRole('combobox', { name: /^شهر/ }),
  address: () => screen.getByRole('textbox', { name: /^نشانی کامل/ }),
  plaque: () => screen.getByRole('textbox', { name: /^پلاک/ }),
  unit: () => screen.getByRole('textbox', { name: /^واحد/ }),
  postalCode: () => screen.getByRole('textbox', { name: /^کد پستی/ }),
  firstName: () => screen.getByRole('textbox', { name: /^نام گیرنده/ }),
  lastName: () => screen.getByRole('textbox', { name: /^نام خانوادگی گیرنده/ }),
  mobile: () => screen.getByRole('textbox', { name: /^شماره موبایل گیرنده/ }),
  save: () => screen.getByRole('button', { name: 'ذخیرهٔ آدرس' }),
  isDefault: () => screen.getByRole('switch', { name: /آدرس پیش‌فرض/ }),
}

/**
 * Each test starts with sara's two addresses and no write answered (set `api.write` per test;
 * `api.book` is what the list answers from then on).
 */
export function setUpAddressApi(bffFetch: ReturnType<typeof vi.fn>) {
  const api = { book: [HOME, WORK] as Address[], write: vi.fn<ApiStub['write']>() }
  beforeEach(() => {
    vi.clearAllMocks()
    stubBrowserApis()
    api.book = [HOME, WORK]
    api.write = vi.fn<ApiStub['write']>()
    stubApi(bffFetch, {
      get book() {
        return api.book
      },
      write: (path, options) => api.write(path, options),
    })
  })
  return api
}

/** The form for `initial` (or a new address), signed in. */
export function renderForm(initial?: Address, options?: { me?: UserProfile }) {
  const onSaved = vi.fn()
  const view = renderSignedIn(<AddressForm initial={initial} onSaved={onSaved} />, options)
  return { onSaved, ...view }
}

export async function chooseRegion(user: UserEvent, province = 'تهران', city = 'شهریار') {
  await waitFor(() =>
    expect(within(field.province()).getByRole('option', { name: province })).toBeInTheDocument(),
  )
  await user.selectOptions(field.province(), province)
  await waitFor(() => expect(field.city()).toBeEnabled())
  await user.selectOptions(field.city(), city)
}

/** A complete new address, typed with Persian digits where people use them. */
export async function fillNew(user: UserEvent) {
  await user.type(field.title(), 'منزل پدری')
  await chooseRegion(user)
  await user.type(field.address(), 'خیابان امام، کوچه یاس')
  await user.type(field.plaque(), '۱۲ب')
  await user.type(field.unit(), '۳')
  await user.type(field.postalCode(), '۱۲۳۴۵-۶۷۸۹۰')
  await user.type(field.firstName(), 'مریم')
  await user.type(field.lastName(), 'رضایی')
  await user.type(field.mobile(), '۰۹۱۲۱۲۳۴۵۶۷')
}

/** What a create answers in these tests. */
export const SAVED: Address = { ...WORK, id: 10050, title: 'منزل پدری', is_default: false }

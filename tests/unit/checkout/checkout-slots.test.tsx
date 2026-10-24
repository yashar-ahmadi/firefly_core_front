import { render, screen, within } from '@testing-library/react'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CheckoutRoute from '@/app/(checkout)/checkout/page'
import { CheckoutPage } from '@/features/checkout/checkout-page'
import { DynamicSlot } from '@/features/content/dynamic/dynamic-slot'
import { FeatureProvider } from '@/features/settings/feature-context'
import { catalog } from '../payment/fixtures'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'

// `/checkout/`'s message slots (Plan 5 Task 5): the operator's `checkout` slot under the page's
// heading, its links in a new tab like the terms' (following one must not lose the purchase), and
// the `terms` and `return-policy` slots handed to the review as dialog links
// («مطالعهٔ قوانین», «رویهٔ بازگرداندن کالا»; their place beside the terms' checkbox:
// review-section.test.tsx).

const mocks = vi.hoisted(() => ({ slots: {} as Record<string, unknown> }))

vi.mock('server-only', () => ({}))
// The route reads the payment lists on the server: answered here, never by the dev backend.
vi.mock('@/features/payment/catalog', () => ({ getPaymentCatalog: async () => catalog() }))
vi.mock('@/features/content/dynamic/api', () => ({
  getDynamicContent: async (key: string) => mocks.slots[key] ?? null,
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای', phone: '+982191000000' }),
}))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({
    name: 'فایرفلای',
    siteUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:8000',
  }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const { wrapper: Wrapper } = clientProviders()
  return (
    <FeatureProvider initial={{}}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
}

beforeEach(() => {
  mocks.slots = {}
})

/** The first element of `type` in a tree (its children and element props), or null. */
function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, type)
      if (found) return found
    }
    return null
  }
  if (!isValidElement(node)) return null
  const element = node as ReactElement<Record<string, unknown>>
  if (element.type === type) return element
  for (const value of Object.values(element.props)) {
    const found = find(value as ReactNode, type)
    if (found) return found
  }
  return null
}

describe('/checkout/’s message slots', () => {
  it('shows the operator’s `checkout` slot under the heading, its links in a new tab (Plan 5 Task 5)', async () => {
    mocks.slots.checkout = {
      page_type: 1,
      page_type_key: 'checkout',
      page_display_name: 'پیام تکمیل خرید',
      descriptions: [
        {
          id: 1,
          title: null,
          content: '<p>ارسال\u{200C}ها از شنبه. <a href="/page/terms/">قوانین</a></p>',
        },
      ],
      warnings: [],
    }
    const { container } = render(await resolveServerTree(await CheckoutRoute()), { wrapper })
    const slot = container.querySelector('[data-slot="checkout"]')!
    const heading = screen.getByRole('heading', { level: 1, name: 'تکمیل خرید' })
    expect(heading.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(slot as HTMLElement).getByRole('link', { name: 'قوانین' })).toHaveAttribute(
      'target',
      '_blank',
    )
  })

  it('hands the review the `terms` and `return-policy` dialog links', async () => {
    const page = find(await CheckoutRoute(), CheckoutPage)!
    const slots: ReactElement<Record<string, unknown>>[] = []
    const collect = (node: ReactNode) => {
      if (Array.isArray(node)) node.forEach(collect)
      else if (isValidElement(node)) {
        const element = node as ReactElement<Record<string, unknown>>
        if (element.type === DynamicSlot) slots.push(element)
        else collect(element.props.children as ReactNode)
      }
    }
    collect(page.props.termsLinks as ReactNode)
    expect(slots.map((slot) => slot.props)).toEqual([
      { pageType: 'terms', variant: 'dialog-link', label: 'مطالعهٔ قوانین', newTabLinks: true },
      {
        pageType: 'return-policy',
        variant: 'dialog-link',
        label: 'رویهٔ بازگرداندن کالا',
        newTabLinks: true,
      },
    ])
  })
})

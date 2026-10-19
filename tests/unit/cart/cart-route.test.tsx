import { render, screen } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CartRoute, { dynamic, generateMetadata } from '@/app/(shop)/cart/page'
import { FeatureProvider } from '@/features/settings/feature-context'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'

// `/cart/`: a per-visitor page (Plan 4 global constraints: noindex and dynamic), titled, with
// the cart read in the browser (a skeleton first), and no loading.tsx (ruling R9).

const slots = vi.hoisted(() => ({ cart: null as unknown }))

vi.mock('server-only', () => ({}))
vi.mock('@/features/content/dynamic/api', () => ({
  getDynamicContent: async (key: string) => (key === 'cart' ? slots.cart : null),
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/cart/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))

async function renderRoute() {
  const { wrapper: Wrapper } = clientProviders()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={{}}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  return render(await resolveServerTree(await CartRoute()), { wrapper })
}

beforeEach(() => {
  slots.cart = null
})

describe('/cart/', () => {
  it('is titled «سبد خرید», never indexed, and rendered per request', async () => {
    const meta = await generateMetadata()
    expect(meta.title).toBe('سبد خرید')
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(dynamic).toBe('force-dynamic')
  })

  it('renders the heading, and the cart’s skeleton until the cart is read', async () => {
    const { wrapper: Wrapper } = clientProviders()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <FeatureProvider initial={{}}>
        <Wrapper>{children}</Wrapper>
      </FeatureProvider>
    )
    render(await resolveServerTree(CartRoute()), { wrapper })
    expect(screen.getByRole('heading', { level: 1, name: 'سبد خرید' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'در حال بارگذاری سبد خرید' })).toBeInTheDocument()
  })

  it('shows the operator’s `cart` slot under the heading, above the cart (Plan 5 Task 5)', async () => {
    slots.cart = {
      page_type: 1,
      page_type_key: 'cart',
      page_display_name: 'پیام سبد خرید',
      descriptions: [],
      warnings: [{ id: 3, title: null, content: '<p>ارسال سفارش\u{200C}ها از شنبه.</p>' }],
    }
    const { container } = await renderRoute()
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('توجه')
    const heading = screen.getByRole('heading', { level: 1, name: 'سبد خرید' })
    expect(heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const skeleton = screen.getByRole('status', { name: 'در حال بارگذاری سبد خرید' })
    expect(note.compareDocumentPosition(skeleton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelectorAll('[data-slot="cart"]')).toHaveLength(1)
  })

  it('without a `cart` slot, nothing of it', async () => {
    const { container } = await renderRoute()
    expect(container.querySelector('[data-slot]')).toBeNull()
  })

  it('has no loading.tsx (it would turn errors into soft 200s)', () => {
    const segment = join(process.cwd(), 'src/app/(shop)/cart/')
    for (const name of ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']) {
      expect(existsSync(`${segment}${name}`), name).toBe(false)
    }
  })
})

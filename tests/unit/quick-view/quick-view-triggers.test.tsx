import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicStoreConfig } from '@/config/resolve-store-config'
import { QuickViewButton } from '@/features/quick-view/quick-view-button'
import { QuickViewLink } from '@/features/quick-view/quick-view-link'
import { useQuickViewStore } from '@/features/quick-view/use-quick-view'
import { StoreConfigProvider } from '@/lib/config-context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const SLUG = 'samsung-galaxy-s25-ultra'
const NAME = 'گوشی موبایل سامسونگ گلکسی S25 اولترا'
const CHOOSE = 'انتخاب ویژگی\u{200C}ها'
const HREF = `/product/${SLUG}/`

function Named({ children }: { children: ReactNode }) {
  return (
    <>
      <span id="name">{NAME}</span>
      {children}
    </>
  )
}

const link = (slug = SLUG) => <QuickViewLink slug={slug} describedBy="name" />

beforeEach(() => {
  useQuickViewStore.setState({ request: null, open: false, hosts: 1 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('QuickViewLink («انتخاب ویژگی‌ها»)', () => {
  it('is a plain link to the product page in the server HTML (works before hydration)', () => {
    const html = renderToString(<Named>{link()}</Named>)
    const container = document.createElement('div')
    container.innerHTML = html
    const anchor = container.querySelector('a')
    expect(anchor).toHaveAttribute('href', HREF)
    expect(anchor).not.toHaveAttribute('role')
    expect(anchor).not.toHaveAttribute('aria-hidden')
    expect(anchor).not.toHaveAttribute('tabindex')
    expect(anchor).toHaveTextContent(CHOOSE)
  })

  it('hydrates cleanly into a button that opens quick view, described by the name', async () => {
    const html = renderToString(<Named>{link()}</Named>)
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const consoleError = vi.spyOn(console, 'error')
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, <Named>{link()}</Named>)
    })
    expect(consoleError).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: CHOOSE })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveAccessibleDescription(NAME)
    // Still a link underneath: a modified click opens the page in a new tab.
    expect(button).toHaveAttribute('href', HREF)
    act(() => root?.unmount())
    container.remove()
  })

  it('opens quick view on a plain click, instead of following the link', async () => {
    render(<Named>{link()}</Named>)
    const button = screen.getByRole('button', { name: CHOOSE })
    const followed = fireEvent.click(button)
    expect(followed).toBe(false)
    expect(useQuickViewStore.getState()).toMatchObject({
      open: true,
      request: { slug: SLUG, variantId: null },
    })
  })

  it('opens with the keyboard: Enter, and Space like a button', async () => {
    const user = userEvent.setup()
    render(<Named>{link()}</Named>)
    await user.tab()
    await user.keyboard(' ')
    expect(useQuickViewStore.getState().open).toBe(true)
    act(() => useQuickViewStore.setState({ open: false, request: null }))
    await user.keyboard('{Enter}')
    expect(useQuickViewStore.getState().open).toBe(true)
  })

  it('leaves a modified click to the browser (a new tab on the product page)', () => {
    render(<Named>{link()}</Named>)
    const followed = fireEvent.click(screen.getByRole('button', { name: CHOOSE }), {
      ctrlKey: true,
    })
    expect(followed).toBe(true)
    expect(useQuickViewStore.getState().open).toBe(false)
  })

  it('follows the link when no quick view host is mounted', () => {
    useQuickViewStore.setState({ hosts: 0 })
    render(<Named>{link()}</Named>)
    expect(fireEvent.click(screen.getByRole('button', { name: CHOOSE }))).toBe(true)
  })

  it('stays a link to the product page while quick view is switched off', () => {
    const config = { features: { quickView: false } } as PublicStoreConfig
    render(
      <StoreConfigProvider value={config}>
        <Named>{link()}</Named>
      </StoreConfigProvider>,
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('link', { name: CHOOSE })).toHaveAttribute('href', HREF)
  })
})

describe('QuickViewButton (the card icon)', () => {
  it('opens quick view on the product, described by its name', async () => {
    render(
      <Named>
        <QuickViewButton slug={SLUG} describedBy="name" />
      </Named>,
    )
    const button = screen.getByRole('button', { name: 'مشاهده سریع' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveAccessibleDescription(NAME)
    await userEvent.click(button)
    expect(useQuickViewStore.getState()).toMatchObject({ open: true, request: { slug: SLUG } })
  })

  it('is not shown while quick view is switched off', () => {
    const config = { features: { quickView: false } } as PublicStoreConfig
    render(
      <StoreConfigProvider value={config}>
        <QuickViewButton slug={SLUG} />
      </StoreConfigProvider>,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })
})

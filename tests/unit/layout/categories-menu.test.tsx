import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Direction } from 'radix-ui'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CategoriesMenu } from '@/components/layout/categories-menu'
import { navItems } from '@/components/layout/menu-tree'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import { sampleTree } from './support'

// The header's «دسته‌بندی‌ها» per viewport (Plan 5 Task 8, carried from Plan 1): the mega-menu's
// code (its panel holds the whole menu) loads only from lg, and only when the visitor reaches for
// the button; below lg the drawer's button (its panel loads on the first opening); phones hide
// the row, so neither panel's code ever loads there.

// Counts every read of the lazily loaded export: each load of the menu's code reads it once.
const loads = vi.hoisted(() => ({ megaMenu: 0 }))
vi.mock('@/components/layout/mega-menu', async (original) => {
  const real = await original<typeof import('@/components/layout/mega-menu')>()
  return Object.defineProperty({ ...real }, 'MegaMenu', {
    enumerable: true,
    get() {
      loads.megaMenu++
      return real.MegaMenu
    },
  })
})
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

const media = stubBrowserApis()
const TRIGGER = 'دسته\u{200C}بندی\u{200C}ها'
const items = () => navItems([], sampleTree())

function rtl(children: ReactNode) {
  return <Direction.Provider dir="rtl">{children}</Direction.Provider>
}

beforeEach(() => {
  media.set(() => false)
  loads.megaMenu = 0
})

describe('CategoriesMenu', () => {
  it('the server’s HTML: one button, no menu links (the same at every width)', () => {
    const html = renderToString(rtl(<CategoriesMenu items={items()} />))
    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain(TRIGGER)
    expect(html).not.toContain('<a ')
    // The mega-menu's chevron, shown from lg only: the button keeps its width when it takes over.
    expect(html).toMatch(/lucide-chevron-down[^"]*"/)
  })

  it('below lg: the drawer’s button; the mega-menu’s code is never loaded', async () => {
    render(rtl(<CategoriesMenu items={items()} />))
    const button = screen.getByRole('button', { name: TRIGGER })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.pointerEnter(button, { pointerType: 'mouse' })
    fireEvent.focus(button)
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)))
    expect(loads.megaMenu).toBe(0)
  })

  it('renders nothing without items', () => {
    media.set(minWidth(64))
    const { container } = render(rtl(<CategoriesMenu items={navItems([], [])} />))
    expect(container).toBeEmptyDOMElement()
  })

  it('from lg: a stand-in until reached for; hovering loads the menu and opens it', async () => {
    media.set(minWidth(64))
    render(rtl(<CategoriesMenu items={items()} />))
    const button = screen.getByRole('button', { name: TRIGGER })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).not.toHaveAttribute('aria-haspopup')
    expect(loads.megaMenu).toBe(0)
    fireEvent.pointerEnter(button, { pointerType: 'mouse' })
    const roots = await screen.findByRole('list', { name: TRIGGER })
    expect(loads.megaMenu).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: TRIGGER })).toHaveAttribute('aria-expanded', 'true')
    expect(roots).toBeVisible()
    // No focus taken: the visitor only pointed at it.
    expect(document.body).toHaveFocus()
  })

  it('from lg: a pointer that leaves before the menu opens cancels the opening', async () => {
    media.set(minWidth(64))
    render(rtl(<CategoriesMenu items={items()} />))
    const button = screen.getByRole('button', { name: TRIGGER })
    fireEvent.pointerEnter(button, { pointerType: 'mouse' })
    fireEvent.pointerLeave(button, { pointerType: 'mouse' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)))
    expect(screen.queryByRole('list', { name: TRIGGER })).toBeNull()
    expect(screen.getByRole('button', { name: TRIGGER })).toHaveAttribute('aria-expanded', 'false')
  })

  it('from lg: a click opens it, the focus kept on its button', async () => {
    media.set(minWidth(64))
    const user = userEvent.setup()
    render(rtl(<CategoriesMenu items={items()} />))
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    await screen.findByRole('list', { name: TRIGGER })
    const button = screen.getByRole('button', { name: TRIGGER })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveFocus()
  })

  it('from lg: Down opens it on the first item, Up on the last', async () => {
    media.set(minWidth(64))
    const user = userEvent.setup()
    const { unmount } = render(rtl(<CategoriesMenu items={items()} />))
    screen.getByRole('button', { name: TRIGGER }).focus()
    await user.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('link', { name: 'کالای دیجیتال' })).toHaveFocus())
    unmount()
    render(rtl(<CategoriesMenu items={items()} />))
    screen.getByRole('button', { name: TRIGGER }).focus()
    await user.keyboard('{ArrowUp}')
    const last = items().at(-1)!.title
    await waitFor(() => expect(screen.getByRole('link', { name: last })).toHaveFocus())
  })

  it('from lg: focusing it fetches the code ahead without opening', async () => {
    media.set(minWidth(64))
    render(rtl(<CategoriesMenu items={items()} />))
    fireEvent.focus(screen.getByRole('button', { name: TRIGGER }))
    await waitFor(() => expect(loads.megaMenu).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: TRIGGER })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list', { name: TRIGGER })).toBeNull()
  })
})

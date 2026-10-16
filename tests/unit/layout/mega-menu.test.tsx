import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Direction } from 'radix-ui'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MegaMenu } from '@/components/layout/mega-menu'
import { focusedElement, stubBrowserApis } from '../support/dom-stubs'
import { categoryNode, menuNode, sampleTree } from './support'

const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

stubBrowserApis()

const TRIGGER = 'دسته‌بندی‌ها'

function rtl(children: ReactNode) {
  return <Direction.Provider dir="rtl">{children}</Direction.Provider>
}

/** A main menu like the dev sample: a group heading with children, then a brand link. */
function mainMenu() {
  return [
    menuNode({
      id: 1,
      title: 'کالای دیجیتال',
      url: null,
      children: [
        menuNode({
          id: 2,
          title: 'گوشی موبایل',
          url: '/product-category/digital/mobile-phone/',
          link_type: 'product_category',
          children: [menuNode({ id: 3, title: 'گوشی سامسونگ', url: '/brand/samsung/' })],
        }),
        menuNode({ id: 4, title: 'گوشی‌های پرچمدار', url: '/product/list/flagship-phones/' }),
      ],
    }),
    menuNode({ id: 5, title: 'سامسونگ', url: '/brand/samsung/', link_type: 'brand' }),
  ]
}

beforeEach(() => {
  nav.pathname = '/'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MegaMenu', () => {
  it('renders the category tree roots when the main menu is empty', async () => {
    const user = userEvent.setup()
    render(rtl(<MegaMenu menu={[]} categories={sampleTree()} />))
    await user.click(screen.getByRole('button', { name: TRIGGER }))

    const roots = screen.getByRole('list', { name: TRIGGER })
    expect(within(roots).getByRole('link', { name: 'کالای دیجیتال' })).toHaveAttribute(
      'href',
      '/product-category/digital/',
    )
    expect(within(roots).getByRole('link', { name: 'لوازم خانگی' })).toHaveAttribute(
      'href',
      '/product-category/home-appliance/',
    )
    // The first root is active: its children are shown, linked by path.
    expect(screen.getByRole('link', { name: 'گوشی موبایل' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )
    expect(
      screen.getByRole('link', { name: 'همه\u{0654} محصولات کالای دیجیتال' }),
    ).toBeInTheDocument()
  })

  it('renders nothing when there is neither a menu nor a category', () => {
    const { container } = render(rtl(<MegaMenu menu={[]} categories={[]} />))
    expect(container).toBeEmptyDOMElement()
  })

  it('uses the main menu when it has items: headings, links and third-level links', async () => {
    const user = userEvent.setup()
    render(rtl(<MegaMenu menu={mainMenu()} categories={sampleTree()} />))
    const trigger = screen.getByRole('button', { name: TRIGGER })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const roots = screen.getByRole('list', { name: TRIGGER })
    // A group heading cannot be a link, but it must be reachable: it is a button.
    expect(within(roots).getByRole('button', { name: 'کالای دیجیتال' })).toBeInTheDocument()
    expect(within(roots).getByRole('link', { name: 'سامسونگ' })).toBeInTheDocument()
    expect(within(roots).queryByRole('link', { name: 'لوازم خانگی' })).toBeNull()

    const column = screen.getByRole('link', { name: 'گوشی موبایل' })
    expect(column).toHaveAttribute('href', '/product-category/digital/mobile-phone/')
    expect(screen.getByRole('link', { name: 'گوشی سامسونگ' })).toHaveAttribute(
      'href',
      '/brand/samsung/',
    )
  })

  it('shows the children of the item that gets focus and hides the others', async () => {
    const user = userEvent.setup()
    render(rtl(<MegaMenu menu={[]} categories={sampleTree()} />))
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    expect(screen.getByRole('link', { name: 'گوشی موبایل' })).toBeInTheDocument()

    act(() => screen.getByRole('link', { name: 'لوازم خانگی' }).focus())
    expect(screen.queryByRole('link', { name: 'گوشی موبایل' })).toBeNull()
    expect(
      screen.getByRole('link', { name: 'همه\u{0654} محصولات لوازم خانگی' }),
    ).toBeInTheDocument()
  })

  it('opens on hover after a 120ms delay', () => {
    vi.useFakeTimers()
    render(rtl(<MegaMenu menu={[]} categories={sampleTree()} />))
    const trigger = screen.getByRole('button', { name: TRIGGER })

    fireEvent.pointerOver(trigger, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(100))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    act(() => vi.advanceTimersByTime(30))
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('moves with the arrow keys (RTL), follows columns and closes on Escape', async () => {
    const user = userEvent.setup()
    render(rtl(<MegaMenu menu={mainMenu()} categories={[]} />))
    const trigger = screen.getByRole('button', { name: TRIGGER })
    act(() => trigger.focus())

    await user.keyboard('{ArrowDown}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(focusedElement()).toHaveAccessibleName('کالای دیجیتال')

    // ArrowLeft goes forward in RTL: into the first column of the active item.
    await user.keyboard('{ArrowLeft}')
    expect(focusedElement()).toHaveAccessibleName('گوشی موبایل')
    await user.keyboard('{ArrowDown}')
    expect(focusedElement()).toHaveAccessibleName('گوشی سامسونگ')
    await user.keyboard('{ArrowLeft}')
    expect(focusedElement()).toHaveAccessibleName('گوشی‌های پرچمدار')
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(focusedElement()).toHaveAccessibleName('کالای دیجیتال')

    await user.keyboard('{ArrowDown}')
    expect(focusedElement()).toHaveAccessibleName('سامسونگ')
    await user.keyboard('{ArrowDown}')
    expect(focusedElement()).toHaveAccessibleName('کالای دیجیتال')

    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(focusedElement()).toBe(trigger)
  })

  it('on touch, a first tap on an item with children shows them instead of leaving', async () => {
    const user = userEvent.setup()
    const tree = sampleTree()
    tree[1].children = [
      categoryNode({ id: 10009, name: 'یخچال و فریزر', path: 'home-appliance/refrigerator' }),
    ]
    render(rtl(<MegaMenu menu={[]} categories={tree} />))
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    const item = screen.getByRole('link', { name: 'لوازم خانگی' })

    // Record whether React cancelled each visit, then stop jsdom from navigating.
    const visits: boolean[] = []
    const record = (event: Event) => {
      visits.push(!event.defaultPrevented)
      event.preventDefault()
    }
    document.addEventListener('click', record)
    // A real tap: pointerdown, pointerup, then mousedown (which focuses the link) and click.
    await user.pointer({ keys: '[TouchA]', target: item })
    expect(visits).toEqual([false])
    expect(screen.getByRole('button', { name: TRIGGER })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'یخچال و فریزر' })).toBeInTheDocument()

    // The second tap on the item that is now shown follows its link.
    await user.pointer({ keys: '[TouchA]', target: item })
    document.removeEventListener('click', record)
    expect(visits).toEqual([false, true])
  })

  it('closes on an outside click and on a route change', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      rtl(
        <>
          <MegaMenu menu={[]} categories={sampleTree()} />
          <p>محتوای صفحه</p>
        </>,
      ),
    )
    const trigger = screen.getByRole('button', { name: TRIGGER })
    await user.click(trigger)
    await user.click(screen.getByText('محتوای صفحه'))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    nav.pathname = '/product-category/digital/'
    rerender(rtl(<MegaMenu menu={[]} categories={sampleTree()} />))
    expect(screen.getByRole('button', { name: TRIGGER })).toHaveAttribute('aria-expanded', 'false')
  })
})

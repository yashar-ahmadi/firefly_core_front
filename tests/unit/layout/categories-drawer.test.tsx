import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CategoriesDrawer } from '@/components/layout/categories-drawer'
import { HeaderLinks } from '@/components/layout/header-links'
import { navItems } from '@/components/layout/menu-tree'
import { stubBrowserApis } from '../support/dom-stubs'
import { menuNode, sampleTree } from './support'

const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

stubBrowserApis()

describe('CategoriesDrawer', () => {
  it('opens the category tree as an accordion and closes when a link is followed', async () => {
    const user = userEvent.setup()
    render(<CategoriesDrawer items={navItems([], sampleTree())} />)
    const button = screen.getByRole('button', { name: 'دسته‌بندی‌ها' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    // The drawer's code loads on the first opening.
    const drawer = await screen.findByRole('dialog', { name: 'دسته‌بندی‌ها' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(within(drawer).getByRole('link', { name: 'لوازم خانگی' })).toHaveAttribute(
      'href',
      '/product-category/home-appliance/',
    )

    await user.click(within(drawer).getByRole('button', { name: 'کالای دیجیتال' }))
    expect(
      within(drawer).getByRole('link', { name: 'همه\u{0654} محصولات کالای دیجیتال' }),
    ).toHaveAttribute('href', '/product-category/digital/')
    // jsdom cannot navigate: cancel the visit after React has handled the click.
    const stay = (event: Event) => event.preventDefault()
    document.addEventListener('click', stay)
    await user.click(within(drawer).getByRole('link', { name: 'گوشی موبایل' }))
    document.removeEventListener('click', stay)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('gives the focus back to its button when closed', async () => {
    const user = userEvent.setup()
    render(<CategoriesDrawer items={navItems([], sampleTree())} />)
    const button = screen.getByRole('button', { name: 'دسته‌بندی‌ها' })
    button.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('dialog', { name: 'دسته‌بندی‌ها' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(button).toHaveFocus()
  })

  it('renders nothing without items', () => {
    const { container } = render(<CategoriesDrawer items={navItems([], [])} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('HeaderLinks', () => {
  it('marks the link of the current page', () => {
    nav.pathname = '/page/about/'
    render(
      <HeaderLinks
        items={[
          menuNode({ id: 1, title: 'درباره ما', url: '/page/about/', link_type: 'page' }),
          menuNode({ id: 2, title: 'تخفیف‌ها', url: '/product/list/?has_discount=true' }),
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'درباره ما' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'تخفیف‌ها' })).not.toHaveAttribute('aria-current')
  })

  it('opens an item with children as a menu of its links', async () => {
    const user = userEvent.setup()
    render(
      <HeaderLinks
        items={[
          menuNode({
            id: 1,
            title: 'راهنما',
            url: null,
            children: [
              menuNode({ id: 2, title: 'ارسال', url: '/page/shipping/' }),
              menuNode({ id: 3, title: 'مرجوعی', url: '/page/returns/' }),
            ],
          }),
        ]}
      />,
    )
    const button = screen.getByRole('button', { name: 'راهنما' })
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    // The menu's code loads on first use.
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'ارسال' })).toHaveAttribute(
      'href',
      '/page/shipping/',
    )
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2)
    // The open menu hides the rest of the page from screen readers (Radix modal menu).
    expect(screen.getByRole('button', { name: 'راهنما', hidden: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('opens the menu from the keyboard with the focus on its first item, and gives it back', async () => {
    const user = userEvent.setup()
    render(
      <HeaderLinks
        items={[
          menuNode({
            id: 1,
            title: 'راهنما',
            url: null,
            children: [
              menuNode({ id: 2, title: 'ارسال', url: '/page/shipping/' }),
              menuNode({ id: 3, title: 'مرجوعی', url: '/page/returns/' }),
            ],
          }),
        ]}
      />,
    )
    screen.getByRole('button', { name: 'راهنما' }).focus()
    await user.keyboard('{Enter}')
    const menu = await screen.findByRole('menu')
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'ارسال' })).toHaveFocus())
    await user.keyboard('{ArrowDown}')
    expect(within(menu).getByRole('menuitem', { name: 'مرجوعی' })).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(screen.getByRole('button', { name: 'راهنما' })).toHaveFocus()
  })
})

import { render, screen, within } from '@testing-library/react'
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
    await user.click(screen.getByRole('button', { name: 'دسته‌بندی‌ها' }))
    const drawer = screen.getByRole('dialog', { name: 'دسته‌بندی‌ها' })
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
    await user.click(screen.getByRole('button', { name: 'راهنما' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'ارسال' })).toHaveAttribute(
      'href',
      '/page/shipping/',
    )
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2)
  })
})

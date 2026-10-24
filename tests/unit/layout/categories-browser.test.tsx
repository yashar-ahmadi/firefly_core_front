import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CategoriesBrowser } from '@/components/layout/categories-browser'
import { categoryNode, sampleTree } from './support'

const MORE = 'زیردسته\u{200C}های گوشی موبایل'

/** The sample tree with a third level under «گوشی موبایل». */
function deepTree() {
  const tree = sampleTree()
  tree[0].children[0].children = [
    categoryNode({ id: 20001, name: 'گوشی سامسونگ', path: 'digital/mobile-phone/samsung' }),
  ]
  return tree
}

describe('CategoriesBrowser', () => {
  it('lists the roots and shows the children of the first one', () => {
    render(<CategoriesBrowser categories={sampleTree()} />)
    const roots = screen.getByRole('tablist')
    expect(
      within(roots)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['کالای دیجیتال', 'لوازم خانگی'])
    expect(within(roots).getByRole('tab', { name: 'کالای دیجیتال' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByRole('link', { name: 'گوشی موبایل' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )
    expect(within(panel).getByRole('link', { name: /مشاهده/ })).toHaveAttribute(
      'href',
      '/product-category/digital/',
    )
  })

  it('switches the children when another root is chosen', async () => {
    const user = userEvent.setup()
    render(<CategoriesBrowser categories={sampleTree()} />)
    await user.click(screen.getByRole('tab', { name: 'لوازم خانگی' }))
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).queryByRole('link', { name: 'گوشی موبایل' })).toBeNull()
    expect(within(panel).getByRole('link', { name: /مشاهده/ })).toHaveAttribute(
      'href',
      '/product-category/home-appliance/',
    )
  })

  it('a child with children of its own is a link to its category, with a control for them', () => {
    // It was a button only: neither it nor its children were links (Plan 5 Task 9, carried).
    render(<CategoriesBrowser categories={deepTree()} />)
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByRole('link', { name: 'گوشی موبایل' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )
    expect(within(panel).getByRole('button', { name: MORE })).toHaveTextContent('زیردسته\u{200C}ها')
    // Its children are there, hidden until it is opened.
    expect(
      within(panel).getByRole('link', { name: 'گوشی سامسونگ', hidden: true }),
    ).not.toBeVisible()
    // A child without children has no control.
    expect(within(panel).queryByRole('button', { name: /لپ تاپ/ })).toBeNull()
  })

  it('opens deeper levels inside the page and goes back', async () => {
    const user = userEvent.setup()
    render(<CategoriesBrowser categories={deepTree()} />)
    const panel = screen.getByRole('tabpanel')

    await user.click(within(panel).getByRole('button', { name: MORE }))
    expect(within(panel).getByRole('heading', { name: 'گوشی موبایل' })).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'گوشی سامسونگ' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/samsung/',
    )
    expect(within(panel).getByRole('link', { name: 'گوشی سامسونگ' })).toBeVisible()
    expect(within(panel).queryByRole('link', { name: 'گوشی موبایل' })).toBeNull()
    expect(within(panel).getByRole('link', { name: /مشاهده/ })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )

    await user.click(within(panel).getByRole('button', { name: 'بازگشت' }))
    expect(within(panel).getByRole('heading', { name: 'کالای دیجیتال' })).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'گوشی موبایل' })).toBeVisible()
    expect(
      within(panel).getByRole('link', { name: 'گوشی سامسونگ', hidden: true }),
    ).not.toBeVisible()
  })

  it('the server’s HTML links every category at every depth, the deeper levels hidden', () => {
    const html = new DOMParser().parseFromString(
      renderToString(<CategoriesBrowser categories={deepTree()} />),
      'text/html',
    )
    const hrefs = [...html.querySelectorAll('a[href]')].map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual([
      '/product-category/digital/',
      '/product-category/digital/mobile-phone/',
      '/product-category/digital/laptop/',
      '/product-category/digital/mobile-phone/samsung/',
      '/product-category/home-appliance/',
    ])
    // The level below «گوشی موبایل» hidden, the root's own shown (another document's elements).
    const list = (href: string) => html.querySelector(`a[href$="${href}"]`)!.closest('ul')!
    expect(list('/samsung/').hasAttribute('hidden')).toBe(true)
    expect(list('/mobile-phone/').hasAttribute('hidden')).toBe(false)
  })

  it('the server’s HTML links every root’s children, the inactive panels hidden', () => {
    // Radix mounts only the active panel: the other roots' links were missing from the page's
    // HTML (spec §8.13). Every panel is in it; the inactive ones are `hidden`.
    const html = new DOMParser().parseFromString(
      renderToString(<CategoriesBrowser categories={sampleTree()} />),
      'text/html',
    )
    const panels = [...html.querySelectorAll('[role="tabpanel"]')]
    expect(panels).toHaveLength(2)
    expect(panels.map((panel) => panel.hasAttribute('hidden'))).toEqual([false, true])
    const hrefs = [...html.querySelectorAll('a[href]')].map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual([
      '/product-category/digital/',
      '/product-category/digital/mobile-phone/',
      '/product-category/digital/laptop/',
      '/product-category/home-appliance/',
    ])
  })

  it('shows one panel at a time; a root chosen again starts at its own level', async () => {
    const user = userEvent.setup()
    render(<CategoriesBrowser categories={deepTree()} />)
    await user.click(screen.getByRole('button', { name: MORE }))
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('کالای دیجیتال')
    await user.click(screen.getByRole('tab', { name: 'لوازم خانگی' }))
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'لوازم خانگی' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'گوشی موبایل' })).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'کالای دیجیتال' }))
    expect(screen.getByRole('heading', { name: 'کالای دیجیتال' })).toBeVisible()
    expect(screen.getByRole('button', { name: MORE })).toBeVisible()
  })
})

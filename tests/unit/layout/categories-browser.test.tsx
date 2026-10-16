import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CategoriesBrowser } from '@/components/layout/categories-browser'
import { categoryNode, sampleTree } from './support'

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

  it('opens deeper levels inside the page and goes back', async () => {
    const user = userEvent.setup()
    render(<CategoriesBrowser categories={deepTree()} />)
    const panel = screen.getByRole('tabpanel')

    await user.click(within(panel).getByRole('button', { name: 'گوشی موبایل' }))
    expect(within(panel).getByRole('heading', { name: 'گوشی موبایل' })).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'گوشی سامسونگ' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/samsung/',
    )
    expect(within(panel).getByRole('link', { name: /مشاهده/ })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )

    await user.click(within(panel).getByRole('button', { name: 'بازگشت' }))
    expect(within(panel).getByRole('heading', { name: 'کالای دیجیتال' })).toBeInTheDocument()
  })
})

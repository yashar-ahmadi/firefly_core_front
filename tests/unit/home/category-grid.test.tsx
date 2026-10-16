import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CategoryGridSection } from '@/features/home/sections/category-grid-section'
import type { HomeSection } from '@/lib/api/types/catalog'
import { categoryFixture, categoryGrid } from './fixtures'

type Grid = Extract<HomeSection, { type: 'category_grid' }>

/** The `--cols-*` of the tile list for `count` categories: tiles per row at md, lg and xl. */
function rowsOf(count: number): string[] {
  const categories = Array.from({ length: count }, (_, i) =>
    categoryFixture({ id: i + 1, name: `دسته ${i + 1}`, path: `c${i + 1}` }),
  )
  const { container, unmount } = render(
    <CategoryGridSection section={categoryGrid(categories) as Grid} seeAllLabel="همه" />,
  )
  const list = container.querySelector('ul')!
  const vars = ['--cols-md', '--cols-lg', '--cols-xl'].map((name) =>
    list.style.getPropertyValue(name),
  )
  unmount()
  return vars
}

describe('CategoryGridSection', () => {
  it('balances the wrapped rows from md: seven tiles split 4 + 3, never 6 + 1', () => {
    // At most 6 tiles fit a row at 768px, 7 at 1024px and 9 at 1280px.
    expect(rowsOf(4)).toEqual(['4', '4', '4'])
    expect(rowsOf(7)).toEqual(['4', '7', '7'])
    expect(rowsOf(8)).toEqual(['4', '4', '8'])
    expect(rowsOf(10)).toEqual(['5', '5', '5'])
    expect(rowsOf(13)).toEqual(['5', '7', '7'])
  })
})

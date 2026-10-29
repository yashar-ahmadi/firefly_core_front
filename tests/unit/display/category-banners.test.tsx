import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DISPLAY_STYLES } from '@/features/display/display-style'
import { CategoryBanners } from '@/features/display/category-banners'
import type { CategoryBanner } from '@/lib/api/types/display'
import { stubBrowserApis } from '../support/dom-stubs'

vi.mock('server-only', () => ({}))

stubBrowserApis()

function banner(id: number): CategoryBanner {
  return {
    id,
    image: `http://localhost:8000/media/categories/banners/26/10/29/b${id}.jpg`,
    mobile_image: null,
    alt: `بنر ${id}`,
    title: '',
    link: null,
  }
}

const banners = (count: number) => Array.from({ length: count }, (_, index) => banner(index + 1))

describe('CategoryBanners', () => {
  it.each(DISPLAY_STYLES)('is one region named after the category in %s', (style) => {
    render(<CategoryBanners banners={banners(3)} style={style} name="گوشی موبایل" />)
    const regions = screen.getAllByRole('region', { name: 'بنرهای گوشی موبایل' })
    expect(regions).toHaveLength(1)
    // Style 2's carousel is that region itself, never a region inside another.
    expect(within(regions[0]!).queryAllByRole('region')).toHaveLength(0)
    for (const { alt } of banners(3)) {
      expect(within(regions[0]!).getAllByRole('img', { name: alt })[0]).toBeDefined()
    }
  })

  it('a single banner in style 2 is a plain section, not a carousel', () => {
    render(<CategoryBanners banners={banners(1)} style="style_2" name="لپ‌تاپ" />)
    const region = screen.getByRole('region', { name: 'بنرهای لپ‌تاپ' })
    expect(region.tagName).toBe('SECTION')
    expect(region).toHaveAttribute('data-style', 'style_2')
  })

  it('draws nothing without banners', () => {
    const { container } = render(<CategoryBanners banners={[]} style="style_4" name="لپ‌تاپ" />)
    expect(container).toBeEmptyDOMElement()
  })
})

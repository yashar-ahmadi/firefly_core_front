import { describe, expect, it } from 'vitest'
import {
  categoriesToMenu,
  categoryHref,
  isActivePath,
  isPlaceholderImage,
  navItems,
  slimCategories,
} from '@/components/layout/menu-tree'
import { categoryNode, menuNode, sampleTree } from './support'

describe('categoryHref', () => {
  it('builds the link from the full path, never the slug', () => {
    expect(categoryHref('digital/mobile-phone')).toBe('/product-category/digital/mobile-phone/')
  })
})

describe('isPlaceholderImage', () => {
  it('recognises the API default image', () => {
    expect(isPlaceholderImage('http://localhost:8000/static/defaults/default.png')).toBe(true)
    expect(isPlaceholderImage('https://api.shop.ir/media/categories/phone.png')).toBe(false)
    expect(isPlaceholderImage('')).toBe(true)
    expect(isPlaceholderImage(null)).toBe(true)
  })
})

describe('categoriesToMenu', () => {
  it('turns the category tree into category links, keeping order and depth', () => {
    const [digital, home] = categoriesToMenu(sampleTree())
    expect(digital).toMatchObject({
      id: 10001,
      title: 'کالای دیجیتال',
      link_type: 'product_category',
      url: '/product-category/digital/',
      open_in_new_tab: false,
      target: { type: 'product_category', id: 10001, slug: 'digital' },
    })
    expect(digital.children.map((child) => child.url)).toEqual([
      '/product-category/digital/mobile-phone/',
      '/product-category/digital/laptop/',
    ])
    expect(home.children).toEqual([])
  })

  it('uses a real icon and drops the placeholder', () => {
    const [withIcon, placeholder] = categoriesToMenu([
      categoryNode({ id: 1, name: 'الف', path: 'a', icon: 'https://api.shop.ir/media/a.svg' }),
      categoryNode({ id: 2, name: 'ب', path: 'b' }),
    ])
    expect(withIcon.icon).toBe('https://api.shop.ir/media/a.svg')
    expect(placeholder.icon).toBeNull()
  })
})

describe('navItems', () => {
  it('prefers the main menu and falls back to the category tree', () => {
    const main = [menuNode({ id: 1, title: 'سامسونگ' })]
    expect(navItems(main, sampleTree())).toBe(main)
    expect(navItems([], sampleTree()).map((item) => item.title)).toEqual([
      'کالای دیجیتال',
      'لوازم خانگی',
    ])
  })
})

describe('slimCategories', () => {
  it('keeps only what the browser needs', () => {
    const [digital] = slimCategories(sampleTree())
    expect(Object.keys(digital).sort()).toEqual(['children', 'icon', 'id', 'image', 'name', 'path'])
    expect(digital.children).toHaveLength(2)
  })
})

describe('isActivePath', () => {
  it('matches the same path, ignoring a missing trailing slash and encoding', () => {
    expect(isActivePath('/page/about/', '/page/about/')).toBe(true)
    expect(isActivePath('/page/about', '/page/about/')).toBe(true)
    expect(isActivePath('/page/شرایط/', '/page/%D8%B4%D8%B1%D8%A7%DB%8C%D8%B7/')).toBe(true)
    expect(isActivePath('/page/about/', '/page/')).toBe(false)
  })

  it('never marks query links, foreign URLs or headings as active', () => {
    expect(isActivePath('/product/list/?has_discount=true', '/product/list/')).toBe(false)
    expect(isActivePath('https://blog.example.com/', '/')).toBe(false)
    expect(isActivePath(null, '/')).toBe(false)
  })
})

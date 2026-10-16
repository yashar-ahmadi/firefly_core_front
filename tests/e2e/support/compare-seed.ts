import type { Page } from '@playwright/test'

/** Products of the dev sample data, as the compare list names them. */
export const SAMPLE = {
  S25: { slug: 'samsung-galaxy-s25-ultra', name: 'گوشی موبایل سامسونگ گلکسی S25 اولترا' },
  A56: { slug: 'samsung-galaxy-a56', name: 'گوشی موبایل سامسونگ گلکسی A56' },
  IPHONE_15: { slug: 'apple-iphone-15', name: 'گوشی موبایل اپل آیفون ۱۵' },
} as const

/**
 * Puts `products` in this browser's compare list (localStorage `ff-compare`, the store's
 * persisted shape) before any page script runs, as a returning visitor has it. Works on a page
 * or a whole context.
 */
export async function seedCompare(
  target: Pick<Page, 'addInitScript'>,
  products: readonly { slug: string; name: string }[],
): Promise<void> {
  const items = products.map(({ slug, name }) => ({
    slug,
    name,
    image: 'http://localhost:8000/static/defaults/default.png',
    categoryId: 10002,
  }))
  await target.addInitScript((list) => {
    localStorage.setItem('ff-compare', JSON.stringify({ state: { items: list }, version: 0 }))
  }, items)
}

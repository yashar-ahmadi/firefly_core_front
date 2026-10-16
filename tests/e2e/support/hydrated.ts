import { expect, type Page } from '@playwright/test'

/**
 * Resolves once the shop shell has hydrated: below md the header's search field becomes the
 * overlay's trigger (`aria-haspopup="dialog"`), from md the cart icon becomes a button that opens
 * the mini-cart.
 */
export async function shellHydrated(page: Page): Promise<void> {
  const banner = page.getByRole('banner')
  const width = page.viewportSize()?.width ?? 0
  if (width < 768) {
    await expect(banner.getByRole('searchbox', { name: 'جستجو' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    )
  } else {
    await expect(banner.getByRole('link', { name: /^سبد خرید/ })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    )
  }
}

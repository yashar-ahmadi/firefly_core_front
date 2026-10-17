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

/**
 * Resolves once the page has run the work React scheduled for its last commit: the effects of
 * what just mounted, and a render they asked for. Two animation frames, then a message posted
 * after React's scheduler tasks (the same task source, run in order). For checking that the page
 * *stays* as it is after a mount effect that could change it, without a fixed wait.
 */
export async function scheduledWorkDone(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const channel = new MessageChannel()
            channel.port1.onmessage = () => resolve()
            channel.port2.postMessage(null)
          }),
        ),
      ),
  )
}

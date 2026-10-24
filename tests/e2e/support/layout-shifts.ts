import type { Page } from '@playwright/test'

// Layout shifts a page makes by itself, as the browser counts them for CLS (`layout-shift`
// entries without recent input), summed from navigation on.

/** Starts counting; call before the page's first navigation. */
export async function watchShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shifts: number[] = []
    Object.assign(window, { __shifts: shifts })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number
        hadRecentInput: boolean
      })[]) {
        if (!entry.hadRecentInput) shifts.push(entry.value)
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
}

/** The shifts so far, summed, after two frames (for the latest change's shift to be reported). */
export async function shiftTotal(page: Page): Promise<number> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  return page.evaluate(() =>
    ((window as unknown as { __shifts: number[] }).__shifts ?? []).reduce((a, b) => a + b, 0),
  )
}

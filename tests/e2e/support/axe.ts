import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

// axe-core on a page as a visitor sees it (Plan 5 Task 8; tests/e2e/a11y.spec.ts): the WCAG 2.0
// and 2.1 A and AA rules, every one of them (no rule is ever turned off). What fails the spec is
// a `serious` or `critical` violation; the others are printed for the audit's report.

/** The rule sets audited: WCAG 2.0 and 2.1, levels A and AA. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

/**
 * Third-party embeds, excluded element by element (never a rule): their markup is the
 * provider's, not the shop's, and cannot be fixed here. Google's sign-in button (an iframe GIS
 * draws on the login and register pages when the shop offers Google) and the video players of
 * the linker page (features/linker/video-embed.ts: Aparat and YouTube's privacy-enhanced host;
 * operator rich content keeps no iframe).
 */
export const THIRD_PARTY_EMBEDS = [
  'iframe[src^="https://accounts.google.com/"]',
  'iframe[src^="https://www.aparat.com/"]',
  'iframe[src^="https://www.youtube-nocookie.com/embed/"]',
] as const

export interface AxeFinding {
  id: string
  impact: string
  help: string
  targets: string[]
}

const BLOCKING = new Set(['serious', 'critical'])

/** Waits until what the visitor sees has stopped moving: the font in, finite animations done. */
export async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('load')
  await page.evaluate(async () => {
    await document.fonts.ready
    const finite = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

/** Every WCAG A/AA violation on the page now, third-party embeds left out. */
export async function axeFindings(page: Page): Promise<AxeFinding[]> {
  let builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS])
  for (const embed of THIRD_PARTY_EMBEDS) builder = builder.exclude(embed)
  const { violations } = await builder.analyze()
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? 'unknown',
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }))
}

/** The findings that fail the audit: `serious` or `critical`. */
export const blocking = (findings: AxeFinding[]) =>
  findings.filter((finding) => BLOCKING.has(finding.impact))

/** One line per finding, for the run's output (`[axe] <page>: <rule> (<impact>) ×n …`). */
export function axeReport(label: string, findings: AxeFinding[]): string {
  if (findings.length === 0) return `[axe] ${label}: none`
  return findings
    .map(
      (finding) =>
        `[axe] ${label}: ${finding.id} (${finding.impact}) ×${finding.targets.length} ` +
        `${finding.help} — ${finding.targets.slice(0, 3).join(' | ')}`,
    )
    .join('\n')
}

// What scripts/lighthouse.mjs reports from Lighthouse's JSON results (pure, so the unit tests
// check it: tests/unit/e2e-support/lighthouse-summary.test.ts): each category's score as 0–100
// and the main metrics of one run, then the median of a page's runs, and the summary table.

/** The four categories audited, in the table's order, with their targets (Plan 5 Task 8). */
export const CATEGORIES = [
  { id: 'performance', label: 'Perf', target: 85 },
  { id: 'accessibility', label: 'A11y', target: 95 },
  { id: 'best-practices', label: 'BP', target: 95 },
  { id: 'seo', label: 'SEO', target: 95 },
]

/** The metrics shown beside the scores (milliseconds, but CLS). */
export const METRICS = [
  { id: 'first-contentful-paint', label: 'FCP' },
  { id: 'largest-contentful-paint', label: 'LCP' },
  { id: 'total-blocking-time', label: 'TBT' },
  { id: 'cumulative-layout-shift', label: 'CLS' },
  { id: 'speed-index', label: 'SI' },
]

/**
 * @typedef {Record<string, number | null>} Values
 * @typedef {{ scores: Values, metrics: Values }} Summary
 */

/**
 * One run's scores (0–100, or null when a category did not score) and metric values.
 * @param {any} lhr Lighthouse's result (its JSON report)
 * @returns {Summary}
 */
export function runSummary(lhr) {
  /** @type {Values} */
  const scores = {}
  for (const { id } of CATEGORIES) {
    const score = lhr.categories?.[id]?.score
    scores[id] = typeof score === 'number' ? Math.round(score * 100) : null
  }
  /** @type {Values} */
  const metrics = {}
  for (const { id } of METRICS) {
    const value = lhr.audits?.[id]?.numericValue
    metrics[id] = typeof value === 'number' ? value : null
  }
  return { scores, metrics }
}

/**
 * The median of the numbers (the lower middle of an even count); null for none.
 * @param {(number | null | undefined)[]} values
 * @returns {number | null}
 */
export function median(values) {
  const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b)
  if (sorted.length === 0) return null
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

/**
 * A page's runs reduced to the median of each score and metric.
 * @param {Summary[]} runs
 * @returns {Summary}
 */
export function pageMedian(runs) {
  /** @type {Values} */
  const scores = {}
  for (const { id } of CATEGORIES) scores[id] = median(runs.map((run) => run.scores[id]))
  /** @type {Values} */
  const metrics = {}
  for (const { id } of METRICS) metrics[id] = median(runs.map((run) => run.metrics[id]))
  return { scores, metrics }
}

/**
 * The categories of a page's median below their targets, e.g. `['performance']`.
 * @param {Summary} summary
 * @returns {string[]}
 */
export function missedTargets(summary) {
  return CATEGORIES.filter(({ id, target }) => (summary.scores[id] ?? 0) < target).map(
    ({ id }) => id,
  )
}

/** @type {(id: string, value: number | null) => string} */
const metricText = (id, value) => {
  if (value === null) return '–'
  return id === 'cumulative-layout-shift' ? value.toFixed(3) : `${Math.round(value)}`
}

/**
 * A Markdown table: one row per page, the median scores, then the median metrics.
 * @param {{ name: string, summary: Summary }[]} pages
 * @returns {string}
 */
export function summaryTable(pages) {
  const head = ['Page', ...CATEGORIES.map((c) => c.label), ...METRICS.map((m) => m.label)]
  const rows = pages.map(({ name, summary }) => [
    name,
    ...CATEGORIES.map(({ id, target }) => {
      const score = summary.scores[id]
      return score === null ? '–' : `${score}${score < target ? ' ✗' : ''}`
    }),
    ...METRICS.map(({ id }) => metricText(id, summary.metrics[id])),
  ])
  return [head, head.map(() => '---'), ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n')
}

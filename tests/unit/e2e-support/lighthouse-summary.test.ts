// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  median,
  missedTargets,
  pageMedian,
  runSummary,
  summaryTable,
} from '../../../scripts/lighthouse-summary.mjs'

// scripts/lighthouse.mjs's arithmetic: Lighthouse's 0–1 scores as 0–100, the median of a page's
// runs (the sandbox is noisy: three runs a page), the targets missed, and the summary table.

function lhr(scores: Record<string, number | null>, tbt = 100): Record<string, unknown> {
  return {
    categories: Object.fromEntries(Object.entries(scores).map(([id, score]) => [id, { score }])),
    audits: {
      'first-contentful-paint': { numericValue: 1000.4 },
      'largest-contentful-paint': { numericValue: 2500 },
      'total-blocking-time': { numericValue: tbt },
      'cumulative-layout-shift': { numericValue: 0.0123 },
      'speed-index': { numericValue: 3000 },
    },
  }
}

const ALL = { performance: 0.9, accessibility: 1, 'best-practices': 0.96, seo: 1 }

describe('runSummary', () => {
  it('turns scores into 0–100 and reads the metrics', () => {
    const run = runSummary(lhr({ ...ALL, performance: 0.874 }))
    expect(run.scores).toEqual({
      performance: 87,
      accessibility: 100,
      'best-practices': 96,
      seo: 100,
    })
    expect(run.metrics['total-blocking-time']).toBe(100)
  })

  it('a category that did not score is null', () => {
    expect(runSummary(lhr({ ...ALL, performance: null })).scores.performance).toBeNull()
    expect(runSummary({}).scores.seo).toBeNull()
  })
})

describe('median and pageMedian', () => {
  it('the middle value, the lower middle of an even count, nulls ignored', () => {
    expect(median([90, 70, 80])).toBe(80)
    expect(median([4, 1, 3, 2])).toBe(2)
    expect(median([10, 9, 2, 1])).toBe(2) // numbers, not text: 10 after 9
    expect(median([null, 5])).toBe(5)
    expect(median([])).toBeNull()
  })

  it('takes each score and metric’s median separately', () => {
    const runs = [
      runSummary(lhr({ ...ALL, performance: 0.7 }, 900)),
      runSummary(lhr({ ...ALL, performance: 0.95 }, 100)),
      runSummary(lhr({ ...ALL, performance: 0.88 }, 300)),
    ]
    const summary = pageMedian(runs)
    expect(summary.scores.performance).toBe(88)
    expect(summary.metrics['total-blocking-time']).toBe(300)
  })
})

describe('missedTargets and summaryTable', () => {
  it('names the categories under their targets (85, 95, 95, 95)', () => {
    const summary = pageMedian([runSummary(lhr({ ...ALL, performance: 0.84, seo: 0.95 }))])
    expect(missedTargets(summary)).toEqual(['performance'])
    const none = pageMedian([runSummary(lhr({ ...ALL, accessibility: 0.94 }))])
    expect(missedTargets(none)).toEqual(['accessibility'])
  })

  it('one Markdown row a page, a missed target marked', () => {
    const summary = pageMedian([runSummary(lhr({ ...ALL, performance: 0.8 }))])
    const table = summaryTable([{ name: 'home', summary }])
    expect(table.split('\n')).toEqual([
      '| Page | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS | SI |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| home | 80 ✗ | 100 | 96 | 100 | 1000 | 2500 | 100 | 0.012 | 3000 |',
    ])
  })
})

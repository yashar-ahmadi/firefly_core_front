// Lighthouse on the production build (Plan 5 Task 8): run by hand, never part of `pnpm test:e2e`.
//
//   pnpm build && pnpm start:standalone   # in another terminal (FIREFLY_API_URL, SITE_URL, …)
//   node scripts/lighthouse.mjs [page …]   # pages: home category product post checkout
//
// Lighthouse's CLI (pinned below, through npx) with its defaults for a phone: mobile emulation
// and simulated throttling (150 ms RTT, 1.6 Mbps, 4× CPU). Each page is run RUNS times (3 by
// default: a shared machine is noisy) and the median of each score and metric is reported. The
// JSON reports go to the system's temp folder; the summary table is printed at the end.
//
// Environment:
// - BASE_URL: the shop (default http://localhost:3000);
// - RUNS: runs per page (default 3);
// - CHROME_PATH: the browser (default: PLAYWRIGHT_CHROMIUM_PATH, else the preinstalled
//   /opt/pw-browsers/chromium). Lighthouse 13 takes it from CHROME_PATH (it has no flag for it).
//
// The post is the one the e2e specs open (each load counts a view: ruling P5-R1), so a run adds
// RUNS views to it. `/checkout/` is measured as a guest with a line in the cart: one guest cart
// is filled through the shop's BFF before, its cookie sent with every request, and cleared after.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { missedTargets, pageMedian, runSummary, summaryTable } from './lighthouse-summary.mjs'

const LIGHTHOUSE = 'lighthouse@13.5.0'
const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const RUNS = Number(process.env.RUNS ?? 3)
const CHROME_PATH =
  process.env.CHROME_PATH ?? process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'

const PAGES = {
  home: '/',
  category: '/product-category/digital/mobile-phone/',
  product: '/product/samsung-galaxy-s25-ultra/',
  post: '/blog/best-phones-under-30m/',
  checkout: '/checkout/',
}
/** A simple product with stock to spare (the e2e specs' cart product). */
const CART_VARIANT = 10123
const BFF_HEADERS = { 'X-Requested-With': 'ff', 'Content-Type': 'application/json' }

/** A guest cart with one line: its `ff_cart` cookie, for the checkout's runs. */
async function guestCart() {
  const response = await fetch(`${BASE_URL}/api/bff/cart/item/add/`, {
    method: 'POST',
    headers: BFF_HEADERS,
    body: JSON.stringify({ variant: CART_VARIANT, quantity: 1 }),
  })
  const cookie = response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .find((pair) => pair.startsWith('ff_cart='))
  if (!response.ok || !cookie) throw new Error(`could not fill a guest cart (${response.status})`)
  return cookie
}

async function clearCart(cookie) {
  await fetch(`${BASE_URL}/api/bff/cart/clear/`, {
    method: 'DELETE',
    headers: { ...BFF_HEADERS, Cookie: cookie },
  }).catch(() => undefined)
}

/** One Lighthouse run of `url`; returns the parsed result (also left in `file`). */
function lighthouse(url, file, cookie) {
  const args = [
    '--yes',
    LIGHTHOUSE,
    url,
    '--quiet',
    '--output=json',
    `--output-path=${file}`,
    '--only-categories=performance,accessibility,best-practices,seo',
    // Root in a container needs --no-sandbox; the form factor and throttling stay the defaults.
    '--chrome-flags=--headless=new --no-sandbox',
    ...(cookie ? [`--extra-headers=${JSON.stringify({ Cookie: cookie })}`] : []),
  ]
  const run = spawnSync('npx', args, {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, CHROME_PATH },
  })
  if (run.status !== 0 || !existsSync(file)) throw new Error(`lighthouse failed on ${url}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(PAGES)
const unknown = names.filter((name) => !(name in PAGES))
if (unknown.length > 0) {
  console.error(`Unknown page(s): ${unknown.join(', ')}. Pages: ${Object.keys(PAGES).join(', ')}`)
  process.exit(1)
}
if (!existsSync(CHROME_PATH)) {
  console.error(`No browser at ${CHROME_PATH}: set CHROME_PATH.`)
  process.exit(1)
}

const outDir = path.join(
  tmpdir(),
  'firefly-lighthouse',
  new Date().toISOString().replace(/:/g, '-'),
)
mkdirSync(outDir, { recursive: true })
console.log(`Lighthouse (${LIGHTHOUSE}) on ${BASE_URL}, ${RUNS} runs a page; reports in ${outDir}`)

const results = []
for (const name of names) {
  const cookie = name === 'checkout' ? await guestCart() : null
  try {
    const runs = []
    for (let run = 1; run <= RUNS; run++) {
      const file = path.join(outDir, `${name}-${run}.report.json`)
      const summary = runSummary(lighthouse(`${BASE_URL}${PAGES[name]}`, file, cookie))
      runs.push(summary)
      console.log(`${name} #${run}: ${JSON.stringify(summary.scores)}`)
    }
    results.push({ name, summary: pageMedian(runs) })
  } finally {
    if (cookie) await clearCart(cookie)
  }
}

console.log(`\nMedian of ${RUNS} (mobile, simulated throttling; ✗ below target):\n`)
console.log(summaryTable(results))
const missed = results.flatMap(({ name, summary }) =>
  missedTargets(summary).map((category) => `${name}: ${category}`),
)
console.log(missed.length > 0 ? `\nBelow target: ${missed.join(', ')}` : '\nEvery target met.')

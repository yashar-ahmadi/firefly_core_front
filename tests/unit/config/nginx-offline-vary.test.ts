// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The offline copies' `Vary: X-FF-Offline` (Plan 5 Task 7, carried from Task 6's review) is the
// edge's: Next sets every page's `Vary` itself (`res.setHeader('Vary', …)` in its app-page
// runtime, checked on the 16.4.1 build), replacing any the proxy wrote. So the nginx example adds
// it to exactly the responses the app consents to keep (`x-ff-offline: snapshot` back,
// src/lib/edge/offline-copy.ts): a shared cache in front reuses such a copy only for the worker's
// own request, never for a visitor's navigation.

const conf = readFileSync('deploy/nginx.conf.example', 'utf8')

/** The block that opens with `opening` (its braces balanced). */
function block(opening: RegExp): string {
  const start = conf.search(opening)
  expect(start, String(opening)).toBeGreaterThanOrEqual(0)
  let depth = 0
  for (let at = conf.indexOf('{', start); at < conf.length; at++) {
    if (conf[at] === '{') depth++
    if (conf[at] === '}' && --depth === 0) return conf.slice(start, at + 1)
  }
  throw new Error(`unbalanced ${String(opening)}`)
}

describe('nginx: Vary on the offline copies', () => {
  it('maps the upstream consent to `X-FF-Offline`, anything else to nothing', () => {
    const map = block(/map \$upstream_http_x_ff_offline \$ff_offline_vary \{/)
    expect(map).toMatch(/default\s+"";/)
    expect(map).toMatch(/snapshot\s+"X-FF-Offline";/)
  })

  it('the pages’ location adds it (an empty value adds no header), HSTS repeated there', () => {
    // The shop's own `location /` (the one proxying to the app, not the plain-HTTP redirect).
    const pages = block(/location \/ \{\s*proxy_pass http:\/\/firefly_storefront;/)
    expect(pages).toMatch(/add_header Vary \$ff_offline_vary;/)
    // add_header in a location drops the server's: the HSTS line must be repeated.
    expect(pages).toMatch(/add_header Strict-Transport-Security "max-age=31536000" always;/)
  })
})

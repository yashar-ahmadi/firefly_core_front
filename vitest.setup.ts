import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { createNetworkGuard } from './tests/unit/support/network-guard'

// No unit test reaches a real server: `fetch` to an absolute http(s) URL is refused, and the test
// that tried fails after it with the URLs (tests/unit/support/network-guard.ts).
const guard = createNetworkGuard(globalThis.fetch.bind(globalThis))
globalThis.fetch = guard.fetch

// Vitest runs without globals, so Testing Library cannot auto-register its cleanup.
afterEach(() => {
  cleanup()
  const escapes = guard.takeEscapes()
  if (escapes.length > 0) {
    throw new Error(
      `[network guard] this test fetched ${escapes.join(', ')}: mock the module that calls it`,
    )
  }
})

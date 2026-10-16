import { describe, expect, it } from 'vitest'
import { isExpectedFailure, watchErrors } from '../../e2e/support/watch-errors'

// The e2e console guard (tests/e2e/support/watch-errors.ts): only the dev backend's missing
// pictures and routes later plans build may fail; anything else must reach the test.

const NOT_FOUND = 'Failed to load resource: the server responded with a status of 404 (Not Found)'
const SERVER_ERROR =
  'Failed to load resource: the server responded with a status of 500 (Internal Server Error)'

describe('isExpectedFailure', () => {
  it('lets through the backend pictures under /media/ and /static/', () => {
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:8000/media/CACHE/a.jpg')).toBe(true)
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/static/defaults/default.png')).toBe(
      true,
    )
  })

  it("reports a failed Next chunk under /_next/static/ (the path only contains '/static/')", () => {
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/_next/static/chunks/app.js')).toBe(
      false,
    )
    expect(isExpectedFailure(SERVER_ERROR, 'http://localhost:3000/_next/static/css/app.css')).toBe(
      false,
    )
  })

  it('lets through only 404s from the routes not built yet', () => {
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/search/?_rsc=abc')).toBe(true)
    expect(isExpectedFailure(SERVER_ERROR, 'http://localhost:3000/search/?_rsc=abc')).toBe(false)
    expect(isExpectedFailure(NOT_FOUND, 'http://localhost:3000/product/x/')).toBe(false)
  })

  it('reports every other message', () => {
    expect(isExpectedFailure('Minified React error #418', 'http://localhost:3000/media/a')).toBe(
      false,
    )
    expect(isExpectedFailure(NOT_FOUND, '')).toBe(false)
  })
})

describe('watchErrors', () => {
  /** The two Page events the guard listens to, fired by hand. */
  function fakePage() {
    const handlers: Record<string, (value: unknown) => void> = {}
    const page = {
      on: (event: string, handler: (value: unknown) => void) => (handlers[event] = handler),
    }
    const consoleMessage = (type: string, text: string, url: string) =>
      handlers.console?.({ type: () => type, text: () => text, location: () => ({ url }) })
    return {
      page,
      consoleMessage,
      pageError: (message: string) => handlers.pageerror?.({ message }),
    }
  }

  it('collects page errors and unexpected console errors, with their URL', () => {
    const fake = fakePage()
    const errors = watchErrors(fake.page as never)
    fake.consoleMessage('error', NOT_FOUND, 'http://localhost:8000/media/a.jpg')
    fake.consoleMessage('warning', 'just a warning', '')
    fake.consoleMessage('error', NOT_FOUND, 'http://localhost:3000/_next/static/chunks/app.js')
    fake.pageError('Hydration failed')
    expect(errors).toEqual([
      `${NOT_FOUND} (http://localhost:3000/_next/static/chunks/app.js)`,
      'Hydration failed',
    ])
  })
})

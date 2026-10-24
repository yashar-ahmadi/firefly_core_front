// The unit suite's network guard (Task 9 fix round, controller ruling): a unit test never reaches
// a real server (the dev backend least of all: its anonymous budget is the e2e runs', and a test
// that passes only while it answers is not a unit test). vitest.setup.ts installs `guard.fetch` as
// the global `fetch` for every test file. A request to an absolute http(s) URL is refused (a
// rejected promise, as a network error would be) and its URL remembered; the setup fails the test
// after it with every URL it tried, even when the code under test swallowed the refusal (a server
// loader answering null on any error). Anything else (a relative path, a data: URL) goes to the
// real fetch. A test that stubs fetch itself (`vi.stubGlobal`, `vi.spyOn(...).mockImplementation`)
// replaces the guard for that test. An escape is fixed by mocking the module that fetches, never
// by letting the URL through.

type Fetch = typeof fetch

const ABSOLUTE_HTTP = /^https?:\/\//i

function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

export interface NetworkGuard {
  fetch: Fetch
  /** The URLs refused since the last call (and forgets them). */
  takeEscapes: () => string[]
}

export function createNetworkGuard(real: Fetch): NetworkGuard {
  let escapes: string[] = []
  const guarded: Fetch = (input, init) => {
    const url = urlOf(input)
    if (!ABSOLUTE_HTTP.test(url)) return real(input, init)
    escapes.push(url)
    return Promise.reject(
      new TypeError(`[network guard] a unit test fetched ${url}: mock the module that calls it`),
    )
  }
  return {
    fetch: guarded,
    takeEscapes: () => {
      const taken = escapes
      escapes = []
      return taken
    },
  }
}

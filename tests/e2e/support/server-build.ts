// Before the e2e suite: every local server the projects use must serve the build just made.
// Playwright reuses a server that is already listening (`reuseExistingServer`), and each server
// runs from its own copy of the build taken when it started (scripts/standalone-instance.mjs), so
// one left running from an earlier build would serve that build: the specs and the JS budget
// would test old code. Such a server stops the run with one clear message.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** The projects' base URLs on this machine, each once (a remote one is not ours to check). */
export function localServers(urls: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>()
  return urls.filter((url): url is string => {
    if (!url || seen.has(url)) return false
    seen.add(url)
    return LOCAL_HOSTS.has(new URL(url).hostname)
  })
}

/**
 * Null when the server at `url` serves the build `buildId` (its own build manifest answers), or
 * does not answer at all (left to the specs, as before); else the message that stops the run.
 */
export async function checkServerBuild(
  url: string,
  buildId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const manifest = new URL(`/_next/static/${buildId}/_buildManifest.js`, url)
  let response: Response
  try {
    response = await fetchImpl(manifest, { signal: AbortSignal.timeout(10_000) })
  } catch {
    return null
  }
  await response.body?.cancel().catch(() => undefined)
  if (response.ok) return null
  return [
    `The server at ${url} serves another build than .next/ holds (build ${buildId}): Playwright`,
    'reused a server left running from an earlier build. Stop it (and any other server of this',
    'repository), then run the suite again: Playwright builds and starts fresh ones.',
  ].join(' ')
}

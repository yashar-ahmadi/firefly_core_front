import type { FullConfig } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { isFullRun, ledgerVerdict, readStarts, recordStart } from './support/anon-budget'
import { checkServerBuild, localServers } from './support/server-build'
import { probeBackend, probeVerdict } from './support/throttle-probe'

/**
 * Playwright global setup (after the web servers are up): stop at once, with one clear message,
 * when the backend's anonymous budget is used up (it would answer every spec's API call with
 * 429), when the full runs of the past hour leave too little of it for one more full run
 * (support/anon-budget.ts: a ledger of full runs in tests/e2e/.state/), or when a local server
 * serves another build than the one just made (a server reused from an earlier run). An
 * unreachable backend or server is left to the specs, as before. A full run is booked in the
 * ledger last, once none of these has stopped it: a run stopped at start-up makes no API call,
 * and booking it would make the next real run wait for nothing.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8000'
  const verdict = probeVerdict(
    await probeBackend(apiUrl, process.env.FIREFLY_API_KEY ?? 'e2e-dev-key'),
    apiUrl,
  )
  if (verdict) throw new Error(verdict)

  const repository = config.configFile ? path.dirname(config.configFile) : process.cwd()
  const ledger = path.join(repository, 'tests', 'e2e', '.state', 'full-runs.json')
  const counted = isFullRun(process.argv) && process.env.E2E_SKIP_ANON_LEDGER !== '1'
  const starts = counted ? await readStarts(ledger) : []
  const now = Date.now()
  const stop = counted ? ledgerVerdict(starts, now) : null
  if (stop) throw new Error(stop)

  const buildFile = path.join(repository, '.next', 'BUILD_ID')
  if (existsSync(buildFile)) {
    const buildId = readFileSync(buildFile, 'utf8').trim()
    const servers = localServers(config.projects.map((project) => project.use.baseURL))
    for (const url of servers) {
      const stale = await checkServerBuild(url, buildId)
      if (stale) throw new Error(stale)
    }
  }
  if (counted) await recordStart(ledger, starts, now)
}

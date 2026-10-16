import { probeBackend, probeVerdict } from './support/throttle-probe'

/**
 * Playwright global setup: stop at once, with one clear message, when the backend's anonymous
 * budget is used up (it would answer every spec's API call with 429). An unreachable backend is
 * left to the specs, as before.
 */
export default async function globalSetup(): Promise<void> {
  const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8000'
  const verdict = probeVerdict(
    await probeBackend(apiUrl, process.env.FIREFLY_API_KEY ?? 'e2e-dev-key'),
    apiUrl,
  )
  if (verdict) throw new Error(verdict)
}

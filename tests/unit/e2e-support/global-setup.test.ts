import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FullConfig } from '@playwright/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The e2e global setup's order (Plan 4 final fix wave): a full run is booked in the anonymous
// budget's ledger (tests/e2e/.state/full-runs.json) only once nothing stops it at start-up any
// more. A run that a stale server (or the probe, or the ledger itself) stops makes no API call,
// so booking it would make the next real run wait for a run that never happened.

const mocks = vi.hoisted(() => ({
  probe: vi.fn(),
  checkServerBuild: vi.fn<(url: string, buildId: string) => Promise<string | null>>(),
}))
vi.mock('../../e2e/support/throttle-probe', () => ({
  probeBackend: mocks.probe,
  probeVerdict: (result: { stop?: string }) => result.stop ?? null,
}))
vi.mock('../../e2e/support/server-build', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../e2e/support/server-build')>()),
  checkServerBuild: mocks.checkServerBuild,
}))

const { default: globalSetup } = await import('../../e2e/global-setup')

let repository = ''
const argv = process.argv
const ledger = () => path.join(repository, 'tests', 'e2e', '.state', 'full-runs.json')
const booked = async () =>
  JSON.parse(await readFile(ledger(), 'utf8').catch(() => '[]')) as number[]

const config = () =>
  ({
    configFile: path.join(repository, 'playwright.config.ts'),
    projects: [{ use: { baseURL: 'http://localhost:3000' } }],
  }) as unknown as FullConfig

beforeEach(async () => {
  repository = await mkdtemp(path.join(tmpdir(), 'ff-global-setup-'))
  await mkdir(path.join(repository, '.next'))
  await writeFile(path.join(repository, '.next', 'BUILD_ID'), 'BUILD-NOW\n')
  // A full run: `playwright test` with nothing that filters the suite.
  process.argv = ['node', '/x/playwright/cli.js', 'test']
  vi.stubEnv('E2E_SKIP_ANON_LEDGER', '')
  mocks.probe.mockResolvedValue({})
  mocks.checkServerBuild.mockResolvedValue(null)
})

afterEach(async () => {
  process.argv = argv
  vi.unstubAllEnvs()
  await rm(repository, { recursive: true, force: true })
})

describe('the global setup books a full run only once it starts', () => {
  it('every check passed: the run is booked', async () => {
    await globalSetup(config())
    expect(await booked()).toHaveLength(1)
    expect(mocks.checkServerBuild).toHaveBeenCalledWith('http://localhost:3000', 'BUILD-NOW')
  })

  it('a server serving an earlier build stops the run: nothing is booked', async () => {
    mocks.checkServerBuild.mockResolvedValue('The server at http://localhost:3000 is stale.')
    await expect(globalSetup(config())).rejects.toThrow(/stale/)
    expect(await booked()).toEqual([])
  })

  it('the probe stops the run (429): nothing is booked, no server is asked', async () => {
    mocks.probe.mockResolvedValue({ stop: 'throttled: wait 552 s' })
    await expect(globalSetup(config())).rejects.toThrow(/wait 552 s/)
    expect(await booked()).toEqual([])
    expect(mocks.checkServerBuild).not.toHaveBeenCalled()
  })

  it('two full runs in the past hour: stopped at once, the ledger as it was', async () => {
    const now = Date.now()
    const earlier = [now - 40 * 60_000, now - 20 * 60_000]
    await mkdir(path.dirname(ledger()), { recursive: true })
    await writeFile(ledger(), JSON.stringify(earlier))
    await expect(globalSetup(config())).rejects.toThrow(/Wait \d+ s/)
    expect(await booked()).toEqual(earlier)
    expect(mocks.checkServerBuild).not.toHaveBeenCalled()
  })

  it('a filtered run is never booked', async () => {
    process.argv = ['node', '/x/playwright/cli.js', 'test', '--project=journeys', '--no-deps']
    await globalSetup(config())
    expect(await booked()).toEqual([])
  })
})

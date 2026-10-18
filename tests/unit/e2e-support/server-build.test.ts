import { describe, expect, it, vi } from 'vitest'
import { checkServerBuild, localServers } from '../../e2e/support/server-build'

// The e2e global setup's check that every local server it will measure serves the build just
// made (tests/e2e/global-setup.ts): Playwright reuses a server already listening, and a server
// left running from an earlier build would serve that build (its chunk names, its code), so a
// budget or a spec would test old code. A stale server stops the run with one clear message.

const BUILD = 'LXySY4cvIDqwanjnhShQj'

function answering(status: number) {
  return vi.fn<typeof fetch>(async () => new Response('', { status }))
}

describe('checkServerBuild', () => {
  it('asks the server for this build’s own manifest', async () => {
    const fetchImpl = answering(200)
    expect(await checkServerBuild('http://localhost:3001/', BUILD, fetchImpl)).toBeNull()
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      `http://localhost:3001/_next/static/${BUILD}/_buildManifest.js`,
    )
  })

  it('a server without it serves another build: the run stops, saying which and what to do', async () => {
    const verdict = await checkServerBuild('http://localhost:3001', BUILD, answering(404))
    expect(verdict).toMatch(/localhost:3001/)
    expect(verdict).toMatch(/another build/)
    expect(verdict).toMatch(/stop it/i)
  })

  it('a server that does not answer is left to the specs', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await checkServerBuild('http://localhost:3001', BUILD, fetchImpl)).toBeNull()
  })
})

describe('localServers', () => {
  it('the projects’ local base URLs, each once', () => {
    expect(
      localServers([
        'http://localhost:3000',
        'http://localhost:3000',
        'http://127.0.0.1:3001/',
        'https://staging.example.com',
        undefined,
      ]),
    ).toEqual(['http://localhost:3000', 'http://127.0.0.1:3001/'])
  })
})

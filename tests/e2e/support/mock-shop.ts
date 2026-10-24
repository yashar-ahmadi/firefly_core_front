import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { rmSync } from 'node:fs'
import { createServer, request as forward, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A shop of its own for one spec: a second production server of the build under test, whose API
// is a pass-through to the dev backend that changes one answer. For what the dev data does not
// have and the server renders before the browser sees anything (the category tree of
// `/categories/` has two levels in dev; a third must be in the server's HTML), so a browser route
// cannot stand in for it. The server runs from its own copy of the build (scripts/standalone-
// instance.mjs), on a free port, and both go when the spec ends. Its shell loaders read through
// the pass-through like any server's (about fifteen anonymous calls).

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const BACKEND = new URL(process.env.E2E_API_URL ?? 'http://localhost:8000')
const START_TIMEOUT_MS = 45_000

/** Changes the JSON body of one API answer (`pathname` without the query), or keeps it (null). */
export type Rewrite = (pathname: string, body: unknown) => unknown | null

export interface MockShop {
  url: string
  close: () => Promise<void>
}

async function listening(server: Server): Promise<number> {
  server.listen(0, 'localhost')
  await once(server, 'listening')
  return (server.address() as AddressInfo).port
}

async function freePort(): Promise<number> {
  const probe = createServer()
  const port = await listening(probe)
  probe.close()
  await once(probe, 'close')
  return port
}

async function readBody(stream: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/** The dev backend as is, but for the JSON answers `rewrite` changes. */
async function passThrough(rewrite: Rewrite): Promise<{ origin: string; server: Server }> {
  const server = createServer((incoming, outgoing) => {
    const headers = { ...incoming.headers, host: BACKEND.host }
    // A plain body, so an answer can be read and changed.
    delete headers['accept-encoding']
    const upstream = forward(
      {
        host: BACKEND.hostname,
        port: BACKEND.port,
        path: incoming.url,
        method: incoming.method,
        headers,
      },
      async (answer) => {
        const pathname = new URL(incoming.url ?? '/', BACKEND).pathname
        const json = /application\/json/.test(answer.headers['content-type'] ?? '')
        if (!json) {
          outgoing.writeHead(answer.statusCode ?? 502, answer.headers)
          answer.pipe(outgoing)
          return
        }
        const raw = await readBody(answer)
        let body = raw
        try {
          const changed = rewrite(pathname, JSON.parse(raw.toString('utf8')))
          if (changed !== null) body = Buffer.from(JSON.stringify(changed))
        } catch {
          // Not JSON after all: as it came.
        }
        const answerHeaders = { ...answer.headers, 'content-length': String(body.length) }
        outgoing.writeHead(answer.statusCode ?? 502, answerHeaders)
        outgoing.end(body)
      },
    )
    upstream.on('error', () => outgoing.writeHead(502).end())
    incoming.pipe(upstream)
  })
  const port = await listening(server)
  return { origin: `http://localhost:${port}`, server }
}

async function healthy(url: string, child: ChildProcess): Promise<void> {
  const until = Date.now() + START_TIMEOUT_MS
  while (Date.now() < until) {
    if (child.exitCode !== null)
      throw new Error(`the mock shop's server exited (${child.exitCode})`)
    try {
      if ((await fetch(`${url}/healthz/`)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`the mock shop's server did not start within ${START_TIMEOUT_MS} ms`)
}

/** Starts the pass-through and a production server reading through it. */
export async function startMockShop(rewrite: Rewrite): Promise<MockShop> {
  const api = await passThrough(rewrite)
  const port = await freePort()
  const url = `http://localhost:${port}`
  const child = spawn(process.execPath, ['scripts/start-standalone.mjs'], {
    cwd: ROOT,
    stdio: 'ignore',
    env: {
      ...process.env,
      FIREFLY_API_URL: api.origin,
      FIREFLY_API_KEY: process.env.FIREFLY_API_KEY ?? 'e2e-dev-key',
      SITE_URL: url,
      PORT: String(port),
      HOSTNAME: 'localhost',
      FEATURE_PWA: '0',
    },
  })
  const close = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await once(child, 'exit')
    }
    api.server.close()
    rmSync(path.join(ROOT, 'node_modules', '.cache', 'standalone-servers', String(port)), {
      recursive: true,
      force: true,
    })
  }
  try {
    await healthy(url, child)
  } catch (error) {
    await close()
    throw error
  }
  return { url, close }
}

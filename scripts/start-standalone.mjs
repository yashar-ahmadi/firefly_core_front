// Serves the production build exactly as the Docker image does: the standalone server
// (`.next/standalone/server.js`) with `.next/static` and `public` copied next to it, because
// `next build` leaves them out of the standalone folder. Run `pnpm build` first.
//
// Environment: the same runtime variables as the container (see .env.example), plus PORT
// (default 3000), HOSTNAME (the address to listen on; default 0.0.0.0) and KEEP_ALIVE_TIMEOUT
// (ms; default 65000 as in the image, longer than nginx's upstream keepalive_timeout).

import { cpSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const standalone = path.join(root, '.next', 'standalone')
const server = path.join(standalone, 'server.js')

if (!existsSync(server)) {
  console.error('[start:standalone] .next/standalone/server.js is missing: run `pnpm build` first.')
  process.exit(1)
}

// Fresh copies, so files deleted from public/ or a previous build's chunks never linger.
for (const [from, to] of [
  [path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static')],
  [path.join(root, 'public'), path.join(standalone, 'public')],
]) {
  rmSync(to, { recursive: true, force: true })
  if (existsSync(from)) cpSync(from, to, { recursive: true })
}

// Idle keep-alive sockets must outlive the reverse proxy's, or it may reuse one Node just closed
// (a sporadic 502). server.js reads this variable; Node's own default is 5 s.
process.env.KEEP_ALIVE_TIMEOUT ??= '65000'

// server.js changes into its own folder and starts listening when it is loaded.
await import(pathToFileURL(server).href)

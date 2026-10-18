// Serves the production build exactly as the Docker image does: the standalone server
// (`.next/standalone/server.js`) with `.next/static` and `public` copied next to it, because
// `next build` leaves them out of the standalone folder. Run `pnpm build` first.
//
// Each server runs from its own copy of the build, one folder per PORT, complete before it starts
// (scripts/standalone-instance.mjs): two servers of one build (the e2e run's main and push-shop
// servers) never touch each other's files, nor does a rebuild touch a server still running.
// Restart a server after a rebuild to serve the new one.
//
// Environment: the same runtime variables as the container (see .env.example), plus PORT
// (default 3000), HOSTNAME (the address to listen on; default 0.0.0.0) and KEEP_ALIVE_TIMEOUT
// (ms; default 65000 as in the image, longer than nginx's upstream keepalive_timeout).

import { fileURLToPath, pathToFileURL } from 'node:url'
import { prepareInstance } from './standalone-instance.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const server = prepareInstance({ root, port: process.env.PORT ?? '3000' })

if (server === null) {
  console.error('[start:standalone] .next/standalone/server.js is missing: run `pnpm build` first.')
  process.exit(1)
}

// Idle keep-alive sockets must outlive the reverse proxy's, or it may reuse one Node just closed
// (a sporadic 502). server.js reads this variable; Node's own default is 5 s.
process.env.KEEP_ALIVE_TIMEOUT ??= '65000'

// server.js changes into its own folder and starts listening when it is loaded.
await import(pathToFileURL(server).href)

# Firefly Storefront

Production storefront for the Firefly Core API. Persian only (`fa`, RTL), light theme only.

Stack: Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, pnpm, Node 22.

## Getting started

```bash
nvm use            # Node 22 (see .nvmrc)
corepack enable    # pins pnpm via the "packageManager" field
pnpm install
pnpm dev           # http://localhost:3000
```

The browser never talks to the Firefly API directly; every call goes through the Next.js server.
`pnpm build` does not need a backend or any environment variable.

## Scripts

| Script              | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `pnpm dev`          | Start the dev server                       |
| `pnpm build`        | Production build (`output: 'standalone'`)  |
| `pnpm start`        | Serve the production build                 |
| `pnpm lint`         | ESLint (flat config, `eslint-config-next`) |
| `pnpm typecheck`    | `tsc --noEmit`                             |
| `pnpm test`         | Unit tests (Vitest, jsdom)                 |
| `pnpm test:watch`   | Vitest in watch mode                       |
| `pnpm test:e2e`     | Playwright (mobile, tablet and desktop)    |
| `pnpm format`       | Format with Prettier                       |
| `pnpm format:check` | Check formatting                           |

## Testing notes

- Unit tests live in `tests/unit/**` and next to source as `src/**/*.test.{ts,tsx}`.
- E2E tests live in `tests/e2e/**`. Playwright builds and starts the app itself with
  `FIREFLY_API_URL=http://localhost:8000` and `SITE_URL=http://localhost:3000`, and reuses a server
  that is already running. Set `E2E_BASE_URL` to point at another origin.
- To use a specific Chromium binary, set `PLAYWRIGHT_CHROMIUM_PATH` (it defaults to
  `/opt/pw-browsers/chromium` when that file exists).

## Images

`FIREFLY_API_URL`, when set at build time, restricts `next/image` to exactly that origin and the
`/media/**` and `/static/**` paths. Without it the build falls back to a permissive allow-list
(any `https` host, `localhost` and `127.0.0.1` on any port) and logs a warning.

## Documentation

Design spec, backend integration digests and implementation plans are in [`docs/`](docs/).

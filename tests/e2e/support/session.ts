import { test as base, expect, type BrowserContext } from '@playwright/test'
import { mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Signing in for e2e specs (Plan 3). Every login is one `auth_attempt` at the backend, 20 a
// minute per IP for the whole run (the BFF forwards the visitor's IP), so specs never log in per
// test, and never in a loop:
//
// - A spec that only reads with a session (the account pages, the header) uses `signedInTest`:
//   its `page` is signed in as sara through a session shared by every spec and worker of the
//   project, logged in once per project per run, the first time a test asks for it. That
//   session must stay as it is: never log it out, revoke it (logout everywhere) or change the
//   password with it, and restore any account data a test changes (addresses, wishlist).
// - A spec that ends or changes its session (logout, password change) logs in on its own, once
//   per project, with `logIn`, as `account/logout.spec.ts` does.

/** The dev backend's demo customer. */
export const SARA = {
  email: 'sara.ahmadi@example.com',
  password: 'Firefly@1234',
  fullName: 'سارا احمدی',
} as const

/** The cookies a session lives in: the tokens (httpOnly) and the `ff_auth` flag. */
export const SESSION_COOKIES = ['ff_at', 'ff_rt', 'ff_auth'] as const

/**
 * Signs `context` in as sara the way the login form does: one POST through the BFF, which keeps
 * the tokens in the context's cookies (its pages share them). One `auth_attempt`.
 */
export async function logIn(context: BrowserContext, baseURL: string): Promise<void> {
  const response = await context.request.post(`${baseURL}/api/bff/account/auth/login/`, {
    headers: { 'X-Requested-With': 'ff', Origin: baseURL },
    data: {
      login_method: 'email',
      login_identifier: SARA.email,
      password: SARA.password,
      remember_me: false,
    },
  })
  expect(response.status(), `login through the BFF: ${await response.text()}`).toBe(200)
}

const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  )

/**
 * The project's shared session as a storage-state file, made once: the worker that creates the
 * lock file logs in and writes the state (renamed into place, so nobody reads half a file); any
 * other worker waits for it. If that login fails, its worker leaves a `.failed` file with the
 * reason and every waiting worker fails at once with it (none tries again: one more login is one
 * more `auth_attempt`). The output folder is emptied at the start of every run.
 */
async function sharedState(file: string, create: () => Promise<object>): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true })
  const failed = `${file}.failed`
  try {
    await (await open(`${file}.lock`, 'wx')).close()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const settled = async () => (await exists(file)) || (await exists(failed))
    await expect
      .poll(settled, { message: `the shared session ${file}`, timeout: 30_000 })
      .toBe(true)
    if (await exists(failed)) {
      throw new Error(`The shared session could not be made: ${await readFile(failed, 'utf8')}`)
    }
    return file
  }
  try {
    await writeFile(`${file}.tmp`, JSON.stringify(await create()))
    await rename(`${file}.tmp`, file)
    return file
  } catch (error) {
    await writeFile(failed, error instanceof Error ? error.message : String(error))
    throw error
  }
}

/** `test` with `page` (and `context`) signed in as sara through the project's shared session. */
export const signedInTest = base.extend<object, { saraState: string }>({
  saraState: [
    async ({ browser }, provide, { project }) => {
      const baseURL = project.use.baseURL ?? 'http://localhost:3000'
      const file = path.join(project.outputDir, '.auth', `sara-${project.name}.json`)
      const state = await sharedState(file, async () => {
        const context = await browser.newContext({ baseURL })
        try {
          await logIn(context, baseURL)
          return await context.storageState()
        } finally {
          await context.close()
        }
      })
      await provide(state)
    },
    { scope: 'worker' },
  ],
  // The fixture's `use` callback, named apart from React's `use` (the hooks lint rule).
  storageState: ({ saraState }, provide) => provide(saraState),
})

import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type FullProject,
  type Page,
} from '@playwright/test'
import { mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Signing in for e2e specs (Plan 3). Every login, and every logout too, is one `auth_attempt`
// at the backend: 20 a minute per IP for the whole run (the BFF forwards the visitor's IP), so
// specs never log in per test, and never in a loop:
//
// - A spec that only reads with a session (the account pages, the header) uses `signedInTest`:
//   its `page` is signed in as sara through a session shared by every spec and worker of the
//   project, logged in once per project per run, the first time a test asks for it. That
//   session must stay as it is: never log it out, revoke it (logout everywhere) or change the
//   password with it, and restore any account data a test changes (the `sara` guard of
//   support/sara-guard.ts).
// - A spec that ends or changes its session (logout, password change) logs in on its own, once
//   per project, with `logIn` (or the form), as `account/logout.spec.ts` does, and ends it.
//
// The attempts of a full run: the shared session of each project (mobile, tablet, desktop,
// journeys: 4; budget-push reads through the desktop's); logout.spec (a login and a logout per project but journeys: 6);
// session-restore.spec (a form login and a logout, idem: 6); auth.spec (journeys only: a wrong
// password, a form login, its logout in another tab, kamran's login there and its logout: 5).
// 21 in all. They come apart because Playwright, as
// configured, runs the projects one after the other (mobile, tablet, desktop, then journeys, which
// waits for the others), each project's account specs first: measured from the backend's log
// (Task 10), at most 5 in any minute of a run and 9 across two runs back to back. That is an
// observation of the scheduler, not a guarantee (more workers or a filtered run can bunch them):
// keep a run's total low, and a spec that adds attempts adds its count here.

/** The dev backend's demo customer. */
export const SARA = {
  email: 'sara.ahmadi@example.com',
  password: 'Firefly@1234',
  fullName: 'سارا احمدی',
} as const

/**
 * Another demo customer (k.yazdi; ruling P4-R4: never sara for order journeys): the visitor who
 * signs in after sara in another tab (auth.spec). Read only here.
 */
export const KAMRAN = {
  email: 'k.yazdi@example.com',
  password: 'Firefly@1234',
  fullName: 'کامران یزدی',
} as const

/** A demo account `logIn` can sign in. */
export type DemoAccount = { readonly email: string; readonly password: string }

/** The cookies a session lives in: the tokens (httpOnly) and the `ff_auth` flag. */
export const SESSION_COOKIES = ['ff_at', 'ff_rt', 'ff_auth'] as const

/**
 * Signs `context` in as sara (or `account`) the way the login form does: one POST through the
 * BFF, which keeps the tokens in the context's cookies (its pages share them). One
 * `auth_attempt`.
 */
export async function logIn(
  context: BrowserContext,
  baseURL: string,
  account: DemoAccount = SARA,
): Promise<void> {
  const response = await context.request.post(`${baseURL}/api/bff/account/auth/login/`, {
    headers: { 'X-Requested-With': 'ff', Origin: baseURL },
    data: {
      login_method: 'email',
      login_identifier: account.email,
      password: account.password,
      remember_me: false,
    },
  })
  expect(response.status(), `login through the BFF: ${await response.text()}`).toBe(200)
}

/**
 * Signs in on the login page that `page` shows, the way a visitor does: sara's email, «ادامه»,
 * the password (sara's unless another is given), «ورود». One `auth_attempt`. Resolves once
 * «ورود» is pressed: the caller waits for what should follow.
 */
export async function logInWithForm(page: Page, password: string = SARA.password): Promise<void> {
  // Hydrated first (a value typed into the server's HTML could be lost to hydration): the auth
  // forms' submit button is disabled until the page has hydrated.
  const next = page.getByRole('button', { name: 'ادامه' })
  await expect(next).toBeEnabled()
  await page.getByLabel('ایمیل یا شماره موبایل').fill(SARA.email)
  await next.click()
  await page.getByLabel('رمز عبور', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'ورود', exact: true }).click()
}

/**
 * Ends `context`'s session through the BFF, as the account menu's «خروج» does (the API revokes the
 * refresh token; the BFF drops the cookies). One `auth_attempt`.
 */
export async function logOut(context: BrowserContext, baseURL: string): Promise<void> {
  const response = await context.request.post(`${baseURL}/api/bff/account/auth/logout/`, {
    headers: { 'X-Requested-With': 'ff', Origin: baseURL },
  })
  expect(response.status(), `logout through the BFF: ${await response.text()}`).toBe(200)
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

/**
 * The project's shared session (sara), as a storage-state file: made the first time it is asked
 * for in a run (one login), then the same file for every worker and spec of the project. A
 * project with `metadata.session` uses that project's instead (`budget-push` reads only, through
 * the desktop's session: no login of its own; cookies are the host's, whatever the port).
 */
export async function saraSession(browser: Browser, project: FullProject): Promise<string> {
  const baseURL = project.use.baseURL ?? 'http://localhost:3000'
  const owner =
    typeof project.metadata.session === 'string' ? project.metadata.session : project.name
  const file = path.join(project.outputDir, '.auth', `sara-${owner}.json`)
  return sharedState(file, async () => {
    const context = await browser.newContext({ baseURL })
    try {
      await logIn(context, baseURL)
      return await context.storageState()
    } finally {
      await context.close()
    }
  })
}

/** `test` with `page` (and `context`) signed in as sara through the project's shared session. */
export const signedInTest = base.extend<object, { saraState: string }>({
  saraState: [
    async ({ browser }, provide, { project }) => provide(await saraSession(browser, project)),
    { scope: 'worker' },
  ],
  // The fixture's `use` callback, named apart from React's `use` (the hooks lint rule).
  storageState: ({ saraState }, provide) => provide(saraState),
})

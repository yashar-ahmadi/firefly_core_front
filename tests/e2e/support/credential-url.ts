import { expect, type Page } from '@playwright/test'

// Assertions about addresses that hold a credential (a payment link's token, a payment's uuid;
// docs/ARCHITECTURE.md «Payment credentials in URLs») or a tracking key (an order code with its
// mobile): a failure says what was expected, never the address. Such checks compare to a boolean
// (`expect(a === b, what).toBe(true)`), and the wait for such a page polls its path: Playwright's
// own `waitForURL` logs every address it saw when it times out.

/** Waits (20 s) until the page's path matches `pattern`; a timeout says only `what`. */
export async function waitForCredentialPath(page: Page, pattern: RegExp, what: string) {
  await expect
    .poll(() => pattern.test(new URL(page.url()).pathname), { message: what, timeout: 20_000 })
    .toBe(true)
}

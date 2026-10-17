import type { AuthPage } from './identifier-handoff'

// Links between the auth pages, with the page to return to (`next`, read back through
// `safeNext`). What the visitor typed never goes in them: it is handed over apart
// (`identifier-handoff.ts`). Pure.

function withNext(path: AuthPage, next?: string): string {
  return next ? `${path}?${new URLSearchParams({ next })}` : path
}

/** `/login/`, with the page to return to (when there is one). */
export function loginPageHref(next?: string): string {
  return withNext('/login/', next)
}

/** `/register/`, with the page to return to (when there is one). */
export function registerHref(next?: string): string {
  return withNext('/register/', next)
}

/** `/forgot-password/`, with the page to return to afterwards (when there is one). */
export function forgotPasswordHref(next?: string): string {
  return withNext('/forgot-password/', next)
}

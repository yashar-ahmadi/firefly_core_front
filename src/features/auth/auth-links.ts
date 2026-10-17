// Links between the auth pages, carrying what the visitor already typed and the page to return
// to (`next`, read back through `safeNext`). Pure.

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  const search = query.toString()
  return search ? `${path}?${search}` : path
}

/** `/login/`, with the identifier to prefill and the page to return to (when there is one). */
export function loginPageHref(identifier?: string, next?: string): string {
  return withQuery('/login/', { identifier, next })
}

/** `/register/`, with the identifier to prefill and the page to return to (when there is one). */
export function registerHref(identifier?: string, next?: string): string {
  return withQuery('/register/', { identifier, next })
}

/** `/forgot-password/`, with the identifier to prefill and the page to return to afterwards. */
export function forgotPasswordHref(identifier?: string, next?: string): string {
  return withQuery('/forgot-password/', { identifier, next })
}

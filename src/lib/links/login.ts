/**
 * `/login/?next=<path>`, readable (slashes kept). `path` may carry a query string or a hash.
 * The home page (with or without a query) and the auth pages (login, register, forgot password)
 * send no `next`; the login page reads it back through `safeNext`. Pure: safe in any bundle.
 */
export function loginHref(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] ?? path
  if (pathname === '/' || /^\/(?:login|register|forgot-password)\//.test(pathname)) return '/login/'
  return `/login/?next=${encodeURIComponent(path).replace(/%2F/gi, '/')}`
}

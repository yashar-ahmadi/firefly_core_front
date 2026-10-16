/**
 * `/login/?next=<path>`, readable (slashes kept); the home page and the auth pages send no
 * `next`. `path` may carry a query string. Pure: safe in any bundle.
 */
export function loginHref(path: string): string {
  if (path === '/' || /^\/(?:login|register)\//.test(path)) return '/login/'
  return `/login/?next=${encodeURIComponent(path).replace(/%2F/gi, '/')}`
}

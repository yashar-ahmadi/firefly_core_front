import { isSessionExpiredError } from './viewer-queries'

// One wrapper for every session-only read (a query's `queryFn`). Pure (no React): safe in any
// bundle, the catalog's hearts included.

/**
 * `read`, where a failure that means the session is gone (`isSessionExpiredError`: the BFF's one
 * refresh failed) ends it (`expire`, from `useSessionExpired`: the page stops asking, and login
 * replaces an account page once however many reads fail together). The error then stays the
 * read's (a section keeps its skeleton for it), or, with `expired`, the read resolves to that
 * value instead (nobody's profile: null; nobody's wishlist: none). Any other failure is rethrown
 * as it is.
 */
export function withSessionExpiry<A extends unknown[], T>(
  read: (...args: A) => Promise<T>,
  expire: () => void,
): (...args: A) => Promise<T>
export function withSessionExpiry<A extends unknown[], T, F>(
  read: (...args: A) => Promise<T>,
  expire: () => void,
  expired: () => F,
): (...args: A) => Promise<T | F>
export function withSessionExpiry<A extends unknown[], T, F>(
  read: (...args: A) => Promise<T>,
  expire: () => void,
  expired?: () => F,
): (...args: A) => Promise<T | F> {
  return async (...args) => {
    try {
      return await read(...args)
    } catch (error) {
      if (!isSessionExpiredError(error)) throw error
      expire()
      if (expired) return expired()
      throw error
    }
  }
}

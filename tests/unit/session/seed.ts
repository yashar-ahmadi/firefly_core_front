import type { QueryClient } from '@tanstack/react-query'
import { parseCommentsParams } from '@/features/account/comments/comment-params'
import { commentsKey } from '@/features/account/comments/comments-api'
import { TOTP_STATUS_KEY } from '@/features/account/profile/use-totp-status'
import { wishlistListKey } from '@/features/account/wishlist/use-wishlist-list'
import { parseWishlistParams } from '@/features/account/wishlist/wishlist-params'
import { NOTIFICATIONS_KEY } from '@/features/notifications/notifications-api'
import { UNREAD_NOTIFICATIONS_KEY } from '@/features/notifications/unread'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { cart, cartLine } from '../cart/support'

// The session tests' cache as a signed-in visitor leaves it, under the app's own query keys.

/** «دیدگاه‌های من»'s and the wishlist page's first page, as their pages key them. */
export const MY_LIST = commentsKey(parseCommentsParams(new URLSearchParams()))
export const WISHLIST_LIST = wishlistListKey(parseWishlistParams(new URLSearchParams()))

/** Every key of the visitor's own data that `seed` fills. */
export const VIEWER_KEYS = [
  ME_KEY,
  ['summary'],
  ['wishlist', 'ids'],
  ['addresses'],
  ['cart'],
  ['product', 'samsung-galaxy-s25-ultra'],
  ['product', 'samsung-galaxy-s25-ultra', 'comments', 'review'],
  TOTP_STATUS_KEY,
  NOTIFICATIONS_KEY,
  UNREAD_NOTIFICATIONS_KEY,
  MY_LIST,
  WISHLIST_LIST,
] as const

/** A cache as a signed-in visitor leaves it: theirs, and data that is the same for everyone. */
export function seed(client: QueryClient): void {
  client.setQueryData(ME_KEY, { full_name: 'سارا احمدی' })
  client.setQueryData(['summary'], { wishlist_count: 3 })
  client.setQueryData(['wishlist', 'ids'], [10001, 10062])
  client.setQueryData(['addresses'], { count: 1, results: [{ id: 10001, title: 'خانه' }] })
  client.setQueryData(['geo', 'provinces'], [{ id: 8, name: 'تهران' }])
  client.setQueryData(['cart'], cart([cartLine({ quantity: 2 })]))
  // The BFF's product payload carries `is_in_wishlist`; its comment lists `is_current_user`.
  client.setQueryData(['product', 'samsung-galaxy-s25-ultra'], { is_in_wishlist: true })
  client.setQueryData(['product', 'samsung-galaxy-s25-ultra', 'comments', 'review'], {
    pages: [{ results: [{ id: 1, is_current_user: true }] }],
    pageParams: [1],
  })
  client.setQueryData(['search-suggest', 'گوشی'], { products: [] })
  // The account pages' own: 2FA status, the inbox and its count, «دیدگاه‌های من», the wishlist page.
  client.setQueryData(TOTP_STATUS_KEY, { is_enabled: true })
  client.setQueryData(NOTIFICATIONS_KEY, { pages: [], pageParams: [] })
  client.setQueryData(UNREAD_NOTIFICATIONS_KEY, 1)
  client.setQueryData(MY_LIST, { count: 1, results: [] })
  client.setQueryData(WISHLIST_LIST, { count: 1, results: [] })
}

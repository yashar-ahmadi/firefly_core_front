import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { commentsKey } from '@/features/account/comments/comments-api'
import { parseCommentsParams } from '@/features/account/comments/comment-params'
import { ADDRESSES_KEY } from '@/features/account/addresses/use-addresses'
import { PURCHASES_KEY } from '@/features/account/dashboard/recent-purchases'
import { TOTP_STATUS_KEY } from '@/features/account/profile/use-totp-status'
import { useAccountQuery } from '@/features/account/use-account-query'
import { wishlistListKey } from '@/features/account/wishlist/use-wishlist-list'
import { parseWishlistParams } from '@/features/account/wishlist/wishlist-params'
import { NOTIFICATIONS_KEY } from '@/features/notifications/notifications-api'
import { UNREAD_NOTIFICATIONS_KEY } from '@/features/notifications/unread'
import { SHIPPING_OPTIONS_KEY } from '@/features/checkout/use-shipping-options'
import { WALLET_BALANCE_KEY } from '@/features/payment/use-wallet'
import { WISHLIST_IDS_KEY } from '@/features/wishlist/hooks'
import { createQueryClient } from '@/lib/query/query-client'
import {
  clearViewerQueries,
  isSessionQuery,
  ME_KEY,
  MY_COMMENTS_KEY,
  SUMMARY_KEY,
} from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// The guard on the logout cleanup's registry (`SESSION_QUERIES`): a per-visitor query outside
// it would outlive a logout and show the last visitor's data to the next one. Every key the
// session-only reads use is under a registered prefix, and `useAccountQuery` refuses one that
// is not (in development and tests: the bug shows up at once, not after a logout).

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

afterEach(() => vi.restoreAllMocks())

/** Every key the session-only reads use, from the app's own constants and key builders. */
const SESSION_READ_KEYS = [
  ME_KEY,
  TOTP_STATUS_KEY,
  SUMMARY_KEY,
  PURCHASES_KEY,
  MY_COMMENTS_KEY,
  commentsKey(parseCommentsParams(new URLSearchParams('type=post&page=2'))),
  ADDRESSES_KEY,
  WISHLIST_IDS_KEY,
  wishlistListKey(parseWishlistParams(new URLSearchParams('sort=price&page=3'))),
  NOTIFICATIONS_KEY,
  UNREAD_NOTIFICATIONS_KEY,
  WALLET_BALANCE_KEY,
]

describe('SESSION_QUERIES', () => {
  it.each(SESSION_READ_KEYS.map((key) => [JSON.stringify(key), key]))(
    '%s is under a registered prefix (a logout removes it)',
    (_, key) => {
      expect(isSessionQuery(key)).toBe(true)
    },
  )

  it.each([
    [['cart']],
    [['product', 'samsung-galaxy-s25-ultra']],
    [['orders', 'list']],
    [['geo', 'provinces']],
    [['me-not', 'x']],
  ])('%j is not', (key) => {
    expect(isSessionQuery(key)).toBe(false)
  })
})

describe('VIEWER_AWARE_QUERIES', () => {
  it('the checkout’s shipping options go with the cart (read by guests too, per viewer)', async () => {
    const client = createQueryClient()
    const key = [...SHIPPING_OPTIONS_KEY, 'signature']
    client.setQueryData(key, { options: [], adjustments: [] })
    expect(isSessionQuery(key)).toBe(false)
    await clearViewerQueries(client)
    expect(client.getQueryData(key)).toBeUndefined()
  })
})

describe('useAccountQuery', () => {
  it('refuses a key outside SESSION_QUERIES, naming it and where to register it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { wrapper } = clientProviders({ hasSession: true })
    expect(() =>
      renderHook(() => useAccountQuery({ queryKey: ['orders', 'list'], queryFn: async () => [] }), {
        wrapper,
      }),
    ).toThrow(/\["orders","list"\].*SESSION_QUERIES.*viewer-queries\.ts/)
  })

  it('takes a registered one', () => {
    const { wrapper } = clientProviders({ hasSession: true })
    const { result } = renderHook(
      () => useAccountQuery({ queryKey: [...SUMMARY_KEY], queryFn: async () => 1 }),
      { wrapper },
    )
    expect(result.current.isPending).toBe(true)
  })
})

import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { useMe } from '@/features/auth/use-me'
import { ApiError } from '@/lib/api/errors'
import type { UserProfile } from '@/lib/api/types/account'
import type { AuthSettings } from '@/lib/api/types/settings'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { SARA } from '../auth/fixtures'
import { authProviders } from '../support/auth-providers'

// The profile page's sections read the signed-in visitor from `['me']`, as the page hands it
// down: these render one with sara (or `me`) already in the cache, through `useMe`, so a write
// that replaces `['me']` shows on screen as it would on the page.

export interface ProfileRenderOptions {
  me?: UserProfile
  auth?: AuthSettings
}

/** Renders `section(me)` for the profile in `['me']`; a user-event with fake timers. */
export function renderWithMe(
  section: (me: UserProfile) => ReactNode,
  { me = SARA, auth }: ProfileRenderOptions = {},
) {
  const providers = authProviders({ hasSession: true, auth })
  providers.client.setQueryData(ME_KEY, me)
  function Harness() {
    const { data } = useMe()
    return data ? section(data) : null
  }
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const view = render(<Harness />, { wrapper: providers.wrapper })
  return { user, client: providers.client, ...view }
}

/** An API error as the BFF relays it (`bffFetch` rejects with it). */
export function apiError(
  status: number,
  code: string,
  detail: string,
  {
    attr = null,
    retryAfter,
    reasons,
  }: { attr?: string | null; retryAfter?: number; reasons?: string[] } = {},
): ApiError {
  return ApiError.fromBody(status, {
    msg: 'خطا',
    data: {
      type: status >= 500 ? 'server_error' : attr ? 'validation_error' : 'client_error',
      errors: [{ code, detail, attr }],
      ...(retryAfter !== undefined && { retry_after: retryAfter }),
      ...(reasons && { reasons }),
    },
  })
}

/** A 400 `validation_error` with one message per field (`[attr, detail]`). */
export function validationError(fields: Array<[string, string]>): ApiError {
  return ApiError.fromBody(400, {
    msg: 'خطا',
    data: {
      type: 'validation_error',
      errors: fields.map(([attr, detail]) => ({ code: 'invalid', detail, attr })),
    },
  })
}

/** sara after a change (the API answers the whole profile). */
export function saraWith(changes: Partial<UserProfile>): UserProfile {
  return { ...SARA, ...changes }
}

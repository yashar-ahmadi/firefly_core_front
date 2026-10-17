import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountEntry } from '@/components/layout/account-entry'
import { FeatureProvider } from '@/features/settings/feature-context'
import { clientProviders } from '../support/providers'

// The signed-in account button loads with a session only (a guest never downloads it). When its
// code cannot be downloaded, the header degrades in place: a plain link to the account page,
// never the root error page.

vi.mock('@/components/layout/account-menu-button', () =>
  Object.defineProperty({}, 'AccountMenuButton', {
    enumerable: true,
    get() {
      throw new Error('ChunkLoadError: Loading chunk failed.')
    },
  }),
)
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error')
})

afterEach(() => {
  // Nothing was thrown to an error boundary (React reports those on console.error).
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
})

describe('the signed-in account button, when its code cannot load', () => {
  it('is a plain link to the account page', async () => {
    const { wrapper: Base } = clientProviders({ hasSession: true })
    render(
      <Base>
        <FeatureProvider initial={{}}>
          <AccountEntry />
        </FeatureProvider>
      </Base>,
    )
    expect(await screen.findByRole('link', { name: 'حساب من' })).toHaveAttribute(
      'href',
      '/account/',
    )
    expect(screen.queryByRole('button')).toBeNull()
  })
})

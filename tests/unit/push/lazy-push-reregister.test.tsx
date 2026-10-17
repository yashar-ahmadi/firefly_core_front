import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LazyPushReregister } from '@/features/push/lazy-push-reregister'
import { readPushState, savePushState } from '@/features/push/push-storage'
import { OWNER, pushProviders } from './support'

// The re-register effect's code (its own chunk) is downloaded only by a browser that has web
// push on (a stored registration) and a session: a shop with push sends it to nobody else, so a
// guest's catalog page carries none of it (the JS budget, ruling P2-R4).

const mocks = vi.hoisted(() => ({ loaded: vi.fn() }))
// Each load of the chunk reads its export: counted (the module itself is imported once per file).
vi.mock('@/features/push/push-reregister', () => {
  function PushReregister() {
    return <output aria-label="re-register" />
  }
  return {
    get PushReregister() {
      mocks.loaded()
      return PushReregister
    },
  }
})
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))

const STORED = { token: 'stored-fcm-token', owner: OWNER, checkedAt: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

afterEach(() => cleanup())

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('LazyPushReregister', () => {
  it('signed in with push on in this browser: loads and runs the re-register effect', async () => {
    savePushState(STORED)
    render(<LazyPushReregister />, { wrapper: pushProviders().wrapper })
    expect(await screen.findByRole('status', { name: 're-register' })).toBeInTheDocument()
    expect(mocks.loaded).toHaveBeenCalledTimes(1)
  })

  it('signed in, push off in this browser: downloads nothing', async () => {
    render(<LazyPushReregister />, { wrapper: pushProviders().wrapper })
    await settle()
    expect(mocks.loaded).not.toHaveBeenCalled()
    expect(screen.queryByRole('status', { name: 're-register' })).toBeNull()
  })

  it('a guest: downloads nothing, and a registration left behind is forgotten', async () => {
    savePushState(STORED)
    render(<LazyPushReregister />, { wrapper: pushProviders({ hasSession: false }).wrapper })
    await settle()
    expect(mocks.loaded).not.toHaveBeenCalled()
    expect(screen.queryByRole('status', { name: 're-register' })).toBeNull()
    expect(readPushState()).toBeNull()
  })

  it('a shop without the Firebase config: downloads nothing', async () => {
    savePushState(STORED)
    render(<LazyPushReregister />, { wrapper: pushProviders({ firebase: null }).wrapper })
    await settle()
    expect(mocks.loaded).not.toHaveBeenCalled()
    expect(screen.queryByRole('status', { name: 're-register' })).toBeNull()
    expect(readPushState()).toEqual(STORED)
  })
})

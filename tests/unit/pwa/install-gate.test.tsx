import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallPromptGate } from '@/features/pwa/install-prompt-gate'
import { MAY_OFFER_EVENT, MAY_OFFER_FLAG } from '@/features/pwa/install-flag'
import { directImports } from '../support/import-graph'

// The shop layout's gate for the install prompt (FEATURE_PWA): the device's verdict comes from
// the registration script (install-offer.test.ts); the gate only reads it, so the prompt's code
// downloads for an offered device alone and every other visitor gets this gate and nothing more.

const mocks = vi.hoisted(() => ({ loaded: vi.fn() }))
vi.mock('@/features/pwa/install-prompt', () => {
  mocks.loaded()
  return { InstallPrompt: ({ name }: { name: string }) => <p>prompt for {name}</p> }
})

const flag = window as unknown as Record<string, unknown>

beforeEach(() => {
  mocks.loaded.mockClear()
})

afterEach(() => {
  delete flag[MAY_OFFER_FLAG]
})

describe('InstallPromptGate', () => {
  it('reads the verdict’s two names alone; the prompt is a chunk of its own (import())', () => {
    // The gate is in every shop page's bundle (Turbopack bundles a layout's client components,
    // rendered or not): the prompt's names and code must not come with it.
    expect(directImports('src/features/pwa/install-prompt-gate.tsx')).toEqual([
      'src/features/pwa/install-flag.ts',
      'src/features/pwa/install-prompt.tsx',
    ])
  })

  it('a device not offered: nothing, and none of the prompt’s code', async () => {
    render(<InstallPromptGate name="فایرفلای" />)
    await act(async () => {})
    expect(screen.queryByText(/prompt for/)).not.toBeInTheDocument()
    expect(mocks.loaded).not.toHaveBeenCalled()
  })

  it('a device offered before the page hydrated: the prompt loads', async () => {
    flag[MAY_OFFER_FLAG] = true
    render(<InstallPromptGate name="فایرفلای" />)
    expect(await screen.findByText('prompt for فایرفلای')).toBeInTheDocument()
  })

  it('offered after it hydrated (the script ran later): its event loads the prompt then', async () => {
    render(<InstallPromptGate name="فایرفلای" />)
    await act(async () => {
      flag[MAY_OFFER_FLAG] = true
      window.dispatchEvent(new Event(MAY_OFFER_EVENT))
    })
    expect(await screen.findByText('prompt for فایرفلای')).toBeInTheDocument()
  })
})

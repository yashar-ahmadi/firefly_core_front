import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DeferredMenu, type DeferredMenuProps } from '@/components/ui/deferred-menu'

/** A stand-in for the lazily loaded Radix menu: shows how it was opened. */
function FakeMenu({ trigger, opening }: DeferredMenuProps) {
  return (
    <div>
      {trigger}
      <p>{opening.byKeyboard ? 'opened from the keyboard' : 'opened by a press'}</p>
    </div>
  )
}

/** A `load` the test resolves or rejects by hand. */
function deferredLoad() {
  let resolve!: (menu: ComponentType<DeferredMenuProps>) => void
  let reject!: (error: Error) => void
  const promise = new Promise<ComponentType<DeferredMenuProps>>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { load: vi.fn(() => promise), resolve, reject }
}

function renderMenu(
  load: () => Promise<ComponentType<DeferredMenuProps>>,
  onUnavailable = vi.fn(),
) {
  render(
    <DeferredMenu
      load={load}
      props={{}}
      onUnavailable={onUnavailable}
      trigger={<button type="button">راهنما</button>}
    />,
  )
  return screen.getByRole('button', { name: 'راهنما' })
}

describe('DeferredMenu', () => {
  it('is a menu button before its code loads, and preloads on hover or focus', () => {
    const { load } = deferredLoad()
    const button = renderMenu(load)
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.focus(button)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('shows a spinner in the button while the code downloads after a press, then the menu', async () => {
    const { load, resolve } = deferredLoad()
    const button = renderMenu(load)
    expect(button.querySelector('.animate-spin')).toBeNull()
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.animate-spin')).not.toBeNull()
    await act(async () => resolve(FakeMenu))
    expect(screen.getByText('opened by a press')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'راهنما' }).querySelector('.animate-spin')).toBeNull()
  })

  it('opens from Enter, Space or Down as a keyboard opening', async () => {
    const { load, resolve } = deferredLoad()
    const button = renderMenu(load)
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    await act(async () => resolve(FakeMenu))
    expect(screen.getByText('opened from the keyboard')).toBeInTheDocument()
  })

  it('hands a failed download to its owner and drops the busy state', async () => {
    const { load, reject } = deferredLoad()
    const onUnavailable = vi.fn()
    const button = renderMenu(load, onUnavailable)
    fireEvent.click(button)
    await act(async () => reject(new Error('ChunkLoadError')))
    expect(onUnavailable).toHaveBeenCalledTimes(1)
    expect(button).not.toHaveAttribute('aria-busy')
    expect(button.querySelector('.animate-spin')).toBeNull()
  })
})

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { useMediaQuery } from '@/components/ui/use-media-query'
import { focusedElement, minWidth, stubBrowserApis } from '../support/dom-stubs'

const media = stubBrowserApis()

beforeEach(() => {
  media.set(() => false)
})

describe('useMediaQuery', () => {
  function Probe() {
    return <span>{useMediaQuery('(min-width: 48rem)') ? 'wide' : 'narrow'}</span>
  }

  it('uses the fallback on the server and follows the query on the client', () => {
    media.set(minWidth(48))
    expect(renderToString(<Probe />)).toContain('narrow')

    render(<Probe />)
    expect(screen.getByText('wide')).toBeInTheDocument()
    act(() => media.set(() => false))
    expect(screen.getByText('narrow')).toBeInTheDocument()
  })
})

describe('Sheet', () => {
  function FilterSheet({ onOpenChange = vi.fn(), hideTitle = false }) {
    return (
      <Sheet
        open
        onOpenChange={onOpenChange}
        title="فیلترها"
        hideTitle={hideTitle}
        footer={<Button>نمایش نتایج</Button>}
      >
        <p>فهرست فیلترها</p>
      </Sheet>
    )
  }

  it('renders nothing on the server, so its two variants never mismatch on hydration', () => {
    expect(renderToString(<FilterSheet />)).toBe('')
  })

  it('is a bottom sheet below md, with its footer', () => {
    render(<FilterSheet />)
    const sheet = screen.getByRole('dialog', { name: 'فیلترها' })
    expect(sheet).toHaveAttribute('data-vaul-drawer-direction', 'bottom')
    expect(within(sheet).getByRole('button', { name: 'نمایش نتایج' })).toBeInTheDocument()
  })

  it('is a side drawer from the start (right) side at md and up', () => {
    media.set(minWidth(48))
    render(<FilterSheet />)
    const sheet = screen.getByRole('dialog', { name: 'فیلترها' })
    expect(sheet).not.toHaveAttribute('data-vaul-drawer')
    expect(sheet).toHaveAttribute('data-side', 'start')
    expect(within(sheet).getByText('فهرست فیلترها')).toBeInTheDocument()
  })

  it('keeps a visually hidden title as its accessible name', () => {
    render(<FilterSheet hideTitle />)
    expect(screen.getByRole('dialog', { name: 'فیلترها' })).toBeInTheDocument()
    expect(screen.getByText('فیلترها')).toHaveClass('sr-only')
  })

  it('asks to close from its close button', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<FilterSheet onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: 'بستن' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('Sheet focus', () => {
  function Opener() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>فیلترها</Button>
        <Sheet open={open} onOpenChange={setOpen} title="فیلترها">
          <button type="button">برند</button>
        </Sheet>
      </>
    )
  }

  it.each([
    ['bottom sheet', () => false],
    ['side drawer', minWidth(48)],
  ])('moves focus into the %s and back to its opener on close', async (_variant, matcher) => {
    media.set(matcher)
    const user = userEvent.setup()
    render(<Opener />)
    const opener = screen.getByRole('button', { name: 'فیلترها' })
    await user.click(opener)
    const sheet = screen.getByRole('dialog', { name: 'فیلترها' })
    await waitFor(() => expect(sheet).toContainElement(focusedElement()))

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })
})

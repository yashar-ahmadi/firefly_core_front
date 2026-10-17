import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MapUnavailable } from '@/features/geo/map-unavailable'

// The map's fallback takes the focus only from where the picker had it (its region, or the page's
// body once the focused map went): after a slow failure, the visitor may be typing elsewhere.

function Form({ failed }: { failed: boolean }) {
  return (
    <form>
      <input aria-label="کد پستی" />
      <div data-map-region="" tabIndex={-1} role="group" aria-label="انتخاب موقعیت">
        {failed ? <MapUnavailable onCancel={vi.fn()} /> : <span>در حال بارگذاری نقشه</span>}
      </div>
    </form>
  )
}

function Harness() {
  const [failed, setFailed] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setFailed(true)}>
        fail
      </button>
      <Form failed={failed} />
    </>
  )
}

/** The map fails: a bare event, which moves no focus. */
function fail() {
  fireEvent.click(screen.getByRole('button', { name: 'fail' }))
}

describe('MapUnavailable: the focus', () => {
  it('takes it while it is still in the picker’s region', async () => {
    render(<Harness />)
    screen.getByRole('group', { name: 'انتخاب موقعیت' }).focus()
    fail()
    expect(await screen.findByRole('button', { name: 'بستن نقشه' })).toHaveFocus()
  })

  it('takes it from the page’s body (the focused map went)', async () => {
    render(<Harness />)
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(document.activeElement).toBe(document.body)
    fail()
    expect(await screen.findByRole('button', { name: 'بستن نقشه' })).toHaveFocus()
  })

  it('leaves it on a field the visitor moved to meanwhile', async () => {
    render(<Harness />)
    const postal = screen.getByRole('textbox', { name: 'کد پستی' })
    postal.focus()
    fail()
    expect(await screen.findByRole('button', { name: 'بستن نقشه' })).not.toHaveFocus()
    expect(postal).toHaveFocus()
  })
})

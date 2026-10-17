import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { GeoPoint } from '@/features/geo/coordinates'
import { LocationField } from '@/features/geo/location-field'

// Opening the map replaces the pressed button: the focus must land in the picker at once (while
// its code still loads too), on a region whose name says how the map works, never on the page.

const mocks = vi.hoisted(() => ({ loaded: () => {} }))
vi.mock('@/features/geo/map-picker', async () => {
  // The picker's code arrives when the test says so.
  await new Promise<void>((resolve) => (mocks.loaded = resolve))
  return {
    MapPicker: ({ onCancel }: { onCancel: () => void }) => (
      <div>
        <div role="application" aria-label="نقشه" tabIndex={0} />
        <button type="button" onClick={onCancel}>
          انصراف
        </button>
      </div>
    ),
  }
})

function Harness() {
  const [value, setValue] = useState<GeoPoint | null>(null)
  return <LocationField value={value} onChange={setValue} />
}

describe('LocationField: the focus when the map opens', () => {
  it('moves into the picker’s region, named with how to use it, even while the code loads', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    // A bare click (no hover preload): vitest hands a second import of a mocked module that is
    // still loading the real module.
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب موقعیت روی نقشه' }))
    const region = screen.getByRole('group', { name: /^انتخاب موقعیت روی نقشه/ })
    expect(region).toHaveAccessibleName(expect.stringContaining('کلیدهای جهت‌نما'))
    expect(region).toHaveAccessibleName(expect.stringContaining('«تأیید موقعیت»'))
    await waitFor(() => expect(region).toHaveFocus())
    // Still loading: the focus stays in the region.
    expect(screen.queryByRole('application')).toBeNull()
    await act(async () => mocks.loaded())
    expect(await screen.findByRole('application', { name: 'نقشه' })).toBeInTheDocument()
    expect(region.contains(document.activeElement)).toBe(true)
    // Tab goes on into the map.
    await user.tab()
    expect(screen.getByRole('application', { name: 'نقشه' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'انصراف' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'انتخاب موقعیت روی نقشه' })).toHaveFocus(),
    )
  })
})

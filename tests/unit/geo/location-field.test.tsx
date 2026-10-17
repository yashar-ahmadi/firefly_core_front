import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeoPoint } from '@/features/geo/coordinates'
import { LocationField } from '@/features/geo/location-field'
import { MAP_UNAVAILABLE } from '@/features/geo/map-unavailable'

// The form's location block: buttons only until the visitor asks for the map, whose code then
// loads (next/dynamic). Here that code cannot be downloaded: the block says so in place and the
// form goes on (the location is optional); nothing reaches an error boundary.

const mocks = vi.hoisted(() => ({
  /** A module whose export cannot be read: every load fails as a missing chunk does. */
  broken: (name: string) =>
    Object.defineProperty({}, name, {
      enumerable: true,
      get() {
        throw new Error('ChunkLoadError: Loading chunk failed.')
      },
    }),
}))
vi.mock('@/features/geo/map-picker', () => mocks.broken('MapPicker'))

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error')
})

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
})

function Harness({ initial = null }: { initial?: GeoPoint | null }) {
  const [value, setValue] = useState<GeoPoint | null>(initial)
  return (
    <>
      <LocationField value={value} onChange={setValue} />
      <output data-testid="value">{value ? `${value.latitude},${value.longitude}` : 'none'}</output>
    </>
  )
}

describe('LocationField', () => {
  it('a map whose code cannot load: says so, closes, and the form goes on without it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('موقعیتی روی نقشه انتخاب نشده است.')).toBeInTheDocument()
    const open = screen.getByRole('button', { name: 'انتخاب موقعیت روی نقشه' })
    // A bare click, without the pointer's hover preload: vitest hands a second import of a mocked
    // module that is still loading the real module.
    fireEvent.click(open)
    expect(await screen.findByRole('alert')).toHaveTextContent(MAP_UNAVAILABLE)
    await user.click(screen.getByRole('button', { name: 'بستن نقشه' }))
    expect(screen.queryByRole('alert')).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'انتخاب موقعیت روی نقشه' })).toHaveFocus(),
    )
    expect(screen.getByTestId('value')).toHaveTextContent('none')
  })

  it('a saved point: «تغییر موقعیت» and «حذف موقعیت», which clears both coordinates', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ latitude: 35.7564, longitude: 51.41 }} />)
    expect(screen.getByText('موقعیت روی نقشه انتخاب شده است.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تغییر موقعیت' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'حذف موقعیت' }))
    expect(screen.getByTestId('value')).toHaveTextContent('none')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'انتخاب موقعیت روی نقشه' })).toHaveFocus(),
    )
  })
})

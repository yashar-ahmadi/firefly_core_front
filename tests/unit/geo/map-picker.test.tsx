import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicStoreConfig } from '@/config/resolve-store-config'
import { LOCATE_MESSAGES } from '@/features/geo/geolocate'
import { MapPicker } from '@/features/geo/map-picker'
import { StoreConfigProvider } from '@/lib/config-context'
import { stubBrowserApis } from '../support/dom-stubs'

// The map picker (the map's chunk): a fixed pin at the centre of a map the visitor pans, read on
// `moveend`, confirmed with «تأیید موقعیت»; «موقعیت من» only on a tap. Leaflet itself is mocked
// here (map-engine.test covers how it is set up).

type Handler = () => void

const mocks = vi.hoisted(() => ({
  loadLeaflet: vi.fn(),
  createPickerMap: vi.fn(),
  locate: vi.fn(),
}))
vi.mock('@/features/geo/map-engine', () => ({
  loadLeaflet: mocks.loadLeaflet,
  createPickerMap: mocks.createPickerMap,
}))
vi.mock('@/features/geo/geolocate', async (original) => ({
  ...(await original<typeof import('@/features/geo/geolocate')>()),
  locate: mocks.locate,
}))

/** A map whose centre the test moves, as a visitor's pan would. */
function fakeMap() {
  const listeners = new Map<string, Handler[]>()
  let centre = { lat: 0, lng: 0 }
  const map = {
    on: vi.fn((name: string, handler: Handler) => {
      listeners.set(name, [...(listeners.get(name) ?? []), handler])
      return map
    }),
    getCenter: () => ({ wrap: () => centre }),
    setView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    remove: vi.fn(),
    pan(lat: number, lng: number) {
      for (const handler of listeners.get('movestart') ?? []) handler()
      centre = { lat, lng }
      for (const handler of listeners.get('moveend') ?? []) handler()
    },
  }
  return map
}

let map: ReturnType<typeof fakeMap>

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  map = fakeMap()
  mocks.loadLeaflet.mockResolvedValue({})
  mocks.createPickerMap.mockImplementation(() => map)
})

const config = (map: PublicStoreConfig['map']) => ({ map }) as PublicStoreConfig

function renderPicker(
  props: Partial<Parameters<typeof MapPicker>[0]> = {},
  storeMap: PublicStoreConfig['map'] = { provider: 'osm', neshanKey: null },
) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StoreConfigProvider value={config(storeMap)}>{children}</StoreConfigProvider>
  )
  const view = render(
    <MapPicker initial={null} onConfirm={onConfirm} onCancel={onCancel} {...props} />,
    { wrapper },
  )
  return { onConfirm, onCancel, unmount: view.unmount, user: userEvent.setup() }
}

const mapRegion = () => screen.getByRole('application', { name: /نقشه/ })

describe('MapPicker', () => {
  it('opens on Tehran with nothing known, left-to-right inside the RTL page; no location asked', async () => {
    renderPicker()
    await waitFor(() => expect(mocks.createPickerMap).toHaveBeenCalledOnce())
    const [, element, options] = mocks.createPickerMap.mock.calls[0]!
    expect(element).toBe(mapRegion())
    expect(mapRegion()).toHaveAttribute('dir', 'ltr')
    expect(options).toMatchObject({
      tiles: { provider: 'osm' },
      view: { centre: { latitude: 35.6997, longitude: 51.338 }, zoom: 12 },
    })
    expect(mocks.locate).not.toHaveBeenCalled()
  })

  it('opens on the saved point, else on the chosen province’s capital', async () => {
    renderPicker({ initial: { latitude: 35.7564, longitude: 51.41 }, provinceName: 'اصفهان' })
    await waitFor(() => expect(mocks.createPickerMap).toHaveBeenCalledOnce())
    expect(mocks.createPickerMap.mock.calls[0]![2].view.centre).toEqual({
      latitude: 35.7564,
      longitude: 51.41,
    })
  })

  it('a Neshan store maps with Neshan', async () => {
    renderPicker({ provinceName: 'اصفهان' }, { provider: 'neshan', neshanKey: 'web.key-1234567' })
    await waitFor(() => expect(mocks.createPickerMap).toHaveBeenCalledOnce())
    expect(mocks.loadLeaflet).toHaveBeenCalledWith({ provider: 'neshan', key: 'web.key-1234567' })
    const { view } = mocks.createPickerMap.mock.calls[0]![2]
    expect(view.centre.latitude).toBeCloseTo(32.65, 1)
  })

  it('confirms the point under the pin after a pan, rounded to 6 decimals', async () => {
    const { onConfirm, user } = renderPicker()
    await waitFor(() => expect(mocks.createPickerMap).toHaveBeenCalledOnce())
    act(() => map.pan(35.68919832153, 51.38900049))
    await user.click(screen.getByRole('button', { name: 'تأیید موقعیت' }))
    expect(onConfirm).toHaveBeenCalledWith({ latitude: 35.689198, longitude: 51.389 })
  })

  it('zooms with its own 44px buttons and cancels without a point', async () => {
    const { onCancel, onConfirm, user } = renderPicker()
    await waitFor(() => expect(mocks.createPickerMap).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: 'بزرگ‌نمایی' }))
    await user.click(screen.getByRole('button', { name: 'کوچک‌نمایی' }))
    expect(map.zoomIn).toHaveBeenCalledOnce()
    expect(map.zoomOut).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('«موقعیت من» on a tap: the map goes there', async () => {
    mocks.locate.mockResolvedValue({ ok: true, point: { latitude: 35.75, longitude: 51.41 } })
    const { user } = renderPicker()
    await waitFor(() => expect(mocks.createPickerMap).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: 'موقعیت من' }))
    await waitFor(() =>
      expect(map.setView).toHaveBeenCalledWith([35.75, 51.41], 17, expect.any(Object)),
    )
  })

  it('«موقعیت من» refused: a polite sentence, the map stays usable', async () => {
    mocks.locate.mockResolvedValue({ ok: false, message: LOCATE_MESSAGES.denied })
    const { user } = renderPicker()
    await waitFor(() => expect(mocks.createPickerMap).toHaveBeenCalledOnce())
    await user.click(screen.getByRole('button', { name: 'موقعیت من' }))
    expect(await screen.findByRole('status')).toHaveTextContent(LOCATE_MESSAGES.denied)
    expect(map.setView).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'تأیید موقعیت' })).toBeEnabled()
  })

  it('Leaflet that cannot load: says so in place, the address can still be saved', async () => {
    mocks.loadLeaflet.mockRejectedValue(new Error('ChunkLoadError'))
    const { onCancel, user } = renderPicker()
    expect(
      await screen.findByText('نقشه بارگذاری نشد؛ می‌توانید بدون نقشه ادامه دهید.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تأیید موقعیت' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'بستن نقشه' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('removes the Leaflet map when the picker goes', async () => {
    const { unmount } = renderPicker()
    await waitFor(() => expect(mocks.createPickerMap).toHaveBeenCalledOnce())
    expect(map.remove).not.toHaveBeenCalled()
    unmount()
    expect(map.remove).toHaveBeenCalledOnce()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_VIEW, roundCoordinate, toGeoPoint } from '@/features/geo/coordinates'
import { LOCATE_MESSAGES, locate } from '@/features/geo/geolocate'
import { provinceView } from '@/features/geo/province-centres'
import { mapTiles, OSM_TILES, tileErrorBurst } from '@/features/geo/tile-config'

// The map picker's pure parts: which tiles a store shows, the rounding the API stores (6 dp),
// where the map opens, and «موقعیت من» (geolocation, only on a tap).

describe('mapTiles', () => {
  it('shows Neshan when the store has a Neshan key', () => {
    expect(mapTiles({ provider: 'neshan', neshanKey: 'web.0123456789abcdef' })).toEqual({
      provider: 'neshan',
      key: 'web.0123456789abcdef',
    })
  })

  it('shows OpenStreetMap otherwise, with its attribution', () => {
    expect(mapTiles({ provider: 'osm', neshanKey: null })).toEqual({ provider: 'osm' })
    // A provider without a key cannot show Neshan's tiles.
    expect(mapTiles({ provider: 'neshan', neshanKey: null })).toEqual({ provider: 'osm' })
    expect(mapTiles({ provider: 'neshan', neshanKey: '  ' })).toEqual({ provider: 'osm' })
    expect(OSM_TILES.url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(OSM_TILES.attribution).toContain('OpenStreetMap')
    expect(OSM_TILES.attribution.replace(/<[^>]+>/g, '')).toBe('© OpenStreetMap contributors')
  })
})

describe('tileErrorBurst', () => {
  it('reports a burst of failed tiles within the window, once', () => {
    const failed = tileErrorBurst({ limit: 3, windowMs: 1000 })
    expect(failed(0)).toBe(false)
    expect(failed(100)).toBe(false)
    expect(failed(200)).toBe(true)
    // Reported: the map has moved to the fallback by then.
    expect(failed(300)).toBe(false)
  })

  it('forgets failures older than the window (a tile now and then is no outage)', () => {
    const failed = tileErrorBurst({ limit: 3, windowMs: 1000 })
    expect(failed(0)).toBe(false)
    expect(failed(900)).toBe(false)
    expect(failed(2000)).toBe(false)
    expect(failed(2500)).toBe(false)
    expect(failed(2600)).toBe(true)
  })
})

describe('coordinates', () => {
  it('rounds to 6 decimals, as the API stores them', () => {
    expect(roundCoordinate(35.6891983215332)).toBe(35.689198)
    expect(roundCoordinate(51.3380005)).toBe(51.338001)
    expect(roundCoordinate(35.7)).toBe(35.7)
    expect(toGeoPoint(35.68919832, 51.41000049)).toEqual({ latitude: 35.689198, longitude: 51.41 })
  })

  it('opens on Tehran when nothing better is known', () => {
    expect(DEFAULT_VIEW).toEqual({ centre: { latitude: 35.6997, longitude: 51.338 }, zoom: 12 })
  })
})

describe('provinceView', () => {
  it('opens on the chosen province’s capital, found by its name (never by an id)', () => {
    expect(provinceView('اصفهان')?.centre.latitude).toBeCloseTo(32.65, 1)
    expect(provinceView('اصفهان')?.centre.longitude).toBeCloseTo(51.67, 1)
    // Arabic letters and stray spaces are the same name.
    expect(provinceView(' كرمانشاه ')).toEqual(provinceView('کرمانشاه'))
    expect(provinceView('آذربایجان شرقی')?.centre.latitude).toBeCloseTo(38.08, 1)
  })

  it('knows nothing of a name it does not have', () => {
    expect(provinceView('نامعلوم')).toBeNull()
    expect(provinceView(undefined)).toBeNull()
  })
})

describe('locate («موقعیت من»)', () => {
  const geolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation')

  afterEach(() => {
    if (geolocation) Object.defineProperty(navigator, 'geolocation', geolocation)
    else Reflect.deleteProperty(navigator, 'geolocation')
  })

  function stubGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']) {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    })
  }

  it('answers the position, rounded, asking with a timeout', async () => {
    const ask = vi.fn<Geolocation['getCurrentPosition']>((success) =>
      success({
        coords: { latitude: 35.75641234567, longitude: 51.4100009 },
      } as GeolocationPosition),
    )
    stubGeolocation(ask)
    await expect(locate()).resolves.toEqual({
      ok: true,
      point: { latitude: 35.756412, longitude: 51.410001 },
    })
    expect(ask.mock.calls[0]![2]).toMatchObject({ timeout: expect.any(Number) })
  })

  it('says why politely when the visitor refuses, it times out or the browser cannot', async () => {
    const fail = (code: number) =>
      stubGeolocation((_success, error) =>
        error?.({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as never),
      )
    fail(1)
    await expect(locate()).resolves.toEqual({ ok: false, message: LOCATE_MESSAGES.denied })
    fail(3)
    await expect(locate()).resolves.toEqual({ ok: false, message: LOCATE_MESSAGES.failed })
    fail(2)
    await expect(locate()).resolves.toEqual({ ok: false, message: LOCATE_MESSAGES.failed })
    stubGeolocation(() => {
      throw new Error('blocked by a permissions policy')
    })
    await expect(locate()).resolves.toEqual({ ok: false, message: LOCATE_MESSAGES.failed })
    Reflect.deleteProperty(navigator, 'geolocation')
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
    await expect(locate()).resolves.toEqual({ ok: false, message: LOCATE_MESSAGES.unsupported })
  })
})

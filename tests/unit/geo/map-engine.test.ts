import { describe, expect, it, vi } from 'vitest'
import { createPickerMap, loadLeaflet, type Leaflet } from '@/features/geo/map-engine'
import { OSM_TILES } from '@/features/geo/tile-config'

// The Leaflet side of the picker: which build loads (plain Leaflet, or Neshan's SDK for a Neshan
// store), how the map is set up (no Leaflet zoom control: the picker draws 44px buttons;
// keyboard panning; no animation for reduced motion), and the switch to OpenStreetMap when
// Neshan's tiles fail.

const mocks = vi.hoisted(() => ({
  leaflet: { Map: function Map() {}, marker: 'plain' },
  neshan: { Map: function Map() {}, marker: 'neshan' },
}))
// Leaflet is CommonJS (the namespace's `default` is it); the SDK is a UMD whose export wraps it
// in a second `default`.
vi.mock('leaflet', () => ({ default: mocks.leaflet }))
vi.mock('@neshan-maps-platform/leaflet', () => ({ default: { default: mocks.neshan } }))

type Handler = (event?: unknown) => void

/** A tile layer that records its handlers, so a test can fire `tileerror`. */
function fakeLayer(url: string) {
  const handlers = new Map<string, Handler>()
  return {
    url,
    getTileUrl: () => url,
    on: vi.fn((name: string, handler: Handler) => handlers.set(name, handler)),
    fire: (name: string) => handlers.get(name)?.(),
  }
}

type FakeLayer = ReturnType<typeof fakeLayer>

/** A Leaflet stand-in: `new L.Map` records its options and holds layers. */
function fakeLeaflet(sdkLayers: FakeLayer[] = []) {
  const layers = new Set<FakeLayer>(sdkLayers)
  const listeners = new Map<string, Handler>()
  const map = {
    options: {} as Record<string, unknown>,
    attributionControl: { setPrefix: vi.fn() },
    eachLayer: (each: (layer: FakeLayer) => void) => [...layers].forEach(each),
    removeLayer: vi.fn((layer: FakeLayer) => layers.delete(layer)),
    on: vi.fn((name: string, handler: Handler) => listeners.set(name, handler)),
    layers,
  }
  const tileLayer = vi.fn((url: string, options: Record<string, unknown>) => {
    const layer = Object.assign(fakeLayer(url), { options })
    return Object.assign(layer, {
      addTo: () => {
        layers.add(layer)
        listeners.get('layeradd')?.({ layer })
        return layer
      },
    })
  })
  const L = {
    Map: vi.fn(function (this: unknown, element: HTMLElement, options: Record<string, unknown>) {
      map.options = { element, ...options }
      return map
    }),
    tileLayer,
  }
  return { L: L as unknown as Leaflet, map, tileLayer, layers }
}

const VIEW = { centre: { latitude: 35.6997, longitude: 51.338 }, zoom: 12 }

describe('loadLeaflet', () => {
  it('loads plain Leaflet for OpenStreetMap and Neshan’s SDK for a Neshan store', async () => {
    expect(await loadLeaflet({ provider: 'osm' })).toBe(mocks.leaflet)
    expect(await loadLeaflet({ provider: 'neshan', key: 'web.key' })).toBe(mocks.neshan)
  })
})

describe('createPickerMap', () => {
  it('OpenStreetMap: its standard layer with the attribution, our own zoom buttons, keys pan', () => {
    const { L, map, tileLayer } = fakeLeaflet()
    const element = document.createElement('div')
    createPickerMap(L, element, { tiles: { provider: 'osm' }, view: VIEW, reducedMotion: false })
    expect(map.options).toMatchObject({
      element,
      center: [35.6997, 51.338],
      zoom: 12,
      zoomControl: false,
      attributionControl: true,
      keyboard: true,
      zoomAnimation: true,
    })
    expect(map.options).not.toHaveProperty('key')
    expect(tileLayer).toHaveBeenCalledWith(OSM_TILES.url, {
      attribution: OSM_TILES.attribution,
      maxZoom: OSM_TILES.maxZoom,
    })
    // Leaflet's own «Leaflet» prefix goes; the provider's attribution stays.
    expect(map.attributionControl.setPrefix).toHaveBeenCalledWith(false)
  })

  it('reduced motion: no zoom, fade or inertia animation', () => {
    const { L, map } = fakeLeaflet()
    const element = document.createElement('div')
    createPickerMap(L, element, { tiles: { provider: 'osm' }, view: VIEW, reducedMotion: true })
    expect(map.options).toMatchObject({
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      inertia: false,
    })
  })

  it('Neshan: the SDK draws its own layers with the key; a burst of failed tiles turns to OSM', () => {
    const sdk = [fakeLayer('neshan'), fakeLayer('neshan-labels')]
    const { L, map, tileLayer, layers } = fakeLeaflet(sdk)
    const onTilesFallback = vi.fn()
    const element = document.createElement('div')
    createPickerMap(L, element, {
      tiles: { provider: 'neshan', key: 'web.0123456789abcdef' },
      view: VIEW,
      reducedMotion: false,
      onTilesFallback,
    })
    expect(map.options).toMatchObject({ key: 'web.0123456789abcdef', maptype: 'neshan' })
    expect(tileLayer).not.toHaveBeenCalled()

    // A tile lost now and then is no outage.
    sdk[0]!.fire('tileerror')
    expect(onTilesFallback).not.toHaveBeenCalled()
    for (let tile = 0; tile < 6; tile++) sdk[1]!.fire('tileerror')
    expect(onTilesFallback).toHaveBeenCalledOnce()
    expect(map.removeLayer).toHaveBeenCalledTimes(2)
    expect(tileLayer).toHaveBeenCalledWith(OSM_TILES.url, expect.any(Object))
    expect([...layers].map((layer) => layer.url)).toEqual([OSM_TILES.url])
  })
})

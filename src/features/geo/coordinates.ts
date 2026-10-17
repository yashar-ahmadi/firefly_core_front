// A point on the map as the API stores it (cart digest §7.2): both coordinates or neither,
// 6 decimals. Pure.

export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface MapView {
  centre: GeoPoint
  zoom: number
}

/** 6 decimals (about 11 cm): what the API keeps of a coordinate. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

export function toGeoPoint(latitude: number, longitude: number): GeoPoint {
  return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) }
}

/** A city's districts in view. */
export const CITY_ZOOM = 12

/** Where the map opens when nothing better is known: Tehran. */
export const DEFAULT_VIEW: MapView = {
  centre: { latitude: 35.6997, longitude: 51.338 },
  zoom: CITY_ZOOM,
}

/** Close enough to put a pin on a door. */
export const STREET_ZOOM = 17

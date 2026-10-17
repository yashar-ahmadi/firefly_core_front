import { toGeoPoint, type GeoPoint } from './coordinates'

// «موقعیت من»: the browser's position, asked only when the visitor taps it. Every way it can
// fail is a sentence, never an exception. Pure apart from `navigator.geolocation`.

export type LocateResult = { ok: true; point: GeoPoint } | { ok: false; message: string }

export const LOCATE_MESSAGES = {
  denied:
    'اجازهٔ دسترسی به موقعیت شما داده نشد. می‌توانید نقشه را جابه‌جا کنید تا نشانگر روی محل قرار بگیرد.',
  failed: 'موقعیت شما پیدا نشد. نقشه را جابه‌جا کنید تا نشانگر روی محل قرار بگیرد.',
  unsupported: 'این مرورگر موقعیت‌یابی ندارد. نقشه را جابه‌جا کنید تا نشانگر روی محل قرار بگیرد.',
} as const

/** Long enough for a phone's GPS to answer indoors, short enough not to keep anyone waiting. */
const TIMEOUT_MS = 10_000
/** A position from the last minute is good enough for a delivery address. */
const MAX_AGE_MS = 60_000

export function locate(): Promise<LocateResult> {
  const geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation
  if (!geolocation) return Promise.resolve({ ok: false, message: LOCATE_MESSAGES.unsupported })
  return new Promise((resolve) => {
    try {
      geolocation.getCurrentPosition(
        ({ coords }) => resolve({ ok: true, point: toGeoPoint(coords.latitude, coords.longitude) }),
        (error) =>
          resolve({
            ok: false,
            message:
              error.code === error.PERMISSION_DENIED
                ? LOCATE_MESSAGES.denied
                : LOCATE_MESSAGES.failed,
          }),
        { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
      )
    } catch {
      // A permissions policy or an odd browser can throw instead of calling back.
      resolve({ ok: false, message: LOCATE_MESSAGES.failed })
    }
  })
}

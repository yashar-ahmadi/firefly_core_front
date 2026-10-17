import { bffFetch } from '@/lib/api/client'
import type { PushDeviceRequest, PushDeviceUnregister } from '@/lib/api/types/notification'

// This browser as a push device (dashboard digest §4.3), through the BFF. Pure (no React).

/**
 * `POST devices/` (201 new, 200 known: both success): an upsert by token, across every account,
 * so a token used by someone else before moves to this visitor. `name` is kept when left out.
 */
export async function registerDevice(token: string, name?: string): Promise<void> {
  const body: PushDeviceRequest = { registration_id: token, type: 'web', ...(name ? { name } : {}) }
  await bffFetch('devices/', { method: 'POST', body })
}

/** `DELETE devices/unregister/` with a JSON body: always 200, whoever's the device was. */
export async function unregisterDevice(token: string): Promise<void> {
  const body: PushDeviceUnregister = { registration_id: token }
  await bffFetch('devices/unregister/', { method: 'DELETE', body })
}

/**
 * Notifications and push devices (dashboard digest §4). Pure types: safe in any bundle.
 */

/** One row of `GET notification/list/`: the visitor's own notifications and every broadcast. */
export interface NotificationItem {
  id: number
  /** At most 255 characters; the push's first line. */
  title: string
  /** Plain text (never HTML), any length; line breaks are meant. */
  body: string
  /** An absolute URL on the API host, or null. */
  image: string | null
  /** Operator free text: nothing is built on it. */
  topic: string | null
  /** 'normal' today; an unknown future value reads as 'normal'. */
  notification_type: string
  /** Reserved: always null (no deep links). */
  related_object: number | null
  /** This visitor's read state (a broadcast is read per visitor). */
  is_read: boolean
  /** When the operator created it (the list's order), not when it was sent. */
  created: string
  updated: string
}

/** Every platform goes through Firebase Cloud Messaging; the storefront registers 'web'. */
export type PushDeviceType = 'ios' | 'android' | 'web'

/**
 * `POST devices/`: an upsert by `registration_id` (the FCM token), across every account. Never
 * send `active` (false would register a muted device).
 */
export interface PushDeviceRequest {
  registration_id: string
  type: PushDeviceType
  /** At most 255 characters, a label in the panel; kept when left out on a re-register. */
  name?: string
}

/** `DELETE devices/unregister/`'s JSON body: always 200, whoever's the device is. */
export interface PushDeviceUnregister {
  registration_id: string
}

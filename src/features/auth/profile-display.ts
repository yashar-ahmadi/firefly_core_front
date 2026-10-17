import type { UserProfile } from '@/lib/api/types/account'
import { formatIranMobile } from '@/lib/format/phone'

// How the signed-in visitor is shown (the header's account button and menu). Pure: safe in any
// bundle, the header's included.

/** `full_name`, else the email, else the mobile number (`formatIranMobile`), else ''. */
export function profileName(profile: UserProfile): string {
  const fullName = profile.full_name.trim()
  if (fullName) return fullName
  if (profile.email) return profile.email
  return profile.phone_number ? formatIranMobile(profile.phone_number) : ''
}

/** The email or the mobile number, shown under the name; null when the name already is it. */
export function profileContact(profile: UserProfile): string | null {
  const contact =
    profile.email ?? (profile.phone_number ? formatIranMobile(profile.phone_number) : null)
  return contact && contact !== profileName(profile) ? contact : null
}

const firstLetter = (word: string) => Array.from(word.trim())[0] ?? ''

/**
 * The first letters of the first and last names (else of the full name's first two words), kept
 * apart by a zero-width non-joiner so two Persian letters never join into a word. Null without
 * a name.
 */
export function profileInitials(profile: UserProfile): string | null {
  const parts = [profile.first_name, profile.last_name].filter((part) => part.trim() !== '')
  const words = parts.length > 0 ? parts : profile.full_name.trim().split(/\s+/).slice(0, 2)
  const letters = words.map(firstLetter).filter(Boolean)
  return letters.length > 0 ? letters.join('\u{200C}') : null
}

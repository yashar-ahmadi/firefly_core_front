import type { UserProfile } from '@/lib/api/types/account'
import { formatIranMobile } from '@/lib/format/phone'

// How the signed-in visitor is shown (the header's account button and menu, the account area).
// Pure: safe in any bundle, the header's included.

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

const firstLetter = (word: string) => Array.from(word.trim())[0]?.toLocaleUpperCase('en') ?? ''

/**
 * The avatar's one letter: of the first name, else of the full name, else of the email (Latin
 * letters upper-cased). Null for a visitor known by her mobile number alone: a digit is no
 * initial, the avatar shows a person instead. One letter, never two: two Persian letters side by
 * side read as a syllable.
 */
export function profileInitial(profile: UserProfile): string | null {
  const source = [profile.first_name, profile.full_name, profile.email ?? ''].find(
    (value) => value.trim() !== '',
  )
  return source ? firstLetter(source) || null : null
}

/** The first name, for a greeting: `first_name`, else the full name's first word; else null. */
export function profileFirstName(profile: UserProfile): string | null {
  const first = profile.first_name.trim() || profile.full_name.trim().split(/\s+/)[0]
  return first ? first : null
}

/** What the avatar (`Avatar`) shows for a profile: the picture and the one letter. */
export function profileAvatar(profile: UserProfile | null | undefined): {
  src: string | null
  initial: string | null
} {
  return profile
    ? { src: profile.avatar_picture, initial: profileInitial(profile) }
    : { src: null, initial: null }
}

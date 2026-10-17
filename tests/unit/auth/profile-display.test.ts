import { describe, expect, it } from 'vitest'
import { profileContact, profileInitials, profileName } from '@/features/auth/profile-display'
import type { UserProfile } from '@/lib/api/types/account'
import { SARA } from './fixtures'

const nameless: UserProfile = { ...SARA, first_name: '', last_name: '', full_name: '' }

describe('profile display', () => {
  it('names the visitor by full_name, else the email, else the mobile number in Persian', () => {
    expect(profileName(SARA)).toBe('سارا احمدی')
    expect(profileName({ ...nameless, full_name: '  ' })).toBe('sara.ahmadi@example.com')
    expect(profileName({ ...nameless, email: null })).toBe('۰۹۱۲ ۱۲۳ ۴۵۰۱')
    expect(profileName({ ...nameless, email: null, phone_number: null })).toBe('')
  })

  it('says how the account is reached under the name, unless the name already is that', () => {
    expect(profileContact(SARA)).toBe('sara.ahmadi@example.com')
    expect(profileContact({ ...SARA, email: null })).toBe('۰۹۱۲ ۱۲۳ ۴۵۰۱')
    expect(profileContact({ ...nameless })).toBeNull()
    expect(profileContact({ ...nameless, email: null })).toBeNull()
  })

  it('initials: the first letters of the first and last names, kept apart (no joining)', () => {
    expect(profileInitials(SARA)).toBe('س\u{200C}ا')
    expect(profileInitials({ ...SARA, first_name: 'Sara', last_name: 'Ahmadi' })).toBe('S\u{200C}A')
    expect(profileInitials({ ...SARA, last_name: '' })).toBe('س')
    // From the full name when the parts are empty; none without a name.
    expect(profileInitials({ ...nameless, full_name: 'نیما رضایی' })).toBe('ن\u{200C}ر')
    expect(profileInitials(nameless)).toBeNull()
  })
})

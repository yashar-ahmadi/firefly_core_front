import { describe, expect, it } from 'vitest'
import {
  profileContact,
  profileFirstName,
  profileInitial,
  profileName,
} from '@/features/auth/profile-display'
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

  it('initial: one letter, of the first name, else of the full name, else of the email', () => {
    expect(profileInitial(SARA)).toBe('س')
    expect(profileInitial({ ...SARA, first_name: 'sara' })).toBe('S')
    expect(profileInitial({ ...nameless, full_name: 'نیما رضایی' })).toBe('ن')
    expect(profileInitial(nameless)).toBe('S')
    // A phone number's first digit is no initial: the avatar shows a person instead.
    expect(profileInitial({ ...nameless, email: null })).toBeNull()
  })

  it('first name, for the greeting: first_name, else the full name’s first word', () => {
    expect(profileFirstName(SARA)).toBe('سارا')
    expect(profileFirstName({ ...nameless, full_name: ' نیما رضایی ' })).toBe('نیما')
    expect(profileFirstName(nameless)).toBeNull()
  })
})

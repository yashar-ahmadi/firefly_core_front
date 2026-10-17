import type { UserProfile } from '@/lib/api/types/account'

/** `GET account/profile/me/` for sara, as the live API answers it. */
export const SARA: UserProfile = {
  uuid: 'a39a75e3-9c58-43f7-8a2c-3dce983629f8',
  username: 'sara.ahmadi',
  first_name: 'سارا',
  last_name: 'احمدی',
  full_name: 'سارا احمدی',
  email: 'sara.ahmadi@example.com',
  phone_number: '+989121234501',
  is_email_verified: true,
  is_phone_verified: true,
  avatar_picture: null,
  created: '2025-09-18T15:00:00+03:30',
  is_totp_enabled: false,
  has_usable_password: true,
}

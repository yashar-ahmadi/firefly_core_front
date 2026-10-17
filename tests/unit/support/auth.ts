import type { AuthSettings } from '@/lib/api/types/settings'

/** The dev backend's `auth` block (live): email only, no Google, no SMS or Telegram. */
export function emailOnlyAuth(): AuthSettings {
  return {
    google_login_enabled: false,
    google_client_id: null,
    sms_otp_enabled: false,
    telegram_otp_enabled: false,
    available_otp_methods: ['email'],
    registration_methods: ['email'],
    default_otp_methods: { email: 'email' },
  }
}

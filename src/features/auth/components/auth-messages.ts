// The checks made before any request, and their messages, shared by the auth pages. Pure.

export const CODE_INCOMPLETE = 'کد ۶ رقمی را کامل وارد کنید.'

export const IDENTIFIER_REQUIRED = 'ایمیل یا شماره موبایل را وارد کنید.'

export const IDENTIFIER_INVALID =
  'ایمیل یا شماره موبایل را درست وارد کنید؛ مثلاً name@example.com یا ۰۹۱۲۳۴۵۶۷۸۹.'

export const PASSWORD_REQUIRED = 'رمز عبور را وارد کنید.'

export const CONFIRM_REQUIRED = 'تکرار رمز عبور را وارد کنید.'

export const CONFIRM_MISMATCH = 'تکرار رمز عبور با رمز عبور یکسان نیست.'

/** The checks of a new password and its confirmation; the API judges its strength. */
export function newPasswordErrors(
  password: string,
  confirm: string,
): Partial<Record<'password' | 'confirm', string>> {
  if (password === '') return { password: PASSWORD_REQUIRED }
  if (confirm === '') return { confirm: CONFIRM_REQUIRED }
  return password === confirm ? {} : { confirm: CONFIRM_MISMATCH }
}

'use client'

import { LogIn, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button-styles'
import { registerHref } from '@/features/auth/auth-links'
import { useFeature } from '@/features/settings/feature-context'
import { loginHref } from '@/lib/links/login'

// A guest when the shop takes no guest orders (`guest_checkout` off; the cart works for guests,
// only placement needs a login, cart digest §1.6): log in, or register, and come back here. The
// cart is kept: the login merges it (no identifier ever goes in these links).

const NEXT = '/checkout/'

export function LoginPrompt() {
  const registration = useFeature('registration')
  const guest = useFeature('guest_checkout')
  return (
    <div className="flex flex-col gap-3">
      <p className="text-lg leading-8 font-bold text-ink-900">
        {'برای ادامه\u{0654} خرید وارد حساب کاربری شوید'}
      </p>
      <p className="text-base leading-7 text-ink-700">
        {guest.reason ?? 'ثبت سفارش بدون حساب کاربری در این فروشگاه ممکن نیست.'}{' '}
        {'سبد خرید شما پس از ورود حفظ می\u{200C}شود.'}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={loginHref(NEXT)} prefetch={false} className={buttonClasses()}>
          <LogIn aria-hidden />
          ورود به حساب کاربری
        </Link>
        {registration.enabled && (
          <Link
            href={registerHref(NEXT)}
            prefetch={false}
            className={buttonClasses({ variant: 'outline' })}
          >
            <UserPlus aria-hidden />
            ثبت‌نام
          </Link>
        )}
      </div>
    </div>
  )
}

'use client'

import { House } from 'lucide-react'
import Link from 'next/link'
import type { Ref } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { useT } from '@/lib/i18n/i18n-context'
import { loginHref } from '@/lib/links/login'
import { useSession } from '@/lib/session/session-context'

/** A light line drawing of an empty cart, in the brand colour (decorative). */
function EmptyCartIllustration() {
  return (
    <svg
      aria-hidden
      data-illustration="empty-cart"
      viewBox="0 0 160 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-30 w-40 text-brand-600"
    >
      <ellipse cx="82" cy="110" rx="58" ry="6" fill="currentColor" stroke="none" opacity=".08" />
      <path d="M18 18h16l15 62h70l13-46H42" />
      <path d="M58 46h58M62 62h48" opacity=".3" />
      <circle cx="60" cy="96" r="7" />
      <circle cx="110" cy="96" r="7" />
      <path d="M128 12l6-6M136 22h8M118 8V0" opacity=".45" />
    </svg>
  )
}

/**
 * The cart page with nothing in the cart: an illustration, «سبد خرید شما خالی است», the way back
 * home, and for a guest the hint that a signed-in cart is kept with the account (login comes
 * back here). Its heading takes the focus when the last line is removed (`headingRef`).
 */
export function EmptyCart({ headingRef }: { headingRef?: Ref<HTMLHeadingElement> }) {
  const t = useT()
  const { hasSession } = useSession()
  return (
    <div className="flex flex-col items-center rounded-card bg-white px-4 py-12 text-center shadow-card md:py-16">
      <EmptyCartIllustration />
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 text-xl leading-9 font-bold text-ink-900 outline-none"
      >
        سبد خرید شما خالی است
      </h2>
      <p className="mt-2 max-w-md text-base leading-8 text-ink-600">
        کالاهای دلخواهتان را پیدا کنید و به سبد خرید بیفزایید.
      </p>
      <Link href="/" className={cn(buttonClasses(), 'mt-6')}>
        <House aria-hidden />
        {`بازگشت به ${t('home_page')}`}
      </Link>
      {!hasSession && (
        <p className="mt-6 max-w-md text-base leading-8 text-ink-700">
          {'سبد خرید حساب کاربری\u{200C}تان را می\u{200C}خواهید؟ '}
          <Link
            href={loginHref('/cart/')}
            className="font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            وارد حساب شوید
          </Link>
        </p>
      )}
    </div>
  )
}

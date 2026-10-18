'use client'

import { House, LogIn, ShoppingCart, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useT } from '@/lib/i18n/i18n-context'
import { loginHref } from '@/lib/links/login'

// The checkout's states other than the steps: loading, an empty cart, a cart that cannot be
// ordered as it is, and a signed-in checkout whose session ended.

export function CheckoutSkeleton() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری"
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6"
    >
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-3 rounded-card bg-white p-5 shadow-card">
            <Skeleton className="h-7 w-1/3" />
            {index === 0 && <Skeleton className="h-24 w-full" />}
          </div>
        ))}
      </div>
      <div className="hidden flex-col gap-3 rounded-card bg-white p-5 shadow-card lg:flex">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}

/** Nothing to order (an empty cart, or a guest cart that is gone): back to the cart or home. */
export function EmptyCheckout() {
  const t = useT()
  return (
    <EmptyState
      icon={<ShoppingCart />}
      title="سبد خرید شما خالی است"
      description="برای ثبت سفارش، اول کالایی به سبد خرید اضافه کنید."
      className="rounded-card bg-white shadow-card"
      action={
        <>
          <Link href="/cart/" className={buttonClasses()}>
            <ShoppingCart aria-hidden />
            {'مشاهده\u{0654} سبد خرید'}
          </Link>
          <Link href="/" className={buttonClasses({ variant: 'outline' })}>
            <House aria-hidden />
            {`بازگشت به ${t('home_page')}`}
          </Link>
        </>
      }
    />
  )
}

/**
 * A line cannot be ordered as it is (the cart page's «ادامهٔ خرید» is a link, so a middle-click
 * still opens the checkout): back to the cart to set it right; every step waits.
 */
export function UnorderableBanner() {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-card bg-danger/10 px-4 py-3 text-base text-ink-800"
    >
      <TriangleAlert aria-hidden className="mt-1 size-5 shrink-0 text-danger" />
      <p className="min-w-0 flex-1 leading-7">
        برخی کالاهای سبد خرید قابل سفارش نیستند. برای ادامه، سبد خرید را اصلاح کنید.
      </p>
      <Link href="/cart/" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
        بازگشت به سبد خرید
      </Link>
    </div>
  )
}

/** A signed-in checkout whose session ended: nothing of it stays on screen; login takes over. */
export function SessionEnded() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-card bg-white p-5 shadow-card md:p-6">
      <p className="text-lg leading-8 font-bold text-ink-900">نشست شما به پایان رسید</p>
      <p className="text-base leading-7 text-ink-700">
        برای ادامهٔ خرید دوباره وارد حساب کاربری شوید؛ سبد خرید شما حفظ می‌شود.
      </p>
      <Link href={loginHref('/checkout/')} className={buttonClasses()}>
        <LogIn aria-hidden />
        ورود دوباره
      </Link>
    </div>
  )
}

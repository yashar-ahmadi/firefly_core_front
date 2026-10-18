import { ArrowRight, Lock } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/components/ui/cn'
import { CONTAINER } from './container'
import { StoreLogo } from './store-logo'

/**
 * The checkout's quiet header (ruling P4-R3): the logo (home), «خرید امن», and the way back to
 * the cart. No search, no menus: nothing leads away from the purchase but these two links.
 */
export function CheckoutHeader({ logo, name }: { logo: string | null; name: string }) {
  return (
    <header className="border-b border-ink-200 bg-white">
      <div className={cn(CONTAINER, 'flex h-16 items-center justify-between gap-3')}>
        <StoreLogo src={logo} name={name} />
        <p className="hidden items-center gap-1.5 text-base font-medium text-success sm:flex">
          <Lock aria-hidden className="size-5" />
          خرید امن
        </p>
        <Link
          href="/cart/"
          prefetch={false}
          className="-me-3 inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-base text-ink-700 hover:text-ink-900"
        >
          <ArrowRight aria-hidden className="size-5" />
          بازگشت به سبد خرید
        </Link>
      </div>
      <p className="flex items-center justify-center gap-1.5 border-t border-ink-100 py-1.5 text-sm font-medium text-success sm:hidden">
        <Lock aria-hidden className="size-4" />
        خرید امن
      </p>
    </header>
  )
}

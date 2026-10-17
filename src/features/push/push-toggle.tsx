'use client'

import { BellOff, TriangleAlert } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useWebPush, type PushStatus } from './use-web-push'

export const PUSH_LABEL = 'دریافت اعلان در مرورگر'

const DESCRIPTION: Partial<Record<PushStatus, string>> = {
  off: 'اعلان‌های تازهٔ فروشگاه، حتی وقتی سایت بسته است، در همین مرورگر نشان داده می‌شوند.',
  enabling: 'در حال روشن کردن… اگر مرورگر اجازه خواست، «اجازه دادن» را بزنید.',
  on: 'روشن است: اعلان‌های تازه در همین مرورگر نشان داده می‌شوند.',
  disabling: 'در حال خاموش کردن…',
  denied:
    'اعلان‌های این سایت در تنظیمات مرورگرتان مسدود است. برای روشن کردن، از نماد کنار نشانی سایت اجازهٔ «اعلان‌ها» را بدهید و صفحه را دوباره باز کنید.',
}

const IOS = /\b(?:iPhone|iPad|iPod)\b/

/**
 * «دریافت اعلان در مرورگر» in the inbox's header (only when the shop has web push): a switch that
 * asks the browser's permission when it is turned on, never before. Blocked in the browser's
 * settings: the switch is off and says how to allow it there. A browser without web push gets a
 * one-line note instead (on an iPhone: install the site first). While a change is on its way the
 * switch stays focusable but ignores presses.
 */
export function PushToggle() {
  const push = useWebPush()
  if (push.status === 'unavailable') return null
  const frame = 'mb-4 rounded-card bg-white px-4 shadow-card md:mb-5'
  if (push.status === 'unsupported') {
    const ios = IOS.test(navigator.userAgent)
    return (
      <p className={`${frame} flex items-start gap-2 py-3 text-base text-ink-700`}>
        <BellOff aria-hidden className="mt-1 size-5 shrink-0 text-ink-500" />
        {ios
          ? 'برای دریافت اعلان در آیفون و آیپد، سایت را با «افزودن به صفحهٔ اصلی» نصب کنید و از همان‌جا باز کنید.'
          : 'این مرورگر اعلان‌های وب را پشتیبانی نمی‌کند.'}
      </p>
    )
  }
  const busy = push.status === 'enabling' || push.status === 'disabling'
  return (
    <div className={frame} aria-busy={busy || undefined}>
      <Switch
        label={PUSH_LABEL}
        description={DESCRIPTION[push.status]}
        checked={push.status === 'on' || push.status === 'enabling'}
        disabled={push.status === 'denied'}
        aria-disabled={busy || undefined}
        onCheckedChange={(checked) => {
          if (busy) return
          if (checked) push.enable()
          else push.disable()
        }}
      />
      {push.error && (
        <p role="alert" className="flex items-center gap-2 pb-3 text-base text-danger">
          <TriangleAlert aria-hidden className="size-5 shrink-0" />
          {push.error}
        </p>
      )}
    </div>
  )
}

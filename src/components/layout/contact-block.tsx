import { Clock, Mail, MapPin, MessageCircle, Phone, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import type { SiteSettings } from '@/lib/api/types/settings'
import { toPersianDigits } from '@/lib/format/digits'
import { formatIranMobile } from '@/lib/format/phone'
import { httpUrl, linkUrl } from '@/lib/html/safe-url'
import type { Translate } from '@/lib/i18n/translator'
import { FOOTER_HEADING } from './footer-styles'

type ContactSettings = Pick<
  SiteSettings,
  | 'phone'
  | 'phone2'
  | 'email'
  | 'address'
  | 'postal_code'
  | 'map'
  | 'response_time'
  | 'support_link'
>

const IFRAME_SRC = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i

/**
 * The `map` setting as a link: a plain URL, or the `src` of a Google Maps `<iframe>` embed
 * (auth-settings.md §8.1). Anything else (or a non-http URL) gives null.
 */
export function mapLink(map: string | null | undefined): string | null {
  const value = map?.trim() ?? ''
  const url = IFRAME_SRC.exec(value)?.[1]?.replaceAll('&amp;', '&') ?? value
  return httpUrl(url)
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

const LINK = 'rounded-control transition-colors hover:text-brand-700'
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const

function Item({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: ReactNode
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-1 grid size-10 shrink-0 place-items-center rounded-full bg-white text-brand-700 shadow-sm ring-1 ring-ink-200 [&_svg]:size-5"
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-500">{label}</p>
        <div className="text-base text-ink-800">{children}</div>
      </div>
    </li>
  )
}

/**
 * The shop's contact details from the settings: phones (`tel:` with the E.164 value, shown as
 * «۰۲۱ ۹۱۰۰ ۰۰۰۰» left to right), email, address with postal code and map, the response time
 * and the support link. Each missing value hides its row; nothing to show renders nothing.
 */
export function ContactBlock({
  settings,
  t,
  className,
}: {
  settings: ContactSettings
  t: Translate
  className?: string
}) {
  const phones = [text(settings.phone), text(settings.phone2)].filter(Boolean)
  const email = text(settings.email)
  const address = text(settings.address)
  const postalCode = text(settings.postal_code)
  const map = mapLink(settings.map)
  const responseTime = text(settings.response_time)
  const support = linkUrl(settings.support_link)
  if (!phones.length && !email && !address && !responseTime && !support) return null

  return (
    <section
      aria-labelledby="footer-contact"
      className={cn('rounded-card bg-ink-50 p-4 sm:p-6', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 id="footer-contact" className={FOOTER_HEADING}>
          {t('contact_us')}
        </h2>
        {support && (
          <a
            href={support}
            {...(support.startsWith('/') ? {} : EXTERNAL)}
            className={buttonClasses({ variant: 'outline', size: 'sm' })}
          >
            <MessageCircle aria-hidden />
            {t('support_chat')}
          </a>
        )}
      </div>
      <address className="mt-5 not-italic">
        {/* One column on phones, two on tablets, side by side on wide screens. */}
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] lg:gap-6">
          {phones.length > 0 && (
            <Item icon={Phone} label={t('contact_phone')}>
              <span className="flex flex-wrap items-center gap-x-3">
                {phones.map((phone, index) => (
                  <span key={phone} className="flex items-center gap-x-3">
                    {index > 0 && <span aria-hidden className="h-4 w-px bg-ink-300" />}
                    <a
                      href={`tel:${phone}`}
                      dir="ltr"
                      className={cn(
                        LINK,
                        'inline-flex min-h-11 items-center text-lg font-bold tracking-wide text-ink-900',
                      )}
                    >
                      {formatIranMobile(phone)}
                    </a>
                  </span>
                ))}
              </span>
            </Item>
          )}
          {email && (
            <Item icon={Mail} label={t('contact_email')}>
              <a
                href={`mailto:${email}`}
                dir="ltr"
                className={cn(LINK, 'inline-flex min-h-11 items-center break-all')}
              >
                {email}
              </a>
            </Item>
          )}
          {address && (
            <Item icon={MapPin} label={t('contact_address')}>
              <p className="leading-7 whitespace-pre-line">{address}</p>
              {postalCode && (
                <p className="mt-1 text-sm text-ink-600">
                  {t('postal_code', { code: toPersianDigits(postalCode) })}
                </p>
              )}
              {map && (
                <a
                  href={map}
                  {...EXTERNAL}
                  className={cn(
                    LINK,
                    'inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline decoration-1 underline-offset-4 hover:decoration-2',
                  )}
                >
                  {t('view_on_map')}
                </a>
              )}
            </Item>
          )}
          {responseTime && (
            <Item icon={Clock} label={t('response_time')}>
              <p className="leading-7">{responseTime}</p>
            </Item>
          )}
        </ul>
      </address>
    </section>
  )
}

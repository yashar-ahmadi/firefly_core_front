import { Clock, Headset, Mail, MapPin, MessageCircle, Phone, type LucideIcon } from 'lucide-react'
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
  | 'sales_phone'
  | 'sales_phone2'
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

/**
 * Two numbers as links, each once: two spellings of one number (`+982191000000`,
 * `021-9100-0000`) display the same and count as one. Support (`phone`, `phone2`) and sales
 * (`sales_phone`, `sales_phone2`) are two lines of their own, each read this way.
 */
export function uniquePhones(values: ReadonlyArray<string | null | undefined>) {
  const byLabel = new Map<string, string>()
  for (const value of values) {
    const phone = text(value)
    const label = phone && formatIranMobile(phone)
    if (label && !byLabel.has(label)) byLabel.set(label, phone)
  }
  return [...byLabel].map(([label, tel]) => ({ label, tel }))
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

/** A number to call: shown as `label`, dialled as `tel` (the E.164 value). */
export interface PhoneLink {
  label: string
  tel: string
}

/** The shop's contact details, each one trimmed and checked, ready to show. */
export interface ContactDetails {
  /** Support (`phone`, `phone2`). */
  phones: PhoneLink[]
  /** Sales and consultation (`sales_phone`, `sales_phone2`), apart from support. */
  salesPhones: PhoneLink[]
  email: string
  address: string
  postalCode: string
  map: string | null
  responseTime: string
}

/**
 * The settings' contact details (`phone`, `phone2`, `sales_phone`, `sales_phone2`, `email`,
 * `address`, `postal_code`, `map`, `response_time`), or null when none is set. Shared by the
 * footer, the contact page and a content page's contact block.
 */
export function contactDetails(
  settings: Omit<ContactSettings, 'support_link'> | null,
): ContactDetails | null {
  if (!settings) return null
  const details: ContactDetails = {
    phones: uniquePhones([settings.phone, settings.phone2]),
    // An API from before the sales lines leaves them out: undefined reads as unset.
    salesPhones: uniquePhones([settings.sales_phone, settings.sales_phone2]),
    email: text(settings.email),
    address: text(settings.address),
    postalCode: text(settings.postal_code),
    map: mapLink(settings.map),
    responseTime: text(settings.response_time),
  }
  const { phones, salesPhones, email, address, responseTime } = details
  return phones.length || salesPhones.length || email || address || responseTime ? details : null
}

/** Numbers side by side, a thin rule between them: `tel:` links, the number left to right. */
function PhoneLinks({ phones }: { phones: PhoneLink[] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3">
      {phones.map(({ label, tel }, index) => (
        <span key={label} className="flex items-center gap-x-3">
          {index > 0 && <span aria-hidden className="h-4 w-px bg-ink-300" />}
          <a
            href={`tel:${tel}`}
            dir="ltr"
            className={cn(
              LINK,
              'inline-flex min-h-11 items-center text-lg font-bold tracking-wide text-ink-900',
            )}
          >
            {label}
          </a>
        </span>
      ))}
    </span>
  )
}

/**
 * The details as a list in an `<address>`: support phones and the sales line (`tel:` with the
 * E.164 value, shown as «۰۲۱ ۹۱۰۰ ۰۰۰۰» left to right), email, address with postal code and
 * map link, and the response time; each missing value hides its row. One column on phones, two on tablets, side by
 * side where there is room.
 */
export function ContactDetailsList({
  details,
  t,
  className,
}: {
  details: ContactDetails
  t: Translate
  className?: string
}) {
  const { phones, salesPhones, email, address, postalCode, map, responseTime } = details
  return (
    <address className={cn('not-italic', className)}>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] lg:gap-6">
        {phones.length > 0 && (
          <Item icon={Phone} label={t('contact_phone')}>
            <PhoneLinks phones={phones} />
          </Item>
        )}
        {salesPhones.length > 0 && (
          <Item icon={Headset} label={t('contact_sales_phone')}>
            <PhoneLinks phones={salesPhones} />
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
  )
}

/**
 * The footer's contact card: the shop's contact details (`ContactDetailsList`) and the support
 * link. Each missing value hides its row; nothing to show renders nothing.
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
  const details = contactDetails(settings)
  const support = linkUrl(settings.support_link)
  if (!details && !support) return null

  return (
    <div
      role="group"
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
      {details && <ContactDetailsList details={details} t={t} className="mt-5" />}
    </div>
  )
}

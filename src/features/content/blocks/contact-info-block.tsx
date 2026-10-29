import { Clock, Headset, Mail, MapPin, Phone, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  ContactDetailsList,
  type ContactDetails,
  type PhoneLink,
} from '@/components/layout/contact-block'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import type { DisplayStyle } from '@/features/display/display-style'
import { toPersianDigits } from '@/lib/format/digits'
import type { Translate } from '@/lib/i18n/translator'

// The `contact_info` block (content digest §2): the shop's phones, sales line, email, address and
// hours, which are not in the block: they come from the settings (`contactDetails`), the same as
// the footer's and the contact page's. In one of four styles.

export interface ContactInfoBlockProps {
  details: ContactDetails
  style: DisplayStyle
  t: Translate
}

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const
const LINK = 'rounded-control transition-colors hover:text-brand-700'

/** One way to reach the shop: its icon, label and what to show for it. */
interface Channel {
  key: string
  icon: LucideIcon
  label: string
  body: ReactNode
}

function PhoneLinks({ phones, className }: { phones: PhoneLink[]; className?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3">
      {phones.map(({ label, tel }) => (
        <a
          key={label}
          href={`tel:${tel}`}
          dir="ltr"
          className={cn(
            LINK,
            'inline-flex min-h-11 items-center font-bold tracking-wide',
            className,
          )}
        >
          {label}
        </a>
      ))}
    </span>
  )
}

/** The channels the settings fill, in the contact list's order. */
function channelsOf(
  { phones, salesPhones, email, address, postalCode, map, responseTime }: ContactDetails,
  t: Translate,
): Channel[] {
  const channels: Channel[] = []
  if (phones.length > 0) {
    channels.push({
      key: 'phone',
      icon: Phone,
      label: t('contact_phone'),
      body: <PhoneLinks phones={phones} className="text-lg text-ink-900" />,
    })
  }
  if (salesPhones.length > 0) {
    channels.push({
      key: 'sales',
      icon: Headset,
      label: t('contact_sales_phone'),
      body: <PhoneLinks phones={salesPhones} className="text-lg text-ink-900" />,
    })
  }
  if (email) {
    channels.push({
      key: 'email',
      icon: Mail,
      label: t('contact_email'),
      body: (
        <a
          href={`mailto:${email}`}
          dir="ltr"
          className={cn(LINK, 'inline-flex min-h-11 items-center break-all text-ink-900')}
        >
          {email}
        </a>
      ),
    })
  }
  if (address) {
    channels.push({
      key: 'address',
      icon: MapPin,
      label: t('contact_address'),
      body: (
        <>
          <p className="leading-7 whitespace-pre-line text-ink-800">{address}</p>
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
                'inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline decoration-1 underline-offset-4',
              )}
            >
              {t('view_on_map')}
            </a>
          )}
        </>
      ),
    })
  }
  if (responseTime) {
    channels.push({
      key: 'hours',
      icon: Clock,
      label: t('response_time'),
      body: <p className="leading-7 text-ink-800">{responseTime}</p>,
    })
  }
  return channels
}

/** Style 2: a card per channel, its icon in a large tinted circle. */
function ChannelCards({ channels }: { channels: Channel[] }) {
  return (
    <ul className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
      {channels.map(({ key, icon: Icon, label, body }) => (
        <li key={key} className="flex flex-col gap-3 rounded-card bg-white p-5 shadow-card">
          <span
            aria-hidden
            className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100 [&_svg]:size-6"
          >
            <Icon />
          </span>
          <p className="text-sm text-ink-600">{label}</p>
          <div className="text-base">{body}</div>
        </li>
      ))}
    </ul>
  )
}

/** Style 3: the channels in one compact line that wraps, no card. */
function ChannelLine({ channels }: { channels: Channel[] }) {
  return (
    <ul className="flex flex-wrap gap-x-8 gap-y-4 border-y border-ink-200 py-4">
      {channels.map(({ key, icon: Icon, label, body }) => (
        <li key={key} className="flex min-w-0 items-start gap-2.5">
          <Icon aria-hidden className="mt-3 size-5 shrink-0 text-brand-700" />
          <div className="min-w-0 text-base">
            <span className="sr-only">{label}: </span>
            {body}
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Style 4: a band of the brand's gradient with a large call button for each number (support and
 * sales), the email as an outlined button, and the address and hours under them.
 */
function ContactBand({ details, t }: { details: ContactDetails; t: Translate }) {
  const { phones, salesPhones, email, address, responseTime } = details
  const calls = [
    ...phones.map((phone) => ({ ...phone, kind: t('contact_phone'), icon: Phone })),
    ...salesPhones.map((phone) => ({ ...phone, kind: t('contact_sales_phone'), icon: Headset })),
  ]
  return (
    <div className="flex flex-col gap-5 rounded-card bg-linear-to-l from-brand-600 to-brand-800 p-6 text-brand-fg shadow-card md:p-8">
      {(calls.length > 0 || email) && (
        <ul className="flex flex-wrap gap-3">
          {calls.map(({ label, tel, kind, icon: Icon }) => (
            <li key={`${kind}-${tel}`}>
              <a
                href={`tel:${tel}`}
                className={cn(
                  buttonClasses({ size: 'lg' }),
                  'h-auto min-h-13 gap-3 bg-white py-2 text-brand-800 hover:bg-brand-50 active:bg-brand-100',
                )}
              >
                <Icon aria-hidden />
                <span className="flex flex-col items-start leading-6">
                  <span className="text-sm font-normal text-ink-700">{kind}</span>
                  <span dir="ltr" className="font-bold tracking-wide">
                    {label}
                  </span>
                </span>
              </a>
            </li>
          ))}
          {email && (
            <li>
              <a
                href={`mailto:${email}`}
                className={cn(
                  buttonClasses({ size: 'lg' }),
                  'h-auto min-h-13 gap-3 border-2 border-white/70 bg-transparent py-2 text-brand-fg shadow-none hover:bg-white/10',
                )}
              >
                <Mail aria-hidden />
                <span dir="ltr" className="break-all">
                  {email}
                </span>
              </a>
            </li>
          )}
        </ul>
      )}
      {(address || responseTime) && (
        <div className="flex flex-col gap-2 text-base leading-7">
          {address && (
            <p className="flex items-start gap-2">
              <MapPin aria-hidden className="mt-1 size-5 shrink-0" />
              <span className="whitespace-pre-line">
                <span className="sr-only">{t('contact_address')}: </span>
                {address}
              </span>
            </p>
          )}
          {responseTime && (
            <p className="flex items-start gap-2">
              <Clock aria-hidden className="mt-1 size-5 shrink-0" />
              <span>
                <span className="sr-only">{t('response_time')}: </span>
                {responseTime}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The shop's contact details in one of four styles: 1. the contact page's list on a card; 2. a
 * card per channel; 3. a compact line; 4. a band of call buttons. Inside an `<address>`: they are
 * the shop's own contact information.
 */
export function ContactInfoBlock({ details, style, t }: ContactInfoBlockProps) {
  let body
  if (style === 'style_2') body = <ChannelCards channels={channelsOf(details, t)} />
  else if (style === 'style_3') body = <ChannelLine channels={channelsOf(details, t)} />
  else if (style === 'style_4') body = <ContactBand details={details} t={t} />
  else {
    return (
      <div className="rounded-card bg-white p-5 shadow-card md:p-6">
        <ContactDetailsList details={details} t={t} />
      </div>
    )
  }
  return <address className="not-italic">{body}</address>
}

'use client'

import { useQueryClient } from '@tanstack/react-query'
import { BadgeCheck } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { Skeleton } from '@/components/ui/skeleton'
import { codeChannels } from '@/features/auth/login-methods'
import { useAuthSettings } from '@/features/auth/use-auth-settings'
import type { ContactType, UserProfile } from '@/lib/api/types/account'
import { formatIranMobile } from '@/lib/format'
import { ME_KEY } from '@/lib/session/viewer-queries'
import type { ContactEditorProps } from './contact-editor'
import { CONTACT_LABEL, currentContact } from './contact-rules'
import { PartLoading, PartUnavailable } from './lazy-part'
import { ProfileSection, SavedNote } from './profile-section'
import { useTotpStatus } from './use-totp-status'

// The editor (the code flow, the channel choice, the code boxes) loads on the first «تغییر» or
// «افزودن», or as the pointer or the focus reaches one. A failed download says so in place.
const ContactEditor = dynamic<ContactEditorProps>(
  () =>
    import('./contact-editor').then((module) => module.ContactEditor).catch(() => PartUnavailable),
  { ssr: false, loading: PartLoading },
)
/** A failed preload is dropped: opening the editor tries again. */
const preloadEditor = () => {
  import('./contact-editor').catch(() => {})
}

const TYPES: readonly ContactType[] = ['email', 'phone']

const VERIFIED: Record<ContactType, string> = {
  email: 'ایمیل تازه ثبت و تأیید شد.',
  phone: 'شمارهٔ موبایل تازه ثبت و تأیید شد.',
}

interface ContactRowProps {
  type: ContactType
  me: UserProfile
  /** A code can reach this type: its «افزودن» or «تغییر» is offered. */
  changeable: boolean
  open: boolean
  buttonRef: Ref<HTMLButtonElement>
  onToggle: () => void
  editor: ReactNode
}

/** One identifier: its value (or «ثبت نشده»), whether it is verified, and its button. */
function ContactRow({ type, me, changeable, open, buttonRef, onToggle, editor }: ContactRowProps) {
  const labelId = useId()
  const editorId = useId()
  const { value, verified } = currentContact(me, type)
  const label = CONTACT_LABEL[type]
  return (
    <div role="group" aria-labelledby={labelId} className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p id={labelId} className="text-base font-medium text-ink-800">
            {label}
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {value ? (
              <span dir="ltr" className="min-w-0 text-base break-all text-ink-900">
                {type === 'phone' ? formatIranMobile(value) : value}
              </span>
            ) : (
              <span className="text-base text-ink-500">ثبت نشده</span>
            )}
            {value &&
              (verified ? (
                <Badge tone="success" size="sm">
                  <BadgeCheck aria-hidden />
                  تأیید شده
                </Badge>
              ) : (
                <Badge tone="warning" size="sm">
                  تأیید نشده
                </Badge>
              ))}
          </div>
        </div>
        {changeable ? (
          <Button
            ref={buttonRef}
            variant="outline"
            // «تغییر» alone on screen (the row names what); «تغییر ایمیل» to a screen reader.
            aria-label={value ? `تغییر ${label}` : undefined}
            aria-expanded={open}
            aria-controls={open ? editorId : undefined}
            onPointerEnter={preloadEditor}
            onFocus={preloadEditor}
            onClick={onToggle}
          >
            {value ? 'تغییر' : `افزودن ${label}`}
          </Button>
        ) : (
          <p className="text-sm leading-6 text-ink-600">
            {`${value ? 'تغییر' : 'افزودن'} ${label} در این فروشگاه ممکن نیست.`}
          </p>
        )}
      </div>
      {open && (
        <div id={editorId} className="mt-4">
          {editor}
        </div>
      )}
    </div>
  )
}

function ContactRows({ me }: { me: UserProfile }) {
  const client = useQueryClient()
  const auth = useAuthSettings()
  const totp = useTotpStatus()
  const totpOn = totp.data?.is_totp_enabled ?? me.is_totp_enabled
  const [editing, setEditing] = useState<ContactType | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const buttons = useRef<Partial<Record<ContactType, HTMLButtonElement | null>>>({})
  // An editor that closes takes its focus along: it goes back to the row's button.
  const refocus = useRef<ContactType | null>(null)
  useEffect(() => {
    const type = refocus.current
    if (type === null || editing !== null) return
    refocus.current = null
    buttons.current[type]?.focus()
  })

  function close(type: ContactType) {
    refocus.current = type
    setEditing(null)
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col divide-y divide-ink-100">
        {TYPES.map((type) => {
          // A code goes to an email address by email, to a phone by SMS or Telegram (F0, F9).
          const channels = codeChannels(auth, type)
          return (
            <ContactRow
              key={type}
              type={type}
              me={me}
              changeable={channels.otpChannels.length > 0}
              open={editing === type}
              buttonRef={(node) => {
                buttons.current[type] = node
              }}
              onToggle={() => {
                setSaved(null)
                if (editing === type) close(type)
                else setEditing(type)
              }}
              editor={
                <ContactEditor
                  type={type}
                  me={me}
                  totpOn={totpOn}
                  channels={channels}
                  onCancel={() => close(type)}
                  onVerified={(profile) => {
                    client.setQueryData(ME_KEY, profile)
                    setSaved(VERIFIED[type])
                    announce(VERIFIED[type])
                    close(type)
                  }}
                />
              }
            />
          )
        })}
      </div>
      {saved && (
        <div className="mt-4">
          <SavedNote message={saved} />
        </div>
      )}
    </div>
  )
}

/**
 * The email and the phone (auth digest F9): «افزودن …» for a missing one, «تغییر» with its
 * verified badge for one there, each change through a code sent to the new address.
 */
export function ContactSection({ me }: { me: UserProfile | undefined }) {
  return (
    <ProfileSection
      title="ایمیل و شمارهٔ موبایل"
      description="برای ورود و بازیابی رمز عبور به کار می‌روند. هر نشانی تازه با کدی که به خودش فرستاده می‌شود تأیید می‌شود."
      loading={!me}
      skeleton={
        <div aria-hidden className="flex flex-col divide-y divide-ink-100">
          {TYPES.map((type) => (
            <div
              key={type}
              className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
            >
              <div className="flex flex-col gap-1">
                <span className="flex h-6 items-center">
                  <Skeleton className="h-4 w-20" />
                </span>
                <span className="flex h-7 items-center">
                  <Skeleton className="h-4 w-44" />
                </span>
              </div>
              <Skeleton className="h-11 w-20" />
            </div>
          ))}
        </div>
      }
    >
      {me && <ContactRows me={me} />}
    </ProfileSection>
  )
}

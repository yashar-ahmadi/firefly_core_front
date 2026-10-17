'use client'

import { LogOut } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { trackPresses } from '@/components/ui/press-tracking'
import { useLogout } from '@/features/auth/use-logout'
import { PartLoading, PartUnavailable } from './lazy-part'
import type { LogoutAllDialogProps } from './logout-all-dialog'
import { ProfileSection } from './profile-section'

// The dialog (Radix Dialog with its focus trap) loads on the first press, or as the pointer or
// the focus reaches the button. A failed download says so in place of the dialog.
const LogoutAllDialog = dynamic<LogoutAllDialogProps>(
  () =>
    import('./logout-all-dialog')
      .then((module) => module.LogoutAllDialog)
      .catch(() => PartUnavailable),
  { ssr: false, loading: PartLoading },
)
/** A failed preload is dropped: the press tries again. */
const preload = () => {
  import('./logout-all-dialog').catch(() => {})
}

/**
 * «خروج از همهٔ دستگاه‌ها» (auth digest §4.11, F6): every session of the account ends, this one
 * too (other devices keep their access token for up to 15 minutes). It asks first, in a modal
 * dialog; confirmed, `useLogout({ all: true })` forgets the visitor here and goes home.
 */
export function SessionsSection() {
  const { logout, pending } = useLogout()
  const [requested, setRequested] = useState(false)
  const [open, setOpen] = useState(false)
  // The dialog gives the focus back to its opener: record presses before its code is loaded.
  useEffect(trackPresses, [])
  return (
    <ProfileSection
      title="نشست‌ها"
      description="اگر در دستگاهی وارد شده‌اید که به آن دسترسی ندارید، یا فکر می‌کنید کس دیگری وارد حساب شما شده است، از همهٔ دستگاه‌ها خارج شوید."
    >
      <Button
        variant="outline"
        aria-haspopup="dialog"
        iconStart={<LogOut aria-hidden />}
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          setRequested(true)
          setOpen(true)
        }}
      >
        خروج از همهٔ دستگاه‌ها
      </Button>
      {requested && (
        <LogoutAllDialog
          open={open}
          onOpenChange={setOpen}
          pending={pending}
          onConfirm={() => void logout({ all: true })}
        />
      )}
    </ProfileSection>
  )
}

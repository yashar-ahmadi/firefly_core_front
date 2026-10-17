'use client'

import { useQueryClient } from '@tanstack/react-query'
import { ImageUp, Trash2 } from 'lucide-react'
import { useEffect, useId, useReducer, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { Spinner } from '@/components/ui/spinner'
import { authApi } from '@/features/auth/api'
import { FormAlert } from '@/components/form/form-alert'
import { useSubmitWait } from '@/components/form/code-timers'
import { profileInitial } from '@/features/auth/profile-display'
import type { UserProfile } from '@/lib/api/types/account'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { AVATAR_ACCEPT, avatarFileError } from './avatar-file'
import { AvatarSkeleton } from './avatar-skeleton'
import { formFailure, formReducer, initialFormState } from './form-state'
import { ProfileSection, SavedNote } from './profile-section'
import { useProfileRunner } from './use-profile-runner'

const HINT = 'تصویر JPG، PNG یا WEBP، حداکثر ۵ مگابایت.'
const SAVED = 'تصویر پروفایل ذخیره شد.'
const REMOVED = 'تصویر پروفایل حذف شد.'

/** The API judges the content: its word on the file goes where the client's does. */
const toFailure = (error: unknown) =>
  formFailure<'avatar'>(error, { byCode: {}, byAttr: { avatar_picture: 'avatar' } })

/** The buttons the focus moves to as the preview or the remove question come and go. */
type Focus = 'choose' | 'remove' | 'keep'

interface Picked {
  file: File
  /** An object URL of the file, for the preview; revoked when it goes. */
  url: string
}

function AvatarForm({ me }: { me: UserProfile }) {
  const client = useQueryClient()
  const [state, dispatch] = useReducer(formReducer<'avatar'>, undefined, initialFormState)
  const run = useProfileRunner(dispatch, toFailure)
  const lock = useSubmitWait(state.submitWait)
  const blocked = state.busy || lock.locked
  const [picked, setPicked] = useState<Picked | null>(null)
  // «حذف تصویر» asks first, in place: «تصویر حذف شود؟».
  const [confirming, setConfirming] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const choose = useRef<HTMLButtonElement>(null)
  const remover = useRef<HTMLButtonElement>(null)
  const keeper = useRef<HTMLButtonElement>(null)
  // The buttons pressed go with what they open or close: the focus moves to the one that stays.
  const refocus = useRef<Focus | null>(null)
  const hintId = useId()
  const errorId = useId()
  const confirmId = useId()
  const error = state.fieldErrors.avatar
  // A 429's wait holds the button that would send (`retry_after`), its time left as described.
  const sending = {
    'aria-busy': state.busy || undefined,
    'aria-disabled': lock.locked || undefined,
    'aria-describedby': lock.locked ? lock.noteId : undefined,
    iconStart: state.busy ? <Spinner /> : undefined,
  }
  // «انصراف» waits for a write in flight: the write lands anyway, so what it would hide stays.
  const holding = state.busy || undefined

  useEffect(() => (picked ? () => URL.revokeObjectURL(picked.url) : undefined), [picked])
  useEffect(() => {
    const target = refocus.current
    const node = target && { choose, remove: remover, keep: keeper }[target].current
    if (!node) return
    refocus.current = null
    node.focus()
  })

  function onFile(file: File | undefined) {
    if (!file) return
    const invalid = avatarFileError(file)
    if (invalid) return dispatch({ type: 'invalid', errors: { avatar: invalid } })
    dispatch({ type: 'edit', field: 'avatar' })
    setPicked({ file, url: URL.createObjectURL(file) })
  }

  function done(profile: UserProfile, message: string) {
    client.setQueryData(ME_KEY, profile)
    refocus.current = 'choose'
    setPicked(null)
    setConfirming(false)
    dispatch({ type: 'saved', message })
    announce(message)
  }

  function upload() {
    if (!picked || blocked) return
    const { file } = picked
    run(
      () => authApi.updateMe({ avatar_picture: file }),
      (profile) => done(profile, SAVED),
    )
  }

  function remove() {
    if (blocked) return
    run(
      () => authApi.updateMe({ avatar_picture: null }),
      (profile) => done(profile, REMOVED),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {state.notice && <FormAlert>{state.notice.detail}</FormAlert>}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
        {picked ? (
          // An object URL of the visitor's own file: next/image has nothing to optimise here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={picked.url}
            alt="پیش‌نمایش تصویر انتخاب‌شده"
            width={96}
            height={96}
            className="size-24 shrink-0 rounded-full object-cover"
          />
        ) : (
          <Avatar src={me.avatar_picture} initial={profileInitial(me)} size="xl" />
        )}
        <div className="flex flex-col gap-2">
          {picked ? (
            <div className="flex flex-wrap gap-3">
              <Button {...sending} onClick={upload}>
                ذخیرهٔ تصویر
              </Button>
              <Button
                variant="ghost"
                aria-disabled={holding}
                onClick={() => {
                  if (state.busy) return
                  // The API's word on this file goes with it.
                  dispatch({ type: 'edit', field: 'avatar' })
                  refocus.current = 'choose'
                  setPicked(null)
                }}
              >
                انصراف
              </Button>
            </div>
          ) : confirming ? (
            <div role="group" aria-labelledby={confirmId} className="flex flex-col gap-2">
              <p id={confirmId} className="text-base leading-7 font-medium text-ink-800">
                تصویر حذف شود؟
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="danger" {...sending} onClick={remove}>
                  بله، حذف شود
                </Button>
                <Button
                  ref={keeper}
                  variant="outline"
                  aria-disabled={holding}
                  onClick={() => {
                    if (state.busy) return
                    refocus.current = 'remove'
                    setConfirming(false)
                  }}
                >
                  انصراف
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button
                ref={choose}
                variant="outline"
                iconStart={<ImageUp aria-hidden />}
                aria-describedby={error ? `${hintId} ${errorId}` : hintId}
                onClick={() => input.current?.click()}
              >
                انتخاب تصویر
              </Button>
              {me.avatar_picture && (
                <Button
                  ref={remover}
                  variant="ghost"
                  className="text-danger"
                  iconStart={<Trash2 aria-hidden />}
                  onClick={() => {
                    // The harmless answer takes the focus.
                    refocus.current = 'keep'
                    setConfirming(true)
                  }}
                >
                  حذف تصویر
                </Button>
              )}
            </div>
          )}
          {lock.note}
          <p id={hintId} className="text-sm leading-6 text-ink-600">
            {HINT}
          </p>
          {error && (
            <p id={errorId} role="alert" className="text-sm leading-6 font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
      <SavedNote message={state.saved} />
      {/* Opened by «انتخاب تصویر»; the button is the control (focus, name, messages). */}
      <input
        ref={input}
        type="file"
        accept={AVATAR_ACCEPT}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => {
          onFile(event.currentTarget.files?.[0])
          // The same file chosen again is a change again.
          event.currentTarget.value = ''
        }}
      />
    </div>
  )
}

/** The profile picture (auth digest §4.16): checked, previewed, then sent as multipart. */
export function AvatarUpload({ me }: { me: UserProfile | undefined }) {
  return (
    <ProfileSection title="تصویر پروفایل" loading={!me} skeleton={<AvatarSkeleton />}>
      {me && <AvatarForm me={me} />}
    </ProfileSection>
  )
}

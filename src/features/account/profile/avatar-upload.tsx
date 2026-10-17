'use client'

import { useQueryClient } from '@tanstack/react-query'
import { ImageUp, Trash2 } from 'lucide-react'
import { useEffect, useId, useReducer, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { authApi } from '@/features/auth/api'
import { FormAlert } from '@/features/auth/components/auth-card'
import { useRequestRunner } from '@/features/auth/components/use-request-runner'
import { profileInitial } from '@/features/auth/profile-display'
import type { UserProfile } from '@/lib/api/types/account'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { AVATAR_ACCEPT, avatarFileError } from './avatar-file'
import { formFailure, formReducer, initialFormState } from './form-state'
import { ProfileSection, SavedNote } from './profile-section'

const HINT = 'تصویر JPG، PNG یا WEBP، حداکثر ۵ مگابایت.'
const SAVED = 'تصویر پروفایل ذخیره شد.'
const REMOVED = 'تصویر پروفایل حذف شد.'

/** The API judges the content: its word on the file goes where the client's does. */
const toFailure = (error: unknown) =>
  formFailure<'avatar'>(error, { byCode: {}, byAttr: { avatar_picture: 'avatar' } })

interface Picked {
  file: File
  /** An object URL of the file, for the preview; revoked when it goes. */
  url: string
}

function AvatarForm({ me }: { me: UserProfile }) {
  const client = useQueryClient()
  const [state, dispatch] = useReducer(formReducer<'avatar'>, undefined, initialFormState)
  const run = useRequestRunner(dispatch, toFailure)
  const [picked, setPicked] = useState<Picked | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const choose = useRef<HTMLButtonElement>(null)
  // The buttons of a preview go with it: the focus moves back to «انتخاب تصویر».
  const refocus = useRef(false)
  const hintId = useId()
  const errorId = useId()
  const error = state.fieldErrors.avatar

  useEffect(() => (picked ? () => URL.revokeObjectURL(picked.url) : undefined), [picked])
  useEffect(() => {
    if (!refocus.current || picked) return
    refocus.current = false
    choose.current?.focus()
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
    refocus.current = true
    setPicked(null)
    dispatch({ type: 'saved', message })
    announce(message)
  }

  function upload() {
    if (!picked || state.busy) return
    const { file } = picked
    run(
      () => authApi.updateMe({ avatar_picture: file }),
      (profile) => done(profile, SAVED),
    )
  }

  function remove() {
    if (state.busy) return
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
          <div className="flex flex-wrap gap-3">
            {picked ? (
              <>
                <Button
                  aria-busy={state.busy || undefined}
                  iconStart={state.busy ? <Spinner /> : undefined}
                  onClick={upload}
                >
                  ذخیرهٔ تصویر
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    refocus.current = true
                    setPicked(null)
                  }}
                >
                  انصراف
                </Button>
              </>
            ) : (
              <>
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
                    variant="ghost"
                    className="text-danger"
                    aria-busy={state.busy || undefined}
                    iconStart={state.busy ? <Spinner /> : <Trash2 aria-hidden />}
                    onClick={remove}
                  >
                    حذف تصویر
                  </Button>
                )}
              </>
            )}
          </div>
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
    <ProfileSection
      title="تصویر پروفایل"
      loading={!me}
      skeleton={
        <div
          aria-hidden
          className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6"
        >
          <Skeleton className="size-24 shrink-0 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-11 w-36" />
            <span className="flex h-6 items-center">
              <Skeleton className="h-3.5 w-48" />
            </span>
          </div>
        </div>
      }
    >
      {me && <AvatarForm me={me} />}
    </ProfileSection>
  )
}

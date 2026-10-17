'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { useFormFocus } from '@/features/account/profile/profile-section'
import { FormAlert } from '@/features/auth/components/auth-card'
import { AuthForm } from '@/features/auth/components/auth-form'
import { refreshGeo } from '@/features/geo/api'
import { LocationField } from '@/features/geo/location-field'
import { useProvinces } from '@/features/geo/use-provinces'
import type { Address } from '@/lib/api/types/address'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { RegionFields, TitleField } from './address-fields'
import { addressFailure } from './address-errors'
import {
  checkAddress,
  createBody,
  patchBody,
  valuesFrom,
  type AddressValues,
  type FieldErrors,
} from './address-values'
import { PlaceFields } from './place-fields'
import { ReceiverFields } from './receiver-fields'
import { useAddresses, useCreateAddress, useUpdateAddress } from './use-addresses'

export interface AddressFormProps {
  /** The address to edit; none for a new one. */
  initial?: Address
  /** After the save, with the API's address (the book has been read again by then). */
  onSaved: (address: Address) => void
  onCancel?: () => void
  /**
   * The values, when the caller keeps them (a sheet that remounts its content when it switches
   * between its phone and desktop variants); otherwise the form keeps its own.
   */
  values?: AddressValues
  onValuesChange?: (values: AddressValues) => void
}

/** The default switch's rule (cart digest §7.3): the first address and the only one stay on. */
function defaultRule(initial: Address | undefined, count: number | undefined) {
  if (count === undefined) return { forced: false, note: undefined }
  if (!initial && count === 0) return { forced: true, note: 'نخستین آدرس شما پیش‌فرض می‌شود.' }
  if (initial?.is_default && count === 1)
    return { forced: true, note: 'تنها آدرس شما پیش‌فرض می‌ماند.' }
  return { forced: false, note: undefined }
}

const hasErrors = (errors: FieldErrors) => Object.keys(errors).length > 0

/**
 * The address book's form (cart digest §7.2), for the account page and the checkout alike. It
 * checks what the API checks before asking it (which stays the judge), sends a create, or a
 * PATCH of what changed, then re-reads the book and the cart (`use-addresses`). Every message
 * of a field goes under it, the first field in error takes the focus; the attr-less address_*
 * codes go to the alert at the top.
 */
export function AddressForm({
  initial,
  onSaved,
  onCancel,
  values: controlled,
  onValuesChange,
}: AddressFormProps) {
  const client = useQueryClient()
  const [own, setOwn] = useState(() => valuesFrom(initial))
  const values = controlled ?? own
  const setValues = onValuesChange ?? setOwn
  const [errors, setErrors] = useState<FieldErrors>({})
  const [alert, setAlert] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const container = useRef<HTMLDivElement>(null)
  useFormFocus(container, attempt)
  const create = useCreateAddress()
  const update = useUpdateAddress()
  const busy = create.isPending || update.isPending
  const book = useAddresses()
  const provinces = useProvinces()
  const rule = defaultRule(initial, book.data?.count)
  const provinceName = provinces.data?.find((item) => item.id === values.province)?.name

  function edit(changes: Partial<AddressValues>) {
    setValues({ ...values, ...changes })
    const fields = Object.keys(changes) as Array<keyof AddressValues>
    if (fields.some((field) => errors[field])) {
      const next = { ...errors }
      for (const field of fields) delete next[field]
      setErrors(next)
    }
  }

  function failed(next: FieldErrors, message: string | null) {
    setErrors(next)
    setAlert(message)
    setAttempt((count) => count + 1)
  }

  async function save() {
    if (busy) return
    const checked = { ...values, isDefault: rule.forced || values.isDefault }
    const invalid = checkAddress(checked)
    if (hasErrors(invalid)) return failed(invalid, null)
    setErrors({})
    setAlert(null)
    try {
      if (initial) {
        const patch = patchBody(checked, initial)
        if (Object.keys(patch).length === 0) return onSaved(initial)
        onSaved(await update.mutateAsync({ id: initial.id, patch }))
      } else {
        onSaved(await create.mutateAsync({ body: createBody(checked) }))
      }
    } catch (error) {
      // The session is gone: login replaces the page (`use-addresses`).
      if (isSessionExpiredError(error)) return
      const failure = addressFailure(error)
      const reset: Partial<AddressValues> = {}
      // The cached lists disagree with the API: they read again.
      if (failure.staleGeo || failure.resetCity) refreshGeo(client)
      if (failure.staleGeo) {
        if (failure.fields.province) Object.assign(reset, { province: null, city: null })
        if (failure.fields.city) reset.city = null
      }
      if (failure.resetCity) reset.city = null
      if (Object.keys(reset).length > 0) setValues({ ...values, ...reset })
      failed(failure.fields, failure.alert)
    }
  }

  return (
    <div ref={container}>
      <AuthForm className="gap-5" onSubmit={() => void save()}>
        {alert && <FormAlert>{alert}</FormAlert>}
        <TitleField
          value={values.title}
          onChange={(title) => edit({ title })}
          errors={errors.title}
        />
        <RegionFields
          province={values.province}
          city={values.city}
          onProvince={(province) => edit({ province, city: null })}
          onCity={(city) => edit({ city })}
          provinceErrors={errors.province}
          cityErrors={errors.city}
          onStale={() => edit({ province: null, city: null })}
        />
        <PlaceFields values={values} onChange={edit} errors={errors} />
        <ReceiverFields values={values} onChange={edit} errors={errors} />
        <LocationField
          value={values.location}
          onChange={(location) => edit({ location })}
          provinceName={provinceName}
          errors={errors.location}
        />
        <Switch
          label="آدرس پیش‌فرض"
          description={rule.note ?? 'سفارش‌ها به‌طور پیش‌فرض به این آدرس فرستاده می‌شوند.'}
          checked={rule.forced || values.isDefault}
          disabled={rule.forced}
          onCheckedChange={(isDefault) => edit({ isDefault })}
        />
        {/* Pinned at the bottom of a scrolling sheet (over its body’s 1rem bottom padding): the save
            is always in reach. */}
        <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 flex flex-wrap gap-3 border-t border-ink-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
          <Button
            type="submit"
            className="flex-1 sm:flex-none"
            aria-busy={busy || undefined}
            aria-disabled={busy || undefined}
            iconStart={busy ? <Spinner /> : undefined}
          >
            ذخیرهٔ آدرس
          </Button>
          {onCancel && (
            <Button
              variant="ghost"
              aria-disabled={busy || undefined}
              onClick={() => {
                if (!busy) onCancel()
              }}
            >
              انصراف
            </Button>
          )}
        </div>
      </AuthForm>
    </div>
  )
}

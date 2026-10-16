'use client'

import { useMutation } from '@tanstack/react-query'
import { BellRing, CircleAlert, CircleCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { notify } from '@/components/ui/toaster'
import { useFeature, useMarkFeatureDisabled } from '@/features/settings/feature-context'
import { bffFetch } from '@/lib/api/client'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import { normalizeIranMobile } from '@/lib/format'
import { useSession } from '@/lib/session/session-context'
import { useProduct } from './product-provider'

/** The form's anchor, for the phone's buy bar. */
export const NOTIFY_ME_ID = 'notify-me'
export const NOTIFY_ME_TITLE = 'موجود شد خبرم کن'
const TITLE = NOTIFY_ME_TITLE
const LEAD = 'هر وقت این کالا موجود شد، با پیامک خبرتان می\u{200C}کنیم.'
const DONE = 'درخواست شما ثبت شد. پس از موجود شدن کالا به شما خبر می\u{200C}دهیم.'

type FieldName = 'first_name' | 'last_name' | 'mobile_number'
type Errors = Partial<Record<FieldName | 'form', string>>

const LABELS: Record<FieldName, string> = {
  first_name: 'نام',
  last_name: 'نام خانوادگی',
  mobile_number: 'شماره موبایل',
}

/** What is missing before asking the API: the names when asked for, a valid Iranian mobile. */
function localErrors(values: Record<FieldName, string>, names: boolean, mobile: boolean): Errors {
  const errors: Errors = {}
  if (names && !values.first_name.trim()) errors.first_name = 'نام را وارد کنید.'
  if (names && !values.last_name.trim()) errors.last_name = 'نام خانوادگی را وارد کنید.'
  if (mobile && !values.mobile_number.trim()) errors.mobile_number = 'شماره موبایل را وارد کنید.'
  else if (mobile && normalizeIranMobile(values.mobile_number) === null) {
    errors.mobile_number = 'شماره موبایل معتبر نیست.'
  }
  return errors
}

/**
 * The back-in-stock request (product digest §3.14): a guest gives a name and mobile (Persian
 * digits welcome); a signed-in shopper just presses, unless the account lacks a name or a
 * mobile. The API's field errors go under their fields; «already in stock» reads the page again
 * (the buy box comes back); a switched-off feature hides the form with the operator's reason.
 */
function NotifyForm({ slug }: { slug: string }) {
  const { hasSession } = useSession()
  const router = useRouter()
  const markFeatureDisabled = useMarkFeatureDisabled()
  const titleId = useId()
  const [values, setValues] = useState<Record<FieldName, string>>({
    first_name: '',
    last_name: '',
    mobile_number: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  // What a signed-in account lacks (a phone-only account's name, an e-mail account's mobile):
  // the API asks for it with a field error, and the field appears.
  const [lacking, setLacking] = useState({ names: false, mobile: false })
  const [done, setDone] = useState<string | null>(null)
  const names = !hasSession || lacking.names
  const mobile = !hasSession || lacking.mobile

  const mutation = useMutation({
    mutationFn: (body: Partial<Record<FieldName, string>>) =>
      bffFetch<Record<string, never>>(`product/detail/${slug}/notify/`, { method: 'POST', body }),
    onSuccess: ({ msg }) => setDone(msg || DONE),
    onError: (error) => {
      if (!(error instanceof ApiError)) return setErrors({ form: GENERIC_ERROR_DETAIL })
      if (error.isFeatureDisabled()) {
        markFeatureDisabled('stock_notifications', error.detail)
        notify.error(error.detail)
        return
      }
      if (error.code === 'stock_notification_already_in_stock') {
        setErrors({ form: error.detail })
        router.refresh()
        return
      }
      const fields = error.fieldErrors()
      setLacking((current) => ({
        names: current.names || !!fields.first_name || !!fields.last_name,
        mobile: current.mobile || !!fields.mobile_number,
      }))
      const placed = fields.first_name || fields.last_name || fields.mobile_number
      setErrors({
        first_name: fields.first_name,
        last_name: fields.last_name,
        mobile_number: fields.mobile_number,
        // No connection, a page that is not the API, a redirect: no field to show it under.
        form: fields.non_field_errors ?? (placed ? undefined : error.detail),
      })
    },
  })

  if (done) {
    return (
      <p role="status" className="flex items-start gap-2 text-base text-success">
        <CircleCheck aria-hidden className="mt-1 size-5 shrink-0" />
        {done}
      </p>
    )
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = localErrors(values, names, mobile)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    mutation.mutate({
      ...(names
        ? { first_name: values.first_name.trim(), last_name: values.last_name.trim() }
        : {}),
      ...(mobile ? { mobile_number: normalizeIranMobile(values.mobile_number) ?? '' } : {}),
    })
  }

  const field = (name: FieldName, extra: Partial<Parameters<typeof Input>[0]> = {}) => (
    <Field label={LABELS[name]} error={errors[name]} required>
      <Input
        name={name}
        value={values[name]}
        onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
        {...extra}
      />
    </Field>
  )

  return (
    <form aria-labelledby={titleId} noValidate onSubmit={submit} className="flex flex-col gap-3">
      <div>
        <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-ink-900">
          <BellRing aria-hidden className="size-5 text-brand-600" />
          {TITLE}
        </h2>
        <p className="mt-1 text-base text-ink-600">{LEAD}</p>
      </div>
      {names && (
        <div className="grid gap-3 sm:grid-cols-2">
          {field('first_name', { autoComplete: 'given-name', maxLength: 200 })}
          {field('last_name', { autoComplete: 'family-name', maxLength: 200 })}
        </div>
      )}
      {mobile &&
        field('mobile_number', {
          dir: 'ltr',
          inputMode: 'tel',
          autoComplete: 'tel',
          placeholder: '۰۹۱۲ ۱۲۳ ۴۵۶۷',
        })}
      {errors.form && (
        <p role="alert" className="flex items-start gap-1.5 text-base font-medium text-danger">
          <CircleAlert aria-hidden className="mt-1 size-5 shrink-0" />
          {errors.form}
        </p>
      )}
      <Button type="submit" variant="secondary" fullWidth loading={mutation.isPending}>
        {TITLE}
      </Button>
    </form>
  )
}

/** Only when nothing of the product can be bought, and the feature is on (review focus 1). */
export function NotifyMe() {
  const { product } = useProduct()
  const feature = useFeature('stock_notifications')
  if (product.in_stock || !feature.enabled) return null
  return (
    // Clear of the sticky header when the buy bar jumps here.
    <div id={NOTIFY_ME_ID} className="scroll-mt-[calc(var(--header-offset)+1rem)]">
      <NotifyForm key={product.slug} slug={product.slug} />
    </div>
  )
}

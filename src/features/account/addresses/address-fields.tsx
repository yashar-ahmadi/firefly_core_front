'use client'

import { RefreshCw } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useCities } from '@/features/geo/use-cities'
import { useProvinces } from '@/features/geo/use-provinces'

// The address form's own fields: the title with its quick choices, and the province and city
// pair (native selects: the phone's own picker, a screen reader's list, and typing a letter to
// jump, for some hundred cities).

/** Every message of a field, each on its own line (Field shows them under the control). */
export function messagesOf(messages: readonly string[] | undefined): ReactNode {
  if (!messages || messages.length === 0) return undefined
  if (messages.length === 1) return messages[0]
  // A space between the lines, so they are read as two sentences.
  return messages.map((message, index) => (
    <Fragment key={message}>
      {index > 0 && ' '}
      <span className="block">{message}</span>
    </Fragment>
  ))
}

const TITLES = ['خانه', 'محل کار', 'منزل پدری'] as const

export function TitleField({
  value,
  onChange,
  errors,
}: {
  value: string
  onChange: (value: string) => void
  errors?: readonly string[]
}) {
  return (
    <div className="flex flex-col gap-2">
      <Field label="عنوان آدرس" required error={messagesOf(errors)}>
        <Input
          name="address-title"
          autoComplete="off"
          maxLength={50}
          enterKeyHint="next"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </Field>
      <div role="group" aria-label="عنوان‌های آماده" className="flex flex-wrap gap-2">
        {TITLES.map((title) => (
          <Chip key={title} selected={value.trim() === title} onClick={() => onChange(title)}>
            {title}
          </Chip>
        ))}
      </div>
    </div>
  )
}

/** A list that could not be read: the sentence, and a retry that keeps the focus. */
function ListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {message}
      <Button
        variant="ghost"
        size="sm"
        className="text-brand-700"
        iconStart={<RefreshCw aria-hidden />}
        onClick={onRetry}
      >
        تلاش دوباره
      </Button>
    </span>
  )
}

export interface RegionFieldsProps {
  province: number | null
  city: number | null
  onProvince: (province: number | null) => void
  onCity: (city: number | null) => void
  provinceErrors?: readonly string[]
  cityErrors?: readonly string[]
  /** The cached province id is stale (`invalid_choice`): the lists read again, reset both. */
  onStale: () => void
}

const toId = (value: string) => (value === '' ? null : Number(value))

/**
 * «استان» then «شهر»: the city stays disabled until a province is chosen, and its list is that
 * province's (read when chosen, cached a day). The caller resets the city with the province.
 */
export function RegionFields({
  province,
  city,
  onProvince,
  onCity,
  provinceErrors,
  cityErrors,
  onStale,
}: RegionFieldsProps) {
  const provinces = useProvinces()
  const cities = useCities(province, { onStale })
  const provinceFailed = provinces.isError && !provinces.data
  const cityFailed = cities.isError && !cities.data && province !== null
  const cityLoading = province !== null && cities.isPending && !cityFailed
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        label="استان"
        required
        error={
          messagesOf(provinceErrors) ??
          (provinceFailed ? (
            <ListError
              message="فهرست استان‌ها بارگذاری نشد."
              onRetry={() => void provinces.refetch()}
            />
          ) : undefined)
        }
      >
        <Select
          name="province"
          value={province ?? ''}
          disabled={!provinces.data}
          aria-busy={provinces.isPending || undefined}
          onChange={(event) => onProvince(toId(event.currentTarget.value))}
        >
          <option value="" disabled>
            {provinces.isPending ? 'در حال بارگذاری…' : 'انتخاب استان'}
          </option>
          {provinces.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="شهر"
        required
        hint={province === null ? 'اول استان را انتخاب کنید.' : undefined}
        error={
          messagesOf(cityErrors) ??
          (cityFailed ? (
            <ListError message="فهرست شهرها بارگذاری نشد." onRetry={() => void cities.refetch()} />
          ) : undefined)
        }
      >
        <Select
          name="city"
          value={city ?? ''}
          disabled={!cities.data}
          aria-busy={cityLoading || undefined}
          onChange={(event) => onCity(toId(event.currentTarget.value))}
        >
          <option value="" disabled>
            {cityLoading ? 'در حال بارگذاری…' : 'انتخاب شهر'}
          </option>
          {cities.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}

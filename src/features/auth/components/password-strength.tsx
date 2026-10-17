'use client'

import { cn } from '@/components/ui/cn'
import { toLatinDigits, toPersianDigits } from '@/lib/format'

// A hint while a new password is typed. Guidance only: the API's validators decide (its
// `auth_password_weak` reasons are shown under the field). The rules follow them roughly: at
// least 8 characters, not only digits, not close to the name or the identifier.

const MIN_LENGTH = 8
/** Long enough to count on its own. */
const LONG = 12
/** Shorter parts of a name or an address match too many passwords by chance. */
const MIN_RELATED = 4

export type StrengthLevel = 0 | 1 | 2 | 3 | 4

export interface PasswordStrengthResult {
  /** 0: nothing typed; 1 weak … 4 strong. */
  level: StrengthLevel
  label: string
  /** Why it is weak. */
  note: string | null
}

const LABEL: Record<StrengthLevel, string> = { 0: '', 1: 'ضعیف', 2: 'متوسط', 3: 'خوب', 4: 'قوی' }

/** Kinds of characters: Latin lower and upper case, digits, other letters (Persian), the rest. */
const KINDS = [/[a-z]/u, /[A-Z]/u, /\p{Nd}/u, /(?![a-zA-Z])\p{L}/u, /[^\p{L}\p{Nd}]/u]

/** The names, and the parts of the email address or the mobile number, in lower case. */
function relatedParts(related: readonly string[]): string[] {
  const parts = new Set<string>()
  for (const value of related) {
    const text = toLatinDigits(value).trim().toLowerCase()
    const local = text.split('@', 1)[0] ?? ''
    for (const part of [text, local, ...local.split(/[^\p{L}\p{Nd}]+/u)]) {
      if (part.length >= MIN_RELATED) parts.add(part)
    }
  }
  return [...parts]
}

function weak(note: string): PasswordStrengthResult {
  return { level: 1, label: LABEL[1], note }
}

/** How strong `password` looks; `related`: the names and the identifier it should not be like. */
export function passwordStrength(
  password: string,
  related: readonly string[] = [],
): PasswordStrengthResult {
  if (password === '') return { level: 0, label: '', note: null }
  const text = toLatinDigits(password)
  const length = [...text].length
  if (length < MIN_LENGTH) return weak(`کوتاه‌تر از ${toPersianDigits(MIN_LENGTH)} نویسه`)
  if (/^\d+$/u.test(text)) return weak('فقط عدد')
  const lower = text.toLowerCase()
  if (relatedParts(related).some((part) => lower.includes(part))) {
    return weak('شبیه نام، ایمیل یا شمارهٔ شما')
  }
  const kinds = KINDS.filter((kind) => kind.test(text)).length
  // Fair; good when long or varied; strong when both.
  const varied = kinds >= 3
  const long = length >= LONG
  const level: StrengthLevel = varied && long ? 4 : varied || long ? 3 : 2
  return { level, label: LABEL[level], note: null }
}

const BAR: Record<StrengthLevel, string> = {
  0: '',
  1: 'bg-danger',
  2: 'bg-warning',
  3: 'bg-success',
  4: 'bg-success',
}
const TEXT: Record<StrengthLevel, string> = {
  0: '',
  1: 'text-danger',
  2: 'text-warning',
  3: 'text-success',
  4: 'text-success',
}

/**
 * Four bars and «قدرت رمز عبور: خوب» (words, not the colour alone). The sentence is a polite
 * status: it is read out when the level changes, not on every key.
 */
export function PasswordStrength({
  password,
  related,
}: {
  password: string
  related?: readonly string[]
}) {
  const { level, label, note } = passwordStrength(password, related)
  return (
    <div className="flex flex-col gap-1">
      <div aria-hidden className="flex gap-1">
        {([1, 2, 3, 4] as const).map((bar) => (
          <span
            key={bar}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              bar <= level ? BAR[level] : 'bg-ink-200',
              'motion-safe:transition-colors',
            )}
          />
        ))}
      </div>
      <p role="status" className="min-h-6 text-sm leading-6 text-ink-600">
        {level > 0 && (
          <>
            قدرت رمز عبور: <span className={cn('font-bold', TEXT[level])}>{label}</span>
            {note && ` (${note})`}
          </>
        )}
      </p>
    </div>
  )
}

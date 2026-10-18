'use client'

import { Checkbox } from '@/components/ui/checkbox'

// The operator's checkout sentences (settings `accept_terms_text`, `confirm_legal_age`;
// auth-settings digest §1, operator HTML sanitised on the server, links opening in a new tab so
// following one keeps the checkout): each beside a checkbox the shopper must tick before placing
// the order, when the operator wrote one. The API does not check them; the page does.

export interface CheckoutTerms {
  /** Sanitised HTML, or null (nothing to accept). */
  accept: string | null
  legalAge: string | null
}

export type TermKey = keyof CheckoutTerms
export type TermsAccepted = Record<TermKey, boolean>

export const TERM_REQUIRED = 'برای ثبت سفارش، این مورد را تأیید کنید.'

/** The sentences the shopper has not ticked yet. */
export function missingTerms(terms: CheckoutTerms, accepted: TermsAccepted): TermKey[] {
  return (['accept', 'legalAge'] as const).filter((key) => terms[key] && !accepted[key])
}

export function TermsChecks({
  terms,
  accepted,
  onChange,
  errors,
}: {
  terms: CheckoutTerms
  accepted: TermsAccepted
  onChange: (key: TermKey, checked: boolean) => void
  errors: readonly TermKey[]
}) {
  const keys = (['accept', 'legalAge'] as const).filter((key) => terms[key])
  if (keys.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {keys.map((key) => {
        const invalid = errors.includes(key)
        return (
          <Checkbox
            key={key}
            data-term={key}
            checked={accepted[key]}
            onCheckedChange={(checked) => onChange(key, checked === true)}
            aria-required
            aria-invalid={invalid || undefined}
            label={
              <span
                className="rich-content-inline"
                // Sanitised on the server (src/app/(checkout)/checkout/page.tsx).
                dangerouslySetInnerHTML={{ __html: terms[key]! }}
              />
            }
            description={
              invalid ? <span className="font-medium text-danger">{TERM_REQUIRED}</span> : undefined
            }
          />
        )
      })}
    </div>
  )
}

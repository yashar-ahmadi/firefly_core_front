'use client'

import { Fragment, type ReactNode } from 'react'
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

/**
 * The operator's `terms` and `return-policy` slots as dialog links («مطالعهٔ قوانین», «رویهٔ
 * بازگرداندن کالا»: DynamicSlot, rendered by the route), under the terms' sentence, in line with
 * its words (`indent`: with a checkbox to line up with). Hidden when both slots are empty (each
 * renders nothing then): `display: none`, so no gap is left for it in the form's column.
 */
function TermsLinks({ links, indent = true }: { links: ReactNode; indent?: boolean }) {
  const row = 'flex flex-wrap items-center gap-x-5 empty:hidden'
  return <div className={indent ? `${row} ps-9` : row}>{links}</div>
}

export function TermsChecks({
  terms,
  accepted,
  onChange,
  errors,
  links,
}: {
  terms: CheckoutTerms
  accepted: TermsAccepted
  onChange: (key: TermKey, checked: boolean) => void
  errors: readonly TermKey[]
  /** The terms' dialog links, right after the terms' checkbox (alone without a sentence). */
  links?: ReactNode
}) {
  const keys = (['accept', 'legalAge'] as const).filter((key) => terms[key])
  // No sentence: the links alone, straight in the form's column (no wrapper of their own, which
  // would keep a gap there with both slots empty), and nothing to line them up with.
  if (keys.length === 0) return links ? <TermsLinks links={links} indent={false} /> : null
  return (
    <div className="flex flex-col gap-1">
      {!terms.accept && links && <TermsLinks links={links} />}
      {keys.map((key) => {
        const invalid = errors.includes(key)
        return (
          <Fragment key={key}>
            <Checkbox
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
                invalid ? (
                  <span className="font-medium text-danger">{TERM_REQUIRED}</span>
                ) : undefined
              }
            />
            {key === 'accept' && links && <TermsLinks links={links} />}
          </Fragment>
        )
      })}
    </div>
  )
}

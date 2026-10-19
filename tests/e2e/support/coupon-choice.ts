// Which sample coupon a journey applies (Plan 4 Task 10 fix round; cart-address.md §9): the
// sample data's codes run out (TEA30 on 2026-10-28, FREESHIP on 2026-11-12) and the dev backend
// is read only, so they are tried in turn. The first the API takes is the one; a refused one
// (its error code kept) leads to the next; with none taken the caller goes on without a coupon
// and says so. `E2E_COUPONS` (comma-separated) replaces the list: a focused run proves the
// fallbacks with codes the API refuses for real (an expired sample code, an unknown one). Pure.

export const SAMPLE_COUPONS: readonly string[] = ['TEA30', 'FREESHIP']

/**
 * `env`'s codes (the caller passes `E2E_COUPONS`) when it names any, else the sample ones. An
 * explicit argument, never read here: the unit tests must not depend on the shell's value.
 */
export function couponsToTry(env: string | undefined): string[] {
  const named = (env ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
  return named.length > 0 ? named : [...SAMPLE_COUPONS]
}

export type CouponTry<T> = { code: string; taken: T } | { code: string; refusal: string }

export interface CouponChoice<T> {
  /** The first code the API took (with what the apply answered), or null. */
  applied: { code: string; taken: T } | null
  /** The codes refused before it, with the API's error code. */
  refused: { code: string; refusal: string }[]
}

/** Applies the codes in turn until one is taken (`apply` tries one). */
export async function firstTaken<T>(
  codes: readonly string[],
  apply: (code: string) => Promise<CouponTry<T>>,
): Promise<CouponChoice<T>> {
  const refused: CouponChoice<T>['refused'] = []
  for (const code of codes) {
    const tried = await apply(code)
    if ('taken' in tried) return { applied: tried, refused }
    refused.push(tried)
  }
  return { applied: null, refused }
}

import 'server-only'
import { cache } from 'react'
import { richContentHtml } from '@/features/content/rich-content'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import type { Paginated } from '@/lib/api/types/common'
import type { GatewayOption, PaymentMethodOption } from '@/lib/api/types/payment'

// The payment step's catalog, read on the server (order digest §1.6, §10): `payment/method/list/`
// and `payment/gateway/list/` share the anonymous 240/h `payment_status` budget with every
// payment status poll, so they come from the Next.js data cache (60 s, anonymous, no visitor IP:
// one copy for every shopper) and go to the checkout as props. The operator's route texts are
// sanitised here, so the parser never reaches the browser. Never throws: a list that cannot be
// read is null (the page offers to read it again).

const REVALIDATE_SECONDS = 60
const TIMEOUT_MS = 5_000

/** A route as the browser gets it: its texts made safe (null: nothing visible). */
export interface PaymentMethodView extends Omit<
  PaymentMethodOption,
  'description' | 'instruction'
> {
  /** Sanitised operator HTML, or null. */
  description: string | null
  instruction: string | null
}

export interface PaymentCatalog {
  methods: PaymentMethodView[] | null
  gateways: GatewayOption[] | null
}

async function list<T>(path: string): Promise<T[] | null> {
  try {
    const { data } = await apiFetch<Paginated<T>>(path, {
      // A shop lists a handful of each; one page is all of them.
      query: { limit: 100 },
      revalidate: REVALIDATE_SECONDS,
      tags: ['payment-catalog'],
      timeoutMs: TIMEOUT_MS,
    })
    return Array.isArray(data?.results) ? data.results : null
  } catch (error) {
    const what = error instanceof ApiError ? `${error.status} ${error.code}` : String(error)
    console.error(`[payment] ${path} failed:`, what)
    return null
  }
}

/** The route's texts sanitised (links open in a new tab: following one keeps the checkout). */
export function methodView(method: PaymentMethodOption): PaymentMethodView {
  const safe = (html: string) =>
    html.trim() ? richContentHtml(html, { linksInNewTab: true }) : null
  return { ...method, description: safe(method.description), instruction: safe(method.instruction) }
}

export const getPaymentCatalog = cache(async (): Promise<PaymentCatalog> => {
  const [methods, gateways] = await Promise.all([
    list<PaymentMethodOption>('payment/method/list/'),
    list<GatewayOption>('payment/gateway/list/'),
  ])
  return { methods: methods?.map(methodView) ?? null, gateways }
})

import 'server-only'
import { headers } from 'next/headers'
import { cache } from 'react'
import { getServerEnv } from '@/config/env'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import type { OrderPaymentLink } from '@/lib/api/types/order'
import { getClientIp } from '@/lib/http/client-ip'
import { linkRefusalOf, type LinkRefusal } from './link-refusal'

// The payment link's page data, read on the server for its first render (order digest §3.1.9):
// `GET order/pay/<token>/`, public (the token is the credential), never cached (per order, and
// it changes as the order is paid), with the visitor's IP for the API's per-IP 30/min
// `order_payment_link` budget. One read per request: React `cache` shares it between the
// page's metadata and the page. Never throws: a refusal is an answer. Later reads (after the
// shopper acts) go through the BFF (link-api.ts). The token is a credential: a failure is
// logged with its status and code, never the path.

/** A link token's shape (43 URL-safe characters today; a little slack either way). */
export const LINK_TOKEN = /^[A-Za-z0-9_-]{20,64}$/

const TIMEOUT_MS = 8_000

export type PayLinkRead = { ok: true; link: OrderPaymentLink } | { ok: false; refusal: LinkRefusal }

export const readPayLink = cache(async (token: string): Promise<PayLinkRead> => {
  try {
    const { data } = await apiFetch<OrderPaymentLink>(`order/pay/${token}/`, {
      forwardedFor: getClientIp(await headers(), getServerEnv().CLIENT_IP_HEADER),
      timeoutMs: TIMEOUT_MS,
    })
    return { ok: true, link: data }
  } catch (error) {
    const refusal = linkRefusalOf(error)
    if (refusal.kind === 'unavailable') {
      const what = error instanceof ApiError ? `${error.status} ${error.code}` : 'unexpected'
      console.error('[pay-link] the link could not be read:', what)
    }
    return { ok: false, refusal }
  }
})

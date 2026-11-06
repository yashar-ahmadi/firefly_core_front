import { bffFetch } from '@/lib/api/client'
import type { PaymentStatusInfo } from '@/lib/api/types/payment'

// `GET payment/<uuid>/status/` through the BFF (order digest §3.2.5; the 240/h `payment_status`
// budget). Whoever holds the uuid reads the payment, signed in or not and whosever it is
// (BACKEND-ISSUES M-7, fixed: no 403 for another account's payment any more), so it always goes
// with the session. The uuid is a bearer credential: in the path only, never in a log.

export interface StatusReadOptions {
  signal?: AbortSignal
}

/** The payment as it is now; throws `ApiError`. */
export async function readPaymentStatus(
  uuid: string,
  { signal }: StatusReadOptions = {},
): Promise<PaymentStatusInfo> {
  return (await bffFetch<PaymentStatusInfo>(`payment/${uuid}/status/`, { signal })).data
}

import { bffFetch } from '@/lib/api/client'
import type { PaymentStatusInfo } from '@/lib/api/types/payment'

// `GET payment/<uuid>/status/` through the BFF (order digest §3.2.5; the 240/h `payment_status`
// budget). `anonymous` asks the BFF to send it without the session (`?anon=1`: the API refuses a
// signed-in visitor another account's payment but answers it anonymously, §11 #7). The uuid is a
// bearer credential: in the path only, never in a log.

export interface StatusReadOptions {
  anonymous?: boolean
  signal?: AbortSignal
}

/** The payment as it is now; throws `ApiError`. */
export async function readPaymentStatus(
  uuid: string,
  { anonymous = false, signal }: StatusReadOptions = {},
): Promise<PaymentStatusInfo> {
  const query = anonymous ? { anon: '1' } : undefined
  return (await bffFetch<PaymentStatusInfo>(`payment/${uuid}/status/`, { query, signal })).data
}

import { bffFetch } from '@/lib/api/client'
import type { OrderTrackingRequest, OrderTrackingResult } from '@/lib/api/types/order-detail'

// `POST order/track/` through the BFF (order digest §3.1.8): public, 20/min per IP
// (`order_tracking`), a POST with a body so the code and the number never reach a URL, a log or
// the history. The answer has no address, receiver, lines or money breakdown (by design); a miss
// (unknown code, wrong number, either) is one 404 `order_tracking_not_found`. Throws `ApiError`.
// Nothing here logs the body.

export async function trackOrder(
  body: OrderTrackingRequest,
  signal?: AbortSignal,
): Promise<OrderTrackingResult> {
  return (await bffFetch<OrderTrackingResult>('order/track/', { method: 'POST', body, signal }))
    .data
}

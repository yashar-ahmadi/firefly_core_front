import type { PaymentMethodView } from '@/features/payment/catalog'
import type { RouteChoice } from '@/features/payment/routes'

// What a payment route is called on screen, and the API's placeholder picture. Pure (the step
// summaries need the name without the route rows' code).

/** The API's placeholder (`/static/defaults/default.png`) stands for "no picture". */
export const isPlaceholder = (url: string | null | undefined) =>
  !url || url.includes('/static/defaults/')

/** The route's label: the operator's, or the route's own name for a confirmation not listed. */
export const routeLabel = (choice: RouteChoice<PaymentMethodView>) =>
  choice.method?.label ?? 'پرداخت در محل'

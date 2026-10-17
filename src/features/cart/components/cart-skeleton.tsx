import { Skeleton } from '@/components/ui/skeleton'

/** The cart page while the cart is read: two lines and the summary, in the page's own layout. */
export function CartSkeleton() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری سبد خرید"
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6"
    >
      <div className="flex flex-col divide-y divide-ink-100 rounded-card bg-white px-4 shadow-card md:px-6">
        {[0, 1].map((index) => (
          <div key={index} className="flex gap-3 py-5">
            <Skeleton className="size-22 shrink-0 rounded-control md:size-28" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-10 w-32" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-card bg-white p-5 shadow-card">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-2 h-13 w-full" />
      </div>
    </div>
  )
}

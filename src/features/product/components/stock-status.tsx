import { CircleCheck, CircleX, Package, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import type { Variant } from '@/lib/api/types/catalog'
import { formatNumber } from '@/lib/format'

function Line({
  icon,
  className,
  children,
}: {
  icon: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 text-base leading-7 [&_svg]:mt-1 [&_svg]:size-5 [&_svg]:shrink-0',
        className,
      )}
    >
      {icon}
      <span>{children}</span>
    </p>
  )
}

/**
 * The variant's stock (product digest §5.6): out of stock, with a pointer to the other choices
 * when some can be bought (`productInStock`); «only n left» when the API gives a number above
 * zero (marketing text, never a cap); else in stock. Then what a pack holds, for a pack.
 */
export function StockStatus({
  variant,
  productInStock,
}: {
  variant: Variant | null
  productInStock: boolean
}) {
  if (!variant) return null
  const left = variant.low_stock_quantity
  return (
    <div className="flex flex-col gap-1">
      {!variant.in_stock ? (
        <Line icon={<CircleX aria-hidden />} className="text-danger">
          {productInStock
            ? 'این ترکیب ناموجود است؛ رنگ یا ویژگی دیگری را انتخاب کنید.'
            : 'این کالا فعلاً موجود نیست.'}
        </Line>
      ) : left !== null && left > 0 ? (
        <Line icon={<TriangleAlert aria-hidden />} className="font-medium text-warning">
          {`تنها ${formatNumber(left)} عدد باقی مانده`}
        </Line>
      ) : (
        <Line icon={<CircleCheck aria-hidden />} className="text-success">
          موجود در انبار
        </Line>
      )}
      {variant.packing_factor > 1 && (
        <Line icon={<Package aria-hidden />} className="text-ink-700">
          {`هر بسته شامل ${formatNumber(variant.packing_factor)} ${variant.unit_name ?? 'عدد'}`}
        </Line>
      )}
    </div>
  )
}

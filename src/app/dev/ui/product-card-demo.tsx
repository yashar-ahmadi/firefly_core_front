import { Bell, ShoppingCart } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Price } from '@/components/ui/price'
import { Rating } from '@/components/ui/rating'
import { SmartImage } from '@/components/ui/smart-image'

// A sample product card built only from the primitives (the real one comes with the catalog).

export function ProductCardDemo({
  name,
  amount,
  original,
  rating,
  count,
  badge,
}: {
  name: string
  amount: number | null
  original?: number
  rating: number
  count: number
  badge?: string
}) {
  return (
    <Card asChild interactive className="flex flex-col">
      <article>
        <div className="relative p-2 pb-0 sm:p-3 sm:pb-0">
          <SmartImage
            src={null}
            alt={name}
            ratio="1/1"
            sizes="(min-width: 1024px) 280px, 50vw"
            className="rounded-control"
          />
          {badge && (
            <Badge
              tone="sale"
              variant="solid"
              size="sm"
              className="absolute start-4 top-4 sm:start-5 sm:top-5"
            >
              {badge}
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
          <h3
            dir="auto"
            className="line-clamp-2 min-h-12 text-sm leading-6 font-medium text-ink-800 sm:text-base"
          >
            {name}
          </h3>
          <Rating value={rating} count={count} size="sm" compact />
          <Price
            amount={amount}
            original={original}
            size="sm"
            className="mt-auto items-end self-end"
          />
          {amount === null ? (
            <Button size="sm" variant="outline" fullWidth iconStart={<Bell />}>
              خبرم کن
            </Button>
          ) : (
            <Button size="sm" variant="secondary" fullWidth iconStart={<ShoppingCart />}>
              افزودن به سبد
            </Button>
          )}
        </div>
      </article>
    </Card>
  )
}

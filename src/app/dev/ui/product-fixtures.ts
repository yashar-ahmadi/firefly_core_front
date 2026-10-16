import type { ProductCard } from '@/lib/api/types/catalog'
import live from './product-fixtures.json'

// Cards copied from the dev API (`GET /api/v1/product/list/`, 2026-10-16), for the /dev/ui
// showcase only. Dev data has no running discount, so the discounted and timed cards below change
// only their price fields; the long and Latin-first names are edited to stress the title.

const cards = live as ProductCard[]

function card(slug: string, changes: Partial<ProductCard> = {}): ProductCard {
  const found = cards.find((candidate) => candidate.slug === slug)
  if (!found) throw new Error(`No showcase fixture for ${slug}`)
  return { ...found, ...changes }
}

function discounted(slug: string, percent: number, changes: Partial<ProductCard> = {}) {
  const base = card(slug)
  const price = base.price ?? 0
  return card(slug, {
    has_discount: true,
    discount_percent: percent,
    final_price: Math.round((price * (100 - percent)) / 100),
    ...changes,
  })
}

const HOUR = 3_600_000

/** A timed deal ending `hours` after the dev server loaded this module. */
function endsIn(hours: number): Partial<ProductCard> {
  const end = Date.now() + hours * HOUR
  return { discount_end_time: new Date(end).toISOString(), discount_time_remaining: end }
}

export const SHOWCASE_PRODUCTS: ProductCard[] = [
  // Discount with a badge, ending within a day: the ticking clock pill.
  discounted('samsung-galaxy-s25-ultra', 25, endsIn(5)),
  // A deal two days out: the pill shows days.
  discounted('apple-iphone-16-pro-max', 12, endsIn(2 * 24 + 5)),
  // The longest badge with a timed deal (the badge yields to the pill); two of three chips.
  discounted('xiaomi-redmi-note-14-pro', 8, endsIn(9)),
  // Out of stock.
  card('chips-pack-family'),
  // No rating yet.
  card('hisense-tv-55-u7'),
  // A long mixed Persian and Latin name.
  card('nike-air-zoom-pegasus', {
    name: 'کفش ورزشی مخصوص دویدن مردانه نایکی مدل Air Zoom Pegasus 41 Premium رنگ مشکی',
  }),
  // A name that starts in Latin script (dir="auto" sets it left to right).
  card('apple-airpods-pro-2', { name: 'AirPods Pro 2 هندزفری بی سیم اپل با کیس شارژ USB-C' }),
  // Out of stock and discounted: the muted price.
  discounted('panasonic-microwave-25', 10),
  card('apple-macbook-air-m4'),
  card('pistachio-akbari-1kg'),
]

export function showcaseProduct(slug: string): ProductCard {
  const found = SHOWCASE_PRODUCTS.find((product) => product.slug === slug)
  if (!found) throw new Error(`No showcase product ${slug}`)
  return found
}

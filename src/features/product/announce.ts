import type { Variant } from '@/lib/api/types/catalog'
import { formatToman } from '@/lib/format'
import { NO_SUCH_COMBO, OUT_OF_STOCK } from './buy-state'
import type { ClientProduct } from './client-product'
import type { Selection } from './variant'

/**
 * What a screen reader hears after the shopper changes the variant (WCAG 4.1.3): the chosen
 * values of the axes with a choice, then the price and, if so, «ناموجود»; for a selection that
 * is no variant, «این ترکیب موجود نیست». E.g. «نقره ای، ۱ ترابایت: ۹۹٬۵۰۰٬۰۰۰ تومان، ناموجود».
 * Pure.
 */
export function choiceSummary(
  product: Pick<ClientProduct, 'variant_options'>,
  selection: Selection,
  variant: Variant | null,
): string {
  const names = product.variant_options
    .filter((option) => option.values.length > 1)
    .flatMap((option) => {
      const chosen = option.values.find((value) => value.id === selection.get(option.attribute_id))
      return chosen ? [chosen.name] : []
    })
  const choice = names.join('، ')
  if (variant === null) return `${choice}: ${NO_SUCH_COMBO}`
  const stock = variant.in_stock ? '' : `، ${OUT_OF_STOCK}`
  return `${choice}: ${formatToman(variant.final_price)}${stock}`
}

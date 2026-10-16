import { Check } from 'lucide-react'
import Image from 'next/image'
import { HIT_AREA } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import type { FilterAttributeValue } from '@/lib/api/types/catalog'
import { httpUrl } from '@/lib/html/safe-url'

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export interface SwatchProps {
  value: FilterAttributeValue
  selected: boolean
  onToggle: () => void
}

/**
 * A colour or pattern filter value: a toggle button named by the value, showing the colour (or
 * the pattern image) and the name. When chosen, a check mark sits on the swatch and the outline
 * turns brand, so the state never relies on colour alone. 40px tall with a 44px hit area.
 */
export function Swatch({ value, selected, onToggle }: SwatchProps) {
  const color = value.color?.trim() ?? ''
  const pattern = httpUrl(value.pattern)
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={value.name}
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-10 max-w-full items-center gap-2 rounded-pill border ps-1 pe-3.5 text-sm font-medium',
        'transition-[color,background-color,border-color] duration-150',
        HIT_AREA,
        selected
          ? 'border-brand bg-brand-50 text-brand-800 ring-1 ring-brand'
          : 'border-ink-500 bg-white text-ink-800 hover:border-ink-600 hover:bg-ink-50',
      )}
    >
      <span
        aria-hidden
        style={HEX_COLOR.test(color) ? { backgroundColor: color } : undefined}
        className={cn(
          'relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-ink-100',
          // A hairline inside the edge, so white and very light swatches stay visible.
          'after:absolute after:inset-0 after:rounded-full after:ring-1 after:ring-ink-900/20 after:ring-inset',
        )}
      >
        {pattern && (
          <Image src={pattern} alt="" fill sizes="32px" unoptimized className="object-cover" />
        )}
        {selected && (
          <span className="relative grid size-5 place-items-center rounded-full bg-white text-ink-900 shadow-sm">
            <Check strokeWidth={3} className="size-3.5" />
          </span>
        )}
      </span>
      <span dir="auto" className="truncate">
        {value.name}
      </span>
    </button>
  )
}

import { Check } from 'lucide-react'
import Image from 'next/image'
import type { KeyboardEvent, Ref } from 'react'
import { cn } from '@/components/ui/cn'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import type { InputType, VariantOptionValue } from '@/lib/api/types/catalog'
import { httpUrl } from '@/lib/html/safe-url'
import type { ValueState } from '../variant'

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** Read after the name, so the state is never shown by looks alone. */
const SPOKEN_STATE: Record<ValueState, string | null> = {
  buyable: null,
  out_of_stock: '، ناموجود',
  no_such_combo: '، در این ترکیب موجود نیست',
}

export interface VariantValueProps {
  value: VariantOptionValue
  inputType: InputType
  checked: boolean
  state: ValueState
  /** The roving tab stop: the checked value (or the first when none is). */
  tabbable: boolean
  onSelect: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  ref?: Ref<HTMLButtonElement>
}

/**
 * One value of a picker axis: a `radio` in its group. Colours and patterns show a swatch beside
 * the name (never the colour alone); other types are text chips. Chosen: brand outline, ring and
 * a check mark. Out of stock: the name struck through, still selectable. No such combination
 * beside the other choices: dashed and dimmed, still selectable (the picker moves to a variant
 * that exists). 44px tall.
 */
export function VariantValue({
  value,
  inputType,
  checked,
  state,
  tabbable,
  onSelect,
  onKeyDown,
  ref,
}: VariantValueProps) {
  const color = inputType === 'color' ? (value.color?.trim() ?? '') : ''
  const pattern = inputType === 'pattern' ? httpUrl(value.pattern) : null
  const swatch = HEX_COLOR.test(color) || pattern !== null
  const spoken = SPOKEN_STATE[state]

  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={tabbable ? 0 : -1}
      data-state={state}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'relative inline-flex h-11 max-w-full items-center gap-2 rounded-pill border text-base font-medium',
        'transition-[color,background-color,border-color,opacity] duration-150 motion-safe:active:scale-[0.98]',
        swatch ? 'ps-1.5 pe-4' : 'px-4',
        checked
          ? 'border-brand bg-brand-50 text-brand-800 ring-1 ring-brand'
          : 'border-ink-500 bg-white text-ink-800 hover:border-ink-600 hover:bg-ink-50',
        state === 'no_such_combo' && !checked && 'border-dashed bg-ink-50 text-ink-600',
      )}
    >
      {swatch ? (
        <span
          aria-hidden
          style={pattern === null ? { backgroundColor: color } : undefined}
          className={cn(
            'relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-ink-100',
            'after:absolute after:inset-0 after:rounded-full after:ring-1 after:ring-ink-900/20 after:ring-inset',
            state === 'no_such_combo' && !checked && 'opacity-40',
          )}
        >
          {pattern && (
            <Image src={pattern} alt="" fill sizes="32px" unoptimized className="object-cover" />
          )}
          {checked && (
            <span className="relative grid size-5 place-items-center rounded-full bg-white text-ink-900 shadow-sm">
              <Check strokeWidth={3} className="size-3.5" />
            </span>
          )}
        </span>
      ) : (
        checked && <Check aria-hidden strokeWidth={2.5} className="size-4 shrink-0" />
      )}
      <span
        dir="auto"
        className={cn('truncate', state === 'out_of_stock' && 'text-ink-500 line-through')}
      >
        {value.name}
      </span>
      {spoken && <VisuallyHidden>{spoken}</VisuallyHidden>}
    </button>
  )
}

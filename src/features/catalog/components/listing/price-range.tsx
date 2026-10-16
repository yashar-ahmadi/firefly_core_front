'use client'

import { Slider } from 'radix-ui'
import { useId, useState } from 'react'
import { cn } from '@/components/ui/cn'
import { Input } from '@/components/ui/input'
import { formatNumber, formatToman, toLatinDigits } from '@/lib/format'

/** A chosen price range; a missing end means "no bound". */
export interface PriceBounds {
  min?: number
  max?: number
}

export interface PriceRangeProps {
  /** `filters.price`: the prices of the purchasable products in the listing's context. */
  bounds: { min: number; max: number }
  /** The URL's `min_price` and `max_price`. */
  value: PriceBounds
  /**
   * Called when a choice is finished: a thumb released (or moved by a key press), or a field
   * left or confirmed with Enter. Never on every drag tick or keystroke. An end at (or past) the
   * edge of `bounds` is left out; reversed ends are swapped. A field left with no digit in it
   * goes back to its previous value (drag the thumb to the end, or remove the chip, to drop a
   * bound).
   */
  onCommit: (next: PriceBounds) => void
}

type Pair = [number, number]

/** A round slider step for about 100 to 200 stops: 1, 2 or 5 times a power of ten. */
function stepFor(span: number): number {
  const raw = span / 100
  if (raw <= 1) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const scaled = raw / magnitude
  return (scaled >= 5 ? 5 : scaled >= 2 ? 2 : 1) * magnitude
}

const clamp = (n: number, { min, max }: { min: number; max: number }) =>
  Math.min(Math.max(n, min), max)

function ordered([a, b]: Pair): Pair {
  return a <= b ? [a, b] : [b, a]
}

function pairOf(value: PriceBounds, bounds: { min: number; max: number }): Pair {
  return ordered([clamp(value.min ?? bounds.min, bounds), clamp(value.max ?? bounds.max, bounds)])
}

/** A decimal point: Latin, or the Arabic decimal separator «٫» (U+066B). */
const DECIMAL_POINT = /[.\u{066B}]/u
/** A dot before exactly three digits groups thousands («1.250.000»), as many keyboards write. */
const DOT_GROUPING = /\.(?=\d{3}(?!\d))/g

/**
 * A typed price: digits in any script, with grouping separators and spaces ignored. A dot before
 * exactly three digits is a thousands separator («1.250.000»); otherwise prices are whole tomans,
 * so anything after a decimal point is ignored («1.5» and «1.50» read as 1). undefined when
 * there is no digit at all (the field then goes back to its previous value).
 */
function parsePrice(text: string): number | undefined {
  const ungrouped = toLatinDigits(text).replace(DOT_GROUPING, '')
  const whole = ungrouped.split(DECIMAL_POINT)[0] ?? ''
  const digits = whole.replace(/\D/g, '')
  return digits === '' ? undefined : Number(digits)
}

/** The pair inside `bounds`: the track's round ends can lie just past them. */
function within([a, b]: Pair, bounds: { min: number; max: number }): Pair {
  return [clamp(a, bounds), clamp(b, bounds)]
}

const THUMB = cn(
  'relative block size-6 cursor-grab rounded-full border-2 border-brand bg-white shadow-card',
  'transition-[box-shadow] duration-150 hover:ring-4 hover:ring-brand-500/15 active:cursor-grabbing',
  'focus-visible:ring-4 focus-visible:ring-brand-500/25 focus-visible:outline-2 focus-visible:outline-offset-2',
  // 44px touch target around the 24px thumb.
  'after:absolute after:-inset-2.5',
)

/**
 * The price filter: a two-thumb slider (Radix, right-to-left) over `bounds` plus two fields
 * that show Persian digits and accept Latin or Persian ones. The thumbs move freely while
 * dragging; the URL changes once, when the choice is finished. Follows `value` when the URL
 * changes (back and forward).
 */
export function PriceRange({ bounds, value, onCommit }: PriceRangeProps) {
  const unitId = useId()
  const step = stepFor(bounds.max - bounds.min)
  // Round track ends, so the stops are round prices.
  const track = {
    min: Math.floor(bounds.min / step) * step,
    max: Math.ceil(bounds.max / step) * step,
  }

  const source = `${value.min}|${value.max}|${bounds.min}|${bounds.max}`
  const [shown, setShown] = useState(() => ({ source, pair: pairOf(value, bounds) }))
  // What the visitor is typing in each field; null shows the formatted price.
  const [drafts, setDrafts] = useState<[string | null, string | null]>([null, null])
  if (shown.source !== source) {
    setShown({ source, pair: pairOf(value, bounds) })
    setDrafts([null, null])
  }
  const [low, high] = shown.pair

  function commit(pair: Pair) {
    const [min, max] = ordered(within(pair, bounds))
    setShown((current) => ({ ...current, pair: [min, max] }))
    const next = {
      min: min > bounds.min ? min : undefined,
      max: max < bounds.max ? max : undefined,
    }
    if (next.min !== value.min || next.max !== value.max) onCommit(next)
  }

  function commitField(index: 0 | 1) {
    const draft = drafts[index]
    if (draft === null) return
    setDrafts(([a, b]) => (index === 0 ? [null, b] : [a, null]))
    const parsed = parsePrice(draft)
    if (parsed === undefined) return
    const typed = clamp(parsed, bounds)
    commit(index === 0 ? [typed, high] : [low, typed])
  }

  const field = (index: 0 | 1, label: string) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-sm text-ink-700">{label}</span>
      <Input
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        aria-describedby={unitId}
        value={drafts[index] ?? formatNumber(shown.pair[index])}
        onChange={(event) => {
          const text = event.target.value
          setDrafts(([a, b]) => (index === 0 ? [text, b] : [a, text]))
        }}
        onBlur={() => commitField(index)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          commitField(index)
        }}
        inputClassName="px-3"
      />
    </label>
  )

  return (
    <div>
      <Slider.Root
        dir="rtl"
        min={track.min}
        max={track.max}
        step={step}
        value={shown.pair}
        onValueChange={([min = low, max = high]) => {
          setShown((current) => ({ ...current, pair: within([min, max], bounds) }))
          setDrafts([null, null])
        }}
        onValueCommit={([min = low, max = high]) => commit([min, max])}
        className="relative mx-3 flex h-11 touch-none items-center select-none"
      >
        <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-ink-200">
          <Slider.Range className="absolute h-full rounded-full bg-brand" />
        </Slider.Track>
        <Slider.Thumb aria-label="حداقل قیمت" aria-valuetext={formatToman(low)} className={THUMB} />
        <Slider.Thumb
          aria-label="حداکثر قیمت"
          aria-valuetext={formatToman(high)}
          className={THUMB}
        />
      </Slider.Root>
      {/* Side by side when there is room for nine digits each (the sheet), else one per row
          (the sidebar), so a price such as ۱۳۴٬۵۰۰٬۰۰۰ is never cut. */}
      <div className="@container mt-2">
        <div className="grid gap-3 @xs:grid-cols-2">
          {field(0, 'حداقل قیمت')}
          {field(1, 'حداکثر قیمت')}
        </div>
      </div>
      <p id={unitId} className="mt-1.5 text-sm text-ink-600">
        قیمت‌ها به تومان
      </p>
    </div>
  )
}

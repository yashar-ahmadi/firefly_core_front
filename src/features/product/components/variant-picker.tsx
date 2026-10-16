'use client'

import { useRef, type KeyboardEvent } from 'react'
import type { Variant, VariantOption } from '@/lib/api/types/catalog'
import { valueState, type Selection } from '../variant'
import { useProduct } from './product-provider'
import { VariantValue } from './variant-value'

/** Keys that move within a group: in RTL, left is the next value in reading order. */
const STEP: Record<string, (index: number, last: number) => number> = {
  ArrowLeft: (index, last) => (index === last ? 0 : index + 1),
  ArrowDown: (index, last) => (index === last ? 0 : index + 1),
  ArrowRight: (index, last) => (index === 0 ? last : index - 1),
  ArrowUp: (index, last) => (index === 0 ? last : index - 1),
  Home: () => 0,
  End: (_index, last) => last,
}

/** «رنگ: مشکی» above the group: the axis and its current value. */
function AxisLabel({ name, value }: { name: string; value: string | undefined }) {
  return (
    <p className="text-base leading-7">
      <span className="font-medium text-ink-900">{name}:</span>{' '}
      <span dir="auto" className="text-ink-700">
        {value}
      </span>
    </p>
  )
}

function Axis({
  option,
  selection,
  variants,
  onSelect,
}: {
  option: VariantOption
  selection: Selection
  variants: readonly Variant[]
  onSelect: (valueId: number) => void
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const chosenId = selection.get(option.attribute_id)
  const chosenIndex = option.values.findIndex((value) => value.id === chosenId)
  const last = option.values.length - 1

  // The radio pattern: arrows move focus and choose; Tab leaves the group.
  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = STEP[event.key]
    if (!step) return
    event.preventDefault()
    const target = step(index, last)
    const value = option.values[target]
    if (!value) return
    onSelect(value.id)
    buttons.current[target]?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      <AxisLabel name={option.attribute_name} value={option.values[chosenIndex]?.name} />
      <div role="radiogroup" aria-label={option.attribute_name} className="flex flex-wrap gap-2">
        {option.values.map((value, index) => (
          <VariantValue
            key={value.id}
            ref={(button) => {
              buttons.current[index] = button
            }}
            value={value}
            inputType={option.input_type}
            checked={value.id === chosenId}
            state={valueState(variants, selection, option.attribute_id, value.id)}
            tabbable={chosenIndex === -1 ? index === 0 : index === chosenIndex}
            onSelect={() => onSelect(value.id)}
            onKeyDown={onKeyDown(index)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * The variant picker (product digest §5.2): one radio group per axis, in the API's order, each
 * value drawn by the axis's `input_type` (colour and pattern swatches with their names, text
 * chips for radio and select: a native select could not show a value's state). Every value is
 * shown: out of stock struck through, a missing combination dashed; both stay selectable. An
 * axis with a single value is static text. Nothing for a product without options.
 */
export function VariantPicker() {
  const { product, selection, select } = useProduct()
  if (product.variant_options.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {product.variant_options.map((option) => {
        if (option.values.length === 1) {
          return (
            <AxisLabel
              key={option.attribute_id}
              name={option.attribute_name}
              value={option.values[0]?.name}
            />
          )
        }
        return (
          <Axis
            key={option.attribute_id}
            option={option}
            selection={selection}
            variants={product.variants}
            onSelect={(valueId) => select(option.attribute_id, valueId)}
          />
        )
      })}
    </div>
  )
}

import { describe, expect, it } from 'vitest'
import {
  currentVariant,
  initialSelection,
  requestedVariantId,
  resolveVariant,
  selectValue,
  valueState,
  type Selection,
} from '@/features/product/variant'
import type { Variant } from '@/lib/api/types/catalog'
import { AXIS, chipsProduct, s25Product, VALUE, variantOf } from './fixtures'

const product = s25Product()
const { variant_options: options, variants } = product

/** A selection from [axis, value] pairs. */
const sel = (...pairs: [number, number][]): Selection => new Map(pairs)

const BLACK_256 = sel(
  [AXIS.colour, VALUE.black],
  [AXIS.storage, VALUE.gb256],
  [AXIS.ram, VALUE.ram12],
)

describe('initialSelection', () => {
  it('is the values of the default variant, one per axis', () => {
    const selection = initialSelection(options, variants, product.default_variant_id)
    const ids = variantOf(product, product.default_variant_id ?? 0).attribute_value_ids
    expect([...selection.values()].sort()).toEqual([...ids].sort())
    expect(selection).toEqual(BLACK_256)
  })

  it('is empty without a default variant (nothing can be bought)', () => {
    expect(initialSelection(options, variants, null).size).toBe(0)
    expect(initialSelection(options, variants, 1).size).toBe(0)
  })
})

describe('resolveVariant', () => {
  it('finds the variant whose value set equals the selection', () => {
    expect(resolveVariant(variants, BLACK_256)?.id).toBe(10001)
    const gold = sel(
      [AXIS.colour, VALUE.gold],
      [AXIS.storage, VALUE.gb256],
      [AXIS.ram, VALUE.ram12],
    )
    expect(resolveVariant(variants, gold)?.id).toBe(10003)
  })

  it('is null for a combination no variant has', () => {
    const black1tb = sel(
      [AXIS.colour, VALUE.black],
      [AXIS.storage, VALUE.tb1],
      [AXIS.ram, VALUE.ram12],
    )
    expect(resolveVariant(variants, black1tb)).toBeNull()
  })

  it('needs the whole set: a partial selection is no variant', () => {
    expect(resolveVariant(variants, sel([AXIS.colour, VALUE.black]))).toBeNull()
  })
})

describe('valueState', () => {
  it("says what silver is, from the fixture's own variants", () => {
    // Silver exists only as 10004 (silver, 1 TB), which is out of stock.
    const silverVariants = variants.filter((v) => v.attribute_value_ids.includes(VALUE.silver))
    expect(silverVariants.map((v) => [v.id, v.in_stock])).toEqual([[10004, false]])
    // Beside black/256 GB there is no silver at all…
    expect(valueState(variants, BLACK_256, AXIS.colour, VALUE.silver)).toBe('no_such_combo')
    // …beside 1 TB there is, and it cannot be bought.
    const silver1tb = sel(
      [AXIS.colour, VALUE.silver],
      [AXIS.storage, VALUE.tb1],
      [AXIS.ram, VALUE.ram12],
    )
    expect(valueState(variants, silver1tb, AXIS.colour, VALUE.silver)).toBe('out_of_stock')
  })

  it('marks the other values against the rest of the selection', () => {
    expect(valueState(variants, BLACK_256, AXIS.colour, VALUE.black)).toBe('buyable')
    expect(valueState(variants, BLACK_256, AXIS.colour, VALUE.gold)).toBe('buyable')
    expect(valueState(variants, BLACK_256, AXIS.storage, VALUE.gb512)).toBe('buyable')
    expect(valueState(variants, BLACK_256, AXIS.storage, VALUE.tb1)).toBe('no_such_combo')
    expect(valueState(variants, BLACK_256, AXIS.ram, VALUE.ram12)).toBe('buyable')
  })
})

describe('selectValue', () => {
  it('keeps an existing combination as chosen', () => {
    const next = selectValue(options, variants, BLACK_256, AXIS.storage, VALUE.gb512)
    expect(resolveVariant(variants, next)?.id).toBe(10002)
  })

  it('auto-adjusts a missing combination to an existing variant with the clicked value', () => {
    // Silver is only 10004 (silver, 1 TB): the storage follows.
    const silver = selectValue(options, variants, BLACK_256, AXIS.colour, VALUE.silver)
    expect(resolveVariant(variants, silver)?.id).toBe(10004)
    // Gold beside 512 GB does not exist: gold/256 GB keeps the most of the selection (12 GB).
    const black512 = selectValue(options, variants, BLACK_256, AXIS.storage, VALUE.gb512)
    const gold = selectValue(options, variants, black512, AXIS.colour, VALUE.gold)
    expect(resolveVariant(variants, gold)?.id).toBe(10003)
    expect(gold.get(AXIS.colour)).toBe(VALUE.gold)
  })

  it('keeps an existing out-of-stock combination: the shopper sees «ناموجود»', () => {
    const silver1tb = selectValue(options, variants, BLACK_256, AXIS.storage, VALUE.tb1)
    const variant = resolveVariant(variants, silver1tb)
    expect(variant?.id).toBe(10004)
    expect(variant?.in_stock).toBe(false)
  })

  describe('ties', () => {
    // Axes 1 (values 1, 2), 2 (values 10, 11) and 3 (values 20, 21); the selection is 1, 10, 20.
    const axes = [
      [1, [1, 2]],
      [2, [10, 11]],
      [3, [20, 21]],
    ].map(([id, values]) => ({
      attribute_id: id as number,
      attribute_name: `محور ${id}`,
      input_type: 'radio' as const,
      values: (values as number[]).map((value) => ({
        id: value,
        name: String(value),
        color: null,
        pattern: null,
        display_priority: value,
        has_available_variant: true,
      })),
    }))
    const v = (id: number, ids: number[], inStock: boolean): Variant => ({
      ...variantOf(product, 10001),
      id,
      attribute_value_ids: ids,
      in_stock: inStock,
    })
    const start = sel([1, 1], [2, 10], [3, 20])
    const pick = (list: Variant[]) => resolveVariant(list, selectValue(axes, list, start, 1, 2))?.id

    it('takes the variant keeping the most of the selection, even out of stock', () => {
      expect(
        pick([v(1, [1, 10, 20], true), v(2, [2, 11, 21], true), v(3, [2, 11, 20], false)]),
      ).toBe(3)
    })

    it('prefers a variant in stock among equally close ones', () => {
      expect(
        pick([v(1, [1, 10, 20], true), v(2, [2, 11, 20], false), v(3, [2, 10, 21], true)]),
      ).toBe(3)
    })

    it('then the server order (the default first, then by id)', () => {
      expect(
        pick([v(1, [1, 10, 20], true), v(2, [2, 11, 20], true), v(3, [2, 10, 21], true)]),
      ).toBe(2)
    })
  })
})

describe('currentVariant', () => {
  it('resolves the selection when the product has a picker', () => {
    expect(currentVariant(product, BLACK_256)?.id).toBe(10001)
    expect(currentVariant(product, sel([AXIS.colour, VALUE.silver]))).toBeNull()
  })

  it('is the default variant for a product without options', () => {
    const chips = chipsProduct()
    expect(currentVariant(chips, new Map())?.id).toBe(10128)
    expect(currentVariant({ ...chips, default_variant_id: null }, new Map())).toBeNull()
  })
})

describe('requestedVariantId (`?variant=`)', () => {
  it('takes a variant of this product, else the default', () => {
    expect(requestedVariantId(product, '10003')).toBe(10003)
    expect(requestedVariantId(product, ['10002', '10003'])).toBe(10002)
    for (const raw of [undefined, '', 'abc', '10003abc', '99999', '1e4', ' 10003']) {
      expect(requestedVariantId(product, raw)).toBe(10001)
    }
  })
})

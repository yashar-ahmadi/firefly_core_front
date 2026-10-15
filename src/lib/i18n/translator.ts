import { toPersianDigits } from '@/lib/format/digits'
import { fa } from '@/lib/i18n/fa'

export type TranslateVars = Record<string, string | number>
export type Translate = (key: string, vars?: TranslateVars) => string

const PLACEHOLDER = /\{(\w+)\}/g

/** Unknown keys already reported, so a missing label warns once instead of on every render. */
const reportedKeys = new Set<string>()

function lookup(dictionary: Record<string, string>, key: string): string | undefined {
  // `hasOwn`: a key like "constructor" must not resolve to an inherited property.
  if (!Object.hasOwn(dictionary, key)) return undefined
  const value = dictionary[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function interpolate(template: string, vars: TranslateVars | undefined): string {
  if (!vars) return template
  // A replacer function, so "$&"-style sequences in a value are never interpreted.
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    if (!Object.hasOwn(vars, name)) return placeholder
    const value = vars[name]
    return typeof value === 'number' ? toPersianDigits(value) : String(value)
  })
}

/**
 * Build the `t(key, vars?)` function: the operator's `overrides` win over the bundled Persian
 * dictionary, `{name}` placeholders are replaced (numbers in Persian digits; strings are used as
 * given; an unknown placeholder stays), and a blank override counts as unset. An unknown key
 * returns the key itself and warns once per key outside production.
 * Pure: usable in Server and Client Components.
 */
export function createTranslator(overrides: Record<string, string>): Translate {
  return (key, vars) => {
    const template = lookup(overrides, key) ?? lookup(fa, key)
    if (template === undefined) {
      if (process.env.NODE_ENV !== 'production' && !reportedKeys.has(key)) {
        reportedKeys.add(key)
        console.warn(`[i18n] missing translation key "${key}"`)
      }
      return key
    }
    return interpolate(template, vars)
  }
}

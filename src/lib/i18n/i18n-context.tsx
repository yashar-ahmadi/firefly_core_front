'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createTranslator, type Translate } from '@/lib/i18n/translator'

// The interface dictionary for Client Components: the bundled Persian labels with the operator's
// overrides (`getTranslations()`, read by the root layout) merged over them.

/** Outside the provider (isolated tests, say) the bundled dictionary alone is used. */
const I18nContext = createContext<Translate>(createTranslator({}))

export function I18nProvider({
  overrides,
  children,
}: {
  overrides: Record<string, string>
  children: ReactNode
}) {
  const translate = useMemo(() => createTranslator(overrides), [overrides])
  return <I18nContext value={translate}>{children}</I18nContext>
}

/** `t(key, vars?)`: see `createTranslator`. */
export function useT(): Translate {
  return useContext(I18nContext)
}

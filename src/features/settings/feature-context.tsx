'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { FeatureKey } from '@/lib/api/types/common'
import type { FeatureState } from '@/lib/api/types/settings'

/**
 * The ten feature switches in Client Components. The root layout passes `getFeatureStatus()` as
 * the initial map; when the API answers `503 feature_disabled` later (the switch was turned off
 * after the page loaded), `markFeatureDisabled` turns it off here too. The QueryClient's global
 * error handler does that for every query and mutation (src/app/providers.tsx). A newer map from
 * a server re-render (`router.refresh()`) replaces what the page knew, so a switch turned back
 * on shows up again.
 */

export type FeatureMap = Record<FeatureKey, FeatureState>

export interface FeatureSwitch {
  enabled: boolean
  /** Operator text, only while disabled. */
  reason: string | null
}

export type MarkFeatureDisabled = (key: FeatureKey, reason: string) => void

type Switches = Partial<Record<FeatureKey, FeatureSwitch>>

interface FeatureContextValue {
  switches: Switches
  markFeatureDisabled: MarkFeatureDisabled
}

/** A key the API did not return is enabled (the API's own rule). */
const ENABLED: FeatureSwitch = { enabled: true, reason: null }

function toSwitches(map: Partial<FeatureMap>): Switches {
  const switches: Switches = {}
  for (const state of Object.values(map)) {
    if (state) switches[state.key] = { enabled: state.enabled, reason: state.reason }
  }
  return switches
}

const FeatureContext = createContext<FeatureContextValue | null>(null)

export function FeatureProvider({
  initial,
  children,
}: {
  initial: Partial<FeatureMap>
  children: ReactNode
}) {
  const [state, setState] = useState(() => ({ initial, switches: toSwitches(initial) }))
  // A server re-render brings a newer map: it replaces the local switches.
  if (state.initial !== initial) setState({ initial, switches: toSwitches(initial) })

  // Stable for the provider's lifetime: the QueryClient keeps the first one it is given.
  const [markFeatureDisabled] = useState(() => {
    const mark: MarkFeatureDisabled = (key, reason) => {
      const next = { enabled: false, reason: reason.trim() === '' ? null : reason }
      setState((current) => {
        const previous = current.switches[key]
        if (previous && !previous.enabled && previous.reason === next.reason) return current
        return { ...current, switches: { ...current.switches, [key]: next } }
      })
    }
    return mark
  })

  const value = useMemo(
    () => ({ switches: state.switches, markFeatureDisabled }),
    [state.switches, markFeatureDisabled],
  )
  return <FeatureContext value={value}>{children}</FeatureContext>
}

function useFeatureContext(): FeatureContextValue {
  const context = useContext(FeatureContext)
  if (!context) throw new Error('Feature switches must be used inside FeatureProvider')
  return context
}

/** Whether a feature is on, with the operator's reason while it is off. */
export function useFeature(key: FeatureKey): FeatureSwitch {
  const state = useFeatureContext().switches[key] ?? ENABLED
  return useMemo(() => ({ enabled: state.enabled, reason: state.reason }), [state])
}

/** `markFeatureDisabled(key, reason)`: call it on a `503 feature_disabled` for `key`. Stable. */
export function useMarkFeatureDisabled(): MarkFeatureDisabled {
  return useFeatureContext().markFeatureDisabled
}

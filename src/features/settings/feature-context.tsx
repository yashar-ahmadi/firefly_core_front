'use client'

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { FeatureKey } from '@/lib/api/types/common'
import type { FeatureState } from '@/lib/api/types/settings'

/**
 * The ten feature switches in Client Components. The root layout passes `getFeatureStatus()` as
 * the initial map; when the API answers `503 feature_disabled` later (the switch was turned off
 * after the page loaded), `markFeatureDisabled` turns it off here too. The QueryClient's global
 * error handler does that for every query and mutation (src/app/providers.tsx).
 */

export type FeatureMap = Record<FeatureKey, FeatureState>

export interface FeatureSwitch {
  enabled: boolean
  /** Operator text, only while disabled. */
  reason: string | null
}

export type MarkFeatureDisabled = (key: FeatureKey, reason: string) => void

interface FeatureStore {
  get: (key: FeatureKey) => FeatureSwitch
  subscribe: (listener: () => void) => () => void
  markFeatureDisabled: MarkFeatureDisabled
}

/** A key the API did not return is enabled (the API's own rule). */
const ENABLED: FeatureSwitch = { enabled: true, reason: null }

/**
 * Switches live outside React state so that the query cache (not a component) can update them,
 * and a change re-renders only the components that read that key.
 */
function createFeatureStore(initial: Partial<FeatureMap>): FeatureStore {
  const switches = new Map<FeatureKey, FeatureSwitch>()
  for (const state of Object.values(initial)) {
    if (state) switches.set(state.key, { enabled: state.enabled, reason: state.reason })
  }
  const listeners = new Set<() => void>()
  return {
    get: (key) => switches.get(key) ?? ENABLED,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    markFeatureDisabled(key, reason) {
      const next = { enabled: false, reason: reason.trim() === '' ? null : reason }
      const current = switches.get(key)
      if (current && !current.enabled && current.reason === next.reason) return
      switches.set(key, next)
      for (const listener of [...listeners]) listener()
    },
  }
}

const FeatureContext = createContext<FeatureStore | null>(null)

/** `initial` is read once: later switch changes arrive through `markFeatureDisabled`. */
export function FeatureProvider({
  initial,
  children,
}: {
  initial: Partial<FeatureMap>
  children: ReactNode
}) {
  const [store] = useState(() => createFeatureStore(initial))
  return <FeatureContext value={store}>{children}</FeatureContext>
}

function useFeatureStore(): FeatureStore {
  const store = useContext(FeatureContext)
  if (!store) throw new Error('Feature switches must be used inside FeatureProvider')
  return store
}

/** Whether a feature is on, with the operator's reason while it is off. */
export function useFeature(key: FeatureKey): FeatureSwitch {
  const store = useFeatureStore()
  const state = useSyncExternalStore(
    store.subscribe,
    () => store.get(key),
    () => store.get(key),
  )
  return useMemo(() => ({ enabled: state.enabled, reason: state.reason }), [state])
}

/** `markFeatureDisabled(key, reason)`: call it on a `503 feature_disabled` for `key`. Stable. */
export function useMarkFeatureDisabled(): MarkFeatureDisabled {
  return useFeatureStore().markFeatureDisabled
}

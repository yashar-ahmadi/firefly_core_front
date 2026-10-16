import { create } from 'zustand'

// Quick view (spec §8.12): one host in the shop layout shows the panel; any card, rail or table
// opens it with a product's slug. The panel's code loads on first use (see QuickViewHost).

export interface QuickViewRequest {
  /** New for every opening, so the panel starts over (choice, quantity). */
  id: number
  slug: string
  /** The variant shown first; null: the product's representative (default) variant. */
  variantId: number | null
}

export interface QuickViewState {
  /** The last product asked for; kept while the panel closes, so it can animate out. */
  request: QuickViewRequest | null
  open: boolean
  /** Mounted hosts. Without one, openers fall back to the product page. */
  hosts: number
}

export const useQuickViewStore = create<QuickViewState>()(() => ({
  request: null,
  open: false,
  hosts: 0,
}))

let lastId = 0

export interface QuickViewOptions {
  variantId?: number | null
}

/**
 * Opens quick view on the product. Returns false, doing nothing, when no host is mounted (a page
 * outside the shop layout, or quick view switched off): the caller goes to the product page.
 */
export function openQuickView(slug: string, options: QuickViewOptions = {}): boolean {
  if (useQuickViewStore.getState().hosts === 0) return false
  lastId += 1
  useQuickViewStore.setState({
    request: { id: lastId, slug, variantId: options.variantId ?? null },
    open: true,
  })
  return true
}

export function closeQuickView(): void {
  useQuickViewStore.setState({ open: false })
}

/** Called by a host on mount; the returned function unregisters it. */
export function registerQuickViewHost(): () => void {
  useQuickViewStore.setState((state) => ({ hosts: state.hosts + 1 }))
  return () => useQuickViewStore.setState((state) => ({ hosts: state.hosts - 1 }))
}

const ACTIONS = { open: openQuickView }

/** `open(slug, { variantId? })`: true when a host shows it. */
export function useQuickView(): { open: typeof openQuickView } {
  return ACTIONS
}

/**
 * Starts loading the panel's code (on a trigger's hover or focus) so a press opens it at once.
 * A failed download is ignored here: opening tries again.
 */
export function preloadQuickView(): void {
  import('./quick-view').catch(() => {})
}

import { describe, expect, it } from 'vitest'
import { progressFromServer, progressFromTracking } from '@/features/orders/progress'
import type { OrderDetail, OrderTrackingResult } from '@/lib/api/types/order-detail'
import delivered from '../../fixtures/order-detail-delivered.json'
import returned from '../../fixtures/order-detail-returned.json'
import store from '../../fixtures/order-detail-store.json'
import live from '../../fixtures/order-track.json'

// The derived bar (progressFromTracking) against the server's own (order digest §6.2) for the same
// live orders, and the server's bar taken as it came (progressFromServer: what the account's
// order page draws, Task 8).

describe('the derived bar matches the server’s for the same live orders', () => {
  // The same orders read both ways (2026-10-18): the account's detail (progress from the server)
  // and tracking (derived). Only «در حال انجام»'s date differs: tracking has no `confirmed_at`.
  it.each<[string, OrderTrackingResult, OrderDetail]>([
    [
      'delivered (website)',
      live.delivered.body.data as OrderTrackingResult,
      delivered.data as OrderDetail,
    ],
    [
      'delivered (store: no dispatch)',
      live.store_delivered.body.data as OrderTrackingResult,
      store.data as OrderDetail,
    ],
    ['returned', live.returned.body.data as OrderTrackingResult, returned.data as OrderDetail],
  ])('%s', (_, tracked, detail) => {
    const server = progressFromServer(detail.progress)
    const derived = progressFromTracking(tracked)
    expect(derived.terminal).toBe(server.terminal)
    expect(derived.steps).toEqual(
      server.steps.map((step) =>
        step.key === 'processing' ? { ...step, reached_at: null } : step,
      ),
    )
  })
})

describe('progressFromServer', () => {
  it('is the server’s bar as it came: its keys, labels, states and dates', () => {
    const detail = delivered.data as OrderDetail
    const view = progressFromServer(detail.progress)
    expect(view.terminal).toBe(false)
    expect(view.steps).toEqual(
      detail.progress.steps.map((step) => ({
        key: step.status,
        label: step.label,
        state: step.state,
        reached_at: step.reached_at,
      })),
    )
  })
})

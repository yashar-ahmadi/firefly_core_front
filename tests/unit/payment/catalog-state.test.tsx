import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePaymentCatalog } from '@/features/payment/use-payment-catalog'
import { catalog, methodViews } from './fixtures'

// The payment catalog in the browser follows the server's copy when it comes again (a refresh
// of the page brings new props): the newest list wins over the one the page started with.

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))

describe('usePaymentCatalog', () => {
  it('takes the server’s copy again when its props change', () => {
    const missing = catalog({ methods: null, gateways: null })
    const { result, rerender } = renderHook(({ initial }) => usePaymentCatalog(initial), {
      initialProps: { initial: missing },
    })
    expect(result.current.methods).toBeNull()
    rerender({ initial: catalog() })
    expect(result.current.methods).toEqual(methodViews())
    expect(result.current.gateways.length).toBeGreaterThan(0)
  })
})

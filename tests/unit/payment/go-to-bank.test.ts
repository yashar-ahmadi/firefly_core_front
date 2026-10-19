import { afterEach, describe, expect, it, vi } from 'vitest'
import { goToBank } from '@/features/payment/go-to-bank'
import { UnsafeHandoffError } from '@/features/payment/handoff-url'
import { handoff } from './fixtures'

// The way to the bank (order digest §5.4): a GET handoff is the gateway's URL with its params
// in the query, loaded as a new page; a POST one is a form of hidden fields, submitted. A URL
// that is no bank's (handoff-url.ts: not https, or not http outside production) is refused
// before anything happens: never given to `location` nor to a form's `action`.

const mocks = vi.hoisted(() => ({ loadPage: vi.fn() }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
  mocks.loadPage.mockReset()
  document.body.innerHTML = ''
})

describe('goToBank', () => {
  it('GET: the URL with every param set in its query (kept params too)', () => {
    goToBank(handoff({ url: 'https://bank.example/pay?lang=fa', params: { Token: 'T 1&2' } }))
    expect(mocks.loadPage).toHaveBeenCalledTimes(1)
    const url = new URL(mocks.loadPage.mock.calls[0]![0] as string)
    expect(url.origin + url.pathname).toBe('https://bank.example/pay')
    expect(url.searchParams.get('lang')).toBe('fa')
    expect(url.searchParams.get('Token')).toBe('T 1&2')
  })

  it('POST: a form of hidden inputs to the gateway’s URL, submitted', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    goToBank(
      handoff({
        method: 'POST',
        url: 'https://bpm.shaparak.ir/pgwchannel/startpay.mellat',
        params: { RefId: 'AF82041a2Bf6989c7fF9', MobileNo: '989121234567' },
      }),
    )
    expect(mocks.loadPage).not.toHaveBeenCalled()
    expect(submit).toHaveBeenCalledTimes(1)
    const form = submit.mock.contexts[0] as HTMLFormElement
    expect(form.isConnected).toBe(true)
    expect(form.method).toBe('post')
    expect(form.action).toBe('https://bpm.shaparak.ir/pgwchannel/startpay.mellat')
    const inputs = [...form.querySelectorAll('input')]
    expect(inputs.map((input) => [input.type, input.name, input.value])).toEqual([
      ['hidden', 'RefId', 'AF82041a2Bf6989c7fF9'],
      ['hidden', 'MobileNo', '989121234567'],
    ])
  })

  it.each(['GET', 'POST'] as const)(
    '%s to a `javascript:` URL: refused, nothing loaded, no form',
    (method) => {
      const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
      expect(() =>
        goToBank(handoff({ method, url: 'javascript:alert(1)', params: { Token: 'x' } })),
      ).toThrow(UnsafeHandoffError)
      expect(mocks.loadPage).not.toHaveBeenCalled()
      expect(submit).not.toHaveBeenCalled()
      expect(document.querySelector('form')).toBeNull()
    },
  )

  it('a production build: an http bank is refused too', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(() => goToBank(handoff({ url: 'http://bank.example/pay' }))).toThrow(
        UnsafeHandoffError,
      )
      expect(mocks.loadPage).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

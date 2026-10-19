import { afterEach, describe, expect, it, vi } from 'vitest'
import { bankUrl } from '@/features/payment/handoff-url'

// Where a bank handoff may send the browser (Plan 4 final fix wave): the URL comes from the API,
// and a misbehaving backend's `javascript:` or `data:` URL would run on the shop's own origin
// through `location.assign` or a form's `action`. Only `https:` leaves, and `http:` in a build
// that is not production (a sandbox gateway on the developer's machine). Anything else is no
// bank: the page refuses it and goes nowhere.

afterEach(() => vi.unstubAllEnvs())

describe('bankUrl', () => {
  it('an https URL: the bank (its query kept)', () => {
    expect(bankUrl('https://bpm.shaparak.ir/pgwchannel/startpay.mellat')?.href).toBe(
      'https://bpm.shaparak.ir/pgwchannel/startpay.mellat',
    )
    expect(
      bankUrl('HTTPS://sep.shaparak.ir/OnlinePG/OnlinePG?lang=fa')?.searchParams.get('lang'),
    ).toBe('fa')
  })

  it('http: only outside a production build', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(bankUrl('http://localhost:8000/sandbox/pay/')).not.toBeNull()
    vi.stubEnv('NODE_ENV', 'production')
    expect(bankUrl('http://localhost:8000/sandbox/pay/')).toBeNull()
    expect(bankUrl('http://bank.example/pay')).toBeNull()
    expect(bankUrl('https://bank.example/pay')).not.toBeNull()
  })

  it.each([
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'blob:https://shop.example/0b1c',
    'file:///etc/passwd',
    'ftp://bank.example/pay',
    '/payment/callback/',
    '//bank.example/pay',
    'not a url',
    '',
  ])('%j: no bank', (raw) => {
    expect(bankUrl(raw)).toBeNull()
  })
})

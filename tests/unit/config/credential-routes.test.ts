import { describe, expect, it } from 'vitest'
import {
  carriesCredential,
  credentialQueryValue,
  CREDENTIAL_PREFIXES,
  isCredentialPath,
} from '@/config/credential-routes'

// The pages whose URL holds a bearer credential (order digest §1.3): the payment link's token
// (`/order/pay/<token>/`) and a payment's uuid (`/payment/…`), and a page whose `next` leads
// back to one (the login the link page offers for the wallet). They render no operator code and
// send no referrer.

const TOKEN = 'k3J9f0qLx2mN8pR1sT4uV7wY0zA3bC6dE9gH2jK5mN8'

describe('isCredentialPath', () => {
  it.each([
    `/order/pay/${TOKEN}/`,
    `/order/pay/${TOKEN}`,
    '/order/pay/',
    '/order/pay',
    '/payment/callback/',
    '/payment/card-transfer/3f1c7a52-9a0e-4c4b-b5e0-0d2f3b1c9a77/',
    // Spelled in capitals, Next answers 404 there; its page still carries the token in the URL.
    `/ORDER/Pay/${TOKEN}/`,
  ])('%s holds a credential', (path) => {
    expect(isCredentialPath(path)).toBe(true)
  })

  it.each(['/', '/order/track/', '/orders/pay/x/', '/payments/', '/paymentx/', '/checkout/'])(
    '%s does not',
    (path) => {
      expect(isCredentialPath(path)).toBe(false)
    },
  )
})

describe('carriesCredential', () => {
  const url = (path: string) => new URL(path, 'https://shop.ir')

  it('reads the path, and the page `next` leads back to after a login', () => {
    expect(carriesCredential(url(`/order/pay/${TOKEN}/`))).toBe(true)
    expect(carriesCredential(url(`/login/?next=/order/pay/${TOKEN}/`))).toBe(true)
    expect(carriesCredential(url(`/register/?next=%2Forder%2Fpay%2F${TOKEN}%2F`))).toBe(true)
    expect(carriesCredential(url('/login/?next=/payment/callback/?payment=x'))).toBe(true)
  })

  it('leaves every other page alone', () => {
    expect(carriesCredential(url('/login/?next=/account/'))).toBe(false)
    expect(carriesCredential(url('/login/?next=https://x.ir/order/pay/t/'))).toBe(false)
    expect(carriesCredential(url('/product/x/?next=/x/order/pay/t/'))).toBe(false)
    expect(carriesCredential(url('/'))).toBe(false)
  })
})

describe('the shared spelling', () => {
  it('names both prefixes, each with its trailing slash', () => {
    expect(CREDENTIAL_PREFIXES).toEqual(['/order/pay/', '/payment/'])
  })

  it('gives next.config the `next` value pattern (anchored there): the same prefixes', () => {
    const pattern = new RegExp(`^${credentialQueryValue()}$`)
    expect(pattern.test(`/order/pay/${TOKEN}/`)).toBe(true)
    expect(pattern.test('/payment/callback/')).toBe(true)
    expect(pattern.test('/account/')).toBe(false)
    expect(pattern.test('/x/order/pay/t/')).toBe(false)
  })
})

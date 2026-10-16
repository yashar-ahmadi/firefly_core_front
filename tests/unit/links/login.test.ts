import { describe, expect, it } from 'vitest'
import { loginHref } from '@/lib/links/login'

describe('loginHref', () => {
  it('sends no next from the home page, with or without a query', () => {
    expect(loginHref('/')).toBe('/login/')
    expect(loginHref('/?utm_source=sms')).toBe('/login/')
    expect(loginHref('/#top')).toBe('/login/')
  })

  it('sends no next from the auth pages', () => {
    expect(loginHref('/login/')).toBe('/login/')
    expect(loginHref('/login/?next=/cart/')).toBe('/login/')
    expect(loginHref('/register/')).toBe('/login/')
  })

  it('keeps any other page and its query as a readable next', () => {
    expect(loginHref('/account/')).toBe('/login/?next=/account/')
    expect(loginHref('/product/list/?brand=apple')).toBe(
      '/login/?next=/product/list/%3Fbrand%3Dapple',
    )
  })
})

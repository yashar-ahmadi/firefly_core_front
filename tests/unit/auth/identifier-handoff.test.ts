import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearIdentifierHandoff,
  handOffIdentifier,
  keepIdentifier,
  peekIdentifier,
  releaseIdentifier,
  takeIdentifier,
} from '@/features/auth/identifier-handoff'
import { forgotPasswordHref, loginPageHref, registerHref } from '@/features/auth/auth-links'

// What the visitor typed on one auth page goes to the next one by a one-shot handoff, never in
// the URL (history, server logs, Referer and the operator's analytics would all see it).

beforeEach(() => {
  sessionStorage.clear()
  clearIdentifierHandoff()
  for (const page of ['/login/', '/register/', '/forgot-password/'] as const) {
    releaseIdentifier(page)
  }
})

afterEach(() => vi.restoreAllMocks())

describe('the links between the auth pages', () => {
  it('carry the page to return to, and nothing the visitor typed', () => {
    expect(loginPageHref('/cart/')).toBe('/login/?next=%2Fcart%2F')
    expect(registerHref('/cart/')).toBe('/register/?next=%2Fcart%2F')
    expect(forgotPasswordHref('/cart/')).toBe('/forgot-password/?next=%2Fcart%2F')
    expect(loginPageHref()).toBe('/login/')
    expect(registerHref('')).toBe('/register/')
    for (const href of [loginPageHref('/x/'), registerHref('/x/'), forgotPasswordHref('/x/')]) {
      expect(href).not.toMatch(/identifier/)
    }
  })
})

describe('the identifier handoff', () => {
  it('is read by the page it was handed to, normalised, and kept until cleared', () => {
    handOffIdentifier('/register/', ' Sara.Ahmadi@Example.com ')
    expect(peekIdentifier('/login/')).toBe('')
    expect(peekIdentifier('/register/')).toBe('Sara.Ahmadi@Example.com')
    expect(peekIdentifier('/register/')).toBe('Sara.Ahmadi@Example.com')
    clearIdentifierHandoff()
    expect(peekIdentifier('/register/')).toBe('')
  })

  it('lives in this tab’s session storage, not in the URL', () => {
    handOffIdentifier('/login/', '۰۹۱۲۱۲۳۴۵۰۱')
    expect(window.location.href).not.toContain('0912')
    expect(sessionStorage.length).toBe(1)
    expect(peekIdentifier('/login/')).toBe('09121234501')
    clearIdentifierHandoff()
    expect(sessionStorage.length).toBe(0)
  })

  it('works without storage (a private window, blocked site data): kept in memory', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)
    handOffIdentifier('/forgot-password/', 'sara.ahmadi@example.com')
    expect(peekIdentifier('/forgot-password/')).toBe('sara.ahmadi@example.com')
    clearIdentifierHandoff()
    expect(peekIdentifier('/forgot-password/')).toBe('')
  })

  it('a newer handoff replaces the older one', () => {
    handOffIdentifier('/register/', 'nobody@example.com')
    handOffIdentifier('/login/', 'sara.ahmadi@example.com')
    expect(peekIdentifier('/register/')).toBe('')
    expect(peekIdentifier('/login/')).toBe('sara.ahmadi@example.com')
  })

  it('prefills only an email address or a mobile number', () => {
    for (const value of ['', 'sara', `${'a'.repeat(250)}@example.com`]) {
      handOffIdentifier('/login/', value)
      expect(peekIdentifier('/login/'), value).toBe('')
    }
    sessionStorage.setItem('ff_handoff', '{"page":"/login/","identifier":42}')
    expect(peekIdentifier('/login/')).toBe('')
  })
})

describe('taking the handoff', () => {
  it('clears it at once, answers the same until the page lets go, then nothing', () => {
    handOffIdentifier('/login/', 'sara.ahmadi@example.com')
    expect(takeIdentifier('/login/')).toBe('sara.ahmadi@example.com')
    expect(sessionStorage.length).toBe(0)
    expect(peekIdentifier('/login/')).toBe('')
    // The page renders again: the same value.
    expect(takeIdentifier('/login/')).toBe('sara.ahmadi@example.com')
    releaseIdentifier('/login/')
    // A later visit starts empty.
    expect(takeIdentifier('/login/')).toBe('')
  })

  it('leaves a handoff to another page for it', () => {
    handOffIdentifier('/register/', 'nobody@example.com')
    expect(takeIdentifier('/login/')).toBe('')
    expect(takeIdentifier('/register/')).toBe('nobody@example.com')
  })

  it('a remount of the same page keeps what it took', () => {
    handOffIdentifier('/forgot-password/', '09121234501')
    const identifier = takeIdentifier('/forgot-password/')
    releaseIdentifier('/forgot-password/')
    keepIdentifier('/forgot-password/', identifier)
    expect(takeIdentifier('/forgot-password/')).toBe('09121234501')
    // Another page letting go does not take it away.
    releaseIdentifier('/login/')
    expect(takeIdentifier('/forgot-password/')).toBe('09121234501')
  })
})

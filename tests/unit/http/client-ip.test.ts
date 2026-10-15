import { describe, expect, it } from 'vitest'
import { getClientIp } from '@/lib/http/client-ip'

function headersOf(init: Record<string, string>): Headers {
  return new Headers(init)
}

describe('getClientIp', () => {
  it('reads x-real-ip', () => {
    expect(getClientIp(headersOf({ 'x-real-ip': '9.9.9.9' }), 'x-real-ip')).toBe('9.9.9.9')
  })

  it('takes the first entry of x-forwarded-for', () => {
    const headers = headersOf({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })
    expect(getClientIp(headers, 'x-forwarded-for')).toBe('1.1.1.1')
  })

  it('skips empty leading entries of a list', () => {
    const headers = headersOf({ 'x-forwarded-for': ' , 3.3.3.3, 4.4.4.4' })
    expect(getClientIp(headers, 'x-forwarded-for')).toBe('3.3.3.3')
  })

  it('matches the configured header name case-insensitively and trims it', () => {
    const headers = headersOf({ 'cf-connecting-ip': '5.5.5.5' })
    expect(getClientIp(headers, '  CF-Connecting-IP ')).toBe('5.5.5.5')
  })

  it('trims the value', () => {
    expect(getClientIp(headersOf({ 'x-real-ip': '  6.6.6.6  ' }), 'x-real-ip')).toBe('6.6.6.6')
  })

  it('accepts IPv6 addresses', () => {
    expect(getClientIp(headersOf({ 'x-real-ip': '2001:db8::1' }), 'x-real-ip')).toBe('2001:db8::1')
    expect(getClientIp(headersOf({ 'x-forwarded-for': '::1, 1.1.1.1' }), 'x-forwarded-for')).toBe(
      '::1',
    )
    expect(getClientIp(headersOf({ 'x-real-ip': '::ffff:10.0.0.1' }), 'x-real-ip')).toBe(
      '::ffff:10.0.0.1',
    )
  })

  it('returns null for the "none" setting even when headers are present', () => {
    const headers = headersOf({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' })
    expect(getClientIp(headers, 'none')).toBeNull()
    expect(getClientIp(headers, ' NONE ')).toBeNull()
  })

  it('returns null when the header is missing or empty', () => {
    expect(getClientIp(headersOf({}), 'x-real-ip')).toBeNull()
    expect(getClientIp(headersOf({ 'x-real-ip': '   ' }), 'x-real-ip')).toBeNull()
    expect(getClientIp(headersOf({ 'x-forwarded-for': ' , ' }), 'x-forwarded-for')).toBeNull()
    expect(getClientIp(headersOf({ 'x-real-ip': '9.9.9.9' }), '')).toBeNull()
  })

  it('returns null for values that are not an IP address', () => {
    expect(getClientIp(headersOf({ 'x-real-ip': 'unknown' }), 'x-real-ip')).toBeNull()
    expect(getClientIp(headersOf({ 'x-real-ip': 'evil, injected' }), 'x-real-ip')).toBeNull()
  })
})

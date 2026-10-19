import { describe, expect, it } from 'vitest'
import { cssValue, linkerStyle } from '@/features/linker/linker-theme'
import { CYAN } from './linker-fixtures'

// The linker's theme as CSS variables on its root (content digest §8): the API's palette as
// given (a colour or a gradient), one radius for buttons and pictures. A value that is not a
// plain colour or gradient (a declaration smuggled after a `;`, a `url(`) never reaches the
// style: the classic palette's value stands in.

describe('cssValue', () => {
  it.each(['#ffffff', 'transparent', 'linear-gradient(#0891b2, #22d3ee)', 'rgba(0, 0, 0, 0.5)'])(
    'keeps %s',
    (value) => {
      expect(cssValue(value, '#000')).toBe(value)
    },
  )

  it.each([
    'red; background-image: url(https://evil.example/x.png)',
    'url(https://evil.example/x.png)',
    'red } body { display: none',
    'expression(alert(1))',
    '<script>',
    'var(--x)',
    '',
  ])('replaces %s', (value) => {
    expect(cssValue(value, '#000')).toBe('#000')
  })
})

describe('linkerStyle', () => {
  it('sets the five palette variables and the radius', () => {
    expect(linkerStyle(CYAN, true)).toEqual({
      '--linker-background': 'linear-gradient(#0891b2, #22d3ee)',
      '--linker-text': '#ffffff',
      '--linker-button-background': 'transparent',
      '--linker-button-text': '#ffffff',
      '--linker-button-border': '#ffffff',
      '--linker-radius': '0.875rem',
    })
  })

  it('square corners without rounded_edges', () => {
    expect(linkerStyle(CYAN, false)).toMatchObject({ '--linker-radius': '0' })
  })
})

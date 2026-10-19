import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReadingProgress } from '@/features/blog/components/reading-progress'

// The thin bar over the page that fills as the post is read: decorative (aria-hidden), moved by
// a transform only (fixed: nothing shifts), updated from a passive scroll listener once a frame,
// and without a transition under reduced motion.

let top = 0
const HEIGHT = 3000
/** Animation frames, run when the test says (a browser runs them before the next paint). */
let frames: FrameRequestCallback[] = []

function mountArticle() {
  const article = document.createElement('article')
  article.id = 'post-body'
  article.getBoundingClientRect = () => ({ top, height: HEIGHT }) as DOMRect
  document.body.append(article)
}

const bar = () => document.querySelector<HTMLElement>('[data-reading-progress]')!

beforeEach(() => {
  top = 200
  vi.stubGlobal('innerHeight', 1000)
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  mountArticle()
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.getElementById('post-body')?.remove()
})

function scrollTo(next: number) {
  top = next
  act(() => {
    window.dispatchEvent(new Event('scroll'))
    // Several scroll events before a frame: one update.
    window.dispatchEvent(new Event('scroll'))
  })
  expect(frames).toHaveLength(1)
  for (const frame of frames.splice(0)) frame(0)
}

describe('ReadingProgress', () => {
  it('is a fixed, decorative bar, empty before the post is reached', () => {
    render(<ReadingProgress targetId="post-body" />)
    expect(bar().closest('[aria-hidden="true"]')).not.toBeNull()
    expect(bar().parentElement).toHaveClass('fixed')
    expect(bar().style.transform).toBe('scaleX(0)')
  })

  it('fills with the share of the post scrolled past, up to whole at its end', () => {
    render(<ReadingProgress targetId="post-body" />)
    scrollTo(-1000)
    expect(bar().style.transform).toBe('scaleX(0.5)')
    scrollTo(-2000)
    expect(bar().style.transform).toBe('scaleX(1)')
    scrollTo(-5000)
    expect(bar().style.transform).toBe('scaleX(1)')
  })

  it('listens passively, and stops when the page goes', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<ReadingProgress targetId="post-body" />)
    expect(add).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    unmount()
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('animates only when motion is welcome', () => {
    render(<ReadingProgress targetId="post-body" />)
    expect(bar().className).toMatch(/motion-safe:transition-transform/)
    expect(bar().className).not.toMatch(/(?:^|\s)transition/)
  })
})

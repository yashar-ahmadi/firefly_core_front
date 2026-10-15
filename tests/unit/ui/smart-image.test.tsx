import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PLACEHOLDER_SRC, SmartImage, isOptimizable } from '@/components/ui/smart-image'

const MEDIA = 'https://api.shop.ir'

describe('isOptimizable', () => {
  it('optimizes same-origin paths', () => {
    expect(isOptimizable('/images/banner.png')).toBe(true)
  })

  it('optimizes media and static files on the media origin', () => {
    expect(isOptimizable(`${MEDIA}/media/products/a.jpg`, MEDIA)).toBe(true)
    expect(isOptimizable(`${MEDIA}/static/defaults/default.png`, `${MEDIA}/`)).toBe(true)
  })

  it('does not optimize other hosts, other paths or an unknown media origin', () => {
    expect(isOptimizable('https://cdn.example.com/media/a.jpg', MEDIA)).toBe(false)
    expect(isOptimizable(`${MEDIA}/uploads/a.jpg`, MEDIA)).toBe(false)
    expect(isOptimizable(`${MEDIA}/media/a.jpg`)).toBe(false)
  })

  it('does not optimize loopback or private hosts, which the optimizer refuses', () => {
    expect(isOptimizable('http://localhost:8000/media/a.jpg', 'http://localhost:8000')).toBe(false)
    expect(isOptimizable('http://127.0.0.1:8000/media/a.jpg', 'http://127.0.0.1:8000')).toBe(false)
  })

  it('does not optimize data, blob or protocol-relative sources', () => {
    expect(isOptimizable('data:image/png;base64,AAAA')).toBe(false)
    expect(isOptimizable('blob:https://shop.ir/1')).toBe(false)
    expect(isOptimizable('//cdn.example.com/a.jpg')).toBe(false)
  })
})

describe('SmartImage', () => {
  it('uses the placeholder when there is no source', () => {
    render(<SmartImage src={null} alt="گوشی" ratio="1/1" />)
    expect(screen.getByRole('img', { name: 'گوشی' }).getAttribute('src')).toContain(PLACEHOLDER_SRC)
  })

  it('falls back to the placeholder when the image fails to load', () => {
    render(<SmartImage src="https://cdn.example.com/a.jpg" alt="گوشی" ratio="1/1" />)
    const img = screen.getByRole('img', { name: 'گوشی' })
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/a.jpg')
    fireEvent.error(img)
    expect(screen.getByRole('img', { name: 'گوشی' }).getAttribute('src')).toContain(PLACEHOLDER_SRC)
  })

  it('optimizes a same-origin image through next/image', () => {
    render(<SmartImage src="/images/banner.png" alt="بنر" width={640} height={360} />)
    const src = screen.getByRole('img', { name: 'بنر' }).getAttribute('src') ?? ''
    expect(src).toContain('/_next/image')
    expect(src).toContain(encodeURIComponent('/images/banner.png'))
  })

  it('applies the aspect ratio to its frame', () => {
    const { container } = render(<SmartImage src={null} alt="" ratio="1/1" className="frame" />)
    const frame = container.querySelector('.frame') as HTMLElement
    expect(frame.style.aspectRatio).toBe('1 / 1')
  })
})

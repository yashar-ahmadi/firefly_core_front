import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PLACEHOLDER_SRC, SmartImage, isOptimizable } from '@/components/ui/smart-image'
import type { PublicStoreConfig } from '@/config/resolve-store-config'
import { StoreConfigProvider } from '@/lib/config-context'

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

  it('takes the media origin from the store config', () => {
    const config = { mediaOrigin: MEDIA } as PublicStoreConfig
    render(
      <StoreConfigProvider value={config}>
        <SmartImage src={`${MEDIA}/media/a.jpg`} alt="از تنظیمات" width={100} height={100} />
        <SmartImage
          src={`${MEDIA}/media/b.jpg`}
          alt="مبدأ دیگر"
          mediaOrigin="https://other.example.com"
          width={100}
          height={100}
        />
      </StoreConfigProvider>,
    )
    const fromConfig = screen.getByRole('img', { name: 'از تنظیمات' }).getAttribute('src') ?? ''
    expect(fromConfig).toContain('/_next/image')
    // An explicit prop still wins.
    const overridden = screen.getByRole('img', { name: 'مبدأ دیگر' }).getAttribute('src')
    expect(overridden).toBe(`${MEDIA}/media/b.jpg`)
  })

  it('shows a skeleton in the frame until the image loads', async () => {
    const { container } = render(
      <SmartImage src="https://cdn.example.com/a.jpg" alt="گوشی" ratio="1/1" skeleton />,
    )
    const skeleton = () => container.querySelector('[data-image-skeleton]')
    expect(skeleton()).not.toBeNull()
    // next/image reports the load after `decode()`, a microtask later.
    fireEvent.load(screen.getByRole('img', { name: 'گوشی' }))
    await waitFor(() => expect(skeleton()).toBeNull())
  })

  it('shows the skeleton again for the placeholder after a failure, until it loads', async () => {
    const { container } = render(
      <SmartImage src="https://cdn.example.com/a.jpg" alt="گوشی" ratio="1/1" skeleton />,
    )
    const skeleton = () => container.querySelector('[data-image-skeleton]')
    fireEvent.error(screen.getByRole('img', { name: 'گوشی' }))
    expect(skeleton()).not.toBeNull()
    // next/image reports the load after `decode()`, a microtask later.
    fireEvent.load(screen.getByRole('img', { name: 'گوشی' }))
    await waitFor(() => expect(skeleton()).toBeNull())
  })

  it('has no skeleton unless asked', () => {
    const { container } = render(<SmartImage src={null} alt="" ratio="1/1" />)
    expect(container.querySelector('[data-image-skeleton]')).toBeNull()
  })
})

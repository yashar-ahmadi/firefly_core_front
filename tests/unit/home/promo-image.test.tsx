import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PromoImage } from '@/features/home/promo-image'

const IMAGE = 'https://api.shop.ir/media/homepage/hero.png'
const MOBILE = 'https://api.shop.ir/media/homepage/hero-mobile.png'

function renderImage(props: Partial<Parameters<typeof PromoImage>[0]> = {}) {
  return render(
    <PromoImage image={IMAGE} mobileImage={MOBILE} alt="جشنواره" sizes="100vw" {...props} />,
  )
}

/** Makes every <img> report a finished load: broken when `naturalWidth` is 0. */
function stubFinishedImages(naturalWidth: number) {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(naturalWidth)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PromoImage', () => {
  it('serves the mobile picture through <source> and loads lazily by default', () => {
    const { container } = renderImage()
    const source = container.querySelector('picture > source')
    expect(source).toHaveAttribute('media', '(max-width: 767px)')
    expect(source).toHaveAttribute('srcset', MOBILE)
    const img = container.querySelector('picture > img')
    expect(img).toHaveAttribute('src', IMAGE)
    expect(img).toHaveAttribute('alt', 'جشنواره')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).not.toHaveAttribute('fetchpriority')
  })

  it('loads the LCP picture eagerly with high priority', () => {
    const { container } = renderImage({ priority: true, mobileImage: null })
    expect(container.querySelector('picture > source')).toBeNull()
    const img = container.querySelector('picture > img')
    expect(img).toHaveAttribute('loading', 'eager')
    expect(img).toHaveAttribute('fetchpriority', 'high')
  })

  it('removes a picture that fails to load, so the frame shows instead', () => {
    const { container } = renderImage()
    fireEvent.error(container.querySelector('img')!)
    expect(container).toBeEmptyDOMElement()
  })

  it('removes a picture that had already failed before it was hydrated', () => {
    stubFinishedImages(0)
    const { container } = renderImage()
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps a picture that had already loaded', () => {
    stubFinishedImages(1920)
    const { container } = renderImage()
    expect(container.querySelector('picture > img')).toHaveAttribute('src', IMAGE)
  })

  it('tries a new picture again after a failed one', () => {
    const { container, rerender } = renderImage()
    fireEvent.error(container.querySelector('img')!)
    rerender(
      <PromoImage
        image="https://api.shop.ir/media/homepage/next.png"
        mobileImage={null}
        alt="جشنواره"
        sizes="100vw"
      />,
    )
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://api.shop.ir/media/homepage/next.png',
    )
  })
})

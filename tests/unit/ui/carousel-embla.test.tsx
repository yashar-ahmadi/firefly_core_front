import { render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Carousel } from '@/components/ui/carousel'
import { stubBrowserApis } from '../support/dom-stubs'

// The real Embla (carousel.test.tsx uses a fake one). It needs observers jsdom lacks.
stubBrowserApis()

describe('Carousel', () => {
  it('renders aria-roledescription="carousel" with its label, and numbered slides', () => {
    render(
      <Carousel ariaLabel="پیشنهادهای ویژه">
        <div>اسلاید اول</div>
        <div>اسلاید دوم</div>
        <div>اسلاید سوم</div>
      </Carousel>,
    )
    const carousel = screen.getByRole('region', { name: 'پیشنهادهای ویژه' })
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel')
    expect(carousel).toHaveAttribute('dir', 'rtl')

    const slides = within(carousel).getAllByRole('group', { name: /از/ })
    expect(slides).toHaveLength(3)
    expect(slides[0]).toHaveAttribute('aria-roledescription', 'slide')
    expect(slides[0]).toHaveAccessibleName('۱ از ۳')
    expect(slides[2]).toHaveAccessibleName('۳ از ۳')
    expect(slides[1]).toHaveTextContent('اسلاید دوم')
  })

  it('reserves the controls row in the server HTML when autoplay is set, before Embla measures', () => {
    const rows = (autoplayMs?: number) => {
      const host = document.createElement('div')
      host.innerHTML = renderToString(
        <Carousel ariaLabel="بنرها" autoplayMs={autoplayMs}>
          <div>بنر اول</div>
          <div>بنر دوم</div>
        </Carousel>,
      )
      return host.querySelector('section')!.children.length
    }
    expect(rows(5000)).toBe(2)
    expect(rows()).toBe(1)
  })
})

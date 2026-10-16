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

  it('hides an autoplay-only controls row under reduced motion, where it would be empty', () => {
    const row = (props: { showDots?: boolean }) => {
      const host = document.createElement('div')
      host.innerHTML = renderToString(
        <Carousel ariaLabel="بنرها" autoplayMs={5000} {...props}>
          <div>بنر اول</div>
          <div>بنر دوم</div>
        </Carousel>,
      )
      return host.querySelector('section')!.children[1]!
    }
    // Under reduced motion autoplay never runs, so the pause button is not shown either.
    expect(row({})).toHaveClass('motion-reduce:hidden')
    // The dots still need the row.
    expect(row({ showDots: true })).not.toHaveClass('motion-reduce:hidden')
  })

  it('keeps the track clear of the arrows at each breakpoint where the slides overflow', () => {
    const track = (count: number, arrowGutters = true) => {
      const host = document.createElement('div')
      host.innerHTML = renderToString(
        <Carousel
          ariaLabel="کالاها"
          slidesPerView={{ base: 2.2, md: 3.5, lg: 5 }}
          arrowGutters={arrowGutters}
        >
          {Array.from({ length: count }, (_, index) => (
            <div key={index}>کالا</div>
          ))}
        </Carousel>,
      )
      return host.querySelector('[data-carousel-viewport]')!
    }
    // Seven slides overflow everywhere: 56px gutters from sm up (the arrows are hidden below).
    expect(track(7).className).toMatch(/(^| )sm:mx-14( |$)/)
    expect(track(7).className).not.toMatch(/(md|lg):mx-0/)
    // Four slides fit five per view from lg: no arrows there, so no gutters.
    expect(track(4).className).toMatch(/(^| )sm:mx-14( |$)/)
    expect(track(4).className).toMatch(/(^| )lg:mx-0( |$)/)
    // Two slides fit everywhere.
    expect(track(2).className).not.toMatch(/mx-14/)
    expect(track(7, false).className).not.toMatch(/mx-14/)
  })
})

import type { Metadata } from 'next'
import { QuickViewHost } from '@/features/quick-view/quick-view-host'
import { assertDevOnly } from '../dev-only'
import { ControlSections } from './control-sections'
import { DisplaySections } from './display-sections'
import { NavigationSections } from './navigation-sections'
import { OverlaySections } from './overlay-sections'
import { SECTIONS } from './showcase'
import { WidgetSections } from './widget-sections'

// Development-only gallery of the design-system primitives (src/components/ui).

export const metadata: Metadata = {
  title: 'اجزای رابط کاربری',
  robots: { index: false, follow: false },
}

export default function UiShowcasePage() {
  assertDevOnly()

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10 lg:px-8">
      <header className="mb-6 sm:mb-8">
        <p className="text-sm font-medium text-brand-700">سامانه طراحی</p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900 sm:text-3xl">اجزای رابط کاربری</h1>
        <p className="mt-2 max-w-2xl text-base text-ink-600">
          کنترل‌ها، اجزای نمایشی و پنجره‌های شناور فروشگاه، با رنگ‌ها و گردی گوشه‌های همین فروشگاه.
          این صفحه فقط در محیط توسعه در دسترس است.
        </p>
      </header>

      <nav
        aria-label="بخش‌ها"
        className="sticky top-0 z-10 -mx-4 mb-6 border-b border-ink-200 bg-ink-50/90 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8"
      >
        <ul className="flex [scrollbar-width:thin] gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
          {SECTIONS.map((section) => (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                className="inline-flex h-10 items-center rounded-pill border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-800"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* The root layout's skip link targets `#main`, as on the shop's pages (ShellFrame). */}
      <main id="main" tabIndex={-1} className="grid gap-6 outline-none sm:gap-8">
        <ControlSections />
        <DisplaySections />
        <WidgetSections />
        <OverlaySections />
        <NavigationSections />
      </main>
      {/* The shop layout mounts it on shop pages; the showcase is outside that layout. */}
      <QuickViewHost />
    </div>
  )
}

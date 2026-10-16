import type { ReactNode } from 'react'

// Layout helpers for the /dev/ui showcase only.

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="min-w-0 scroll-mt-24 rounded-card bg-white p-4 shadow-card sm:p-6 lg:p-8"
    >
      <header className="mb-6 border-b border-ink-100 pb-4">
        <h2 id={`${id}-title`} className="text-xl font-bold text-ink-900">
          {title}
        </h2>
        {description && <p className="mt-1 text-base text-ink-600">{description}</p>}
      </header>
      <div className="grid gap-8">{children}</div>
    </section>
  )
}

export function Demo({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className="grid min-w-0 content-start gap-3">
      <h3 className="text-sm font-medium text-ink-500">{label}</h3>
      {/* `className` replaces the default wrapping row (e.g. with a grid or a column). min-w-0
          stops wide scrollers (tabs, carousels) from stretching this grid item. */}
      <div className={`min-w-0 ${className ?? 'flex flex-wrap items-center gap-3'}`}>
        {children}
      </div>
    </div>
  )
}

export const SECTIONS = [
  { id: 'buttons', title: 'دکمه‌ها' },
  { id: 'inputs', title: 'ورودی‌ها' },
  { id: 'selection', title: 'گزینه‌ها' },
  { id: 'badges', title: 'برچسب‌ها و تراشه‌ها' },
  { id: 'cards', title: 'کارت‌ها' },
  { id: 'price', title: 'قیمت و امتیاز' },
  { id: 'stepper', title: 'تعداد' },
  { id: 'countdown', title: 'شمارش معکوس' },
  { id: 'otp', title: 'کد یک‌بارمصرف' },
  { id: 'pagination', title: 'صفحه‌بندی' },
  { id: 'empty', title: 'حالت خالی' },
  { id: 'skeletons', title: 'اسکلت بارگذاری' },
  { id: 'images', title: 'تصاویر' },
  { id: 'dialog', title: 'پنجره گفتگو' },
  { id: 'sheet', title: 'برگه پایینی' },
  { id: 'drawer', title: 'کشوی کناری' },
  { id: 'popover', title: 'پنجره شناور' },
  { id: 'menu', title: 'منوی کشویی' },
  { id: 'tooltip', title: 'راهنمای کوتاه' },
  { id: 'toast', title: 'اعلان‌ها' },
  { id: 'tabs', title: 'زبانه‌ها' },
  { id: 'accordion', title: 'بخش‌های تاشو' },
  { id: 'carousel', title: 'اسلایدر' },
  { id: 'scroll', title: 'ناحیه پیمایش' },
  { id: 'breadcrumbs', title: 'مسیر صفحه' },
] as const

export function sectionTitle(id: (typeof SECTIONS)[number]['id']): string {
  return SECTIONS.find((s) => s.id === id)?.title ?? id
}

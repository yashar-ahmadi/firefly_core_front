import { CircleHelp } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { FaqBrowser } from './faq-browser'
import type { FaqSection } from './faq-sections'
import { FAQ_TITLE } from './faq-seo'

const CONTACT_LINK =
  'font-medium text-brand-700 underline decoration-1 underline-offset-4 hover:decoration-2'

/**
 * The help centre's column (blog-faq digest §2.2): the page's one h1, then every category with
 * its questions (FaqBrowser: the search, the chip row, the questions as native disclosures), or
 * an empty state when no category has a visible question; under them, the way to the contact
 * form. A server component: only the browser's search ships code.
 */
export function FaqPage({ sections }: { sections: readonly FaqSection[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl leading-10 font-bold text-ink-900 md:text-3xl md:leading-[3rem]">
          {FAQ_TITLE}
        </h1>
        <p className="mt-2 text-base leading-8 text-ink-600">
          {
            'پاسخ پرسش\u{200C}های رایج را این\u{200C}جا پیدا کنید؛ روی هر پرسش بزنید تا پاسخش باز شود.'
          }
        </p>
      </header>
      {sections.length > 0 ? (
        <FaqBrowser sections={sections} />
      ) : (
        <EmptyState
          icon={<CircleHelp />}
          title="هنوز پرسشی در مرکز راهنما ثبت نشده است."
          className="rounded-card bg-white shadow-card"
        />
      )}
      <p className="text-base leading-8 text-ink-700">
        {'پاسخ پرسش خود را پیدا نکردید؟ '}
        <Link href="/contact-us/" className={CONTACT_LINK}>
          با ما تماس بگیرید
        </Link>
      </p>
    </div>
  )
}

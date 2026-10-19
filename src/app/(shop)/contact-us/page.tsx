import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { contactDetails } from '@/components/layout/contact-block'
import { CONTAINER } from '@/components/layout/container'
import { PreviewBar } from '@/components/layout/preview-bar'
import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { getContactPage, getContactSubjects } from '@/features/contact/api'
import { ContactForm } from '@/features/contact/contact-form'
import { ContactInfo } from '@/features/contact/contact-info'
import { contactHeading, contactJsonLd, contactMetadata } from '@/features/contact/contact-seo'
import { richContentHtml } from '@/features/content/rich-content'
import { RichContentBody } from '@/features/content/rich-content-body'
import { JsonLd } from '@/features/seo/json-ld'
import { propertyMetaTags } from '@/features/seo/page-metadata'
import { shopName } from '@/features/seo/shop-name'
import { getSiteSettings, getTranslations } from '@/features/settings/api'
import { createTranslator } from '@/lib/i18n/translator'

// Per request (content digest §9.2): a page built at build time lost what was typed on the
// stale-subject refresh in the guide's test, and the subjects must not be baked in.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const [page, shop] = await Promise.all([getContactPage(), shopName()])
  return contactMetadata(page, shop)
}

const FORM_TITLE_ID = 'contact-form-title'

/**
 * `/contact-us/`: the contact page, canonical (the backend's `support_link`; `/contact/` and
 * `/page/contact-us/` redirect here, next.config.ts). In the shop's layout, indexable: the trail
 * and its JSON-LD; the operator's `contact-us` page's title and content (sanitised) when there is
 * one, with its `property=` meta rows (its comments are not shown: the form is how to write to
 * the shop), a draft of it for staff under the preview bar (noindex; `getContactPage`); then the shop's contact details (ContactInfo, from the settings) beside the form
 * (ContactForm, with the subjects). On phones the details come first, as they read.
 *
 * Status codes (R9): no loading.tsx, nothing streams; the subjects are awaited (a failed read
 * is the error page), the content page never fails it (`getContactPage`).
 */
export default async function ContactRoute() {
  const [page, subjects, settings, translations] = await Promise.all([
    getContactPage(),
    getContactSubjects(),
    getSiteSettings(),
    getTranslations(),
  ])
  const title = contactHeading(page)
  const html = page?.content ? richContentHtml(page.content) : null
  const details = contactDetails(settings)
  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      {propertyMetaTags(page?.meta_tags ?? []).map((tag, index) => (
        <meta key={`${tag.field}-${index}`} property={tag.field.trim()} content={tag.value} />
      ))}
      <JsonLd data={contactJsonLd(page, getStoreConfig().siteUrl)} />
      {page?.is_unpublished && (
        <PreviewBar className="max-w-3xl">{'پیش\u{200C}نویس — منتشر نشده'}</PreviewBar>
      )}
      <Breadcrumbs items={[{ name: title }]} className="mb-2" />
      <h1
        dir="auto"
        className="mb-4 text-2xl leading-10 font-bold text-ink-900 md:mb-6 md:text-3xl md:leading-[3rem]"
      >
        {title}
      </h1>
      {html && (
        <RichContentBody
          html={html}
          className="rich-content mb-6 max-w-3xl rounded-card bg-white p-4 text-base leading-8 shadow-card md:p-6"
        />
      )}
      <div
        className={cn(
          'grid items-start gap-6 lg:gap-8',
          details ? 'lg:grid-cols-[22rem_minmax(0,1fr)]' : 'max-w-3xl',
        )}
      >
        {details && <ContactInfo details={details} t={createTranslator(translations)} />}
        <section
          aria-labelledby={FORM_TITLE_ID}
          className="rounded-card bg-white p-4 shadow-card md:p-6"
        >
          <h2 id={FORM_TITLE_ID} className="text-lg leading-8 font-bold text-ink-900">
            ارسال پیام
          </h2>
          <p className="mt-1 mb-5 text-base leading-8 text-ink-600">
            {
              'پیام شما به پنل فروشگاه می\u{200C}رسد و پاسخ را به ایمیل یا شمارهٔ موبایلی که می\u{200C}نویسید می\u{200C}فرستیم.'
            }
          </p>
          <ContactForm subjects={subjects} />
        </section>
      </div>
    </div>
  )
}

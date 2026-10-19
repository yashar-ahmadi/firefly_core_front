import { ContactDetailsList, type ContactDetails } from '@/components/layout/contact-block'
import type { Translate } from '@/lib/i18n/translator'

const TITLE_ID = 'contact-info-title'

/**
 * The shop's contact details on the contact page (`contactDetails(settings)`): the footer's own
 * list (`ContactDetailsList`: phones, e-mail, address with its postal code and map link, the
 * response hours) in a card of its own. Not the support link: it leads here.
 */
export function ContactInfo({ details, t }: { details: ContactDetails; t: Translate }) {
  return (
    <section
      aria-labelledby={TITLE_ID}
      className="h-fit rounded-card bg-white p-4 shadow-card md:p-6"
    >
      <h2 id={TITLE_ID} className="text-lg leading-8 font-bold text-ink-900">
        {'راه\u{200C}های ارتباطی'}
      </h2>
      <ContactDetailsList details={details} t={t} className="mt-5" />
    </section>
  )
}

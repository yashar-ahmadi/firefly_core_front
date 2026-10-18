import type { SupportLine } from '../result-actions'

// The shop's support line under a card-transfer view: a `tel:` link, formatted on the server (the
// phone formatter regroups shared chunks when an island imports it; result-actions.tsx). No
// state: the server's not-found page renders it too.

export function SupportNote({ support }: { support: SupportLine | null }) {
  return support ? (
    <p className="flex flex-wrap items-center gap-x-2 text-base leading-7 text-ink-700">
      <span>تماس با پشتیبانی:</span>
      <a
        href={`tel:${support.tel}`}
        dir="ltr"
        className="inline-flex min-h-11 items-center font-bold text-brand-700 hover:underline"
      >
        {support.shown}
      </a>
    </p>
  ) : (
    <p className="text-base leading-7 text-ink-700">با پشتیبانی فروشگاه تماس بگیرید.</p>
  )
}

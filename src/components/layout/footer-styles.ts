// Class recipes shared by the footer's blocks (the shop's and the checkout's).

/** A footer section heading: bold, with a short brand bar under its start. */
export const FOOTER_HEADING =
  'relative pb-2 text-base leading-7 font-bold text-ink-900 after:absolute after:start-0 after:bottom-0 after:h-0.5 after:w-8 after:rounded-full after:bg-brand'

/** Each trust seal (one snippet's HTML) sits on its own white tile; images are kept to badge size. */
export const TRUST_ZONE = [
  'mt-4 flex flex-wrap items-center gap-2',
  '[&>div]:grid [&>div]:min-h-20 [&>div]:min-w-20 [&>div]:place-items-center [&>div]:rounded-control',
  '[&>div]:border [&>div]:border-ink-200 [&>div]:bg-white [&>div]:p-2',
  '[&_img]:h-auto [&_img]:max-h-24 [&_img]:w-auto [&_img]:max-w-32',
].join(' ')

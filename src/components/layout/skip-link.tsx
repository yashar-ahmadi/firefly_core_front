/**
 * «رفتن به محتوای اصلی»: the first focusable element of every page (the root layout renders it
 * first in `<body>`, before any operator HTML), visible only while focused. It jumps to the
 * `<main id="main">` of the shop shell (or of the root error page).
 */
export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-60 focus:rounded-control focus:bg-white focus:px-4 focus:py-3 focus:font-medium focus:text-brand-800 focus:shadow-raised"
    >
      {label}
    </a>
  )
}

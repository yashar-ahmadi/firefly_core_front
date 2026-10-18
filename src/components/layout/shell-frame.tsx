import { Suspense, type ReactNode } from 'react'
import { LiveAnnouncer } from '@/components/ui/live-announcer'
import { NavigationProgress } from './navigation-progress'

/**
 * What every storefront frame around a page holds, in order: the navigation progress bar (it
 * reads the URL, `useSearchParams`, hence its own empty Suspense boundary), the frame's `header`,
 * the page in `<main id="main">` (the target of the root layout's skip link), the frame's
 * `footer`, the polite live region (`announce`) and `overlays` last. The shop's frame
 * (`ShopShell`) and the checkout's (`src/app/(checkout)/layout.tsx`) are built from it.
 */
export function ShellFrame({
  header,
  footer,
  overlays,
  children,
}: {
  header: ReactNode
  footer: ReactNode
  overlays?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {header}
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      {footer}
      <LiveAnnouncer />
      {overlays}
    </div>
  )
}

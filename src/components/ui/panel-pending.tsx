import { Spinner } from './spinner'

/**
 * While a panel's code downloads on its first opening (a press with no hover or focus before):
 * a busy pill in the middle of the screen.
 */
export function PanelPending({ label }: { label: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-1/2 z-50 flex justify-center">
      <span className="rounded-pill bg-white p-3 text-brand-600 shadow-raised">
        <Spinner size="lg" label={label} />
      </span>
    </div>
  )
}

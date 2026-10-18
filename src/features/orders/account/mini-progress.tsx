import { cn } from '@/components/ui/cn'
import type { Progress } from '@/lib/api/types/order-detail'
import { ENDING_TEXT, STATE_TEXT } from '../components/order-progress'
import { progressFromServer } from '../progress'

// An order card's progress (order digest §6.2, §6.3): the server's own steps, drawn as a thin
// bar of segments (done and current in the brand colour, the ending in red, the rest grey), each
// step said in words for assistive tech (its name and its state), the current one
// `aria-current`. Nothing derived here. No state: a server component as well.

export function MiniProgress({ progress }: { progress: Progress }) {
  const view = progressFromServer(progress)
  if (view.steps.length === 0) return null
  return (
    <ol aria-label="مراحل سفارش" className="flex gap-1">
      {view.steps.map((step, index) => {
        const ending = view.terminal && step.state === 'current'
        return (
          <li
            key={`${step.key}-${index}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className="flex-1"
          >
            <span
              aria-hidden
              className={cn(
                'block h-1.5 rounded-full',
                step.state === 'upcoming' ? 'bg-ink-200' : ending ? 'bg-danger' : 'bg-brand',
              )}
            />
            <span className="sr-only">{`${step.label}: ${ending ? ENDING_TEXT : STATE_TEXT[step.state]}`}</span>
          </li>
        )
      })}
    </ol>
  )
}

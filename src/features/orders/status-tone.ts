import type { BadgeTone } from '@/components/ui/badge'
import { groupOf } from './order-statuses'

// The colour of an order's status pill, by its pile (order digest §6.1): awaiting payment a
// warning, under way information, delivered a success, returned plain, cancelled a danger. The
// words are always the API's (`status_display`): the colour never says anything alone. A status
// the code does not know is plain. Pure.

const TONES: Record<string, BadgeTone> = {
  awaiting_payment: 'warning',
  in_progress: 'info',
  delivered: 'success',
  returned: 'neutral',
  cancelled: 'danger',
}

export function statusTone(status: string): BadgeTone {
  const group = groupOf(status)
  return (group && TONES[group]) || 'neutral'
}

import type { OpenAttempt } from '@/lib/api/types/payment'

// Which row of the open-attempt table (order digest §5.9) an attempt is, from the server's own
// fields only. Pure.
//
// - `review`: a receipt under review (`awaiting_review`): wait;
// - `card`: a card transfer still waiting for its receipt: its page, or «انصراف»;
// - `verifying`: the bank answered (`expires_at` null; or a capture the shop parked): wait, read
//   its status now and then, never send to the bank again;
// - `bank`: a bank handoff still valid: «ادامه در …», or «انصراف»;
// - `expired`: the handoff is gone, the attempt closes at `expires_at`: «انصراف و پرداخت دوباره».

export type AttemptRow = 'review' | 'card' | 'verifying' | 'bank' | 'expired'

export function attemptRow(attempt: OpenAttempt): AttemptRow {
  if (attempt.status === 'awaiting_review') return 'review'
  if (attempt.method === 'card_transfer') return 'card'
  if (attempt.expires_at === null) return 'verifying'
  return attempt.handoff ? 'bank' : 'expired'
}

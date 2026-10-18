import { describe, expect, it } from 'vitest'
import { attemptRow } from '@/features/payment/attempt-row'
import {
  bankAttempt,
  cardAttempt,
  expiredAttempt,
  reviewAttempt,
  verifyingAttempt,
} from './link-fixtures'

// Each row of the open-attempt table (order digest §5.9) from the server's fields alone.

describe('attemptRow', () => {
  it.each([
    ['a bank handoff still valid', bankAttempt(), 'bank'],
    ['a bank attempt whose handoff expired', expiredAttempt(), 'expired'],
    ['the bank answered: verification running', verifyingAttempt(), 'verifying'],
    [
      'expires_at null outranks a handoff: never sent to the bank',
      bankAttempt({ expires_at: null }),
      'verifying',
    ],
    ['a card transfer waiting for its receipt (the live attempt)', cardAttempt(), 'card'],
    ['a receipt under review', reviewAttempt(), 'review'],
  ] as const)('%s → %s', (_, attempt, row) => {
    expect(attemptRow(attempt)).toBe(row)
  })
})

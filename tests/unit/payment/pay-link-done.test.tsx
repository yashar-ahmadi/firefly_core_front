import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PayLinkDone, type LinkOutcome } from '@/features/payment/pay-link-done'
import { payLink } from './link-fixtures'

// What the payment link's page says once the shopper acted on it (order digest §5.5, §5.8): a paid
// or settled order is «در حال انجام», the order status's own word (the result page and the card
// transfer's outcome say it so too), never another word for the same state.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/order/pay/token/',
}))

const done = (outcome: LinkOutcome) => render(<PayLinkDone outcome={outcome} link={payLink()} />)

describe('PayLinkDone', () => {
  it.each([
    [{ kind: 'paid' } as LinkOutcome, 'با کیف پول انجام شد و سفارش در حال انجام است.'],
    [{ kind: 'settled' } as LinkOutcome, 'ثبت شد و سفارش در حال انجام است.'],
  ])('%o: the order in progress, in the status’s own word', (outcome, sentence) => {
    done(outcome)
    expect(document.body).toHaveTextContent(sentence)
    expect(document.body).not.toHaveTextContent('پردازش')
  })
})

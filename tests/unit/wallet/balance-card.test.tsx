import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BalanceCard } from '@/features/wallet/balance-card'
import { balance } from './fixtures'
import { renderWallet } from './wallet-support'

// «موجودی» (order digest §3.3.1, §7): the balance in large Persian digits (the API's field), the
// amount set aside for a withdrawal under review when there is one (already deducted), and a
// frozen wallet's badge with its message (plain text).

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))

describe('BalanceCard', () => {
  it('the balance in large Persian digits, as the API gives it', () => {
    renderWallet(<BalanceCard wallet={balance()} />)
    const card = screen.getByRole('region', { name: 'موجودی' })
    expect(card).toHaveTextContent('۴۵٬۱۷۰٬۰۰۰ تومان')
    expect(screen.queryByText(/در انتظار برداشت/)).toBeNull()
    expect(screen.queryByText('مسدود')).toBeNull()
  })

  it('what waits for a withdrawal, when there is some (already out of the balance)', () => {
    renderWallet(
      <BalanceCard wallet={balance({ balance: 44_870_000, pending_withdrawal_amount: 300_000 })} />,
    )
    const card = screen.getByRole('region', { name: 'موجودی' })
    expect(card).toHaveTextContent('۴۴٬۸۷۰٬۰۰۰ تومان')
    expect(card).toHaveTextContent(/در انتظار برداشت:?\s*۳۰۰٬۰۰۰ تومان/)
  })

  it('frozen: a clear badge and the shop’s message, as plain text', () => {
    renderWallet(
      <BalanceCard
        wallet={balance({
          is_frozen: true,
          freeze_message: 'به دلیل بررسی حساب، کیف پول <b>مسدود</b> است.',
        })}
      />,
    )
    expect(screen.getByText('مسدود')).toBeVisible()
    expect(screen.getByText('به دلیل بررسی حساب، کیف پول <b>مسدود</b> است.')).toBeVisible()
    expect(document.querySelector('b')).toBeNull()
  })

  it('frozen without a message: still said', () => {
    renderWallet(<BalanceCard wallet={balance({ is_frozen: true, freeze_message: null })} />)
    expect(screen.getByText(/کیف پول شما مسدود است/)).toBeVisible()
  })
})

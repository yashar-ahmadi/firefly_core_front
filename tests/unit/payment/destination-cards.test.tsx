import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DestinationCard } from '@/features/payment/card-transfer/destination-card'
import { DestinationChoice } from '@/features/payment/card-transfer/destination-choice'
import type { BankCard } from '@/lib/api/types/payment'
import { stubBrowserApis } from '../support/dom-stubs'

// A shop card with no card number (order digest §2 `BankCard`: the model lets `card_number` be
// blank when a sheba or an account number exists): no empty number row to copy, and a radio named
// by the bank and the sheba's last four (else the account's), so two such cards differ.

stubBrowserApis()

const card = (changes: Partial<BankCard> = {}): BankCard => ({
  id: 1,
  holder_name: 'فروشگاه فایرفلای',
  bank_name: 'بانک ملت',
  bank_logo_thumbnail: null,
  card_number: '',
  sheba: 'IR620120000000001234567890',
  account_number: '1234567890',
  ...changes,
})

describe('DestinationCard', () => {
  it('no card number: no number row, the sheba and the account number as before', () => {
    render(<DestinationCard card={card()} />)
    const article = screen.getByRole('article', { name: 'بانک ملت' })
    expect(within(article).queryByText('شماره کارت')).toBeNull()
    expect(within(article).queryByRole('button', { name: /کپی شماره کارت/ })).toBeNull()
    expect(within(article).getByRole('button', { name: /کپی شماره شبای بانک ملت/ })).toBeVisible()
    expect(within(article).getByRole('button', { name: /کپی شماره حساب بانک ملت/ })).toBeVisible()
  })

  it('a card number of separators only counts as none', () => {
    render(<DestinationCard card={card({ card_number: '----' })} />)
    expect(screen.queryByText('شماره کارت')).toBeNull()
  })
})

describe('DestinationChoice', () => {
  const choose = (cards: BankCard[]) =>
    render(<DestinationChoice id="cards" cards={cards} value={null} onChange={vi.fn()} />)

  it('with a card number: the bank and the card’s last four', () => {
    choose([card({ card_number: '6104-3378-1234-5678' })])
    expect(screen.getByRole('radio', { name: /بانک ملت ۵۶۷۸/ })).toBeInTheDocument()
  })

  it('sheba-only cards of one bank: told apart by the sheba’s last four', () => {
    choose([
      card({ id: 1 }),
      card({ id: 2, sheba: 'IR620120000000009876543210', account_number: '' }),
    ])
    const radios = screen.getAllByRole('radio')
    expect(radios[0]).toHaveAccessibleName(/بانک ملت.*شبا.*۷۸۹۰/)
    expect(radios[1]).toHaveAccessibleName(/بانک ملت.*شبا.*۳۲۱۰/)
  })

  it('neither a card number nor a sheba: the account number’s last four', () => {
    choose([card({ sheba: '', account_number: '0011223344' })])
    expect(screen.getByRole('radio')).toHaveAccessibleName(/بانک ملت.*حساب.*۳۳۴۴/)
  })
})

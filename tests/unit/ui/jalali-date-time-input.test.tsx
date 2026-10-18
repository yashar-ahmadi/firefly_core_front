import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { JalaliDateTimeInput } from '@/components/ui/jalali-date-time-input'

// The Jalali date and time input (the card-transfer receipt's «تاریخ و ساعت واریز»): native
// selects for day, month (Persian names), year, hour and minute, labelled in Persian with Persian
// digits; it writes Tehran's wall time as the API reads it (`…+03:30`) and never offers a day the
// month does not have.

const NOW = new Date('2026-10-18T06:50:00Z') // 1405/07/26 10:20 in Tehran

function Harness({
  initial = '2026-10-18T10:20:00+03:30',
  now = NOW,
  onChange = () => {},
  error,
}: {
  initial?: string
  now?: Date
  onChange?: (iso: string) => void
  error?: string
}) {
  const [value, setValue] = useState(initial)
  return (
    <JalaliDateTimeInput
      legend="تاریخ و ساعت واریز"
      value={value}
      now={now}
      error={error}
      onChange={(iso) => {
        setValue(iso)
        onChange(iso)
      }}
    />
  )
}

const select = (name: string) => screen.getByRole('combobox', { name })
const options = (name: string) =>
  within(select(name))
    .getAllByRole('option')
    .map((option) => option.textContent)

describe('JalaliDateTimeInput', () => {
  it('is a labelled group of five selects showing the value in Persian', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'تاریخ و ساعت واریز' })).toBeInTheDocument()
    expect(select('روز')).toHaveDisplayValue('۲۶')
    expect(select('ماه')).toHaveDisplayValue('مهر')
    expect(select('سال')).toHaveDisplayValue('۱۴۰۵')
    expect(select('ساعت')).toHaveDisplayValue('۱۰')
    expect(select('دقیقه')).toHaveDisplayValue('۲۰')
    expect(options('ماه')[0]).toBe('فروردین')
    // This year and the one before it.
    expect(options('سال')).toEqual(['۱۴۰۴', '۱۴۰۵'])
    expect(options('ساعت')).toHaveLength(24)
    expect(options('دقیقه')).toHaveLength(60)
  })

  it('1405/07/23 15:00 gives 2026-10-15T15:00:00+03:30', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await user.selectOptions(select('سال'), '1405')
    await user.selectOptions(select('ماه'), '7')
    await user.selectOptions(select('روز'), '23')
    await user.selectOptions(select('ساعت'), '15')
    await user.selectOptions(select('دقیقه'), '0')
    expect(onChange).toHaveBeenLastCalledWith('2026-10-15T15:00:00+03:30')
  })

  it('never offers a day the month does not have: 31 Shahrivar becomes 30 Mehr', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial="2026-09-22T09:00:00+03:30" onChange={onChange} />) // 1405/06/31
    expect(select('روز')).toHaveDisplayValue('۳۱')
    await user.selectOptions(select('ماه'), '7')
    expect(options('روز')).toHaveLength(30)
    expect(select('روز')).toHaveDisplayValue('۳۰')
    // 1405/07/30 = 2026-10-22.
    expect(onChange).toHaveBeenLastCalledWith('2026-10-22T09:00:00+03:30')
  })

  it('Esfand has 30 days in a leap year (1403) and 29 otherwise (1404)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // 1403/12/30, the year's last day; 1404 is offered too.
    render(
      <Harness
        initial="2025-03-20T12:00:00+03:30"
        now={new Date('2025-03-21T08:30:00Z')}
        onChange={onChange}
      />,
    )
    expect(select('روز')).toHaveDisplayValue('۳۰')
    expect(options('روز')).toHaveLength(30)
    await user.selectOptions(select('سال'), '1404')
    expect(options('روز')).toHaveLength(29)
    expect(select('روز')).toHaveDisplayValue('۲۹')
    // 1404/12/29 = 2026-03-20.
    expect(onChange).toHaveBeenLastCalledWith('2026-03-20T12:00:00+03:30')
  })

  it('an error marks every control invalid and describes it', () => {
    render(<Harness error="زمان واریز نمی‌تواند در آینده باشد" />)
    for (const name of ['روز', 'ماه', 'سال', 'ساعت', 'دقیقه']) {
      expect(select(name)).toHaveAttribute('aria-invalid', 'true')
      expect(select(name)).toHaveAccessibleDescription(/زمان واریز نمی‌تواند در آینده باشد/)
    }
  })

  it('the time reads left to right (hour, then minute)', () => {
    render(<Harness />)
    const hour = select('ساعت')
    const time = hour.closest('[dir="ltr"]')
    expect(time).not.toBeNull()
    expect(time).toContainElement(select('دقیقه'))
    expect(hour.compareDocumentPosition(select('دقیقه')) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})

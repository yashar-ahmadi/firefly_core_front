import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

describe('Field', () => {
  it('wires the label, aria-invalid and aria-describedby to the error', () => {
    render(
      <Field label="ایمیل" error="ایمیل معتبر نیست">
        <Input type="email" dir="ltr" />
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: 'ایمیل' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('ایمیل معتبر نیست')
    const describedBy = input.getAttribute('aria-describedby') ?? ''
    expect(describedBy.split(' ').length).toBeGreaterThanOrEqual(1)
    for (const id of describedBy.split(' ')) expect(document.getElementById(id)).not.toBeNull()
  })

  it('describes the control with the hint and does not mark it invalid without an error', () => {
    render(
      <Field label="نام" hint="همان نامی که روی کارت ملی است">
        <Input />
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: 'نام' })
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).toHaveAccessibleDescription('همان نامی که روی کارت ملی است')
  })

  it('marks required fields with a hidden «(الزامی)» and aria-required', () => {
    render(
      <Field label="شمارهٔ موبایل" required>
        <Input dir="ltr" inputMode="tel" />
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: /شمارهٔ موبایل/ })
    expect(input).toHaveAccessibleName('شمارهٔ موبایل (الزامی)')
    expect(input).toHaveAttribute('aria-required', 'true')
  })

  it('keeps an id and description the child already has', () => {
    render(
      <>
        <p id="extra">توضیح بیشتر</p>
        <Field label="پیام" error="پیام را بنویسید">
          <Textarea id="message" aria-describedby="extra" />
        </Field>
      </>,
    )
    const textarea = screen.getByRole('textbox', { name: 'پیام' })
    expect(textarea).toHaveAttribute('id', 'message')
    expect(textarea).toHaveAccessibleDescription('توضیح بیشتر پیام را بنویسید')
  })
})

describe('Input', () => {
  it('renders start and end adornments around the input', () => {
    render(
      <Input aria-label="جستجو" startAdornment={<span>آ</span>} endAdornment={<span>ب</span>} />,
    )
    expect(screen.getByRole('textbox', { name: 'جستجو' })).toBeInTheDocument()
    expect(screen.getByText('آ')).toBeInTheDocument()
    expect(screen.getByText('ب')).toBeInTheDocument()
  })
})

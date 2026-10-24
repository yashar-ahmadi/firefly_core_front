import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StepLoading } from '@/features/checkout/lazy-steps'

// The checkout's step skeleton (lazy-steps.tsx). The guest's receiver form's skeleton keeps the
// form's room, so the steps below it stay put when the form comes (checkout-stability.spec.ts
// measures the page; this pins the class, which Prettier's Tailwind plugin once glued to the
// one before it: `gap-3guest-form-room`).

describe('StepLoading', () => {
  it('keeps the guest form’s room when asked, as a class of its own', () => {
    render(<StepLoading room />)
    expect(screen.getByRole('status')).toHaveClass('guest-form-room', 'flex', 'flex-col', 'gap-3')
  })

  it('takes only its own height otherwise', () => {
    render(<StepLoading label="در حال انتخاب" />)
    const status = screen.getByRole('status', { name: 'در حال انتخاب' })
    expect(status).not.toHaveClass('guest-form-room')
    expect(status).toHaveClass('gap-3')
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StepLoading } from '@/features/checkout/lazy-steps'

// The checkout's step skeleton (lazy-steps.tsx): shown in a step whose body's code is on its way
// after the page arrived (the page arrives with its open step's body: arrival.test.tsx), or while
// a choice is made for the shopper. Its own height: no reserved room any more.

describe('StepLoading', () => {
  it('is a named skeleton of its own height', () => {
    render(<StepLoading label="در حال انتخاب" />)
    const status = screen.getByRole('status', { name: 'در حال انتخاب' })
    expect(status).toHaveClass('flex', 'flex-col', 'gap-3')
    expect(status.className).not.toMatch(/room|min-h/)
  })
})

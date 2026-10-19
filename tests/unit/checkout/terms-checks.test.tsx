import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TermsChecks, type CheckoutTerms } from '@/features/checkout/terms-checks'

// The review's operator sentences and the `terms` / `return-policy` slots' dialog links (Plan 5
// Task 5). Without a sentence there is no checkbox to line up with: the links stand alone, with
// no indent, and no wrapper of their own in the form's column. Both slots empty, the links' row
// is empty and `empty:hidden` (display: none), which leaves no gap in the form's `gap-5`. jsdom
// ignores `:empty`, so the DOM is asserted instead.

const NONE: CheckoutTerms = { accept: null, legalAge: null }
const BOTH: CheckoutTerms = { accept: 'قوانین را می‌پذیرم.', legalAge: 'سن قانونی دارم.' }
const ACCEPTED = { accept: false, legalAge: false }

/** A slot with nothing to show (DynamicSlot renders nothing then). */
function EmptySlot() {
  return null
}

function renderTerms(terms: CheckoutTerms, links?: React.ReactNode) {
  return render(
    <div data-form="">
      <TermsChecks terms={terms} accepted={ACCEPTED} onChange={vi.fn()} errors={[]} links={links} />
    </div>,
  )
}

const form = (container: HTMLElement) => container.querySelector('[data-form]')!

describe('TermsChecks without the operator’s sentences', () => {
  it('nothing at all without links', () => {
    const { container } = renderTerms(NONE)
    expect(form(container).childElementCount).toBe(0)
  })

  it('both slots empty: only the links’ row, empty and hidden, no wrapper and no indent', () => {
    const { container } = renderTerms(
      NONE,
      <>
        <EmptySlot />
        <EmptySlot />
      </>,
    )
    expect(form(container).childElementCount).toBe(1)
    const row = form(container).firstElementChild!
    expect(row.childElementCount).toBe(0)
    expect(row.textContent).toBe('')
    expect(row).toHaveClass('empty:hidden')
    expect(row).not.toHaveClass('ps-9')
  })

  it('links only: the links’ row stands alone in the form, without the checkbox indent', () => {
    const { container } = renderTerms(NONE, <button type="button">مطالعهٔ قوانین</button>)
    expect(form(container).childElementCount).toBe(1)
    const row = form(container).firstElementChild!
    // The row itself (the button's parent), not a wrapper around it.
    expect(screen.getByRole('button', { name: 'مطالعهٔ قوانین' }).parentElement).toBe(row)
    expect(row).toHaveClass('empty:hidden')
    expect(row).not.toHaveClass('ps-9')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})

describe('TermsChecks with the sentences', () => {
  it('the links sit under the terms’ checkbox, indented to its label', () => {
    renderTerms(BOTH, <button type="button">مطالعهٔ قوانین</button>)
    const row = screen.getByRole('button', { name: 'مطالعهٔ قوانین' }).parentElement!
    expect(row).toHaveClass('ps-9', 'empty:hidden')
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })
})

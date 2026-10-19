import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Disclosure } from '@/components/ui/disclosure'

/** The <summary> holding the heading named `name`. */
function summaryOf(name: string): HTMLElement {
  return screen.getByRole('heading', { name }).closest('summary')!
}

describe('Disclosure', () => {
  it('is a native <details>, closed, its title a heading inside the <summary>', () => {
    render(
      <Disclosure title="گارانتی دارد؟">
        <p>بله.</p>
      </Disclosure>,
    )
    const summary = summaryOf('گارانتی دارد؟')
    expect(screen.getByRole('heading', { level: 3, name: 'گارانتی دارد؟' })).toBeInTheDocument()
    const details = summary.parentElement!
    expect(details.tagName).toBe('DETAILS')
    expect(details).not.toHaveAttribute('open')
    // The content is in the page while closed: search engines read it, no script shows it.
    expect(details).toContainElement(screen.getByText('بله.'))
  })

  it('opens and closes from its summary, a 56px target with a decorative chevron', async () => {
    const user = userEvent.setup()
    render(
      <Disclosure title="لینک‌های مفید" level={2}>
        <a href="#terms">قوانین و مقررات</a>
      </Disclosure>,
    )
    const summary = summaryOf('لینک‌های مفید')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('لینک‌های مفید')
    expect(summary).toHaveClass('min-h-14')
    expect(summary.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull()
    await user.click(summary)
    expect(summary.parentElement).toHaveAttribute('open')
    await user.click(summary)
    expect(summary.parentElement).not.toHaveAttribute('open')
  })

  it('passes a group name, so disclosures sharing it open one at a time where supported', () => {
    render(
      <Disclosure title="یک" name="faq">
        متن
      </Disclosure>,
    )
    expect(summaryOf('یک').parentElement).toHaveAttribute('name', 'faq')
  })

  it('takes an id (an anchor to it) and can be hidden', () => {
    const { rerender } = render(
      <Disclosure id="faq-42" title="پرسش">
        <p>پاسخ</p>
      </Disclosure>,
    )
    const details = summaryOf('پرسش').parentElement!
    expect(details).toHaveAttribute('id', 'faq-42')
    expect(details).not.toHaveAttribute('hidden')
    rerender(
      <Disclosure id="faq-42" title="پرسش" hidden>
        <p>پاسخ</p>
      </Disclosure>,
    )
    expect(document.getElementById('faq-42')).toHaveAttribute('hidden')
  })
})

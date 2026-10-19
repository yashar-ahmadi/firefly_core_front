import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContactFormSlot } from '@/features/content/pages/contact-slot'

// Under `/page/contact-us/`'s content, where Plan 5 Task 4's contact form will render: nothing
// yet (no empty frame, no placeholder text).

describe('ContactFormSlot', () => {
  it('renders nothing until Task 4 fills it', () => {
    const { container } = render(<ContactFormSlot />)
    expect(container).toBeEmptyDOMElement()
  })
})

import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from '@/components/ui/avatar'

// The one avatar of the signed-in visitor (the header's account button and menu, the account
// header): her picture, else one letter, else a person icon. Decorative: the control or text
// beside it carries the name.

describe('Avatar', () => {
  it('shows a single letter, hidden from assistive tech', () => {
    const { container } = render(<Avatar initial="س" />)
    const avatar = container.firstElementChild!
    expect(avatar).toHaveTextContent(/^س$/)
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows the picture instead of the letter', () => {
    const { container } = render(
      <Avatar src="https://cdn.example.com/media/avatar.jpg" initial="س" />,
    )
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/media/avatar.jpg')
    expect(img).toHaveAttribute('alt', '')
    expect(container).not.toHaveTextContent('س')
  })

  it('falls back to the letter when the picture cannot be loaded', () => {
    const { container } = render(<Avatar src="https://cdn.example.com/broken.jpg" initial="S" />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent(/^S$/)
  })

  it('shows a person icon without a picture or a letter', () => {
    const { container } = render(<Avatar initial={null} />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container).toHaveTextContent('')
  })

  it('keeps its box while loading: a skeleton of the same size', () => {
    const { container, rerender } = render(<Avatar loading size="lg" />)
    const skeleton = container.firstElementChild!
    expect(skeleton.className).toContain('animate-shimmer')
    expect(skeleton.className).toContain('size-14')
    rerender(<Avatar initial="س" size="lg" />)
    expect(container.firstElementChild!.className).toContain('size-14')
  })
})

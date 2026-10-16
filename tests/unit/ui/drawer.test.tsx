import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'

describe('Drawer', () => {
  it('opens from its trigger at the start side and closes again', async () => {
    const user = userEvent.setup()
    render(
      <Drawer trigger={<Button>منو</Button>} title="دسته‌بندی‌ها">
        <a href="/product-category/mobile/">موبایل</a>
      </Drawer>,
    )
    await user.click(screen.getByRole('button', { name: 'منو' }))
    const drawer = screen.getByRole('dialog', { name: 'دسته‌بندی‌ها' })
    expect(drawer).toHaveAttribute('data-side', 'start')
    expect(within(drawer).getByRole('link', { name: 'موبایل' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens from the end (left) side with side="end"', async () => {
    const user = userEvent.setup()
    render(
      <Drawer side="end" trigger={<Button>سبد خرید</Button>} title="سبد شما" description="۲ کالا">
        <p>فهرست کالاها</p>
      </Drawer>,
    )
    await user.click(screen.getByRole('button', { name: 'سبد خرید' }))
    const drawer = screen.getByRole('dialog', { name: 'سبد شما' })
    expect(drawer).toHaveAttribute('data-side', 'end')
    expect(drawer).toHaveAccessibleDescription('۲ کالا')
    expect(drawer).toHaveClass('end-0')
    expect(drawer).not.toHaveClass('start-0')
  })
})

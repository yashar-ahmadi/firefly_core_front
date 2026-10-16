import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { stubBrowserApis } from '../support/dom-stubs'

// Radix's popper measures its content with ResizeObserver.
stubBrowserApis()

describe('DropdownMenu', () => {
  it('opens from the keyboard, runs the chosen item and closes', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>حساب کاربری</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>سفارش‌ها</DropdownMenuItem>
          <DropdownMenuItem variant="danger">خروج</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    const trigger = screen.getByRole('button', { name: 'حساب کاربری' })
    act(() => trigger.focus())
    await user.keyboard('{Enter}')

    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2)
    await user.click(within(menu).getByRole('menuitem', { name: 'سفارش‌ها' }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('Popover', () => {
  it('opens from its trigger, closes on Escape and from its close button', async () => {
    const user = userEvent.setup()
    render(
      <Popover>
        <PopoverTrigger asChild>
          <Button>ارسال به: تهران</Button>
        </PopoverTrigger>
        <PopoverContent>
          <p>ارسال همان روز</p>
          <PopoverClose asChild>
            <Button size="sm">متوجه شدم</Button>
          </PopoverClose>
        </PopoverContent>
      </Popover>,
    )
    const trigger = screen.getByRole('button', { name: 'ارسال به: تهران' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog')).toHaveTextContent('ارسال همان روز')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'متوجه شدم' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

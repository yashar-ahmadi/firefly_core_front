import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { focusedElement } from '../support/dom-stubs'

describe('Dialog', () => {
  it('opens on trigger click, traps focus and closes on Escape', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Dialog>
          <DialogTrigger asChild>
            <Button>حذف آدرس</Button>
          </DialogTrigger>
          <DialogContent
            title="حذف این آدرس؟"
            description="این کار برگشت‌پذیر نیست."
            footer={
              <DialogClose asChild>
                <Button variant="outline">انصراف</Button>
              </DialogClose>
            }
          >
            <Button variant="danger">حذف</Button>
          </DialogContent>
        </Dialog>
        <button type="button">بیرون از پنجره</button>
      </>,
    )
    const trigger = screen.getByRole('button', { name: 'حذف آدرس' })
    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'حذف این آدرس؟' })
    expect(dialog).toHaveAccessibleDescription('این کار برگشت‌پذیر نیست.')
    expect(dialog).toContainElement(focusedElement())
    // Close (×), «حذف» and «انصراف» are inside; Tab and Shift+Tab never leave the dialog.
    for (let i = 0; i < 5; i++) {
      await user.tab()
      expect(dialog).toContainElement(focusedElement())
    }
    await user.tab({ shift: true })
    expect(dialog).toContainElement(focusedElement())

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('has a labelled close button', async () => {
    const user = userEvent.setup()
    render(
      <Dialog defaultOpen>
        <DialogContent title="ورود">فرم ورود</DialogContent>
      </Dialog>,
    )
    await user.click(screen.getByRole('button', { name: 'بستن' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('starts a form dialog in its first field', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>ویرایش نام</Button>
        </DialogTrigger>
        <DialogContent title="نام شما">
          <input aria-label="نام" defaultValue="سارا" />
          <input aria-label="نام خانوادگی" defaultValue="احمدی" />
        </DialogContent>
      </Dialog>,
    )
    await user.click(screen.getByRole('button', { name: 'ویرایش نام' }))
    expect(screen.getByRole('textbox', { name: 'نام' })).toHaveFocus()
  })

  it('keeps the default focus when the first field cannot take focus', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>فیلتر</Button>
        </DialogTrigger>
        <DialogContent title="فیلترها">
          <div hidden>
            <input aria-label="حداقل قیمت" />
          </div>
          <Button>اعمال</Button>
        </DialogContent>
      </Dialog>,
    )
    await user.click(screen.getByRole('button', { name: 'فیلتر' }))
    // Radix's own choice: the first tabbable element, the close button.
    expect(screen.getByRole('button', { name: 'بستن' })).toHaveFocus()
  })

  it('starts a dialog without fields on its first button (the close button)', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>حذف</Button>
        </DialogTrigger>
        <DialogContent title="حذف شود؟" footer={<Button>بله</Button>} />
      </Dialog>,
    )
    await user.click(screen.getByRole('button', { name: 'حذف' }))
    expect(screen.getByRole('button', { name: 'بستن' })).toHaveFocus()
  })

  function Controlled({ withSearch = false }) {
    const [open, setOpen] = useState(false)
    return (
      // Safari focuses a focusable container (an open panel, say) instead of a clicked button.
      <div tabIndex={-1} data-testid="container">
        <Button onClick={() => setOpen(true)}>حذف آدرس</Button>
        {withSearch && <input aria-label="جستجو" onKeyDown={() => setOpen(true)} />}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent title="حذف شود؟">این کار برگشت‌پذیر نیست.</DialogContent>
        </Dialog>
      </div>
    )
  }

  it.each([
    ['<body>', false],
    ['a focusable container', true],
  ])(
    'returns focus to the pressed opener of a controlled dialog while %s has focus (Safari)',
    async (_focus, container) => {
      const user = userEvent.setup()
      render(<Controlled />)
      const opener = screen.getByRole('button', { name: 'حذف آدرس' })
      if (container) act(() => screen.getByTestId('container').focus())
      fireEvent.pointerDown(opener)
      fireEvent.click(opener)
      expect(opener).not.toHaveFocus()
      expect(screen.getByRole('dialog', { name: 'حذف شود؟' })).toContainElement(focusedElement())

      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(opener).toHaveFocus()
    },
  )

  it('returns focus to the focused element when a key opened the dialog after an earlier press', async () => {
    const user = userEvent.setup()
    render(<Controlled withSearch />)
    const button = screen.getByRole('button', { name: 'حذف آدرس' })
    fireEvent.pointerDown(button)
    const search = screen.getByRole('textbox', { name: 'جستجو' })
    act(() => search.focus())
    await user.keyboard('a')
    expect(screen.getByRole('dialog', { name: 'حذف شود؟' })).toContainElement(focusedElement())

    await user.keyboard('{Escape}')
    expect(search).toHaveFocus()
  })
})

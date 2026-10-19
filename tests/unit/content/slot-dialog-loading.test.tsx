import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlotDialogLink } from '@/features/content/dynamic/slot-dialog-link'
import { stubBrowserApis } from '../support/dom-stubs'

// The dialog-link's first press while the dialog's code is still on its way (a slow connection):
// the press is answered at once with a polite «در حال باز شدن…», and the dialog follows.

const gate = vi.hoisted(() => {
  let open = () => {}
  const opened = new Promise<void>((resolve) => (open = resolve))
  return { opened, open: () => open() }
})
vi.mock('@/features/content/dynamic/slot-dialog', async (importOriginal) => {
  await gate.opened
  return importOriginal()
})

stubBrowserApis()

describe('SlotDialogLink while its dialog loads', () => {
  it('says it is opening, then opens', async () => {
    render(
      <SlotDialogLink label="مطالعهٔ قوانین" title="قوانین و مقررات">
        <p>کالاهای غیرقابل مرجوع</p>
      </SlotDialogLink>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'مطالعهٔ قوانین' }))
    expect(screen.getByRole('status')).toHaveTextContent('در حال باز شدن')
    expect(screen.queryByRole('dialog')).toBeNull()
    gate.open()
    expect(await screen.findByRole('dialog', { name: 'قوانین و مقررات' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

import { render, waitFor } from '@testing-library/react'
import type { ToasterProps } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sonner = vi.hoisted(() => ({
  Toaster: vi.fn<(props: ToasterProps) => null>(() => null),
  toast: {
    success: vi.fn(() => 1),
    error: vi.fn(() => 2),
    info: vi.fn(() => 3),
    dismiss: vi.fn(),
  },
}))

vi.mock('sonner', () => sonner)

/** A fresh copy of the module: its queue of notices lives at module level. */
async function load() {
  vi.resetModules()
  return import('@/components/ui/toaster')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Toaster', () => {
  it('loads nothing until something is notified: pages without a toast skip its code', async () => {
    const { Toaster } = await load()
    render(<Toaster />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sonner.Toaster).not.toHaveBeenCalled()
  })

  it('renders Sonner in RTL at the top centre with rich colours and a close button', async () => {
    const { notify, Toaster } = await load()
    render(<Toaster />)
    notify.info('سلام')
    await waitFor(() => expect(sonner.Toaster).toHaveBeenCalled())
    const [props] = sonner.Toaster.mock.calls[0]!
    expect(props).toMatchObject({
      dir: 'rtl',
      position: 'top-center',
      richColors: true,
      closeButton: true,
      containerAriaLabel: 'اعلان‌ها',
    })
    expect(props.toastOptions?.closeButtonAriaLabel).toBe('بستن اعلان')
    expect(props.style).toMatchObject({ fontFamily: 'inherit' })
  })
})

describe('notify', () => {
  it('forwards success, error and info to Sonner in order, also those sent before it loaded', async () => {
    const { notify, Toaster } = await load()
    render(<Toaster />)
    const options = { description: 'گوشی موبایل سامسونگ' }
    notify.success('به سبد اضافه شد', options)
    notify.error('پرداخت انجام نشد')
    await waitFor(() => expect(sonner.toast.error).toHaveBeenCalled())
    expect(sonner.toast.success).toHaveBeenCalledWith('به سبد اضافه شد', options)
    expect(sonner.toast.error).toHaveBeenCalledWith('پرداخت انجام نشد', undefined)
    expect(sonner.toast.success.mock.invocationCallOrder[0]).toBeLessThan(
      sonner.toast.error.mock.invocationCallOrder[0]!,
    )
    notify.info('کد کپی شد')
    expect(sonner.toast.info).toHaveBeenCalledWith('کد کپی شد', undefined)
  })

  it('dismisses one toast by id, or all of them', async () => {
    const { notify, Toaster } = await load()
    render(<Toaster />)
    notify.success('یک', { id: 'one' })
    await waitFor(() => expect(sonner.toast.success).toHaveBeenCalled())
    notify.dismiss('one')
    expect(sonner.toast.dismiss).toHaveBeenLastCalledWith('one')
    notify.dismiss()
    expect(sonner.toast.dismiss).toHaveBeenLastCalledWith(undefined)
  })

  it('drops a queued toast dismissed before Sonner loaded, and loads nothing for it', async () => {
    const { notify, Toaster } = await load()
    notify.success('یک', { id: 'one' })
    notify.success('دو', { id: 'two' })
    notify.dismiss('one')
    render(<Toaster />)
    await waitFor(() => expect(sonner.toast.success).toHaveBeenCalledTimes(1))
    expect(sonner.toast.success).toHaveBeenCalledWith('دو', { id: 'two' })

    const fresh = await load()
    fresh.notify.dismiss()
    render(<fresh.Toaster />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sonner.Toaster).toHaveBeenCalledTimes(1)
  })
})

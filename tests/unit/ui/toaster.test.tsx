import { render } from '@testing-library/react'
import type { ToasterProps } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notify, Toaster } from '@/components/ui/toaster'

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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Toaster', () => {
  it('renders Sonner in RTL at the top centre with rich colours and a close button', () => {
    render(<Toaster />)
    const [props] = sonner.Toaster.mock.calls[0]
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
  it('forwards success, error and info to Sonner and returns the toast id', () => {
    const options = { description: 'گوشی موبایل سامسونگ' }
    expect(notify.success('به سبد اضافه شد', options)).toBe(1)
    expect(sonner.toast.success).toHaveBeenCalledWith('به سبد اضافه شد', options)
    expect(notify.error('پرداخت انجام نشد')).toBe(2)
    expect(sonner.toast.error).toHaveBeenCalledWith('پرداخت انجام نشد', undefined)
    expect(notify.info('کد کپی شد')).toBe(3)
    expect(sonner.toast.info).toHaveBeenCalledWith('کد کپی شد', undefined)
  })

  it('dismisses one toast by id, or all of them', () => {
    notify.dismiss(2)
    expect(sonner.toast.dismiss).toHaveBeenLastCalledWith(2)
    notify.dismiss()
    expect(sonner.toast.dismiss).toHaveBeenLastCalledWith(undefined)
  })
})

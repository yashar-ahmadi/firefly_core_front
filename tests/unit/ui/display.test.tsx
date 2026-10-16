import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Link from 'next/link'
import { describe, expect, it, vi } from 'vitest'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/components/ui/cn'
import { EmptyState } from '@/components/ui/empty-state'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'

describe('cn', () => {
  it('merges conflicting Tailwind classes, the last one winning', () => {
    expect(cn('px-4 py-2', false, 'px-6')).toBe('py-2 px-6')
  })
})

describe('selection controls', () => {
  it('toggles a labelled checkbox', async () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox label="فقط کالاهای موجود" onCheckedChange={onCheckedChange} />)
    await userEvent.click(screen.getByText('فقط کالاهای موجود'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole('checkbox', { name: 'فقط کالاهای موجود' })).toBeChecked()
  })

  it('selects a radio option', async () => {
    const onValueChange = vi.fn()
    render(
      <RadioGroup aria-label="روش ارسال" onValueChange={onValueChange}>
        <RadioGroupItem value="post" label="پست" />
        <RadioGroupItem value="courier" label="پیک" />
      </RadioGroup>,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'پیک' }))
    expect(onValueChange).toHaveBeenCalledWith('courier')
  })

  it('switches on', async () => {
    render(<Switch label="اطلاع‌رسانی پیامکی" />)
    const toggle = screen.getByRole('switch', { name: 'اطلاع‌رسانی پیامکی' })
    await userEvent.click(toggle)
    expect(toggle).toBeChecked()
  })

  it('renders a native select with its options', () => {
    render(
      <Select aria-label="مرتب‌سازی" defaultValue="cheap">
        <option value="new">جدیدترین</option>
        <option value="cheap">ارزان‌ترین</option>
      </Select>,
    )
    expect(screen.getByRole('combobox', { name: 'مرتب‌سازی' })).toHaveValue('cheap')
  })
})

describe('display primitives', () => {
  it('renders a badge and a pressed chip', () => {
    render(
      <>
        <Badge tone="sale">فروش ویژه</Badge>
        <Chip selected>سامسونگ</Chip>
      </>,
    )
    expect(screen.getByText('فروش ویژه')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'سامسونگ' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('outlines an unselected chip and a card radio in ink-500 (3:1 boundary, WCAG 1.4.11)', () => {
    render(
      <>
        <Chip selected={false}>اپل</Chip>
        <Chip removable aria-label="حذف فیلتر اپل">
          اپل
        </Chip>
        <RadioGroup>
          <RadioGroupItem variant="card" value="post" label="پست" />
        </RadioGroup>
      </>,
    )
    expect(screen.getByRole('button', { name: 'اپل' })).toHaveClass('border-ink-500')
    expect(screen.getByRole('button', { name: 'حذف فیلتر اپل' })).toHaveClass('border-ink-500')
    expect(screen.getByRole('radio', { name: 'پست' }).closest('.rounded-card')).toHaveClass(
      'border-ink-500',
    )
  })

  it('announces a standalone spinner with its label', () => {
    render(<Spinner label="در حال بارگذاری" />)
    expect(screen.getByRole('status')).toHaveTextContent('در حال بارگذاری')
  })

  it('renders an empty state with a heading and an action', () => {
    render(
      <EmptyState
        icon={<svg />}
        title="سبد خرید شما خالی است"
        description="کالاهای دلخواهتان را به سبد اضافه کنید."
        action={<Link href="/">بازگشت به فروشگاه</Link>}
      />,
    )
    expect(screen.getByRole('heading', { name: 'سبد خرید شما خالی است' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بازگشت به فروشگاه' })).toBeInTheDocument()
  })
})

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Carousel } from '@/components/ui/carousel'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Drawer } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMediaQuery } from '@/components/ui/use-media-query'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'

const media = stubBrowserApis()

beforeEach(() => {
  media.set(() => false)
})

function activeElement(): HTMLElement {
  return document.activeElement as HTMLElement
}

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
    expect(dialog).toContainElement(activeElement())
    // Close (×), «حذف» and «انصراف» are inside; Tab and Shift+Tab never leave the dialog.
    for (let i = 0; i < 5; i++) {
      await user.tab()
      expect(dialog).toContainElement(activeElement())
    }
    await user.tab({ shift: true })
    expect(dialog).toContainElement(activeElement())

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
})

describe('Tabs', () => {
  it('switch panels with the arrow keys in RTL reading order', async () => {
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="intro">
        <TabsList aria-label="اطلاعات کالا">
          <TabsTrigger value="intro">معرفی</TabsTrigger>
          <TabsTrigger value="specs">مشخصات</TabsTrigger>
          <TabsTrigger value="reviews">نظرات</TabsTrigger>
        </TabsList>
        <TabsContent value="intro">متن معرفی</TabsContent>
        <TabsContent value="specs">جدول مشخصات</TabsContent>
        <TabsContent value="reviews">نظرات خریداران</TabsContent>
      </Tabs>,
    )
    await user.tab()
    expect(screen.getByRole('tab', { name: 'معرفی' })).toHaveFocus()

    // In RTL the next tab sits to the left, so ArrowLeft moves forward.
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'مشخصات' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('جدول مشخصات')

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('نظرات خریداران')

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'مشخصات' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('جدول مشخصات')
  })
})

describe('Accordion', () => {
  it('toggles aria-expanded and shows the answer as a labelled region', async () => {
    const user = userEvent.setup()
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="shipping">
          <AccordionTrigger>هزینه ارسال چقدر است؟</AccordionTrigger>
          <AccordionContent>برای خریدهای بالای یک میلیون تومان رایگان است.</AccordionContent>
        </AccordionItem>
      </Accordion>,
    )
    const trigger = screen.getByRole('button', { name: 'هزینه ارسال چقدر است؟' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'هزینه ارسال چقدر است؟' })).toHaveTextContent(
      'برای خریدهای بالای یک میلیون تومان رایگان است.',
    )

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('Carousel', () => {
  it('renders aria-roledescription="carousel" with its label, and numbered slides', () => {
    render(
      <Carousel ariaLabel="پیشنهادهای ویژه">
        <div>اسلاید اول</div>
        <div>اسلاید دوم</div>
        <div>اسلاید سوم</div>
      </Carousel>,
    )
    const carousel = screen.getByRole('region', { name: 'پیشنهادهای ویژه' })
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel')
    expect(carousel).toHaveAttribute('dir', 'rtl')

    const slides = within(carousel).getAllByRole('group', { name: /از/ })
    expect(slides).toHaveLength(3)
    expect(slides[0]).toHaveAttribute('aria-roledescription', 'slide')
    expect(slides[0]).toHaveAccessibleName('۱ از ۳')
    expect(slides[2]).toHaveAccessibleName('۳ از ۳')
    expect(slides[1]).toHaveTextContent('اسلاید دوم')
  })
})

describe('useMediaQuery', () => {
  function Probe() {
    return <span>{useMediaQuery('(min-width: 768px)') ? 'wide' : 'narrow'}</span>
  }

  it('uses the fallback on the server and follows the query on the client', () => {
    media.set(minWidth(768))
    expect(renderToString(<Probe />)).toContain('narrow')

    render(<Probe />)
    expect(screen.getByText('wide')).toBeInTheDocument()
    act(() => media.set(() => false))
    expect(screen.getByText('narrow')).toBeInTheDocument()
  })
})

describe('Sheet', () => {
  function FilterSheet({ onOpenChange = vi.fn(), hideTitle = false }) {
    return (
      <Sheet
        open
        onOpenChange={onOpenChange}
        title="فیلترها"
        hideTitle={hideTitle}
        footer={<Button>نمایش نتایج</Button>}
      >
        <p>فهرست فیلترها</p>
      </Sheet>
    )
  }

  it('renders nothing on the server, so its two variants never mismatch on hydration', () => {
    expect(renderToString(<FilterSheet />)).toBe('')
  })

  it('is a bottom sheet below md, with its footer', () => {
    render(<FilterSheet />)
    const sheet = screen.getByRole('dialog', { name: 'فیلترها' })
    expect(sheet).toHaveAttribute('data-vaul-drawer-direction', 'bottom')
    expect(within(sheet).getByRole('button', { name: 'نمایش نتایج' })).toBeInTheDocument()
  })

  it('is a side drawer from the start (right) side at md and up', () => {
    media.set(minWidth(768))
    render(<FilterSheet />)
    const sheet = screen.getByRole('dialog', { name: 'فیلترها' })
    expect(sheet).not.toHaveAttribute('data-vaul-drawer')
    expect(sheet).toHaveAttribute('data-side', 'start')
    expect(within(sheet).getByText('فهرست فیلترها')).toBeInTheDocument()
  })

  it('keeps a visually hidden title as its accessible name', () => {
    render(<FilterSheet hideTitle />)
    expect(screen.getByRole('dialog', { name: 'فیلترها' })).toBeInTheDocument()
    expect(screen.getByText('فیلترها')).toHaveClass('sr-only')
  })

  it('asks to close from its close button', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<FilterSheet onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: 'بستن' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('Sheet focus', () => {
  function Opener() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>فیلترها</Button>
        <Sheet open={open} onOpenChange={setOpen} title="فیلترها">
          <button type="button">برند</button>
        </Sheet>
      </>
    )
  }

  it.each([
    ['bottom sheet', () => false],
    ['side drawer', minWidth(768)],
  ])('moves focus into the %s and back to its opener on close', async (_variant, matcher) => {
    media.set(matcher)
    const user = userEvent.setup()
    render(<Opener />)
    const opener = screen.getByRole('button', { name: 'فیلترها' })
    await user.click(opener)
    const sheet = screen.getByRole('dialog', { name: 'فیلترها' })
    await waitFor(() => expect(sheet).toContainElement(activeElement()))

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })
})

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
})

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

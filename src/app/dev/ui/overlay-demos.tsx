'use client'

import {
  ChevronLeft,
  Home,
  Laptop,
  LogIn,
  Menu,
  Pencil,
  Shirt,
  Smartphone,
  SlidersHorizontal,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Drawer } from '@/components/ui/drawer'
import { Field } from '@/components/ui/field'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Sheet } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { notify } from '@/components/ui/toaster'

// Interactive overlay demos for the /dev/ui showcase.

export function DialogDemo() {
  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="danger" iconStart={<Trash2 />}>
            حذف آدرس
          </Button>
        </DialogTrigger>
        <DialogContent
          size="sm"
          title="این آدرس حذف شود؟"
          description="آدرس «خانه — تهران، خیابان ولیعصر» از فهرست آدرس‌های شما حذف می‌شود."
          footer={
            <>
              <DialogClose asChild>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => notify.success('آدرس حذف شد')}
                >
                  بله، حذف شود
                </Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="outline" className="flex-1">
                  انصراف
                </Button>
              </DialogClose>
            </>
          }
        />
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" iconStart={<Pencil />}>
            ویرایش نام
          </Button>
        </DialogTrigger>
        <DialogContent
          title="ویرایش نام"
          description="نام شما روی فاکتور و برچسب مرسوله چاپ می‌شود."
          footer={
            <>
              <DialogClose asChild>
                <Button onClick={() => notify.success('نام شما ذخیره شد')}>ذخیره</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="ghost">انصراف</Button>
              </DialogClose>
            </>
          }
        >
          <div className="grid gap-4 pt-1">
            <Field label="نام" required>
              <Input defaultValue="سارا" autoComplete="given-name" />
            </Field>
            <Field label="نام خانوادگی" required>
              <Input defaultValue="احمدی" autoComplete="family-name" />
            </Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

const BRANDS = ['سامسونگ', 'اپل', 'شیائومی', 'نوکیا', 'هوآوی', 'آنر']

export function SheetDemo() {
  const [filters, setFilters] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [sort, setSort] = useState('popular')
  return (
    <>
      <Button variant="outline" iconStart={<SlidersHorizontal />} onClick={() => setFilters(true)}>
        فیلترها
      </Button>
      <Button variant="ghost" onClick={() => setSortOpen(true)}>
        مرتب‌سازی
      </Button>

      <Sheet
        open={filters}
        onOpenChange={setFilters}
        title="فیلترها"
        description="۱۲۴ کالا با فیلترهای فعلی"
        footer={
          <>
            <Button className="flex-1" onClick={() => setFilters(false)}>
              نمایش ۱۲۴ کالا
            </Button>
            <Button variant="ghost">حذف همه</Button>
          </>
        }
      >
        <Accordion type="multiple" defaultValue={['brand', 'stock']}>
          <AccordionItem value="brand">
            <AccordionTrigger>برند</AccordionTrigger>
            <AccordionContent className="grid">
              {BRANDS.map((brand) => (
                <Checkbox key={brand} label={brand} defaultChecked={brand === 'سامسونگ'} />
              ))}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="price">
            <AccordionTrigger>محدوده قیمت</AccordionTrigger>
            <AccordionContent className="grid grid-cols-2 gap-3">
              <Field label="از">
                <Input inputMode="numeric" placeholder="۰" />
              </Field>
              <Field label="تا">
                <Input inputMode="numeric" placeholder="۵۰٬۰۰۰٬۰۰۰" />
              </Field>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="stock">
            <AccordionTrigger>وضعیت کالا</AccordionTrigger>
            <AccordionContent>
              <Switch label="فقط کالاهای موجود" defaultChecked />
              <Switch label="فقط کالاهای تخفیف‌دار" />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Sheet>

      <Sheet open={sortOpen} onOpenChange={setSortOpen} title="مرتب‌سازی بر اساس">
        <RadioGroup
          value={sort}
          onValueChange={(value) => {
            setSort(value)
            setSortOpen(false)
          }}
          aria-label="مرتب‌سازی"
          className="gap-0"
        >
          <RadioGroupItem value="popular" label="محبوب‌ترین" />
          <RadioGroupItem value="newest" label="جدیدترین" />
          <RadioGroupItem value="cheapest" label="ارزان‌ترین" />
          <RadioGroupItem value="expensive" label="گران‌ترین" />
        </RadioGroup>
      </Sheet>
    </>
  )
}

const CATEGORIES = [
  { name: 'موبایل و تبلت', icon: Smartphone },
  { name: 'لپ‌تاپ و کامپیوتر', icon: Laptop },
  { name: 'مد و پوشاک', icon: Shirt },
  { name: 'خانه و آشپزخانه', icon: Home },
]

export function DrawerDemo() {
  return (
    <>
      <Drawer
        trigger={<IconButton label="باز کردن منو" icon={<Menu />} variant="outline" />}
        title="منوی فروشگاه"
        footer={
          <Button fullWidth iconStart={<LogIn />}>
            ورود یا ثبت‌نام
          </Button>
        }
      >
        <nav aria-label="دسته‌بندی‌ها">
          <ul className="grid gap-1">
            {CATEGORIES.map(({ name, icon: Icon }) => (
              <li key={name}>
                <a
                  href="#drawer"
                  className="flex min-h-12 items-center gap-3 rounded-control px-3 text-base font-medium text-ink-800 transition-colors hover:bg-ink-100"
                >
                  <Icon aria-hidden className="size-5 text-ink-500" />
                  {name}
                  <ChevronLeft aria-hidden className="ms-auto size-4 text-ink-400" />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Drawer>
      <Drawer
        side="end"
        trigger={
          <Button variant="outline" iconStart={<ShoppingBag />}>
            کشو از سمت چپ
          </Button>
        }
        title="سبد خرید"
        description="۲ کالا"
      >
        <p className="text-ink-600">کشوی سمت مقابل، برای نمونه سبد خرید کوچک.</p>
      </Drawer>
    </>
  )
}

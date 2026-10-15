import {
  ChevronLeft,
  Heart,
  Mail,
  Phone,
  Plus,
  Search,
  Share2,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { LoadingButtonDemo } from './demos'
import { Demo, Section, sectionTitle } from './showcase'

function Buttons() {
  return (
    <Section
      id="buttons"
      title={sectionTitle('buttons')}
      description="ارتفاع پیش‌فرض ۴۴ پیکسل است."
    >
      <Demo label="گونه‌ها">
        <Button iconStart={<ShoppingCart />}>افزودن به سبد</Button>
        <Button variant="secondary">ذخیره برای بعد</Button>
        <Button variant="outline">مقایسه</Button>
        <Button variant="ghost">انصراف</Button>
        <Button variant="danger" iconStart={<Trash2 />}>
          حذف از سبد
        </Button>
        <Button variant="link">مشاهده همه</Button>
      </Demo>
      <Demo label="اندازه‌ها">
        <Button size="sm">کوچک</Button>
        <Button size="md">متوسط</Button>
        <Button size="lg">بزرگ</Button>
      </Demo>
      <Demo label="وضعیت‌ها">
        <Button loading iconStart={<ShoppingCart />}>
          افزودن به سبد
        </Button>
        <Button loading variant="outline">
          در حال ارسال
        </Button>
        <Button disabled>غیرفعال</Button>
        <LoadingButtonDemo />
      </Demo>
      <Demo label="تمام‌عرض و لینک با ظاهر دکمه" className="grid w-full max-w-sm gap-3">
        <Button fullWidth size="lg" iconEnd={<ChevronLeft />}>
          ادامه فرایند خرید
        </Button>
        <Button asChild variant="outline" fullWidth>
          <Link href="/">بازگشت به صفحه اصلی</Link>
        </Button>
      </Demo>
      <Demo label="دکمه‌های آیکونی و نشانگر بارگذاری">
        <IconButton label="افزودن به علاقه‌مندی‌ها" icon={<Heart />} />
        <IconButton label="اشتراک‌گذاری" icon={<Share2 />} variant="outline" />
        <IconButton label="فیلترها" icon={<SlidersHorizontal />} variant="secondary" />
        <IconButton label="افزودن" icon={<Plus />} variant="primary" size="lg" />
        <IconButton label="افزودن" icon={<Plus />} variant="outline" size="sm" />
        <IconButton label="در حال بارگذاری" icon={<Plus />} variant="outline" loading />
        <span className="text-brand-600">
          <Spinner size="lg" label="در حال بارگذاری" />
        </span>
      </Demo>
    </Section>
  )
}

function Inputs() {
  return (
    <Section
      id="inputs"
      title={sectionTitle('inputs')}
      description="برچسب بالای فیلد، راهنما و خطا زیر آن."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="نام و نام خانوادگی" required>
          <Input placeholder="مثلاً سارا احمدی" autoComplete="name" />
        </Field>
        <Field label="شماره موبایل" required hint="کد تأیید به این شماره پیامک می‌شود.">
          <Input
            dir="ltr"
            type="tel"
            inputMode="tel"
            placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
            startAdornment={<Phone />}
          />
        </Field>
        <Field label="ایمیل" error="ایمیل واردشده معتبر نیست.">
          <Input dir="ltr" type="email" defaultValue="sara@example" startAdornment={<Mail />} />
        </Field>
        <Field label="جستجو">
          <Input type="search" placeholder="نام کالا، برند یا دسته" startAdornment={<Search />} />
        </Field>
        <Field label="حداکثر قیمت" hint="فقط عدد وارد کنید.">
          <Input
            inputMode="numeric"
            placeholder="۲۰٬۰۰۰٬۰۰۰"
            endAdornment={<span className="text-sm">تومان</span>}
          />
        </Field>
        <Field label="کد تخفیف" hint="برای این سفارش کد تخفیفی فعال نیست.">
          <Input dir="ltr" disabled placeholder="OFF-1405" />
        </Field>
        <Field label="مرتب‌سازی">
          <Select defaultValue="popular">
            <option value="popular">محبوب‌ترین</option>
            <option value="newest">جدیدترین</option>
            <option value="cheapest">ارزان‌ترین</option>
            <option value="expensive">گران‌ترین</option>
          </Select>
        </Field>
        <Field label="استان" required error="استان را انتخاب کنید.">
          <Select defaultValue="">
            <option value="" disabled>
              انتخاب کنید
            </option>
            <option value="teh">تهران</option>
            <option value="isf">اصفهان</option>
          </Select>
        </Field>
        <Field label="توضیحات سفارش" hint="مثلاً ساعت مناسب برای تحویل." className="md:col-span-2">
          <Textarea placeholder="توضیحات خود را بنویسید" />
        </Field>
      </div>
    </Section>
  )
}

function Selection() {
  return (
    <Section id="selection" title={sectionTitle('selection')}>
      <div className="grid gap-8 lg:grid-cols-3">
        <Demo label="چک‌باکس" className="flex flex-col">
          <Checkbox label="فقط کالاهای موجود" defaultChecked />
          <Checkbox label="ارسال رایگان" />
          <Checkbox label="دارای تخفیف" description="کالاهایی که همین حالا تخفیف دارند" />
          <Checkbox label="همه برندها" defaultChecked="indeterminate" />
          <Checkbox label="غیرفعال" disabled />
        </Demo>
        <Demo label="دکمه رادیویی (کارتی)" className="flex flex-col">
          <RadioGroup defaultValue="post" aria-label="روش ارسال">
            <RadioGroupItem
              variant="card"
              value="post"
              label="پست پیشتاز"
              description="۳ تا ۵ روز کاری"
              aside={<span className="text-sm font-bold text-ink-800">۴۵٬۰۰۰ تومان</span>}
            />
            <RadioGroupItem
              variant="card"
              value="courier"
              label="پیک موتوری"
              description="امروز، فقط تهران"
              aside={<span className="text-sm font-bold text-ink-800">۸۰٬۰۰۰ تومان</span>}
            />
            <RadioGroupItem
              variant="card"
              value="pickup"
              label="تحویل حضوری"
              description="از فروشگاه مرکزی"
              aside={<Badge tone="success">رایگان</Badge>}
            />
          </RadioGroup>
        </Demo>
        <div className="grid content-start gap-8">
          <Demo label="دکمه رادیویی" className="flex flex-col">
            <RadioGroup defaultValue="online" aria-label="روش پرداخت" className="gap-0">
              <RadioGroupItem value="online" label="پرداخت اینترنتی" />
              <RadioGroupItem value="wallet" label="کیف پول" />
              <RadioGroupItem value="cod" label="پرداخت در محل" disabled />
            </RadioGroup>
          </Demo>
          <Demo label="کلید" className="flex flex-col">
            <Switch label="اطلاع‌رسانی پیامکی" description="وضعیت سفارش پیامک شود" defaultChecked />
            <Switch label="خبرنامه ایمیلی" />
            <Switch label="غیرفعال" disabled />
          </Demo>
        </div>
      </div>
    </Section>
  )
}

export function ControlSections() {
  return (
    <>
      <Buttons />
      <Inputs />
      <Selection />
    </>
  )
}

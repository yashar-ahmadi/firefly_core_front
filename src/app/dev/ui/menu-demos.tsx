'use client'

import {
  ArrowUpDown,
  ChevronDown,
  GitCompareArrows,
  Heart,
  Info,
  LogOut,
  MapPin,
  Package,
  Share2,
  ShoppingCart,
  UserRound,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { notify } from '@/components/ui/toaster'
import { Tooltip } from '@/components/ui/tooltip'

// Floating overlays (popover, menu, tooltip) and toasts for the /dev/ui showcase.

export function PopoverDemo() {
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" iconStart={<MapPin />} iconEnd={<ChevronDown />}>
            ارسال به: تهران
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start">
          <p className="font-bold text-ink-900">ارسال به تهران</p>
          <p className="mt-1 text-ink-600">سفارش‌های ثبت‌شده تا ساعت ۱۴، همان روز ارسال می‌شوند.</p>
          <div className="mt-4 flex gap-2">
            <PopoverClose asChild>
              <Button size="sm">متوجه شدم</Button>
            </PopoverClose>
            <Button size="sm" variant="ghost">
              تغییر شهر
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <IconButton label="شرایط ارسال رایگان" icon={<Info />} variant="secondary" />
        </PopoverTrigger>
        <PopoverContent side="bottom">
          <p className="text-ink-700">
            برای خریدهای بالای <strong className="text-ink-900">۱ میلیون تومان</strong> ارسال رایگان
            است.
          </p>
        </PopoverContent>
      </Popover>
    </>
  )
}

const SORTS = [
  ['popular', 'محبوب‌ترین'],
  ['newest', 'جدیدترین'],
  ['cheapest', 'ارزان‌ترین'],
  ['expensive', 'گران‌ترین'],
] as const

export function DropdownDemo() {
  const [sort, setSort] = useState<string>('popular')
  const sortLabel = SORTS.find(([value]) => value === sort)?.[1]
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" iconStart={<UserRound />} iconEnd={<ChevronDown />}>
            سارا احمدی
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>حساب کاربری</DropdownMenuLabel>
          <DropdownMenuItem>
            <Package />
            سفارش‌های من
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Heart />
            علاقه‌مندی‌ها
          </DropdownMenuItem>
          <DropdownMenuItem>
            <MapPin />
            آدرس‌ها
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="danger" onSelect={() => notify.info('از حساب خود خارج شدید')}>
            <LogOut />
            خروج
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" iconStart={<ArrowUpDown />}>
            {sortLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>مرتب‌سازی</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
            {SORTS.map(([value, label]) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

export function TooltipDemo() {
  return (
    <>
      <Tooltip content="افزودن به علاقه‌مندی‌ها">
        <IconButton label="علاقه‌مندی" icon={<Heart />} variant="outline" />
      </Tooltip>
      <Tooltip content="مقایسه با کالاهای مشابه">
        <IconButton label="مقایسه" icon={<GitCompareArrows />} variant="outline" />
      </Tooltip>
      <Tooltip content="ارسال پیوند این کالا برای دوستان" side="bottom">
        <IconButton label="اشتراک‌گذاری" icon={<Share2 />} variant="outline" />
      </Tooltip>
    </>
  )
}

export function ToastDemo() {
  return (
    <>
      <Button
        variant="secondary"
        iconStart={<ShoppingCart />}
        onClick={() =>
          notify.success('به سبد خرید اضافه شد', {
            description: 'گوشی موبایل سامسونگ مدل Galaxy A55',
          })
        }
      >
        موفقیت
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          notify.error('پرداخت انجام نشد', {
            description: 'اگر مبلغی کسر شده، تا ۷۲ ساعت به حساب شما برمی‌گردد.',
          })
        }
      >
        خطا
      </Button>
      <Button variant="outline" onClick={() => notify.info('کد تخفیف کپی شد')}>
        اطلاع
      </Button>
    </>
  )
}

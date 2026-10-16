import { PackageSearch, SearchX, ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { SmartImage } from '@/components/ui/smart-image'
import { Demo, Section, sectionTitle } from './showcase'

const hrefFor = (page: number) => `/dev/ui/?page=${page}#pagination`

function ProductCardSkeleton() {
  return (
    <Card className="p-2 sm:p-3">
      <Skeleton className="aspect-square w-full" />
      <div className="grid gap-2.5 p-1 pt-4 sm:p-1 sm:pt-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-10 w-full" />
      </div>
    </Card>
  )
}

export function FeedbackSections() {
  return (
    <>
      <Section
        id="pagination"
        title={sectionTitle('pagination')}
        description="در موبایل فشرده، از تبلت به بالا کامل."
      >
        <Demo label="صفحه ۱ از ۵" className="block">
          <Pagination page={1} totalPages={5} hrefFor={hrefFor} />
        </Demo>
        <Demo label="صفحه ۲ از ۵" className="block">
          <Pagination page={2} totalPages={5} hrefFor={hrefFor} />
        </Demo>
        <Demo label="صفحه ۱۰ از ۲۴" className="block">
          <Pagination page={10} totalPages={24} hrefFor={hrefFor} />
        </Demo>
      </Section>

      <Section id="empty" title={sectionTitle('empty')}>
        <div className="grid gap-4 md:grid-cols-2">
          <Card variant="outline">
            <EmptyState
              icon={<ShoppingCart />}
              title="سبد خرید شما خالی است"
              description="کالاهای دلخواهتان را پیدا کنید و به سبد اضافه کنید."
              action={
                <Button asChild>
                  <Link href="/">مشاهده محصولات</Link>
                </Button>
              }
            />
          </Card>
          <Card variant="outline">
            <EmptyState
              icon={<SearchX />}
              title="نتیجه‌ای پیدا نشد"
              description="املای واژه را بررسی کنید یا فیلترها را کمتر کنید."
              action={<Button variant="outline">پاک کردن فیلترها</Button>}
            />
          </Card>
        </div>
      </Section>

      <Section id="skeletons" title={sectionTitle('skeletons')}>
        <Demo
          label="کارت محصول در حال بارگذاری"
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          {Array.from({ length: 4 }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </Demo>
        <Demo label="فهرست">
          <div className="flex w-full max-w-md items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        </Demo>
      </Section>

      <Section
        id="images"
        title={sectionTitle('images')}
        description="تصویر خراب یا خالی با تصویر جایگزین نمایش داده می‌شود."
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <figure className="grid content-start gap-2">
            <SmartImage
              src={null}
              alt="کالای بدون تصویر"
              ratio="1/1"
              className="rounded-card"
              sizes="25vw"
            />
            <figcaption className="text-sm text-ink-600">بدون تصویر (۱:۱)</figcaption>
          </figure>
          <figure className="grid content-start gap-2">
            <SmartImage
              src="https://images.invalid/broken.jpg"
              alt="تصویر خراب"
              ratio="1/1"
              className="rounded-card"
              sizes="25vw"
            />
            <figcaption className="text-sm text-ink-600">آدرس خراب، جایگزین</figcaption>
          </figure>
          <figure className="col-span-2 grid content-start gap-2">
            <SmartImage src={null} alt="بنر" ratio="16/9" className="rounded-card" sizes="50vw" />
            <figcaption className="flex items-center gap-1.5 text-sm text-ink-600">
              <PackageSearch aria-hidden className="size-4" />
              نسبت ۱۶:۹ برای بنرها
            </figcaption>
          </figure>
        </div>
      </Section>
    </>
  )
}

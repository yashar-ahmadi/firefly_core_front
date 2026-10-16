import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Button } from '@/components/ui/button'
import { Carousel } from '@/components/ui/carousel'
import { Checkbox } from '@/components/ui/checkbox'
import { Chip } from '@/components/ui/chip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProductCard } from '@/features/catalog/components/product-card'
import { SHOWCASE_PRODUCTS } from './product-fixtures'
import { Demo, Section, sectionTitle } from './showcase'

const BANNERS = [
  {
    title: 'جشنواره پاییزه',
    text: 'تا ۴۰٪ تخفیف روی موبایل و لوازم جانبی',
    tone: 'bg-brand text-brand-fg',
    action: 'secondary',
  },
  {
    title: 'ارسال رایگان',
    text: 'برای همه سفارش‌های بالای یک میلیون تومان',
    tone: 'bg-ink-800 text-white',
    action: 'secondary',
  },
  {
    title: 'کالاهای تازه',
    text: 'جدیدترین لپ‌تاپ‌ها با گارانتی معتبر',
    tone: 'bg-accent-100 text-accent-950',
    action: 'primary',
  },
] as const

const FAQ = [
  [
    'هزینه ارسال چقدر است؟',
    'برای خریدهای بالای یک میلیون تومان رایگان است و در غیر این صورت بر اساس شهر و وزن مرسوله حساب می‌شود.',
  ],
  [
    'چطور سفارشم را پیگیری کنم؟',
    'از بخش «سفارش‌های من» در حساب کاربری، وضعیت و کد رهگیری مرسوله را ببینید.',
  ],
  [
    'می‌توانم کالا را مرجوع کنم؟',
    'تا ۷ روز پس از تحویل، اگر کالا استفاده نشده باشد، می‌توانید درخواست مرجوعی ثبت کنید.',
  ],
] as const

const BRANDS = [
  'سامسونگ',
  'اپل',
  'شیائومی',
  'نوکیا',
  'هوآوی',
  'آنر',
  'سونی',
  'ال‌جی',
  'لنوو',
  'ایسوس',
  'اچ‌پی',
  'دل',
]

const CATEGORY_CRUMBS = [
  { name: 'کالای دیجیتال', href: '/product-category/digital/' },
  { name: 'گوشی موبایل', href: '/product-category/digital/mobile-phone/' },
]

const PRODUCT_CRUMBS = [
  ...CATEGORY_CRUMBS,
  { name: 'سامسونگ', href: '/brand/samsung/' },
  { name: 'گوشی موبایل سامسونگ مدل Galaxy S25 Ultra ظرفیت ۵۱۲ گیگابایت رم ۱۲ گیگابایت' },
]

export function NavigationSections() {
  return (
    <>
      <Section
        id="tabs"
        title={sectionTitle('tabs')}
        description="کلید جهت‌نمای چپ، زبانه بعدی است."
      >
        <Demo label="زبانه‌های خطی (صفحه کالا)" className="block">
          <Tabs defaultValue="intro">
            <TabsList aria-label="اطلاعات کالا">
              <TabsTrigger value="intro">معرفی</TabsTrigger>
              <TabsTrigger value="specs">مشخصات فنی</TabsTrigger>
              <TabsTrigger value="reviews">نظرات کاربران (۱۲۸)</TabsTrigger>
              <TabsTrigger value="qa">پرسش و پاسخ</TabsTrigger>
            </TabsList>
            <TabsContent value="intro">
              گلکسی A55 با بدنه فلزی و صفحه‌نمایش ۶٫۶ اینچی عرضه شده است.
            </TabsContent>
            <TabsContent value="specs">حافظه داخلی ۲۵۶ گیگابایت، رم ۸ گیگابایت.</TabsContent>
            <TabsContent value="reviews">۱۲۸ نفر درباره این کالا نظر داده‌اند.</TabsContent>
            <TabsContent value="qa">هنوز پرسشی ثبت نشده است.</TabsContent>
          </Tabs>
        </Demo>
        <Demo label="زبانه‌های قرصی (فیلتر سریع)" className="block">
          <Tabs defaultValue="all">
            <TabsList variant="pill" aria-label="نمایش کالاها">
              <TabsTrigger value="all">همه</TabsTrigger>
              <TabsTrigger value="best">پرفروش‌ترین</TabsTrigger>
              <TabsTrigger value="new">جدیدترین</TabsTrigger>
            </TabsList>
            <TabsContent value="all">همه کالاهای این دسته.</TabsContent>
            <TabsContent value="best">کالاهایی که بیشتر خریده شده‌اند.</TabsContent>
            <TabsContent value="new">کالاهایی که این هفته اضافه شده‌اند.</TabsContent>
          </Tabs>
        </Demo>
      </Section>

      <Section id="accordion" title={sectionTitle('accordion')}>
        <Demo label="پرسش‌های متداول" className="block max-w-2xl">
          <Accordion type="single" collapsible defaultValue="q0">
            {FAQ.map(([question, answer], index) => (
              <AccordionItem key={question} value={`q${index}`}>
                <AccordionTrigger>{question}</AccordionTrigger>
                <AccordionContent>{answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Demo>
      </Section>

      <Section
        id="carousel"
        title={sectionTitle('carousel')}
        description="اسلاید اول سمت راست است؛ دکمه «بعدی» سمت چپ. نمایش خودکار با نشانگر، فوکوس یا لمس متوقف می‌شود."
      >
        <Demo label="بنرها: نمایش خودکار، چرخشی، با نقطه‌ها" className="block">
          <Carousel ariaLabel="بنرهای تبلیغاتی" loop autoplayMs={5000} showDots>
            {BANNERS.map((banner) => (
              <div
                key={banner.title}
                className={`flex aspect-[2/1] flex-col items-start justify-center gap-2 rounded-card px-6 sm:aspect-[3/1] sm:px-16 ${banner.tone}`}
              >
                <p className="text-xl font-bold sm:text-3xl">{banner.title}</p>
                <p className="text-base opacity-90 sm:text-lg">{banner.text}</p>
                <Button size="sm" variant={banner.action} className="mt-1">
                  مشاهده
                </Button>
              </div>
            ))}
          </Carousel>
        </Demo>
        <Demo label="کالاها: ۲٫۲ در موبایل، ۳ در تبلت، ۴ در دسکتاپ" className="block">
          <Carousel ariaLabel="پیشنهادهای ویژه" slidesPerView={{ base: 2.2, md: 3, lg: 4 }}>
            {SHOWCASE_PRODUCTS.map((product) => (
              <ProductCard key={product.id} product={product} showOutOfStockLabel />
            ))}
          </Carousel>
        </Demo>
      </Section>

      <Section
        id="scroll"
        title={sectionTitle('scroll')}
        description="نوار پیمایش باریک در سمت چپ (ابتدای راست‌به‌چپ)."
      >
        <div className="grid gap-8 md:grid-cols-2">
          <Demo label="فهرست بلند با ارتفاع ثابت" className="block">
            <ScrollArea className="h-64 rounded-card border border-ink-200">
              <div className="px-4 py-2">
                {BRANDS.map((brand) => (
                  <Checkbox key={brand} label={brand} />
                ))}
              </div>
            </ScrollArea>
          </Demo>
          <Demo label="ردیف افقی" className="block">
            <ScrollArea orientation="horizontal" className="w-full">
              <div className="flex gap-2 pb-3">
                {BRANDS.map((brand) => (
                  <Chip key={brand}>{brand}</Chip>
                ))}
              </div>
            </ScrollArea>
          </Demo>
        </div>
      </Section>

      <Section
        id="breadcrumbs"
        title={sectionTitle('breadcrumbs')}
        description="خانه با نماد، جداکننده‌ها به سمت چپ، صفحه فعلی بدون پیوند. در عرض کم، ردیف افقی پیمایش می‌شود."
      >
        <Demo label="صفحه دسته‌بندی" className="block">
          <Breadcrumbs items={CATEGORY_CRUMBS} />
        </Demo>
        <Demo label="صفحه کالا با نام بلند، در عرض گوشی" className="block max-w-sm">
          <div className="rounded-card border border-ink-200 px-2">
            <Breadcrumbs items={PRODUCT_CRUMBS} />
          </div>
        </Demo>
      </Section>
    </>
  )
}

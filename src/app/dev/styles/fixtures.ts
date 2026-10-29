import type { ContactDetails } from '@/components/layout/contact-block'
import { SHOWCASE_PRODUCTS } from '@/app/dev/ui/product-fixtures'
import type { HomeItem, HomeSection, PostCard } from '@/lib/api/types/catalog'
import type { CategoryBanner } from '@/lib/api/types/display'
import type { PageBlock, PageBlockItem } from '@/lib/api/types/page'
import type { CategoryCard } from '@/lib/api/types/settings'

// Sample content for the /dev/styles review page only: every home section, page block and
// category banner set, shaped as the API sends them (content digest §2, §6; product digest
// §4.2). Pictures are drawn here as SVG data URLs, so the page needs no API and no network.

/** A picture: a diagonal gradient of `hue` with a few rings, `w`×`h`, and an optional word. */
export function art(hue: number, w = 1600, h = 600, word = ''): string {
  const rings = Array.from({ length: 5 }, (_, i) => {
    const r = Math.round(Math.min(w, h) * (0.18 + i * 0.09))
    return `<circle cx='${Math.round(w * (0.25 + i * 0.12))}' cy='${Math.round(h * 0.5)}' r='${r}'/>`
  }).join('')
  const text = word
    ? `<text x='50%' y='54%' text-anchor='middle' font-family='Tahoma,sans-serif' font-size='${Math.round(h / 6)}' fill='white' fill-opacity='.9'>${word}</text>`
    : ''
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue} 72% 58%)'/><stop offset='1' stop-color='hsl(${(hue + 35) % 360} 68% 34%)'/></linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/><g fill='none' stroke='white' stroke-opacity='.32' stroke-width='${Math.max(3, Math.round(w / 260))}'>${rings}</g>${text}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** A small round icon (as an operator's SVG upload would be). */
function icon(hue: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' fill='hsl(${hue} 70% 45%)'/><path d='M7 12.5l3 3 7-7' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const SLIDE_WORDS = [
  {
    title: 'جشنوارهٔ یلدا',
    description: 'تا ۳۰ درصد تخفیف روی گوشی و لپ‌تاپ',
    cta: 'دیدن تخفیف‌ها',
  },
  { title: 'گوشی‌های تازه رسیده', description: 'جدیدترین پرچمدارهای بازار', cta: 'خرید' },
  { title: 'ارسال رایگان', description: 'برای سفارش‌های بالای یک میلیون تومان', cta: '' },
  { title: 'لوازم خانگی هوشمند', description: '', cta: 'مشاهده' },
  { title: 'هفتهٔ صوتی', description: 'هدفون و اسپیکر با گارانتی معتبر', cta: 'خرید' },
]

/** `count` slides or banners: words, links and a mobile picture on some. */
export function promoItems(count: number, ratio: [number, number] = [1600, 600]): HomeItem[] {
  return Array.from({ length: count }, (_, index) => {
    const words = SLIDE_WORDS[index % SLIDE_WORDS.length]!
    return {
      id: index + 1,
      title: words.title,
      description: words.description,
      image: art(220 + index * 47, ratio[0], ratio[1]),
      mobile_image: index % 2 === 0 ? art(220 + index * 47, 800, 450) : null,
      text_color: index === 1 ? '#FEF3C7' : '',
      alt: words.title,
      link: words.cta || index !== 2 ? { url: '/product/list/', title: words.cta } : null,
    }
  })
}

const HEAD = { title: '', subtitle: '', link: null }
const EMPTY = {
  items: null,
  products: null,
  listing_query: null,
  categories: null,
  posts: null,
  content: null,
} as const

const CATEGORY_NAMES = [
  'گوشی موبایل',
  'لپ‌تاپ',
  'هدفون و هندزفری',
  'ساعت هوشمند',
  'لوازم خانگی',
  'دوربین',
  'کنسول بازی',
  'تبلت',
]

const categories: CategoryCard[] = CATEGORY_NAMES.map((name, index) => ({
  id: index + 1,
  name,
  slug: `c-${index + 1}`,
  path: `digital/c-${index + 1}`,
  parent_id: null,
  short_description: null,
  // Two keep the API's placeholder: the first letter shows instead.
  image: index % 4 === 3 ? '/static/defaults/default.png' : art(index * 40, 500, 500),
  icon: '/static/defaults/default.png',
  show_in_homepage: true,
  default_sorting: null,
  product_count: 0,
  created: '',
  updated: '',
}))

const POST_TITLES = [
  'راهنمای خرید گوشی در ۱۴۰۵: به این پنج نکته نگاه کنید',
  'مقایسهٔ بهترین لپ‌تاپ‌های دانشجویی',
  'چطور هدفون بی‌سیم مناسب انتخاب کنیم؟',
  'ده ترفند برای افزایش عمر باتری گوشی',
  'بررسی ساعت‌های هوشمند پرفروش',
  'نگهداری درست از لوازم خانگی',
]

const posts: PostCard[] = POST_TITLES.map((name, index) => ({
  id: index + 1,
  name,
  slug: `post-${index + 1}`,
  description:
    'خلاصه‌ای کوتاه از مطلب که در کارت ویژه دیده می‌شود و خواننده را به خواندن دعوت می‌کند.',
  image: art(160 + index * 30, 800, 450),
  author: { full_name: 'سارا کریمی', avatar: null },
  categories: [],
  comment_count: 0,
  question_count: 0,
  view_count: 120,
  is_in_reading_list: false,
  published_at: `2026-10-${String(20 - index).padStart(2, '0')}T10:00:00+03:30`,
  created: '',
  updated: '',
}))

/** Every home section type in `style`. */
export function homeSections(style: string): HomeSection[] {
  return [
    { id: 1, type: 'slider', style, ...HEAD, ...EMPTY, items: promoItems(4) },
    {
      id: 2,
      type: 'banner_group',
      style,
      ...HEAD,
      title: 'پیشنهادهای این هفته',
      ...EMPTY,
      items: promoItems(5, [1200, 600]),
    },
    {
      id: 3,
      type: 'product_carousel',
      style,
      ...HEAD,
      title: 'پیشنهاد شگفت‌انگیز',
      subtitle: 'تخفیف‌هایی که زمانشان رو به پایان است',
      ...EMPTY,
      products: SHOWCASE_PRODUCTS,
      listing_query: { has_timed_discount: 'true', in_stock: 'true', special_first: 'false' },
    },
    {
      id: 4,
      type: 'category_grid',
      style,
      ...HEAD,
      title: 'خرید بر اساس دسته‌بندی',
      ...EMPTY,
      categories,
    },
    {
      id: 5,
      type: 'post_carousel',
      style,
      ...HEAD,
      title: 'تازه‌ترین مطالب مجله',
      link: { url: '/blog/', title: 'ورود به مجله' },
      ...EMPTY,
      posts,
    },
    {
      id: 6,
      type: 'rich_text',
      style,
      ...HEAD,
      title: 'چرا فایرفلای؟',
      ...EMPTY,
      content:
        '<p>ارسال سریع به سراسر کشور، <strong>ضمانت اصالت کالا</strong> و <a href="/page/return-policy/">هفت روز ضمانت بازگشت</a>. پشتیبانی ما هر روز پاسخگوی شماست.</p>',
    },
  ]
}

function item(overrides: Partial<PageBlockItem>): PageBlockItem {
  return {
    id: 1,
    title: null,
    subtitle: null,
    description: null,
    value: null,
    image: null,
    mobile_image: null,
    icon: null,
    alt: null,
    link: null,
    ...overrides,
  }
}

function block(overrides: Partial<PageBlock>): PageBlock {
  return {
    id: 1,
    type: 'rich_text',
    style: 'style_1',
    placement: 'after_content',
    title: '',
    subtitle: null,
    content: null,
    image: null,
    mobile_image: null,
    alt: null,
    video_url: null,
    link: null,
    items: null,
    ...overrides,
  }
}

const pageSlides = (count: number) =>
  promoItems(count).map((slide) =>
    item({
      id: slide.id,
      title: slide.title,
      description: slide.description,
      image: slide.image,
      mobile_image: slide.mobile_image,
      alt: slide.alt,
      link: slide.link,
    }),
  )

/** One block of each of the eleven types in `style` (ids per type, unique on the page). */
export function pageBlocks(style: string): { label: string; block: PageBlock }[] {
  const list: [string, Partial<PageBlock>][] = [
    [
      'اسلایدر',
      {
        type: 'slider',
        title: 'پیشنهادهای ویژه',
        link: { url: '/product/list/', title: '' },
        items: pageSlides(3),
      },
    ],
    ['بنرها', { type: 'banners', title: 'بنرهای صفحه', items: pageSlides(3) }],
    [
      'گالری تصاویر',
      {
        type: 'gallery',
        title: 'دفتر و انبار فایرفلای',
        subtitle: 'نگاهی به پشت صحنه',
        items: Array.from({ length: 7 }, (_, i) =>
          item({
            id: i + 1,
            image: art(i * 50, 900, 700),
            alt: `تصویر ${i + 1}`,
            title: i % 3 ? `زیرنویس تصویر ${i + 1}` : null,
          }),
        ),
      },
    ],
    [
      'کارت‌ها',
      {
        type: 'cards',
        title: 'چرا از فایرفلای خرید کنید؟',
        subtitle: 'سه قولی که به هر مشتری می‌دهیم',
        link: { url: '/product/list/', title: 'مشاهدهٔ محصولات' },
        items: [
          item({
            id: 1,
            icon: icon(150),
            title: 'ضمانت اصالت کالا',
            description: 'همهٔ کالاها با گارانتی معتبر و از نمایندگی رسمی تهیه می‌شوند.',
          }),
          item({
            id: 2,
            icon: icon(210),
            title: 'ارسال سریع',
            description: 'سفارش‌های تهران همان روز و شهرهای دیگر حداکثر در سه روز کاری می‌رسند.',
          }),
          item({
            id: 3,
            icon: icon(30),
            title: 'هفت روز ضمانت بازگشت',
            description: 'اگر کالا با سفارش شما یکی نبود، تا هفت روز آن را پس می‌گیریم.',
            link: { url: '/page/return-policy/', title: 'رویهٔ بازگرداندن کالا' },
          }),
        ],
      },
    ],
    [
      'آمار و ارقام',
      {
        type: 'stats',
        title: 'فایرفلای در یک نگاه',
        subtitle: 'چند عدد از هفت سال همراهی با مشتریان',
        items: [
          item({ id: 1, icon: icon(260), title: 'سال تجربه', value: '۷+' }),
          item({ id: 2, icon: icon(150), title: 'مشتری راضی', value: '۲۵۰۰۰+' }),
          item({ id: 3, icon: icon(30), title: 'سفارش تحویل‌شده در موعد', value: '۹۸٪' }),
          item({ id: 4, icon: icon(330), title: 'کالای موجود', value: '۴۸۰۰' }),
        ],
      },
    ],
    [
      'نظر مشتریان',
      {
        type: 'testimonials',
        title: 'مشتریان دربارهٔ ما',
        subtitle: 'تجربهٔ خریدارانی که به ما اعتماد کردند',
        items: [
          item({
            id: 1,
            image: art(20, 200, 200),
            title: 'مینا رضایی',
            subtitle: 'مشتری از ۱۴۰۲',
            description:
              'کالا را روز پنجم پس دادم و مبلغ آن دو روز بعد به کیف پولم برگشت، بدون هیچ پیگیری اضافه.',
          }),
          item({
            id: 2,
            title: 'علی محمدی',
            subtitle: 'خریدار لپ‌تاپ',
            description: 'بسته‌بندی عالی و ارسال سریع.',
          }),
          item({
            id: 3,
            image: art(200, 200, 200),
            title: 'سارا کریمی',
            description:
              'مشاوره پیش از خرید خیلی کمکم کرد تا گوشی مناسب بودجه‌ام را پیدا کنم. ممنون از پشتیبانی خوبتان.',
          }),
          item({
            id: 4,
            title: 'رضا احمدی',
            subtitle: 'مشتری تهرانی',
            description: 'همه‌چیز همان‌طور بود که در سایت نوشته شده بود.',
          }),
        ],
      },
    ],
    [
      'پرسش و پاسخ',
      {
        type: 'faq',
        title: 'پرسش‌های پرتکرار',
        subtitle: 'پاسخ کوتاه به سؤال‌هایی که بیشتر از ما می‌پرسید',
        items: [
          item({
            id: 1,
            title: 'سفارش من کی ارسال می‌شود؟',
            description: 'سفارش‌هایی که تا ساعت ۱۴ ثبت شوند، همان روز تحویل پست می‌شوند.',
          }),
          item({
            id: 2,
            title: 'آیا می‌توانم در محل پرداخت کنم؟',
            description: 'بله، در تهران و کرج پرداخت در محل ممکن است.',
          }),
          item({
            id: 3,
            title: 'فاکتور رسمی می‌دهید؟',
            description: 'بله؛ پیش از نهایی کردن سفارش، اطلاعات حقوقی را در حساب خود وارد کنید.',
          }),
          item({
            id: 4,
            title: 'هزینهٔ ارسال چقدر است؟',
            description: 'برای سفارش‌های بالای یک میلیون تومان رایگان است.',
          }),
        ],
      },
    ],
    [
      'ویدیو',
      {
        type: 'video',
        title: 'آموزش بسته‌بندی کالای مرجوعی',
        subtitle: 'در دو دقیقه ببینید کالا را چگونه برای پیک آماده کنید',
        video_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
        image: art(250, 1280, 720),
        alt: '',
      },
    ],
    [
      'فراخوان',
      {
        type: 'call_to_action',
        title: 'پیش از ثبت سفارش، قوانین را بخوانید',
        subtitle: 'شرایط ارسال، مرجوعی و ضمانت کالا در یک صفحه',
        image: art(280, 1400, 700),
        alt: '',
        link: { url: '/page/terms/', title: 'قوانین و مقررات' },
      },
    ],
    [
      'متن',
      {
        type: 'rich_text',
        title: 'مأموریت ما',
        content:
          '<p>می‌خواهیم خرید کالای دیجیتال و لوازم خانگی اصل، با قیمت منصفانه و ارسال مطمئن، برای همه در سراسر ایران ساده باشد.</p>',
      },
    ],
    [
      'اطلاعات تماس',
      {
        type: 'contact_info',
        title: 'راه‌های ارتباط با ما',
        subtitle: 'تلفن، ایمیل و نشانی فروشگاه',
      },
    ],
  ]
  return list.map(([label, overrides], index) => ({
    label,
    block: block({ id: index + 1, style, ...overrides }),
  }))
}

/** The shop's contact details, as `contactDetails(settings)` reads the demo shop's. */
export const CONTACT: ContactDetails = {
  phones: [
    { label: '۰۲۱ ۹۱۰۰ ۰۰۰۰', tel: '+982191000000' },
    { label: '۰۲۱ ۸۸۷۷ ۶۶۵۵', tel: '+982188776655' },
  ],
  salesPhones: [{ label: '۰۲۱ ۹۱۰۰ ۰۱۰۰', tel: '+982191000100' }],
  email: 'support@firefly-core.ir',
  address: 'تهران، خیابان ولیعصر، بالاتر از میدان ونک، پلاک ۲۴۰',
  postalCode: '1969734512',
  map: 'https://maps.google.com/?q=35.7564,51.4100',
  responseTime: 'شنبه تا چهارشنبه ۹ تا ۱۸',
}

/** A category's banners: one alone, or three as a group. */
export function categoryBanners(count: 1 | 3): CategoryBanner[] {
  return promoItems(count, [1600, 800]).map((slide) => ({
    id: slide.id,
    title: slide.title,
    image: slide.image,
    mobile_image: slide.mobile_image,
    alt: slide.alt,
    link: slide.link,
  }))
}

import type {
  FilterBrandOption,
  FilterCategoryOption,
  FiltersMetadata,
} from '@/lib/api/types/catalog'

// `GET /api/v1/product/filters/` payloads as the dev API returns them (2026-10-16).

const DEFAULT_IMAGE = 'http://localhost:8000/static/defaults/default.png'

function brand(id: number, slug: string, name: string): FilterBrandOption {
  return { id, slug, name, image: DEFAULT_IMAGE }
}

function category(id: number, slug: string, name: string, count: number): FilterCategoryOption {
  return { id, slug, name, image: DEFAULT_IMAGE, icon: DEFAULT_IMAGE, product_count: count }
}

export const SORT_OPTIONS: FiltersMetadata['sort_options'] = [
  { value: 'date-desc', label: 'جدیدترین' },
  { value: 'date-asc', label: 'قدیمی ترین' },
  { value: 'price-desc', label: 'گران ترین' },
  { value: 'price-asc', label: 'ارزان ترین' },
  { value: 'sale', label: 'پرفروش ترین' },
]

/** Every published brand with products (the store-wide context): code-point order. */
export const STORE_BRANDS: FilterBrandOption[] = [
  brand(10014, 'adidas', 'آدیداس'),
  brand(10012, 'snowa', 'اسنوا'),
  brand(10008, 'lg', 'ال جی'),
  brand(10025, 'anker', 'انکر'),
  brand(10002, 'apple', 'اپل'),
  brand(10006, 'hp', 'اچ پی'),
  brand(10004, 'asus', 'ایسوس'),
  brand(10009, 'bosch', 'بوش'),
  brand(10026, 'baseus', 'بیسوس'),
  brand(10027, 'tefal', 'تفال'),
  brand(10011, 'gplus', 'جی پلاس'),
  brand(10023, 'debsh', 'دبش'),
  brand(10015, 'dorsa', 'درسا'),
  brand(10024, 'ronix', 'رونیکس'),
  brand(10001, 'samsung', 'سامسونگ'),
  brand(10007, 'sony', 'سونی'),
  brand(10020, 'cinere', 'سینره'),
  brand(10003, 'xiaomi', 'شیائومی'),
  brand(10028, 'philips', 'فیلیپس'),
  brand(10005, 'lenovo', 'لنوو'),
  brand(10018, 'loreal', 'لورآل'),
  brand(10017, 'maybelline', 'میبلین'),
  brand(10013, 'nike', 'نایکی'),
  brand(10022, 'nestle', 'نستله'),
  brand(10030, 'nashr-cheshmeh', 'نشر چشمه'),
  brand(10019, 'nivea', 'نیوآ'),
  brand(10029, 'hisense', 'هایسنس'),
  brand(10010, 'panasonic', 'پاناسونیک'),
  brand(10021, 'ahmad-tea', 'چای احمد'),
  brand(10016, 'charm-mashhad', 'چرم مشهد'),
]

/** `?list=best-selling-digital`: the list category's children, one with no product. */
export const LIST_CATEGORIES: FilterCategoryOption[] = [
  category(10002, 'mobile-phone', 'گوشی موبایل', 6),
  category(10003, 'laptop', 'لپ تاپ و الترابوک', 1),
  category(10004, 'tablet', 'تبلت', 0),
  category(10005, 'headphone', 'هدفون و هندزفری', 2),
]

/** `?category=mobile-phone`: a leaf (no child categories), three brands, three attributes. */
export const MOBILE_FILTERS: FiltersMetadata = {
  categories: [],
  brands: [
    brand(10002, 'apple', 'اپل'),
    brand(10001, 'samsung', 'سامسونگ'),
    brand(10003, 'xiaomi', 'شیائومی'),
  ],
  attributes: [
    {
      id: 10002,
      name: 'حافظه داخلی',
      input_type: 'select',
      values: [
        { id: 10014, name: '۱۲۸ گیگابایت', color: null, pattern: null },
        { id: 10015, name: '۲۵۶ گیگابایت', color: null, pattern: null },
      ],
    },
    {
      id: 10003,
      name: 'حافظه رم',
      input_type: 'select',
      values: [
        { id: 10020, name: '۸ گیگابایت', color: null, pattern: null },
        { id: 10021, name: '۱۲ گیگابایت', color: null, pattern: null },
      ],
    },
    {
      id: 10001,
      name: 'رنگ',
      input_type: 'color',
      values: [
        { id: 10001, name: 'مشکی', color: '#111111', pattern: null },
        { id: 10002, name: 'سفید', color: '#FFFFFF', pattern: null },
        { id: 10005, name: 'آبی', color: '#1E5AA8', pattern: null },
      ],
    },
  ],
  price: { min: 1250000, max: 134500000 },
  sort_options: SORT_OPTIONS,
}

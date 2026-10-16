import { BadgeCheck, Clock, Flame, Truck } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Price } from '@/components/ui/price'
import { Rating } from '@/components/ui/rating'
import { ProductCardSection } from './catalog-sections'
import { ChipsDemo } from './demos'
import { Demo, Section, sectionTitle } from './showcase'

const TONES: Array<[BadgeTone, string]> = [
  ['neutral', 'عادی'],
  ['brand', 'برند'],
  ['accent', 'تأکیدی'],
  ['success', 'موجود'],
  ['warning', 'رو به اتمام'],
  ['danger', 'ناموجود'],
  ['info', 'جدید'],
  ['sale', 'فروش ویژه'],
]

function Badges() {
  return (
    <Section id="badges" title={sectionTitle('badges')}>
      <Demo label="برچسب کم‌رنگ">
        {TONES.map(([tone, text]) => (
          <Badge key={tone} tone={tone}>
            {text}
          </Badge>
        ))}
      </Demo>
      <Demo label="برچسب پررنگ">
        {TONES.map(([tone, text]) => (
          <Badge key={tone} tone={tone} variant="solid">
            {text}
          </Badge>
        ))}
      </Demo>
      <Demo label="با آیکون و اندازه کوچک">
        <Badge tone="success">
          <Truck aria-hidden />
          ارسال رایگان
        </Badge>
        <Badge tone="brand">
          <BadgeCheck aria-hidden />
          ضمانت اصالت
        </Badge>
        <Badge tone="sale" variant="solid" size="sm">
          <Flame aria-hidden />
          شگفت‌انگیز
        </Badge>
        <Badge tone="warning" size="sm">
          <Clock aria-hidden />
          تنها ۲ عدد باقی مانده
        </Badge>
      </Demo>
      <ChipsDemo />
    </Section>
  )
}

function Cards() {
  return (
    <Section id="cards" title={sectionTitle('cards')}>
      <Demo label="گونه‌ها" className="grid gap-4 md:grid-cols-3">
        {(
          [
            ['elevated', 'سایه‌دار', 'سایه نرم روی زمینه روشن.'],
            ['outline', 'خط‌دار', 'حاشیه باریک بدون سایه.'],
            ['flat', 'ساده', 'سطح سفید بدون حاشیه و سایه.'],
          ] as const
        ).map(([variant, title, description]) => (
          <Card key={variant} variant={variant} className={variant === 'flat' ? 'bg-ink-50' : ''}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="text-base text-ink-700">
              محتوای کارت اینجا قرار می‌گیرد.
            </CardContent>
            <CardFooter>
              <Button size="sm" variant="secondary">
                جزئیات
              </Button>
            </CardFooter>
          </Card>
        ))}
      </Demo>
    </Section>
  )
}

function PriceAndRating() {
  return (
    <Section id="price" title={sectionTitle('price')}>
      <Demo label="قیمت در سه اندازه" className="flex flex-wrap items-end gap-8">
        <Price size="sm" amount={900_000} original={1_000_000} discountPercent={10} />
        <Price size="md" amount={12_500_000} original={14_200_000} />
        <Price size="lg" amount={89_900_000} original={99_000_000} />
      </Demo>
      <Demo label="بدون تخفیف و ناموجود" className="flex flex-wrap items-end gap-8">
        <Price amount={2_350_000} />
        <Price amount={2_350_000} original={2_350_000} />
        <Price amount={null} original={1_000_000} />
      </Demo>
      <Demo label="امتیاز" className="flex flex-wrap items-center gap-8">
        <Rating value={4.5} count={128} />
        <Rating value={3.2} count={14} size="sm" />
        <Rating value={5} />
        <Rating value={0} count={0} size="sm" />
        <Rating value={4.3} count={1284} size="sm" compact />
      </Demo>
    </Section>
  )
}

export function DisplaySections() {
  return (
    <>
      <Badges />
      <Cards />
      <ProductCardSection />
      <PriceAndRating />
    </>
  )
}

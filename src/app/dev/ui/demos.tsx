'use client'

import { CreditCard, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Countdown } from '@/components/ui/countdown'
import { OtpInput } from '@/components/ui/otp-input'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { toPersianDigits } from '@/lib/format'
import { Demo } from './showcase'

// Interactive pieces of the /dev/ui showcase.

export function LoadingButtonDemo() {
  const [loading, setLoading] = useState(false)
  return (
    <Button
      variant="secondary"
      loading={loading}
      iconStart={<CreditCard />}
      onClick={() => {
        setLoading(true)
        setTimeout(() => setLoading(false), 2000)
      }}
    >
      پرداخت (امتحان کنید)
    </Button>
  )
}

const BRANDS = ['سامسونگ', 'اپل', 'شیائومی', 'نوکیا', 'هوآوی']

export function ChipsDemo() {
  const [selected, setSelected] = useState<string[]>(['سامسونگ'])
  const [applied, setApplied] = useState(['تا ۲۰ میلیون تومان', 'فقط کالاهای موجود'])
  return (
    <>
      <Demo label="تراشه انتخابی">
        {BRANDS.map((brand) => (
          <Chip
            key={brand}
            selected={selected.includes(brand)}
            onClick={() =>
              setSelected((s) => (s.includes(brand) ? s.filter((b) => b !== brand) : [...s, brand]))
            }
          >
            {brand}
          </Chip>
        ))}
      </Demo>
      <Demo label="فیلترهای اعمال‌شده">
        {applied.map((filter) => (
          <Chip
            key={filter}
            removable
            aria-label={`حذف فیلتر ${filter}`}
            onClick={() => setApplied((a) => a.filter((f) => f !== filter))}
          >
            {filter}
          </Chip>
        ))}
        {applied.length === 0 && (
          <Button
            variant="link"
            iconStart={<RotateCcw />}
            onClick={() => setApplied(['تا ۲۰ میلیون تومان', 'فقط کالاهای موجود'])}
          >
            بازگرداندن فیلترها
          </Button>
        )}
      </Demo>
    </>
  )
}

export function StepperDemo() {
  const [quantity, setQuantity] = useState(1)
  const [removed, setRemoved] = useState(false)
  return (
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      <Demo label="سقف ۵ عدد، با حذف">
        {removed ? (
          <Button variant="link" iconStart={<RotateCcw />} onClick={() => setRemoved(false)}>
            کالا حذف شد؛ بازگرداندن
          </Button>
        ) : (
          <QuantityStepper
            value={quantity}
            max={5}
            onChange={setQuantity}
            onRemove={() => setRemoved(true)}
          />
        )}
      </Demo>
      <Demo label="بدون سقف">
        <UnlimitedStepper />
      </Demo>
      <Demo label="اندازه کوچک، در سقف">
        <QuantityStepper value={3} max={3} size="sm" onChange={() => {}} />
      </Demo>
      <Demo label="در حال ذخیره">
        <QuantityStepper value={2} loading onChange={() => {}} />
      </Demo>
    </div>
  )
}

function UnlimitedStepper() {
  const [quantity, setQuantity] = useState(12)
  return <QuantityStepper value={quantity} max={0} onChange={setQuantity} />
}

const HOUR = 3_600_000

export function CountdownDemo() {
  // The end times are fixed at first render; the countdown itself starts after mount.
  const [base] = useState(() => Date.now())
  const [ended, setEnded] = useState(false)
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <Demo label="ساده">
        <span className="text-base text-ink-700">
          ارسال دوباره کد تا <Countdown endsAt={base + 95_000} className="text-ink-900" />
        </span>
      </Demo>
      <Demo label="کاشی‌دار (پیشنهاد شگفت‌انگیز)">
        <Countdown variant="boxed" endsAt={base + 5 * HOUR + 1_234_000} />
      </Demo>
      <Demo label="بیش از ۲۴ ساعت">
        <Countdown variant="boxed" endsAt={base + 50 * HOUR + 600_000} />
      </Demo>
      <Demo label="پایان‌یافته">
        <Countdown endsAt={base + 3000} onEnd={() => setEnded(true)} />
        <span className="text-base text-ink-600">
          {ended ? 'زمان پیشنهاد تمام شد.' : 'در حال شمارش…'}
        </span>
      </Demo>
    </div>
  )
}

export function OtpDemo() {
  const [code, setCode] = useState('')
  const [completed, setCompleted] = useState<string | null>(null)
  const [wrong, setWrong] = useState('1234')
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="grid gap-3">
        <p id="otp-help" className="text-base text-ink-700">
          کد ۶ رقمی پیامک‌شده به <span dir="ltr">۰۹۱۲ ۱۲۳ ۴۵۶۷</span> را وارد کنید.
        </p>
        <OtpInput
          value={code}
          onChange={(next) => {
            setCode(next)
            if (next.length < 6) setCompleted(null)
          }}
          onComplete={setCompleted}
          aria-describedby="otp-help"
        />
        <p aria-live="polite" className="min-h-7 text-base text-success">
          {completed && `کد کامل شد: ${toPersianDigits(completed)}`}
        </p>
      </div>
      <div className="grid content-start gap-3">
        <p className="text-base text-ink-700">کد نادرست، ۴ رقمی:</p>
        <OtpInput length={4} value={wrong} onChange={setWrong} invalid />
        <p className="text-sm font-medium text-danger">کد واردشده درست نیست.</p>
      </div>
    </div>
  )
}

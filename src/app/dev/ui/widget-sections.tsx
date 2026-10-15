import { CountdownDemo, OtpDemo, StepperDemo } from './demos'
import { Section, sectionTitle } from './showcase'
import { FeedbackSections } from './feedback-sections'

export function WidgetSections() {
  return (
    <>
      <Section
        id="stepper"
        title={sectionTitle('stepper')}
        description="دکمه‌های ۴۴ پیکسلی؛ در کمترین مقدار، دکمه منفی به «حذف» تبدیل می‌شود."
      >
        <StepperDemo />
      </Section>
      <Section
        id="countdown"
        title={sectionTitle('countdown')}
        description="هر ثانیه به‌روز می‌شود و در صفر می‌ایستد."
      >
        <CountdownDemo />
      </Section>
      <Section
        id="otp"
        title={sectionTitle('otp')}
        description="چسباندن کد، ارقام فارسی و پیامک خودکار پشتیبانی می‌شود."
      >
        <OtpDemo />
      </Section>
      <FeedbackSections />
    </>
  )
}

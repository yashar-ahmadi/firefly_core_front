import { DropdownDemo, PopoverDemo, ToastDemo, TooltipDemo } from './menu-demos'
import { DialogDemo, DrawerDemo, SheetDemo } from './overlay-demos'
import { Demo, Section, sectionTitle } from './showcase'

export function OverlaySections() {
  return (
    <>
      <Section
        id="dialog"
        title={sectionTitle('dialog')}
        description="تمرکز داخل پنجره می‌ماند؛ Escape، دکمه بستن یا کلیک روی پس‌زمینه آن را می‌بندد."
      >
        <Demo label="تأیید حذف و فرم">
          <DialogDemo />
        </Demo>
      </Section>
      <Section
        id="sheet"
        title={sectionTitle('sheet')}
        description="در موبایل از پایین باز می‌شود و با کشیدن به پایین بسته می‌شود؛ از تبلت به بالا از سمت راست."
      >
        <Demo label="فیلتر و مرتب‌سازی">
          <SheetDemo />
        </Demo>
      </Section>
      <Section
        id="drawer"
        title={sectionTitle('drawer')}
        description="برای منوها؛ از سمت راست (ابتدای خط) باز می‌شود."
      >
        <Demo label="منوی فروشگاه">
          <DrawerDemo />
        </Demo>
      </Section>
      <Section id="popover" title={sectionTitle('popover')}>
        <Demo label="توضیح کوتاه کنار دکمه">
          <PopoverDemo />
        </Demo>
      </Section>
      <Section
        id="menu"
        title={sectionTitle('menu')}
        description="با کلیدهای جهت‌نما جابه‌جا شوید و با Enter انتخاب کنید."
      >
        <Demo label="حساب کاربری و مرتب‌سازی">
          <DropdownDemo />
        </Demo>
      </Section>
      <Section
        id="tooltip"
        title={sectionTitle('tooltip')}
        description="با نگه‌داشتن نشانگر یا رسیدن با Tab نمایش داده می‌شود؛ در لمس نمایش داده نمی‌شود."
      >
        <Demo label="دکمه‌های آیکونی">
          <TooltipDemo />
        </Demo>
      </Section>
      <Section
        id="toast"
        title={sectionTitle('toast')}
        description="بالای صفحه نمایش داده می‌شود؛ با دکمه بستن یا کشیدن کنار می‌رود."
      >
        <Demo label="نوع اعلان">
          <ToastDemo />
        </Demo>
      </Section>
    </>
  )
}

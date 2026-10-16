import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

describe('Tabs', () => {
  it('switch panels with the arrow keys in RTL reading order', async () => {
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="intro">
        <TabsList aria-label="اطلاعات کالا">
          <TabsTrigger value="intro">معرفی</TabsTrigger>
          <TabsTrigger value="specs">مشخصات</TabsTrigger>
          <TabsTrigger value="reviews">نظرات</TabsTrigger>
        </TabsList>
        <TabsContent value="intro">متن معرفی</TabsContent>
        <TabsContent value="specs">جدول مشخصات</TabsContent>
        <TabsContent value="reviews">نظرات خریداران</TabsContent>
      </Tabs>,
    )
    await user.tab()
    expect(screen.getByRole('tab', { name: 'معرفی' })).toHaveFocus()

    // In RTL the next tab sits to the left, so ArrowLeft moves forward.
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'مشخصات' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('جدول مشخصات')

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('نظرات خریداران')

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'مشخصات' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('جدول مشخصات')
  })
})

describe('Accordion', () => {
  it('toggles aria-expanded and shows the answer as a labelled region', async () => {
    const user = userEvent.setup()
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="shipping">
          <AccordionTrigger>هزینه ارسال چقدر است؟</AccordionTrigger>
          <AccordionContent>برای خریدهای بالای یک میلیون تومان رایگان است.</AccordionContent>
        </AccordionItem>
      </Accordion>,
    )
    const trigger = screen.getByRole('button', { name: 'هزینه ارسال چقدر است؟' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'هزینه ارسال چقدر است؟' })).toHaveTextContent(
      'برای خریدهای بالای یک میلیون تومان رایگان است.',
    )

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

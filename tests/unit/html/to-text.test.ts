import { describe, expect, it } from 'vitest'
import { htmlToText } from '@/lib/html/to-text'

describe('htmlToText', () => {
  it('keeps plain text as it is', () => {
    expect(htmlToText('ارسال رایگان برای سفارش‌های بالای ۱۰ میلیون تومان.')).toBe(
      'ارسال رایگان برای سفارش‌های بالای ۱۰ میلیون تومان.',
    )
  })

  it('drops tags and keeps their text', () => {
    expect(htmlToText('<p>ارسال <strong>رایگان</strong> <a href="/x/">جزئیات</a></p>')).toBe(
      'ارسال رایگان جزئیات',
    )
  })

  it('drops scripts, styles and comments with their content', () => {
    expect(
      htmlToText('<style>p{color:red}</style>سلام<script>alert(1)</script><!-- note -->!'),
    ).toBe('سلام!')
  })

  it('turns block breaks into spaces and collapses whitespace', () => {
    expect(htmlToText('<p>خط اول</p><p>خط دوم</p>\n\n  <br/>سوم')).toBe('خط اول خط دوم سوم')
  })

  it('decodes entities once', () => {
    expect(
      htmlToText('a &amp; b &lt;i&gt; &quot;q&quot; &#39;s&#39; &#x6F0;&nbsp;c &amp;lt;'),
    ).toBe('a & b <i> "q" \'s\' ۰ c &lt;')
  })

  it('returns an empty string for nothing', () => {
    expect(htmlToText(null)).toBe('')
    expect(htmlToText('  <p> </p> ')).toBe('')
  })
})

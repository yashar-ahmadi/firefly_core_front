import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { AnnouncementBar, announcementKey } from '@/components/layout/announcement-bar'

const TEXT = 'ارسال رایگان برای سفارش‌های بالای ۱۰ میلیون تومان.'
const STORAGE_KEY = 'ff_announcement_dismissed'

beforeEach(() => {
  sessionStorage.clear()
})

describe('AnnouncementBar', () => {
  it('shows the text with a dismiss button', () => {
    render(<AnnouncementBar text={TEXT} />)
    expect(screen.getByText(TEXT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'بستن اطلاعیه' })).toBeInTheDocument()
  })

  it('hides on dismiss and remembers it for the session', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<AnnouncementBar text={TEXT} />)
    await user.click(screen.getByRole('button', { name: 'بستن اطلاعیه' }))
    expect(screen.queryByText(TEXT)).toBeNull()
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(announcementKey(TEXT))

    unmount()
    render(<AnnouncementBar text={TEXT} />)
    expect(screen.queryByText(TEXT)).toBeNull()
  })

  it('shows a new announcement even when an older one was dismissed', () => {
    sessionStorage.setItem(STORAGE_KEY, announcementKey('اطلاعیه قبلی'))
    render(<AnnouncementBar text={TEXT} />)
    expect(screen.getByText(TEXT)).toBeInTheDocument()
  })

  it('gives different texts different keys', () => {
    expect(announcementKey(TEXT)).toMatch(/^[0-9a-z]+$/)
    expect(announcementKey(TEXT)).not.toBe(announcementKey(`${TEXT}!`))
  })
})

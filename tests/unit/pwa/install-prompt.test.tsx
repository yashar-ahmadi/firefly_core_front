import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallPrompt } from '@/features/pwa/install-prompt'
import { DISMISSED_KEY, INSTALLABLE_EVENT } from '@/features/pwa/install-state'

const mocks = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }))

// The install prompt (Plan 5 Task 6), once the gate lets it load (install-gate.test.tsx): with
// the browser's install offer (`beforeinstallprompt`, kept by the registration script) a banner
// whose «نصب» opens the browser's own dialog; on an iPhone's Safari, which makes no such offer,
// how to add the shop to the home screen. Dismissed, it never comes back (localStorage, which
// may be refused). A labelled region that never takes the focus; 44 px targets.

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36'

type Offer = Event & {
  prompt: ReturnType<typeof vi.fn>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function offer(outcome: 'accepted' | 'dismissed' = 'accepted'): Offer {
  return Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  })
}

const keep = (event: Offer | undefined) => {
  ;(window as unknown as { __ffInstall?: Offer }).__ffInstall = event
}

beforeEach(() => {
  mocks.pathname = '/'
  localStorage.clear()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID)
  keep(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  keep(undefined)
})

const region = () => screen.queryByRole('region', { name: /نصب/ })

describe('with the browser’s install offer', () => {
  it('a labelled region, the focus left where it was, «نصب» opening the browser’s dialog', async () => {
    const event = offer('accepted')
    keep(event)
    render(<InstallPrompt name="فایرفلای" />)
    expect(region()).toHaveAccessibleName('نصب برنامهٔ فایرفلای')
    expect(document.activeElement).toBe(document.body)
    for (const button of screen.getAllByRole('button')) expect(button).toHaveClass('h-11')
    await userEvent.setup().click(screen.getByRole('button', { name: 'نصب' }))
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(region()).not.toBeInTheDocument()
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('1')
  })

  it('the browser’s dialog dismissed: the banner goes, and is not offered again', async () => {
    keep(offer('dismissed'))
    render(<InstallPrompt name="فایرفلای" />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'نصب' }))
    expect(region()).not.toBeInTheDocument()
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('1')
  })

  it('«بعداً»: gone, and remembered', async () => {
    keep(offer())
    render(<InstallPrompt name="فایرفلای" />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'بعداً' }))
    expect(region()).not.toBeInTheDocument()
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('1')
  })

  it('an offer that comes after the banner’s code: shown then', async () => {
    render(<InstallPrompt name="فایرفلای" />)
    expect(region()).not.toBeInTheDocument()
    act(() => {
      keep(offer())
      window.dispatchEvent(new Event(INSTALLABLE_EVENT))
    })
    expect(region()).toBeInTheDocument()
  })

  it('no offer at all (a browser that makes none): nothing', () => {
    render(<InstallPrompt name="فایرفلای" />)
    expect(region()).not.toBeInTheDocument()
  })

  it('installed meanwhile (from the browser’s menu): gone, and never offered again', () => {
    keep(offer())
    render(<InstallPrompt name="فایرفلای" />)
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(region()).not.toBeInTheDocument()
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('1')
  })

  it('storage refused: dismissing still hides it', async () => {
    keep(offer())
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    render(<InstallPrompt name="فایرفلای" />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'بعداً' }))
    expect(region()).not.toBeInTheDocument()
  })
})

describe('the visitor’s own pages', () => {
  it.each(['/cart/', '/account/orders/', '/order/track/', '/login/'])(
    'gone while on %s, back after',
    (path) => {
      keep(offer())
      const { rerender } = render(<InstallPrompt name="فایرفلای" />)
      expect(region()).toBeInTheDocument()
      mocks.pathname = path
      rerender(<InstallPrompt name="فایرفلای" />)
      expect(region()).not.toBeInTheDocument()
      mocks.pathname = '/product/x/'
      rerender(<InstallPrompt name="فایرفلای" />)
      expect(region()).toBeInTheDocument()
    },
  )
})

describe('on an iPhone', () => {
  it('Safari: how to add it to the home screen, with no install button', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    render(<InstallPrompt name="فایرفلای" />)
    expect(region()).toHaveAccessibleName('نصب برنامهٔ فایرفلای')
    expect(region()).toHaveTextContent('Add to Home Screen')
    expect(screen.queryByRole('button', { name: 'نصب' })).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'متوجه شدم' }))
    expect(region()).not.toBeInTheDocument()
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('1')
  })

  it('another browser there (its menu differs): nothing', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_CHROME)
    render(<InstallPrompt name="فایرفلای" />)
    expect(region()).not.toBeInTheDocument()
  })
})

import type { Page, Request } from '@playwright/test'

// The card-transfer receipt's answers, mocked for the routine card-to-card journey (Plan 4 Task
// 6; card-transfer.spec.ts): a live upload moves the order to awaiting_review, which no customer
// can cancel, so the routine run answers the POST itself (201, under review) and the page's
// status reads after it. Each POST's multipart body is kept for the test to check what was sent.

export const RECEIPT = /\/api\/bff\/payment\/[0-9a-f-]{36}\/card-transfer\/receipt\/$/
const STATUS = /\/api\/bff\/payment\/[0-9a-f-]{36}\/status\/(?:\?.*)?$/

/** A request's multipart body as text (latin1: the PNG's bytes stay one character each). */
export const bodyOf = (request: Request) => request.postDataBuffer()?.toString('latin1') ?? ''

export async function mockReceipt(
  page: Page,
  { attempt, amount, orderCode }: { attempt: string; amount: number; orderCode: string },
): Promise<string[]> {
  const posted: string[] = []
  await page.route(RECEIPT, (route) => {
    posted.push(bodyOf(route.request()))
    return route.fulfill({
      status: 201,
      json: {
        msg: 'ایجاد شد',
        code: 201,
        data: {
          uuid: '7c2e0f5a-1b3d-4e6f-8a9b-0c1d2e3f4a5b',
          status: 'awaiting_review',
          paid_at: new Date().toISOString(),
          image_thumbnail: null,
          rejection_reason_code: null,
          rejection_reason: '',
          reviewed_at: null,
        },
      },
    })
  })
  await page.route(STATUS, (route) =>
    route.fulfill({
      json: {
        msg: 'درخواست با موفقیت انجام شد.',
        code: 200,
        data: {
          uuid: attempt,
          applies_to: 'online_charge',
          method: 'card_transfer',
          status: 'awaiting_review',
          amount,
          order_code: orderCode,
          failure_reason: '',
          settled_at: null,
        },
      },
    }),
  )
  return posted
}

import { bffFetch } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import { toLatinDigits } from '@/lib/format/digits'
import type {
  CardTransferInstruction,
  CardTransferReceipt,
  PaymentHistoryDetail,
  PaymentStatusInfo,
} from '@/lib/api/types/payment'

// The card-transfer page's calls through the BFF (order digest §3.2.5, §3.2.7, §3.2.8, §3.2.10).
// The cards are always read here (`GET payment/<uuid>/card-transfer/`), never taken from an
// intent's answer: a replayed key answers `destination_cards: []` (§0 #11). The instruction read
// and the status share the 240/h `payment_status` budget; the receipt has its own 10/h. Signed
// in, the API refuses another account's payment (403 `payment_forbidden`) but answers the same
// call made anonymously (§11 #7): the status, the cards and the receipt are then made again
// without the session (`?anon=1`, which the BFF honours for exactly these three), and from then
// on (`sessionFirst`). The uuid is a bearer credential: in the path only, never in a log. Each
// call throws `ApiError`.

export const instructionPath = (uuid: string) => `payment/${uuid}/card-transfer/`
export const receiptPath = (uuid: string) => `payment/${uuid}/card-transfer/receipt/`

export interface PaymentCallOptions {
  /** Without the session (`?anon=1`). */
  anonymous?: boolean
  signal?: AbortSignal
}

const anonQuery = (anonymous: boolean) => (anonymous ? { anon: '1' } : undefined)

export async function readInstruction(
  uuid: string,
  { anonymous = false, signal }: PaymentCallOptions = {},
): Promise<CardTransferInstruction> {
  const query = anonQuery(anonymous)
  return (await bffFetch<CardTransferInstruction>(instructionPath(uuid), { query, signal })).data
}

/** What a call answered, and whether only without the session (another account's payment). */
export interface Answered<T> {
  value: T
  foreign: boolean
}

export const isPaymentForbidden = (error: unknown) =>
  error instanceof ApiError && error.status === 403 && error.code === 'payment_forbidden'

/**
 * `call` with the session, then, refused another account's payment, once more without it; at
 * once without it when the payment is already known to be someone else's (`anonymous`).
 */
export async function sessionFirst<T>(
  call: (anonymous: boolean) => Promise<T>,
  anonymous = false,
): Promise<Answered<T>> {
  if (anonymous) return { value: await call(true), foreign: true }
  try {
    return { value: await call(false), foreign: false }
  } catch (error) {
    if (!isPaymentForbidden(error)) throw error
    return { value: await call(true), foreign: true }
  }
}

export interface TransferStatus {
  info: PaymentStatusInfo
  /** Answered only without the session (another account's payment, §11 #7). */
  foreign: boolean
}

export interface ReceiptBody {
  image: File
  payerName: string
  /** Four ASCII digits (`normalizeLastDigits`). */
  lastDigits: string
  /** ISO at +03:30. */
  paidAt: string
  destinationCard: number
  bankReference: string
}

/**
 * The receipt, as multipart through the BFF (streamed, 6 MiB at most: a 5 MiB picture and these
 * fields fit). A stream cannot be sent twice, so a refresh of the session on the way answers
 * `503 upload_retry`, and the shopper presses again.
 */
export async function submitReceipt(
  uuid: string,
  body: ReceiptBody,
  { anonymous = false }: Pick<PaymentCallOptions, 'anonymous'> = {},
): Promise<CardTransferReceipt> {
  const form = new FormData()
  form.set('image', body.image)
  form.set('payer_name', body.payerName.trim())
  form.set('payer_card_last_digits', body.lastDigits)
  form.set('paid_at', body.paidAt)
  form.set('destination_card', String(body.destinationCard))
  // In ASCII digits, as a bank statement prints it (the shop matches references as text).
  const reference = toLatinDigits(body.bankReference).trim()
  if (reference) form.set('bank_reference', reference)
  return (
    await bffFetch<CardTransferReceipt>(receiptPath(uuid), {
      method: 'POST',
      formData: form,
      query: anonQuery(anonymous),
    })
  ).data
}

/** The owner's history detail: the only place a rejected receipt's reason can be read (§3.2.10). */
export async function readReceiptDetail(
  uuid: string,
  signal?: AbortSignal,
): Promise<PaymentHistoryDetail> {
  return (await bffFetch<PaymentHistoryDetail>(`payment/history/${uuid}/`, { signal })).data
}

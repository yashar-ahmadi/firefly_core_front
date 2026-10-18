import { bffFetch } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import { toLatinDigits } from '@/lib/format/digits'
import type {
  CardTransferInstruction,
  CardTransferReceipt,
  PaymentHistoryDetail,
  PaymentStatusInfo,
} from '@/lib/api/types/payment'
import { readPaymentStatus } from '../status-api'

// The card-transfer page's calls through the BFF (order digest §3.2.5, §3.2.7, §3.2.8, §3.2.10).
// The cards are always read here (`GET payment/<uuid>/card-transfer/`), never taken from an
// intent's answer: a replayed key answers `destination_cards: []` (§0 #11). The instruction read
// and the status share the 240/h `payment_status` budget; the receipt has its own 10/h. The uuid
// is a bearer credential: in the path only, never in a log. Each call throws `ApiError`.

export const instructionPath = (uuid: string) => `payment/${uuid}/card-transfer/`
export const receiptPath = (uuid: string) => `payment/${uuid}/card-transfer/receipt/`

export async function readInstruction(
  uuid: string,
  signal?: AbortSignal,
): Promise<CardTransferInstruction> {
  return (await bffFetch<CardTransferInstruction>(instructionPath(uuid), { signal })).data
}

export interface TransferStatus {
  info: PaymentStatusInfo
  /** Answered only without the session (another account's payment, §11 #7). */
  foreign: boolean
}

const isForbidden = (error: unknown) =>
  error instanceof ApiError && error.status === 403 && error.code === 'payment_forbidden'

/** The payment's status once, with the session and, refused it, without (`?anon=1`). */
export async function readTransferStatus(
  uuid: string,
  signal?: AbortSignal,
): Promise<TransferStatus> {
  try {
    return { info: await readPaymentStatus(uuid, { signal }), foreign: false }
  } catch (error) {
    if (!isForbidden(error)) throw error
    return { info: await readPaymentStatus(uuid, { anonymous: true, signal }), foreign: true }
  }
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
export async function submitReceipt(uuid: string, body: ReceiptBody): Promise<CardTransferReceipt> {
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
    await bffFetch<CardTransferReceipt>(receiptPath(uuid), { method: 'POST', formData: form })
  ).data
}

/** The owner's history detail: the only place a rejected receipt's reason can be read (§3.2.10). */
export async function readReceiptDetail(
  uuid: string,
  signal?: AbortSignal,
): Promise<PaymentHistoryDetail> {
  return (await bffFetch<PaymentHistoryDetail>(`payment/history/${uuid}/`, { signal })).data
}

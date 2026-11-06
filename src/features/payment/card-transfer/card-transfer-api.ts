import { bffFetch } from '@/lib/api/client'
import { toLatinDigits } from '@/lib/format/digits'
import type {
  CardTransferInstruction,
  CardTransferReceipt,
  PaymentHistoryDetail,
  PaymentStatusInfo,
} from '@/lib/api/types/payment'

// The card-transfer page's calls through the BFF (order digest §3.2.5, §3.2.7, §3.2.8, §3.2.10).
// The page reads the cards itself (`GET payment/<uuid>/card-transfer/`, with the amount, the
// route's instruction and the deadline): it is a page of its own, reached by a full page load, so
// no intent's answer is at hand. The instruction read and the status share the 240/h
// `payment_status` budget; the receipt has its own 10/h. Whoever holds the uuid makes these calls,
// signed in or not and whosever the payment is (BACKEND-ISSUES M-7, fixed), so they always go with
// the session. The uuid is a bearer credential: in the path only, never in a log. Each call
// throws `ApiError`.

export const instructionPath = (uuid: string) => `payment/${uuid}/card-transfer/`
export const receiptPath = (uuid: string) => `payment/${uuid}/card-transfer/receipt/`

export interface PaymentCallOptions {
  signal?: AbortSignal
}

export async function readInstruction(
  uuid: string,
  { signal }: PaymentCallOptions = {},
): Promise<CardTransferInstruction> {
  return (await bffFetch<CardTransferInstruction>(instructionPath(uuid), { signal })).data
}

export interface TransferStatus {
  info: PaymentStatusInfo
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

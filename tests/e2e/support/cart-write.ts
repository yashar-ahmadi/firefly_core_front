import type { APIRequestContext, APIResponse, Page, Response } from '@playwright/test'
import { open, stat } from 'node:fs/promises'
import { forgiveFailure } from './watch-errors'

// Cart writes driven through the UI against the dev backend (Plan 4 Task 2, controller ruling).
// The dev backend runs on SQLite: two projects writing carts at the same moment can meet
// «database is locked», a 500. The dev server answers it with its HTML error page, which the
// BFF turns into its own `500 non_json_response`, so the lock is read from the backend's log
// (`FIREFLY_BACKEND_LOG`, by default /tmp/backend.log, where context.md starts the server). Such
// a write is checked to have changed nothing (the cart read again through the BFF), said with a
// warning (the page's `watchErrors` forgets that 500), and the visitor's action is repeated once.
// Any other failure fails the test, saying what the BFF answered. A write the test makes itself
// (`requestCartWrite`, a measure's setup) is guarded the same way. Never in app code, and never a
// reason to reconfigure the backend.

export const BACKEND_LOG = process.env.FIREFLY_BACKEND_LOG ?? '/tmp/backend.log'
export const DATABASE_LOCKED = 'database is locked'

const BFF = '/api/bff/'
const HEADERS = { 'X-Requested-With': 'ff' }

export interface CartWriteSpec {
  method: 'POST' | 'PUT' | 'DELETE'
  /** The API path the BFF forwards, e.g. `cart/item/add/`. */
  path: string
  /** Picks this write among several to the same path, by the JSON body sent. */
  body?: (data: unknown) => boolean
  /** The answer the test expects (a refusal it checks, say); by default any 2xx. */
  status?: number
  /** Names the write in a failure or a warning. */
  label?: string
}

/** What the backend wrote to its log: its size now, and the text written since an offset. */
export interface BackendLog {
  size: () => Promise<number>
  since: (offset: number) => Promise<string>
}

/** The backend's log file; an unreadable one is empty (no lock can be confirmed then). */
export function fileLog(file = BACKEND_LOG): BackendLog {
  return {
    size: () =>
      stat(file).then(
        ({ size }) => size,
        () => 0,
      ),
    since: async (offset) => {
      try {
        const handle = await open(file)
        try {
          const { size } = await handle.stat()
          // A log started again since (a smaller file) is read from its start.
          const start = size < offset ? 0 : offset
          const buffer = Buffer.alloc(size - start)
          await handle.read(buffer, 0, buffer.length, start)
          return buffer.toString('utf8')
        } finally {
          await handle.close()
        }
      } catch {
        return ''
      }
    },
  }
}

/**
 * Whether `log` holds Django's error record of `path` (`Internal Server Error: /api/v1/<path>`,
 * then its traceback up to the next record) with the SQLite lock in it. Pure.
 */
export function lockLogged(log: string, path: string): boolean {
  const marker = `Internal Server Error: /api/v1/${path}`
  let at = log.indexOf(marker)
  while (at >= 0) {
    const end = log.indexOf('\n[', at)
    if (log.slice(at, end < 0 ? undefined : end).includes(DATABASE_LOCKED)) return true
    at = log.indexOf(marker, at + marker.length)
  }
  return false
}

interface CartLike {
  lines?: { variant_id: number; quantity: number }[]
  coupon?: { code?: string | null } | null
  shipping?: { code?: string | null; is_selected?: boolean; cash_on_delivery?: boolean } | null
  destination?: unknown
}

/** What a failed write must have left as it was: lines, coupon, shipping choice, destination. */
export function cartState(cart: unknown): string {
  const { lines = [], coupon, shipping, destination = null } = (cart ?? {}) as CartLike
  return JSON.stringify({
    lines: lines.map((line) => [line.variant_id, line.quantity]).sort((a, b) => a[0]! - b[0]!),
    coupon: coupon?.code ?? null,
    shipping: [shipping?.code ?? null, !!shipping?.is_selected, !!shipping?.cash_on_delivery],
    destination,
  })
}

type WritePage = Pick<Page, 'waitForResponse' | 'request'>

/** A write's answer: the browser's (`Response`) or the test's own request's (`APIResponse`). */
interface Answer {
  ok(): boolean
  status(): number
  text(): Promise<string>
  url(): string
}

async function readCart(request: Pick<APIRequestContext, 'get'>): Promise<unknown> {
  const response = await request.get(`${BFF}cart/`, { headers: HEADERS })
  if (!response.ok()) throw new Error(`GET cart/ answered ${response.status()}`)
  return ((await response.json()) as { data: unknown }).data
}

function isWrite(spec: CartWriteSpec) {
  return (response: Response) => {
    const request = response.request()
    if (request.method() !== spec.method) return false
    if (!response.url().split('?')[0]!.endsWith(`${BFF}${spec.path}`)) return false
    return spec.body ? spec.body(request.postDataJSON()) : true
  }
}

const accepted = (spec: CartWriteSpec, answer: Answer) =>
  spec.status === undefined ? answer.ok() : answer.status() === spec.status

/**
 * The write's answer to the page's next matching write: set before the action that leads to it
 * (an action, or a write the page makes by itself after an earlier one). Never rejects unheard.
 */
export function cartAnswer(page: Pick<Page, 'waitForResponse'>, spec: CartWriteSpec) {
  const answer = page.waitForResponse(isWrite(spec))
  answer.catch(() => {})
  return answer
}

/** The write's answer to one `act` (the waiter is set before the action starts). */
async function attempt(page: WritePage, spec: CartWriteSpec, act: () => Promise<unknown>) {
  const answer = cartAnswer(page, spec)
  await act()
  return answer
}

interface Guarded<A extends Answer> {
  /** The first try, and the one repeat after a lock. */
  send: () => Promise<A>
  again: () => Promise<A>
  /** The cart now, and the state it had before the write. */
  read: () => Promise<unknown>
  before: () => Promise<string>
  log: BackendLog
  /** Told of a locked first try that is accounted for (the page's error watch). */
  forgive?: (answer: A) => void
}

/**
 * The guard shared by the page's writes and the test's own: a 500 that the backend's log (or
 * the answer) shows as the dev database's lock, with the cart unchanged, is said with a warning
 * and repeated once; anything else that is not `spec`'s answer rejects, saying what came back.
 */
async function guarded<A extends Answer>(spec: CartWriteSpec, write: Guarded<A>): Promise<A> {
  const label = spec.label ?? `${spec.method} ${spec.path}`
  const offset = await write.log.size()
  const first = await write.send()
  if (accepted(spec, first)) return first
  const said = `${first.status()} ${await first.text()}`
  const locked =
    first.status() === 500 &&
    (said.includes(DATABASE_LOCKED) || lockLogged(await write.log.since(offset), spec.path))
  if (!locked) throw new Error(`${label}: the BFF answered ${said}`)
  if (cartState(await write.read()) !== (await write.before())) {
    throw new Error(`${label}: the cart changed although the write failed (${said})`)
  }
  console.warn(`[cart-write] ${label}: ${said}: the dev database was locked; once more`)
  write.forgive?.(first)
  const second = await write.again()
  if (accepted(spec, second)) return second
  throw new Error(`${label}: failed again: ${second.status()} ${await second.text()}`)
}

export interface CartWriteOptions {
  /** Repeats the visitor's action (by default `act` again: a press, a choice). */
  retry?: () => Promise<unknown>
  /**
   * The cart before the write, when the test has it, or a function giving it when it is known
   * only later (a write that follows another one by itself); else it is read through the BFF
   * before `act`.
   */
  before?: unknown
  /**
   * The first try's answer from a waiter set earlier (`cartAnswer`): a write the page makes by
   * itself after an action that came before; `act` then runs before it is awaited.
   */
  answer?: Promise<Response>
  log?: BackendLog
}

/** The state `before` gives (a cart, or a function giving one), or `read` when there is none. */
async function stateBefore(before: unknown, read: () => Promise<unknown>) {
  if (before === undefined) {
    const state = cartState(await read())
    return async () => state
  }
  return async () =>
    cartState(typeof before === 'function' ? await (before as () => unknown)() : before)
}

/**
 * Runs `act` (the visitor's action that makes the write `spec`) and resolves with the write's
 * answer once it went through (or answered `spec.status`). A write that met the dev database's
 * lock is repeated once (see above); any other failure, a cart changed by the failed write, or a
 * second failure rejects.
 */
export async function cartWrite(
  page: WritePage,
  spec: CartWriteSpec,
  act: () => Promise<unknown>,
  { retry = act, before, answer, log = fileLog() }: CartWriteOptions = {},
): Promise<Response> {
  const read = () => readCart(page.request)
  return guarded(spec, {
    before: await stateBefore(before, read),
    send: answer ? async () => (await act(), answer) : () => attempt(page, spec, act),
    again: () => attempt(page, spec, retry),
    read,
    log,
    // The browser logged the 500: the page's error watch (if any) knows it is accounted for.
    forgive: (first) => forgiveFailure(page, first.url()),
  })
}

/**
 * A cart write the test makes itself (`send`, through the BFF with the context's cookies, e.g.
 * a measure's setup), under the same guard: a lock is repeated once, logged; anything else
 * rejects.
 */
export async function requestCartWrite(
  request: Pick<APIRequestContext, 'get'>,
  spec: CartWriteSpec,
  send: () => Promise<APIResponse>,
  { before, log = fileLog() }: Pick<CartWriteOptions, 'before' | 'log'> = {},
): Promise<APIResponse> {
  const read = () => readCart(request)
  return guarded(spec, { before: await stateBefore(before, read), send, again: send, read, log })
}

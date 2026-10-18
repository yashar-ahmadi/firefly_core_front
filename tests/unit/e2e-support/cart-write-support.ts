// Builders shared by the cart-write helper's tests: a cart as the BFF returns it (the parts the
// helper compares) and the dev server's log record of a locked write.

/** The dev server's log record of a locked write, as /tmp/backend.log has it. */
export const lockRecord = (path: string) =>
  [
    `[2026-10-18 01:03:35,452] ERROR django.request Internal Server Error: /api/v1/${path}`,
    'Traceback (most recent call last):',
    '  File "…/django/db/backends/utils.py", line 105, in _execute',
    'sqlite3.OperationalError: database is locked',
    '',
    'django.db.utils.OperationalError: database is locked',
    `[2026-10-18 01:03:35,456] ERROR django.server "POST /api/v1/${path} HTTP/1.1" 500 79398`,
    '',
  ].join('\n')

/** The BFF's answer to the dev server's HTML error page (a locked write among others). */
export const NON_JSON = JSON.stringify({
  msg: 'درخواست شما انجام نشد.',
  code: 500,
  data: { type: 'server_error', errors: [{ code: 'non_json_response', detail: '…', attr: null }] },
})

export const line = (variant: number, quantity: number) => ({ variant_id: variant, quantity })
export const cart = (lines: { variant_id: number; quantity: number }[]) => ({
  lines,
  coupon: { code: null },
  shipping: { code: null, is_selected: false, cash_on_delivery: false },
  destination: null,
})

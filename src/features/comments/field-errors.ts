// Where a comment form puts the API's errors (product digest §3.13, blog digest §1.7): under the
// field each names (`attr`, an index after a dot: `positive_points.1`), several at once. Pure.

const PARENT_GONE = 'این مورد دیگر در دسترس نیست. فهرست به\u{200C}روز شد.'

export interface PlacedFieldErrors<F extends string> {
  /** Under a field, or (`form`) above the buttons. */
  errors: Partial<Record<F | 'form', string>>
  /** The answered comment is gone (`parent`: missing, not accepted, another subject's): the lists are stale. */
  parentGone: boolean
}

/**
 * The API's field errors (`ApiError.fieldErrors()`) placed on a form with `fields`: each under
 * its field (the first message per field), `parent` above the buttons with its own sentence, any
 * other above the buttons with its message, and `detail` there when nothing could be placed (no
 * connection, not the API, too many requests).
 */
export function placeFieldErrors<F extends string>(
  fieldErrors: Readonly<Record<string, string>>,
  fields: readonly F[],
  detail: string,
): PlacedFieldErrors<F> {
  const errors: Partial<Record<F | 'form', string>> = {}
  let parentGone = false
  for (const [attr, message] of Object.entries(fieldErrors)) {
    const key = attr.split('.')[0] ?? attr
    const field = fields.find((name) => name === key)
    if (field) errors[field] ??= message
    else if (key === 'parent') {
      parentGone = true
      errors.form ??= PARENT_GONE
    } else errors.form ??= message
  }
  if (Object.keys(errors).length === 0) errors.form = detail
  return { errors, parentGone }
}

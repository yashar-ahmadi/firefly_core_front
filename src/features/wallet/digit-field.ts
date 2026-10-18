// A field of digits shown grouped as the shopper types (the top-up's and the withdrawal's
// amounts, the sheba, the card number): every keystroke or paste is read back to its digits and
// shown grouped again, the caret kept after the same digit (so typing in the middle stays in the
// middle). Pure.

export interface DigitField {
  /** The digits of what was typed (Latin; whatever the field keeps). */
  digits: (text: string) => string
  /** What the field shows for those digits. */
  show: (digits: string) => string
}

/** A shown character that is a digit (any script). */
const DIGIT = /[\d\u{06F0}-\u{06F9}\u{0660}-\u{0669}]/u

export function regroupField(
  value: string,
  caret: number,
  field: DigitField,
): { text: string; caret: number } {
  const all = field.digits(value)
  const wanted = Math.min(field.digits(value.slice(0, caret)).length, all.length)
  const text = field.show(all)
  let seen = 0
  let position = 0
  while (position < text.length && seen < wanted) {
    if (DIGIT.test(text[position]!)) seen++
    position++
  }
  return { text, caret: position }
}

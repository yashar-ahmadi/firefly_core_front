/** `<`, and the line and paragraph separators (U+2028, U+2029). */
const UNSAFE = /[<\u{2028}\u{2029}]/gu

function escapeCharacter(character: string): string {
  return `\\u${(character.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`
}

/**
 * JSON for a `<script type="application/ld+json">`: every `<` written as its JSON escape, so a
 * string holding `</script>` (operator HTML in a description) cannot end the script, and the
 * line and paragraph separators escaped too. It parses back to the same value.
 */
export function jsonLdString(data: object): string {
  return JSON.stringify(data).replace(UNSAFE, escapeCharacter)
}

/**
 * Structured data: one `<script type="application/ld+json">` per object. Prices in the
 * backend's structured data are in Rial: they belong here only, never in the page's text.
 */
export function JsonLd({ data }: { data: object | readonly object[] }) {
  const items: readonly object[] = Array.isArray(data) ? data : [data]
  return items.map((item, index) => (
    <script
      key={index}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdString(item) }}
    />
  ))
}

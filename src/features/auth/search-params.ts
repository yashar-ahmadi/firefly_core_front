// The query of an auth page (`?next=`, `?identifier=`) as Next hands it to the page. Pure.

export type SearchParams = Record<string, string | string[] | undefined>

/** The first value of a parameter given once or more, '' when absent. */
export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

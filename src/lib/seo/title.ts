/** The home page's default title: `<store name> | <slogan>`, or the name alone. Pure. */
export function homeTitle(name: string, slogan: string | null): string {
  return slogan ? `${name} | ${slogan}` : name
}

// The label `devices/` keeps for this browser («Chrome روی Windows»): what the operator sees in
// the panel's device list. Pure.

/** Checked in order: browsers that also say «Chrome» or «Safari» in their user agent come first. */
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
]

const SYSTEMS: [RegExp, string][] = [
  [/\bWindows\b/, 'Windows'],
  [/\bAndroid\b/, 'Android'],
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
]

const find = (table: [RegExp, string][], userAgent: string) =>
  table.find(([pattern]) => pattern.test(userAgent))?.[1]

/** «Chrome روی Windows», «Safari روی iOS», «مرورگر وب» when nothing is recognised. */
export function deviceName(userAgent: string): string {
  const browser = find(BROWSERS, userAgent)
  const system = find(SYSTEMS, userAgent)
  if (browser && system) return `${browser} روی ${system}`
  return browser ?? (system ? `مرورگر روی ${system}` : 'مرورگر وب')
}

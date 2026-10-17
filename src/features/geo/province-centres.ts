import { CITY_ZOOM, type MapView } from './coordinates'

// Where the map opens once a province is chosen: its capital, found by the province's name (the
// transportation list's `name`; never by an id). Approximate city centres. Pure; only the map's
// chunk imports it.

const CAPITALS: Record<string, readonly [number, number]> = {
  'آذربایجان شرقی': [38.08, 46.2919],
  'آذربایجان غربی': [37.5527, 45.0761],
  اردبیل: [38.2498, 48.2933],
  اصفهان: [32.6546, 51.668],
  البرز: [35.84, 50.9391],
  ایلام: [33.6374, 46.4227],
  بوشهر: [28.9234, 50.8203],
  تهران: [35.6997, 51.338],
  'چهارمحال و بختیاری': [32.3256, 50.8644],
  'خراسان جنوبی': [32.8649, 59.2262],
  'خراسان رضوی': [36.2605, 59.6168],
  'خراسان شمالی': [37.4747, 57.329],
  خوزستان: [31.3183, 48.6706],
  زنجان: [36.6736, 48.4787],
  سمنان: [35.5729, 53.3971],
  'سیستان و بلوچستان': [29.4963, 60.8629],
  فارس: [29.5918, 52.5837],
  قزوین: [36.2797, 50.0049],
  قم: [34.6399, 50.8759],
  کردستان: [35.3219, 46.9862],
  کرمان: [30.2839, 57.0834],
  کرمانشاه: [34.3142, 47.065],
  'کهگیلویه و بویراحمد': [30.6682, 51.588],
  گلستان: [36.8427, 54.4439],
  گیلان: [37.2808, 49.5832],
  لرستان: [33.4878, 48.3558],
  مازندران: [36.5633, 53.0601],
  مرکزی: [34.0917, 49.6892],
  هرمزگان: [27.1832, 56.2666],
  همدان: [34.7983, 48.5148],
  یزد: [31.8974, 54.3569],
}

/** Arabic yeh and kaf as Persian, joiners and runs of spaces as one space. */
function normaliseName(name: string): string {
  return name
    .replace(/[\u{064A}\u{0649}]/gu, 'ی')
    .replace(/\u{0643}/gu, 'ک')
    .replace(/[\s\u{200C}]+/gu, ' ')
    .trim()
}

/** A view of the province's capital (a city in view), or null for a name not listed. */
export function provinceView(name: string | undefined): MapView | null {
  const capital = name ? CAPITALS[normaliseName(name)] : undefined
  if (!capital) return null
  return { centre: { latitude: capital[0], longitude: capital[1] }, zoom: CITY_ZOOM }
}

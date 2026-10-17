import type { City, Province } from '@/lib/api/types/geo'

// Provinces and cities shaped like the live API's answers (dev sample data, cart digest §8). The
// ids are the sample database's: tests use them as data, never as constants of the app.

export const TEHRAN: Province = { id: 8, name: 'تهران' }
export const ISFAHAN: Province = { id: 4, name: 'اصفهان' }
export const PROVINCES: Province[] = [{ id: 1, name: 'آذربایجان شرقی' }, ISFAHAN, TEHRAN]

const city = (id: number, name: string, province: Province): City => ({
  id,
  name,
  province: province.id,
  province_name: province.name,
})

export const TEHRAN_CITIES: City[] = [
  city(291, 'اسلامشهر', TEHRAN),
  city(301, 'تهران', TEHRAN),
  city(313, 'شهریار', TEHRAN),
]
export const ISFAHAN_CITIES: City[] = [city(127, 'اصفهان', ISFAHAN), city(188, 'کاشان', ISFAHAN)]

/** A list as the API pages it (`limit=1500` gives one page for the whole table). */
export function geoPage<T>(results: T[], { page = 1, totalPages = 1 } = {}) {
  return {
    data: {
      count: results.length * totalPages,
      total_pages: totalPages,
      current_page: page,
      page_size: 1500,
      next: null,
      previous: null,
      results,
    },
    msg: 'درخواست با موفقیت انجام شد.',
    status: 200,
  }
}

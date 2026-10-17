import type { Address } from '@/lib/api/types/address'

// sara's address book as the live API answers it (dev sample data, cart digest §7): the default
// first, then the newest.

export const HOME: Address = {
  id: 10001,
  title: 'خانه',
  receiver_first_name: 'سارا',
  receiver_last_name: 'احمدی',
  receiver_full_name: 'سارا احمدی',
  receiver_mobile: '+989121234501',
  province: 8,
  province_name: 'تهران',
  city: 301,
  city_name: 'تهران',
  address: 'خیابان ولیعصر، بالاتر از میدان ونک، کوچه نگار',
  plaque: '۱۲',
  unit: '۴',
  full_address: 'تهران، تهران، خیابان ولیعصر، بالاتر از میدان ونک، کوچه نگار، پلاک ۱۲، واحد ۴',
  postal_code: '1969734563',
  latitude: 35.7564,
  longitude: 51.41,
  is_default: true,
  created: '2025-09-18T15:00:00+03:30',
  updated: '2025-09-18T15:00:00+03:30',
}

export const WORK: Address = {
  ...HOME,
  id: 10002,
  title: 'محل کار',
  address: 'خیابان مطهری، نبش کوچه میرعماد، ساختمان آفتاب',
  plaque: '۸۸',
  unit: '۱۱',
  full_address: 'تهران، تهران، خیابان مطهری، نبش کوچه میرعماد، ساختمان آفتاب، پلاک ۸۸، واحد ۱۱',
  postal_code: '1587634121',
  latitude: null,
  longitude: null,
  is_default: false,
}

/** `GET account/address/list/` as `bffFetch` resolves it. */
export function addressPage(results: Address[]) {
  return {
    data: {
      count: results.length,
      total_pages: 1,
      current_page: 1,
      page_size: 100,
      next: null,
      previous: null,
      results,
    },
    msg: 'درخواست با موفقیت انجام شد.',
    status: 200,
  }
}

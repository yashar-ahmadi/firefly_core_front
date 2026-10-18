'use client'

import { useListUrl, type ListUrl } from '@/features/account/lists/use-list-url'
import { parseWalletParams, walletSearch, type WalletParams } from './wallet-params'

/** The wallet page's path (its URL holds the tab and that tab's filters). */
export const WALLET_PATH = '/account/wallet/'

/** The wallet page's URL state (Plan 3's shallow list URL: no server round trip). */
export function useWalletUrl(): ListUrl<WalletParams> {
  return useListUrl(WALLET_PATH, parseWalletParams, walletSearch)
}

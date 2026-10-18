'use client'

import { Info } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState, type ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { Skeleton } from '@/components/ui/skeleton'
import { AccountPageHeader } from '@/features/account/layout/account-page-header'
import { ListError } from '@/features/account/lists/list-error'
import { isLoadingSection } from '@/features/account/use-account-query'
import type { PaymentCatalog } from '@/features/payment/catalog'
import { useFeature } from '@/features/settings/feature-context'
import { BalanceCard } from './balance-card'
import type { PaymentHistoryDetailProps } from './payment-history-detail'
import { TopUpForm } from './top-up-form'
import { useWalletUrl } from './use-wallet-url'
import { walletAccess } from './wallet-access'
import { parseWalletParams, WALLET_TABS, type WalletTab } from './wallet-params'
import { useWallet } from './wallet-queries'
import { WalletTabs } from './wallet-tabs'

// `/account/wallet/` «کیف پول» (order digest §3.3, §5.12, §7; Plan 4 Task 9): «موجودی» and
// «افزایش موجودی» at the top, then one view at a time (the page is long on a phone): the ledger,
// the withdrawals, the payment history, each its own chunk. The `wallet` switch off leaves the
// balance and the ledger readable (and the payment history: no wallet operation) and says why;
// `walletAccess` decides the rest (Review Focus #5). A payment's detail opens in one sheet, from
// the ledger or the history, its code loaded on the first open.

function Unavailable() {
  return (
    <p role="alert" className="py-6 text-center text-base leading-7 text-danger">
      این بخش بارگذاری نشد؛ صفحه را دوباره باز کنید.
    </p>
  )
}

const PanelLoading = () => <Skeleton className="h-48 rounded-card" />

const LazyTransactions = dynamic(
  () =>
    import('./transactions-list')
      .then((module) => module.TransactionsList)
      .catch(() => Unavailable),
  { ssr: false, loading: PanelLoading },
)
const LazyWithdrawals = dynamic(
  () => import('./withdrawals').then((module) => module.Withdrawals).catch(() => Unavailable),
  { ssr: false, loading: PanelLoading },
)
const LazyHistory = dynamic(
  () =>
    import('./payment-history').then((module) => module.PaymentHistory).catch(() => Unavailable),
  { ssr: false, loading: PanelLoading },
)
const LazyPaymentDetail = dynamic<PaymentHistoryDetailProps>(
  () =>
    import('./payment-history-detail')
      .then((module) => module.PaymentHistoryDetail)
      .catch(() => Unavailable),
  { ssr: false },
)

const CARD = 'flex flex-col gap-4 rounded-card bg-white p-4 shadow-card md:p-5'

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby="wallet-panel-heading" className={CARD}>
      <h2 id="wallet-panel-heading" className="text-lg leading-8 font-bold text-ink-900">
        {title}
      </h2>
      {children}
    </section>
  )
}

const tabHref = (tab: WalletTab) => (tab === 'transactions' ? '' : `tab=${tab}`)

export interface WalletPageProps {
  title: string
  catalog: PaymentCatalog
  supportPhone: string | null
}

export function WalletPage({ title, catalog, supportPhone }: WalletPageProps) {
  const url = useWalletUrl()
  const wallet = useWallet()
  const walletSwitch = useFeature('wallet')
  const access = walletAccess({
    wallet: walletSwitch,
    onlinePayment: useFeature('online_payment'),
    balance: wallet.data,
  })
  const tabs = WALLET_TABS.filter((tab) => tab.value !== 'withdrawals' || access.withdrawals)
  const tab = tabs.some((item) => item.value === url.params.tab) ? url.params.tab : 'transactions'
  const [payment, setPayment] = useState<string | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const showPayment = (uuid: string) => {
    setPayment(uuid)
    setPaymentOpen(true)
  }

  return (
    <>
      <AccountPageHeader title={title} />
      {!walletSwitch.enabled && (
        <p className="mb-4 flex items-start gap-2 rounded-card bg-info/10 px-4 py-3 text-base leading-7 text-ink-800 md:mb-5">
          <Info aria-hidden className="mt-1 size-5 shrink-0 text-info" />
          <span>
            {walletSwitch.reason ?? 'کیف پول در حال حاضر غیرفعال است.'} موجودی و تراکنش‌های کیف پول
            را همچنان می‌بینید.
          </span>
        </p>
      )}
      <div
        className={cn(
          'mb-4 grid items-start gap-4 md:mb-5 md:gap-5',
          // Side by side only with the top-up box (frozen or off: the balance alone, full width).
          access.topUp && 'lg:grid-cols-2',
        )}
      >
        {wallet.data ? (
          <>
            <BalanceCard wallet={wallet.data} />
            <TopUpForm
              wallet={wallet.data}
              catalog={catalog}
              supportPhone={supportPhone}
              refreshWallet={() => wallet.refetch().then((result) => result.data)}
            />
          </>
        ) : wallet.isError && !isLoadingSection(wallet) ? (
          <div className={CARD}>
            <ListError
              frame="inline"
              message="موجودی کیف پول خوانده نشد."
              error={wallet.error}
              errorAt={wallet.errorUpdatedAt}
              onRetry={() => void wallet.refetch()}
              retrying={wallet.isFetching}
            />
          </div>
        ) : (
          <div aria-busy="true" className={CARD}>
            <span className="sr-only" role="status">
              در حال خواندن موجودی
            </span>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-10 w-56" />
          </div>
        )}
      </div>
      <div className="mb-4 md:mb-5">
        <WalletTabs
          tabs={tabs}
          current={tab}
          href={(next) => url.href(parseWalletParams(new URLSearchParams(tabHref(next))))}
          onFollow={url.follow}
        />
      </div>
      {tab === 'transactions' && (
        <Panel title="تراکنش‌ها">
          <LazyTransactions onShowPayment={showPayment} />
        </Panel>
      )}
      {tab === 'withdrawals' &&
        (wallet.data ? <LazyWithdrawals wallet={wallet.data} /> : <PanelLoading />)}
      {tab === 'history' && (
        <Panel title="تاریخچهٔ پرداخت">
          <LazyHistory onShowPayment={showPayment} />
        </Panel>
      )}
      {payment && (
        <LazyPaymentDetail
          key={payment}
          uuid={payment}
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
        />
      )}
    </>
  )
}

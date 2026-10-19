import { isValidElement, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InstallPromptGate } from '@/features/pwa/install-prompt-gate'
import { InstallPromptSlot } from '@/features/pwa/install-prompt-slot'

// The shop layout's slot for the install prompt (FEATURE_PWA): the gate, with the shop's name
// read on the server (the settings, cached for the request: the root layout read them already).

const settings = vi.hoisted(() => ({ value: { name: 'فایرفلای' } as { name: string } | null }))
vi.mock('server-only', () => ({}))
vi.mock('@/features/settings/api', () => ({ getSiteSettings: async () => settings.value }))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = pure.resolveStoreConfig(
    parseServerEnv({ FIREFLY_API_URL: 'https://api.shop.ir/', SITE_URL: 'https://shop.ir/' }),
  )
  return { ...pure, getStoreConfig: () => config }
})

describe('InstallPromptSlot', () => {
  it.each([
    [{ name: 'فایرفلای' }, 'فایرفلای'],
    [null, 'فروشگاه'],
  ])('the gate with the shop’s name (%j)', async (value, name) => {
    settings.value = value
    const element = (await InstallPromptSlot()) as ReactElement<{ name: string }>
    expect(isValidElement(element) && element.type).toBe(InstallPromptGate)
    expect(element.props.name).toBe(name)
  })
})

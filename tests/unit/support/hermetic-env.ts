import { afterEach, beforeEach } from 'vitest'

/**
 * For the tests of the environment accessors (`getServerEnv`, `getStoreConfig`): before each
 * test `process.env` is replaced by an object holding `NODE_ENV=test` alone, so nothing of the
 * shell's environment (a THEME_PRIMARY, a STORE_PRESET or FIREBASE_* exported where the tests
 * run) reaches the accessor; after it the real one is put back. Call it inside the accessor's
 * `describe`; it returns the setter for the variables a test wants.
 */
export function useHermeticEnv(): (vars: Record<string, string>) => void {
  let real: NodeJS.ProcessEnv = process.env
  beforeEach(() => {
    real = process.env
    process.env = { NODE_ENV: 'test' }
  })
  afterEach(() => {
    process.env = real
  })
  return (vars) => {
    Object.assign(process.env, vars)
  }
}

/**
 * What a developer's shell may export, every value of it wrong for the accessors' tests. A
 * hermetic test passes with all of it set in the real environment.
 */
export const HOSTILE_SHELL_ENV: Readonly<Record<string, string>> = {
  NODE_ENV: 'production',
  FIREFLY_API_URL: 'ftp://shell.example',
  SITE_URL: 'not a url',
  FIREFLY_API_KEY: 'shell-secret-key',
  STORE_PRESET: 'jewelry',
  THEME_PRIMARY: 'blue',
  THEME_RADIUS: 'huge',
  CLIENT_IP_HEADER: 'x real ip',
  FEATURE_PWA: 'maybe',
  FIREBASE_API_KEY: 'shell-firebase-key',
}

import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // next.config sets `trailingSlash: true`; Next bakes it into this variable at build time and
    // next/link reads it at runtime, so tests see the same hrefs as the app.
    env: { __NEXT_TRAILING_SLASH: 'true' },
    include: ['tests/unit/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
})

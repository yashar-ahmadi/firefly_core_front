import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
    '.superpowers/**',
  ]),
  {
    // Tests render plain anchors as fixtures, never as the app's navigation. Since the shop's
    // catch-all (`src/app/(shop)/[...missing]`) every internal path is a page to this rule.
    files: ['tests/**'],
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },
])

export default eslintConfig

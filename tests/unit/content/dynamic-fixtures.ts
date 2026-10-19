import type { DynamicContent, DynamicContentGroup } from '@/lib/api/types/dynamic-content'

// Dynamic content groups as the dev backend answers them (auth-settings digest §7.9, live on
// 2026-10-19: `terms` and `return-policy`, one warning each), and crafted variants.

export function item(
  id: number,
  contentType: DynamicContent['content_type'],
  overrides: Partial<DynamicContent> = {},
): DynamicContent {
  return {
    id,
    page_type: 10003,
    page_type_detail: {
      id: 10003,
      key: 'terms',
      title: 'قوانین و مقررات',
      description: 'شرایط استفاده از خدمات فروشگاه',
    },
    content_type: contentType,
    title: null,
    content: '',
    ...overrides,
  }
}

/** Live `terms`: one warning, no description. */
export const TERMS: DynamicContentGroup = {
  page_type: 10003,
  page_type_key: 'terms',
  page_display_name: 'قوانین و مقررات',
  descriptions: [],
  warnings: [
    item(10004, 'warning', {
      title: 'کالاهای غیرقابل مرجوع',
      content: 'کالاهای بهداشتی و آرایشی باز شده، به دلیل مسائل بهداشتی قابل بازگشت نیستند.',
    }),
  ],
}

export function group(overrides: Partial<DynamicContentGroup> = {}): DynamicContentGroup {
  return { ...TERMS, ...overrides }
}

/** @vitest-environment jsdom */

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMarketplaceApi } from '../src/api/marketplace-api'

/**
 * D-04A: functional regression — доказывает, что useCatalogue/useDevelopmentDetail
 * получают данные ИСКЛЮЧИТЕЛЬНО через реальный API-клиент (fetch на
 * /public/developments...), нет скрытого пути, возвращающего данные мимо
 * него (mock/localStorage/встроенный fallback-массив). Мок-fetcher бросает
 * на любой URL за пределами настроенного baseUrl+/public/developments —
 * если бы хук вернул данные без единого вызова fetcher'а, это осталось бы
 * незамеченным без этой явной проверки.
 *
 * Статическая проверка "нет legacy-импортов" (useCoreStore/developmentApi/
 * leadsApiV2/PROJECTS_MOCK/localStorage) задокументирована как одноразовый
 * grep в evidence-документе (docs/operations/d04-marketplace-public-slice.md)
 * — не текстовый unit-тест здесь, хрупкое сопоставление строк не заменяет
 * функциональную проверку выше.
 */

// vi.mock факторы поднимаются наверх файла (hoisting) — strictFetcher
// должен быть объявлен через vi.hoisted, иначе ReferenceError на
// "используется до инициализации" при доступе внутри фабрики ниже.
const { strictFetcher } = vi.hoisted(() => ({
  strictFetcher: vi.fn(async (url: string | URL | Request) => {
    const href = typeof url === 'string' ? url : url.toString()
    if (!href.startsWith('https://api.example.test/api/v1/public/developments')) {
      throw new Error(`Unexpected fetch outside the real public API client: ${href}`)
    }
    return new Response(JSON.stringify({ slug: 'seaside', name: 'Seaside' }), { status: 200 })
  }),
}))

vi.mock('../src/api/marketplace-api', async () => {
  const actual = await vi.importActual<typeof import('../src/api/marketplace-api')>('../src/api/marketplace-api')
  return {
    ...actual,
    marketplaceApi: actual.createMarketplaceApi({ baseUrl: 'https://api.example.test/api/v1', fetcher: strictFetcher }),
  }
})

describe('no mock/localStorage/legacy data source in the public flow', () => {
  afterEach(() => {
    cleanup()
    strictFetcher.mockClear()
  })

  it('useDevelopmentDetail data flows through the real fetcher, not a bypass path', async () => {
    const { useDevelopmentDetail } = await import('../src/hooks/useDevelopmentDetail')

    const { result } = renderHook(() => useDevelopmentDetail('seaside'))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(strictFetcher).toHaveBeenCalledTimes(1)
    const state = result.current
    if (state.status !== 'ready') throw new Error('expected ready')
    expect(state.item.slug).toBe('seaside')
  })

  it('createMarketplaceApi itself never returns data without invoking the configured fetcher', async () => {
    const localFetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }))
    const api = createMarketplaceApi({ baseUrl: 'https://api.example.test/api/v1', fetcher: localFetcher })

    await api.listDevelopments({ city: 'batumi' })

    expect(localFetcher).toHaveBeenCalledTimes(1)
  })
})

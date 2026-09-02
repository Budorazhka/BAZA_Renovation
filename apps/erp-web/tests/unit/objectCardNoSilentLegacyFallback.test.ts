/** @vitest-environment jsdom */

/**
 * Карточка объекта пробует Platform API, а при неудаче может обратиться к
 * старому каталогу. Раньше туда проваливалась ЛЮБАЯ ошибка, а
 * secondaryObjectsApi.getEstateApartment начинается с DEMO_APARTMENTS —
 * значит при протухшей сессии (401) или нехватке прав (403) пользователь
 * видел демо-объект, неотличимый от настоящего.
 *
 * Тест закрепляет границу: в legacy проваливаемся ТОЛЬКО на честный 404
 * («такого актива в Platform нет» — нормальный случай на время миграции).
 * Любая другая ошибка обязана стать видимой ошибкой, а не тихой подменой
 * данных.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getAssetMock = vi.fn()
const listListingsMock = vi.fn()
const getPublicationStatusMock = vi.fn()
const getDuplicateCandidatesMock = vi.fn()
const getEstateApartmentMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ propertyId: 'asset-1' }),
}))

// t() без fallback возвращает сам ключ — по нему и проверяем, какое состояние
// отрисовано, не завися от формулировок в словарях.
vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: null }),
}))

vi.mock('@/components/layout/DashboardShell', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/components/objects/ObjectPhotoCarousel', () => ({ ObjectPhotoCarousel: () => null }))
vi.mock('@/components/objects/ObjectEditWizard', () => ({ ObjectEditWizard: () => null }))
vi.mock('@/components/objects/MlsConfirmDialog', () => ({ MlsConfirmDialog: () => null }))
vi.mock('@/components/objects/favorites-store', () => ({
  useFavorites: () => new Set<string>(),
  toggleFavorite: vi.fn(),
}))

vi.mock('@/services/propertyAssetsApi', () => ({
  propertyAssetsApi: {
    getAsset: getAssetMock,
    listListings: listListingsMock,
    getPublicationStatus: getPublicationStatusMock,
    getDuplicateCandidates: getDuplicateCandidatesMock,
  },
}))

vi.mock('@/services/secondaryObjectsApi', () => ({
  secondaryObjectsApi: { getEstateApartment: getEstateApartmentMock },
}))

/** Ошибка в форме, в которой её отдаёт axios: статус лежит в response.status. */
function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } })
}

const ERROR_KEY = 'objects.objectCardPage.не_удалось_загрузить_объект'
const NOT_FOUND_KEY = 'objects.objectCardPage.объект_не_найден'

describe('ObjectCardPage — нет тихого отката в legacy/демо', () => {
  beforeEach(() => {
    getAssetMock.mockReset()
    listListingsMock.mockReset()
    getPublicationStatusMock.mockReset()
    getDuplicateCandidatesMock.mockReset()
    getEstateApartmentMock.mockReset()
    getEstateApartmentMock.mockResolvedValue(null)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  for (const status of [401, 403, 500]) {
    it(`при ${status} показывает ошибку и НЕ обращается к старому каталогу`, async () => {
      getAssetMock.mockRejectedValue(httpError(status))

      const { ObjectCardPage } = await import('@/components/objects/ObjectCardPage')
      render(createElement(ObjectCardPage))

      await waitFor(() => expect(screen.getByText(ERROR_KEY)).toBeDefined())
      expect(getEstateApartmentMock).not.toHaveBeenCalled()
      expect(screen.queryByText(NOT_FOUND_KEY)).toBeNull()
    })
  }

  it('при сетевом сбое без HTTP-статуса тоже не откатывается в legacy', async () => {
    getAssetMock.mockRejectedValue(new Error('Network Error'))

    const { ObjectCardPage } = await import('@/components/objects/ObjectCardPage')
    render(createElement(ObjectCardPage))

    await waitFor(() => expect(screen.getByText(ERROR_KEY)).toBeDefined())
    expect(getEstateApartmentMock).not.toHaveBeenCalled()
  })

  it('при честном 404 обращается к старому каталогу — миграционный путь сохранён', async () => {
    getAssetMock.mockRejectedValue(httpError(404))

    const { ObjectCardPage } = await import('@/components/objects/ObjectCardPage')
    render(createElement(ObjectCardPage))

    await waitFor(() => expect(getEstateApartmentMock).toHaveBeenCalledWith('asset-1'))
    expect(screen.queryByText(ERROR_KEY)).toBeNull()
  })
})

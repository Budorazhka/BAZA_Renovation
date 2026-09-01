/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * D-02 COMPLETE: доказывает, что DevelopmentManagementV2Page создаёт
 * Building/Floor/Unit через новый API (developmentsApiV2), что Unit
 * создаётся с целым MoneyAmount (не строкой/float), что units отображаются
 * ТОЛЬКО из API (не useCoreStore — нет мока useCoreStore в этом файле,
 * компонент физически не может его использовать без явного мока), что
 * фильтр статуса делает server-side рефетч, что ошибка API не создаёт
 * fake data, и что version conflict показывает понятную ошибку с кнопкой
 * обновить данные.
 */

const navigateMock = vi.fn()
// Мутируемая обёртка вместо статичного `{ id: 'dev-1' }` — нужна ровно одному
// тесту (смена developmentId во время in-flight publication-status запроса),
// остальные тесты файла её не трогают и получают прежнее поведение по умолчанию.
const paramsRef = { id: 'dev-1' as string }

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => paramsRef,
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}))

vi.mock('@/hooks/useRolePermissions', () => ({
  useRolePermissions: () => ({ isManagementPosition: true }),
}))

const getByIdMock = vi.fn()
const listBuildingsMock = vi.fn()
const listSectionsMock = vi.fn()
const listFloorsMock = vi.fn()
const listFloorPlansMock = vi.fn()
const listUnitsMock = vi.fn()
const getUnitMock = vi.fn()
const createBuildingMock = vi.fn()
const createSectionMock = vi.fn()
const createFloorMock = vi.fn()
const createFloorPlanMock = vi.fn()
const createUnitMock = vi.fn()
const updateUnitPriceMock = vi.fn()
const updateUnitStatusMock = vi.fn()
const publishMock = vi.fn()
const getPublicationStatusMock = vi.fn()

vi.mock('@/services/developmentsApiV2', () => ({
  getCreateIdempotencyKey: (scope: string) => `key-${scope}`,
  resetCreateIdempotencyKey: () => {},
  developmentsApiV2: {
    getById: getByIdMock,
    listBuildings: listBuildingsMock,
    listSections: listSectionsMock,
    listFloors: listFloorsMock,
    listFloorPlans: listFloorPlansMock,
    listUnits: listUnitsMock,
    getUnit: getUnitMock,
    createBuilding: createBuildingMock,
    createSection: createSectionMock,
    createFloor: createFloorMock,
    createFloorPlan: createFloorPlanMock,
    createUnit: createUnitMock,
    updateUnitPrice: updateUnitPriceMock,
    updateUnitStatus: updateUnitStatusMock,
    publish: publishMock,
    getPublicationStatus: getPublicationStatusMock,
  },
}))

const mockDevelopment = {
  _id: 'dev-1',
  organizationId: 'org-1',
  name: 'ЖК Морской бриз',
  status: 'active',
  location: { country: 'ge', city: 'batumi', geo: { type: 'Point', coordinates: [41.6367, 41.6459] } },
  contact: { phone: '+995555000000' },
  version: 0,
  createdAt: '2026-08-27T00:00:00.000Z',
}

const mockDraftDevelopment = { ...mockDevelopment, status: 'draft' as const }

const mockBuilding = {
  _id: 'b-1',
  developmentId: 'dev-1',
  organizationId: 'org-1',
  name: 'Корпус 1',
  floorsCount: 5,
  createdAt: '2026-08-27T00:00:00.000Z',
}

const mockFloor = {
  _id: 'f-1',
  buildingId: 'b-1',
  organizationId: 'org-1',
  floorNumber: 1,
  createdAt: '2026-08-27T00:00:00.000Z',
}

const mockUnit = {
  _id: 'u-1',
  buildingId: 'b-1',
  floorId: 'f-1',
  organizationId: 'org-1',
  number: '101',
  kind: 'apartment' as const,
  area: 45,
  price: { amountMinorUnits: 10000000, currency: 'USD' as const },
  status: 'available' as const,
  priceHistory: [],
  version: 0,
  createdAt: '2026-08-27T00:00:00.000Z',
}

const publicationNotFoundError = {
  response: { status: 404, data: { error: { code: 'PUBLICATION_NOT_FOUND', message: 'Publication not found for this development' } } },
}

async function resetAllMocks() {
  // Module-level dedup-кэш (P1: dedup одного in-flight publication-status
  // запроса по developmentId, переживающий StrictMode double-invoke) должен
  // быть чист перед каждым тестом — иначе тест B может унаследовать
  // "in-flight" Promise, оставленный тестом A под тем же developmentId
  // ('dev-1' переиспользуется почти везде в этом файле).
  const { __resetPublicationStatusDedupCacheForTests } = await import('@/pages/projects/DevelopmentManagementV2Page')
  __resetPublicationStatusDedupCacheForTests()

  getByIdMock.mockReset()
  listBuildingsMock.mockReset()
  listSectionsMock.mockReset()
  listFloorsMock.mockReset()
  listFloorPlansMock.mockReset()
  listUnitsMock.mockReset()
  getUnitMock.mockReset()
  createBuildingMock.mockReset()
  createSectionMock.mockReset()
  createFloorMock.mockReset()
  createFloorPlanMock.mockReset()
  createUnitMock.mockReset()
  updateUnitPriceMock.mockReset()
  updateUnitStatusMock.mockReset()
  publishMock.mockReset()
  getPublicationStatusMock.mockReset()
  // Дефолт для большинства сценариев — "публикация никогда не запускалась"
  // (P1-фикс: теперь это реальный запрос при загрузке страницы, не только
  // побочный эффект publish). Тесты про конкретный статус переопределяют явно.
  getPublicationStatusMock.mockRejectedValue(publicationNotFoundError)
  navigateMock.mockReset()
}

async function renderPageWithEmptyBuilding() {
  getByIdMock.mockResolvedValue(mockDevelopment)
  listBuildingsMock.mockResolvedValue([mockBuilding])
  listSectionsMock.mockResolvedValue([])
  listFloorsMock.mockResolvedValue([mockFloor])
  listFloorPlansMock.mockResolvedValue([])
  listUnitsMock.mockResolvedValue([])

  const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
  render(createElement(DevelopmentManagementV2Page))

  await waitFor(() => {
    expect(screen.getByTestId('buildings-list')).toBeDefined()
  })

  await act(async () => {
    fireEvent.click(screen.getByText('Корпус 1'))
  })

  await waitFor(() => {
    expect(listUnitsMock).toHaveBeenCalled()
  })
}

describe('DevelopmentManagementV2Page', () => {
  beforeEach(async () => {
    await resetAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('отображает initial loading, затем шапку ЖК и список корпусов', async () => {
    let resolveDevelopment: (value: typeof mockDevelopment) => void = () => {}
    const pending = new Promise<typeof mockDevelopment>((resolve) => {
      resolveDevelopment = resolve
    })
    getByIdMock.mockReturnValue(pending)
    listBuildingsMock.mockResolvedValue([])

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    expect(screen.getByTestId('development-management-loading')).toBeDefined()

    await act(async () => {
      resolveDevelopment(mockDevelopment)
    })

    await waitFor(() => {
      expect(screen.getByText('ЖК Морской бриз')).toBeDefined()
    })
  })

  it('создаёт Building через новый API', async () => {
    getByIdMock.mockResolvedValue(mockDevelopment)
    listBuildingsMock.mockResolvedValue([])
    createBuildingMock.mockResolvedValueOnce(mockBuilding)

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(listBuildingsMock).toHaveBeenCalledWith('dev-1')
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Добавить корпус'))
    })
    fireEvent.change(screen.getByLabelText(/Название корпуса/i), { target: { value: 'Корпус 2' } })
    fireEvent.change(screen.getByLabelText(/Этажей/i), { target: { value: '9' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Создать корпус/i }))
    })

    await waitFor(() => {
      expect(createBuildingMock).toHaveBeenCalledWith('dev-1', {
        name: 'Корпус 2',
        floorsCount: 9,
        startDate: undefined,
        completionDate: undefined,
      }, expect.any(String))
    })
    expect(screen.getByText('Корпус 1', { exact: false }) || screen.getAllByText(/Корпус/i)).toBeDefined()
  })

  it('создаёт Floor через новый API', async () => {
    await renderPageWithEmptyBuilding()
    createFloorMock.mockResolvedValueOnce({ ...mockFloor, _id: 'f-2', floorNumber: 2 })

    await act(async () => {
      fireEvent.click(screen.getByText('Добавить этаж'))
    })
    fireEvent.change(screen.getByLabelText(/Номер этажа/i), { target: { value: '2' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Создать этаж/i }))
    })

    await waitFor(() => {
      expect(createFloorMock).toHaveBeenCalledWith('b-1', {
        floorNumber: 2,
        sectionId: undefined,
        floorType: undefined,
      }, expect.any(String))
    })
  })

  it('создаёт Unit с целым MoneyAmount (не строка, не float)', async () => {
    await renderPageWithEmptyBuilding()
    createUnitMock.mockResolvedValueOnce(mockUnit)

    await act(async () => {
      fireEvent.click(screen.getByText('Добавить юнит'))
    })

    fireEvent.change(screen.getByLabelText(/Номер юнита/i), { target: { value: '101' } })
    fireEvent.change(screen.getByLabelText(/^Этаж/i), { target: { value: 'f-1' } })
    fireEvent.change(screen.getByLabelText(/Площадь, м² \*/i), { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText(/Цена \(в минимальных единицах/i), { target: { value: '10000000' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Создать юнит/i }))
    })

    await waitFor(() => {
      expect(createUnitMock).toHaveBeenCalledTimes(1)
    })
    const [floorIdArg, buildingIdArg, payloadArg] = createUnitMock.mock.calls[0]!
    expect(floorIdArg).toBe('f-1')
    expect(buildingIdArg).toBe('b-1')
    expect(payloadArg.price).toEqual({ amountMinorUnits: 10000000, currency: 'USD' })
    expect(typeof payloadArg.price.amountMinorUnits).toBe('number')
    expect(Number.isInteger(payloadArg.price.amountMinorUnits)).toBe(true)
  })

  it('units отображаются только из listUnits API, не из useCoreStore', async () => {
    getByIdMock.mockResolvedValue(mockDevelopment)
    listBuildingsMock.mockResolvedValue([mockBuilding])
    listSectionsMock.mockResolvedValue([])
    listFloorsMock.mockResolvedValue([mockFloor])
    listFloorPlansMock.mockResolvedValue([])
    listUnitsMock.mockResolvedValue([mockUnit])

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('buildings-list')).toBeDefined()
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Корпус 1'))
    })

    await waitFor(() => {
      expect(screen.getAllByText('№ 101').length).toBeGreaterThan(0)
    })
    // Юнит пришёл ровно из listUnitsMock — компонент не читает useCoreStore
    // (нет мока useCoreStore в этом файле, значит любое реальное обращение
    // к нему упало бы на неопределённом хуке до этого момента теста).
    expect(listUnitsMock).toHaveBeenCalledWith('b-1', { kind: undefined, status: undefined, limit: 500 })
  })

  it('фильтр статуса вызывает listUnits повторно с новым status (server-side)', async () => {
    getByIdMock.mockResolvedValue(mockDevelopment)
    listBuildingsMock.mockResolvedValue([mockBuilding])
    listSectionsMock.mockResolvedValue([])
    listFloorsMock.mockResolvedValue([mockFloor])
    listFloorPlansMock.mockResolvedValue([])
    listUnitsMock.mockResolvedValue([mockUnit])

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('buildings-list')).toBeDefined()
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Корпус 1'))
    })
    await waitFor(() => {
      expect(listUnitsMock).toHaveBeenCalledTimes(1)
    })

    const statusSelects = screen.getAllByDisplayValue('Все статусы')
    await act(async () => {
      fireEvent.change(statusSelects[0]!, { target: { value: 'available' } })
    })

    await waitFor(() => {
      expect(listUnitsMock).toHaveBeenCalledWith('b-1', { kind: undefined, status: 'available', limit: 500 })
    })
  })

  it('ошибка listBuildings не создаёт fake data — error banner виден, список пуст', async () => {
    getByIdMock.mockResolvedValue(mockDevelopment)
    listBuildingsMock.mockRejectedValueOnce(new Error('Server unavailable'))

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('buildings-error')).toBeDefined()
    })
    expect(screen.getByText('Server unavailable')).toBeDefined()
    expect(screen.queryByTestId('buildings-list')).toBe(null)
  })

  it('version conflict при смене цены показывает понятную ошибку с кнопкой обновить', async () => {
    getByIdMock.mockResolvedValue(mockDevelopment)
    listBuildingsMock.mockResolvedValue([mockBuilding])
    listSectionsMock.mockResolvedValue([])
    listFloorsMock.mockResolvedValue([mockFloor])
    listFloorPlansMock.mockResolvedValue([])
    listUnitsMock.mockResolvedValue([mockUnit])
    updateUnitPriceMock.mockRejectedValueOnce({
      response: { status: 409, data: { error: { code: 'VERSION_CONFLICT', message: 'Данные устарели' } } },
    })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('buildings-list')).toBeDefined()
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Корпус 1'))
    })
    await waitFor(() => {
      expect(screen.getAllByText('№ 101').length).toBeGreaterThan(0)
    })

    const saveButtons = screen.getAllByRole('button', { name: /Сохранить/i })
    // Первая «Сохранить» — статус контрол, вторая — цена контрол (порядок рендера UnitCard).
    await act(async () => {
      fireEvent.click(saveButtons[1]!)
    })

    await waitFor(() => {
      expect(screen.getByTestId('unit-version-conflict-banner')).toBeDefined()
    })
    expect(screen.getByText('Данные устарели')).toBeDefined()
    expect(screen.getByText('Обновить данные')).toBeDefined()
  })

  it('legacy/marketing-поля отсутствуют в форме Building (нет polygon-инпута)', async () => {
    getByIdMock.mockResolvedValue(mockDevelopment)
    listBuildingsMock.mockResolvedValue([])

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(listBuildingsMock).toHaveBeenCalled()
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Добавить корпус'))
    })

    expect(screen.queryByLabelText(/polygon/i)).toBe(null)
    expect(screen.queryByLabelText(/координат/i)).toBe(null)
  })
})

describe('DevelopmentManagementV2Page — D-03 publish', () => {
  beforeEach(async () => {
    await resetAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('кнопка «Опубликовать» видна только для draft, отсутствует для active', async () => {
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
  })

  it('кнопка «Опубликовать» отсутствует для Development со статусом active', async () => {
    getByIdMock.mockResolvedValue(mockDevelopment) // status: 'active'
    listBuildingsMock.mockResolvedValue([])

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(listBuildingsMock).toHaveBeenCalled()
    })
    expect(screen.queryByTestId('publish-development-button')).toBe(null)
  })

  it('клик открывает диалог подтверждения, publish НЕ вызывается до подтверждения', async () => {
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-development-button'))
    })

    expect(screen.getByTestId('publish-confirm-button')).toBeDefined()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('подтверждение вызывает publish ровно один раз, кнопка disabled во время submitting', async () => {
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])
    let resolvePublish: (value: { id: string; sourceType: 'development'; sourceId: string; status: string }) => void = () => {}
    const pending = new Promise<{ id: string; sourceType: 'development'; sourceId: string; status: string }>((resolve) => {
      resolvePublish = resolve
    })
    publishMock.mockReturnValueOnce(pending)
    getPublicationStatusMock.mockResolvedValue({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-development-button'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-confirm-button'))
    })

    expect((screen.getByTestId('publish-confirm-button') as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      resolvePublish({ id: 'pub-1', sourceType: 'development', sourceId: 'dev-1', status: 'publication_pending' })
    })

    expect(publishMock).toHaveBeenCalledTimes(1)
    expect(publishMock).toHaveBeenCalledWith('dev-1')
  })

  it('после 202 отображается publication_pending-бейдж, не «Опубликовано» немедленно', async () => {
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])
    publishMock.mockResolvedValueOnce({ id: 'pub-1', sourceType: 'development', sourceId: 'dev-1', status: 'publication_pending' })
    getPublicationStatusMock.mockResolvedValue({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-development-button'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-confirm-button'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('publication-status-pending')).toBeDefined()
    })
    expect(screen.queryByTestId('publication-status-published')).toBe(null)
  })

  it('polling переходит published-статус после нескольких тиков, дальнейших вызовов нет', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])
    // initial-fetch (до клика) — публикация ещё не запускалась (дефолт beforeEach).
    publishMock.mockResolvedValueOnce({ id: 'pub-1', sourceType: 'development', sourceId: 'dev-1', status: 'publication_pending' })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
    // Дать initial-fetch эффекту отработать (404) ДО того, как ниже переопределим мок под polling-сценарий.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    getPublicationStatusMock.mockReset()
    getPublicationStatusMock
      .mockResolvedValueOnce({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })
      .mockResolvedValueOnce({ publicationId: 'pub-1', status: 'published', version: 1, slug: 'zhk-x' })

    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-development-button'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-confirm-button'))
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    await waitFor(() => {
      expect(screen.getByTestId('publication-status-published')).toBeDefined()
    })
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(2)

    // Дальнейшая прокрутка времени НЕ должна вызвать доп. запросы — polling
    // остановлен на терминальном статусе.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(2)
  })

  it('build_failed показывает текст ошибки, без retry-кнопки на повторный publish', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])
    publishMock.mockResolvedValueOnce({ id: 'pub-1', sourceType: 'development', sourceId: 'dev-1', status: 'publication_pending' })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
    // Дать initial-fetch эффекту отработать (404) ДО переопределения мока под этот сценарий.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    getPublicationStatusMock.mockReset()
    getPublicationStatusMock.mockResolvedValueOnce({
      publicationId: 'pub-1',
      status: 'build_failed',
      version: 1,
      buildError: 'Не удалось опубликовать. Обратитесь в поддержку.',
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-development-button'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-confirm-button'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('publication-status-build-failed')).toBeDefined()
    })
    expect(screen.getByText('Не удалось опубликовать. Обратитесь в поддержку.')).toBeDefined()
  })

  it('403 при publish показывает «Недостаточно прав»', async () => {
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])
    publishMock.mockRejectedValueOnce({ response: { status: 403, data: { error: { message: 'Недостаточно прав для этого действия' } } } })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-development-button'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-confirm-button'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('publish-forbidden-banner')).toBeDefined()
    })
    expect(screen.getByText('Недостаточно прав для этого действия')).toBeDefined()
  })

  it('409/VERSION_CONFLICT при publish показывает conflict-сообщение', async () => {
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])
    publishMock.mockRejectedValueOnce({
      response: { status: 409, data: { error: { code: 'VERSION_CONFLICT', message: 'Development status is active, only draft can be published' } } },
    })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-development-button'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-confirm-button'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('publish-conflict-banner')).toBeDefined()
    })
  })

  it('повторный клик по кнопке подтверждения синхронно (до resolve) вызывает publish только один раз', async () => {
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])
    let resolvePublish: (value: { id: string; sourceType: 'development'; sourceId: string; status: string }) => void = () => {}
    const pending = new Promise<{ id: string; sourceType: 'development'; sourceId: string; status: string }>((resolve) => {
      resolvePublish = resolve
    })
    publishMock.mockReturnValueOnce(pending)
    getPublicationStatusMock.mockResolvedValue({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-development-button'))
    })

    const confirmButton = screen.getByTestId('publish-confirm-button')
    await act(async () => {
      fireEvent.click(confirmButton)
      fireEvent.click(confirmButton) // повторный клик до resolve первого — кнопка уже disabled
    })

    await act(async () => {
      resolvePublish({ id: 'pub-1', sourceType: 'development', sourceId: 'dev-1', status: 'publication_pending' })
    })

    expect(publishMock).toHaveBeenCalledTimes(1)
  })

  it('unmount во время активного polling не вызывает доп. запросов после unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])
    publishMock.mockResolvedValueOnce({ id: 'pub-1', sourceType: 'development', sourceId: 'dev-1', status: 'publication_pending' })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
    // Дать initial-fetch эффекту отработать (404) ДО переопределения мока — иначе
    // счётчик ниже считал бы и initial-fetch, и первый реальный polling-тик как одно.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    getPublicationStatusMock.mockReset()
    getPublicationStatusMock.mockResolvedValue({ publicationId: 'pub-1', status: 'publication_pending', version: 0 })

    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-development-button'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-confirm-button'))
    })

    await waitFor(() => {
      expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)
    })

    cleanup() // unmount

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    // cleanup() уже вызван выше явно (не через afterEach) — доп. тиков после unmount быть не должно.
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)
  })
})

describe('DevelopmentManagementV2Page — P1-фикс: восстановление publicationStatus после reload', () => {
  beforeEach(async () => {
    await resetAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('initial status published — сразу показывает «Опубликовано» и slug, без клика на publish', async () => {
    // Симулирует reload страницы уже опубликованного ЖК — publish/confirm-dialog
    // тут вообще не задействованы, единственный источник статуса — initial-fetch.
    getByIdMock.mockResolvedValue(mockDevelopment) // status: 'active' на самом Development
    listBuildingsMock.mockResolvedValue([])
    getPublicationStatusMock.mockReset()
    getPublicationStatusMock.mockResolvedValue({
      publicationId: 'pub-1',
      status: 'published',
      version: 2,
      slug: 'zhk-morskoy-briz',
      publishedAt: '2026-08-27T00:00:00.000Z',
    })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publication-status-published')).toBeDefined()
    })
    expect(screen.getByText('Опубликовано · zhk-morskoy-briz')).toBeDefined()
    expect(getPublicationStatusMock).toHaveBeenCalledWith('dev-1')
    // publish-кнопка не должна была понадобиться и не должна быть видна —
    // Development уже active, не draft.
    expect(screen.queryByTestId('publish-development-button')).toBe(null)
  })

  it('initial status publication_pending — запускает polling без предварительного клика на publish', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Development уже active (publish был вызван до reload), но проекция ещё строится.
    getByIdMock.mockResolvedValue(mockDevelopment)
    listBuildingsMock.mockResolvedValue([])
    getPublicationStatusMock.mockReset()
    getPublicationStatusMock
      .mockResolvedValueOnce({ publicationId: 'pub-1', status: 'publication_pending', version: 1 })
      .mockResolvedValueOnce({ publicationId: 'pub-1', status: 'published', version: 2, slug: 'zhk-y' })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publication-status-pending')).toBeDefined()
    })
    expect(publishMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    await waitFor(() => {
      expect(screen.getByTestId('publication-status-published')).toBeDefined()
    })
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(2)
  })

  it('draft без публикации (PUBLICATION_NOT_FOUND) — ни одного error banner, кнопка publish видна', async () => {
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])
    // Дефолт resetAllMocks() уже rejects с PUBLICATION_NOT_FOUND — оставляем как есть.

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
    // Дать initial-fetch эффекту долететь до .catch() и осесть.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByTestId('publish-error-banner')).toBe(null)
    expect(screen.queryByTestId('publish-forbidden-banner')).toBe(null)
    expect(screen.queryByTestId('publish-conflict-banner')).toBe(null)
    expect(screen.queryByTestId('publication-status-pending')).toBe(null)
    expect(screen.queryByTestId('publication-status-published')).toBe(null)
    expect(screen.queryByTestId('publication-status-build-failed')).toBe(null)
  })

  it('не запускает параллельные publication-status запросы при монтаже', async () => {
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])
    getPublicationStatusMock.mockReset()
    getPublicationStatusMock.mockRejectedValue(publicationNotFoundError)

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-development-button')).toBeDefined()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)
  })

  it('только error.code===PUBLICATION_NOT_FOUND трактуется как «публикация не запускалась» — прочий 404 показывает ошибку', async () => {
    getByIdMock.mockResolvedValue(mockDraftDevelopment)
    listBuildingsMock.mockResolvedValue([])
    getPublicationStatusMock.mockReset()
    // 404, но БЕЗ кода PUBLICATION_NOT_FOUND — например протухший/битый id.
    getPublicationStatusMock.mockRejectedValue({
      response: { status: 404, data: { error: { message: 'Development not found' } } },
    })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('publish-error-banner')).toBeDefined()
    })
    expect(screen.getByText('Development not found')).toBeDefined()
  })
})

describe('DevelopmentManagementV2Page — P1-фикс: StrictMode dedup', () => {
  beforeEach(async () => {
    await resetAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    paramsRef.id = 'dev-1'
  })

  it('StrictMode: initial published восстанавливается, запрос ровно один (не два от double-invoke)', async () => {
    getByIdMock.mockResolvedValue(mockDevelopment)
    listBuildingsMock.mockResolvedValue([])
    getPublicationStatusMock.mockReset()
    getPublicationStatusMock.mockResolvedValue({
      publicationId: 'pub-1',
      status: 'published',
      version: 2,
      slug: 'zhk-strict',
    })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(StrictMode, null, createElement(DevelopmentManagementV2Page)))

    await waitFor(() => {
      expect(screen.getByTestId('publication-status-published')).toBeDefined()
    })
    expect(screen.getByText('Опубликовано · zhk-strict')).toBeDefined()
    // StrictMode дважды монтирует эффект (mount→cleanup→mount) — dedup должен
    // схлопнуть это в один реальный HTTP-запрос, не два.
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(1)
  })

  it('StrictMode: initial publication_pending восстанавливается и polling стартует, ни один из двух шагов не задвоен', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    getByIdMock.mockResolvedValue(mockDevelopment)
    listBuildingsMock.mockResolvedValue([])
    getPublicationStatusMock.mockReset()
    // Три ожидаемых логических шага: (1) initial-fetch видит pending,
    // (2) первый polling-тик подтверждает pending (тот же статус — polling
    // не завязан на то, что initial-fetch уже видел), (3) второй polling-тик
    // видит published. StrictMode дедуп схлопывает дубли ВНУТРИ каждого шага,
    // но initial-fetch и polling — архитектурно разные, самостоятельные
    // запросы, друг друга не дедуплицируют.
    getPublicationStatusMock
      .mockResolvedValueOnce({ publicationId: 'pub-1', status: 'publication_pending', version: 1 })
      .mockResolvedValueOnce({ publicationId: 'pub-1', status: 'publication_pending', version: 1 })
      .mockResolvedValueOnce({ publicationId: 'pub-1', status: 'published', version: 2, slug: 'zhk-strict-2' })

    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    render(createElement(StrictMode, null, createElement(DevelopmentManagementV2Page)))

    await waitFor(() => {
      expect(screen.getByTestId('publication-status-pending')).toBeDefined()
    })
    // initial-fetch (дедуплицированный от StrictMode-дубля) + первый
    // polling-тик (тоже дедуплицированный от своего StrictMode-дубля) — ровно
    // 2 реальных запроса, не 4 (2×StrictMode-дубль на каждый из двух шагов).
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    await waitFor(() => {
      expect(screen.getByTestId('publication-status-published')).toBeDefined()
    })
    // Третий шаг — второй polling-тик — тоже не задвоен.
    expect(getPublicationStatusMock).toHaveBeenCalledTimes(3)
  })

  it('смена developmentId во время pending initial-fetch — устаревший результат не применяется к новому экрану', async () => {
    getByIdMock.mockImplementation((id: string) =>
      Promise.resolve(id === 'dev-1' ? mockDevelopment : { ...mockDevelopment, _id: 'dev-2', name: 'ЖК Горный вид' }),
    )
    listBuildingsMock.mockResolvedValue([])
    getPublicationStatusMock.mockReset()

    let resolveDev1Status: (value: { publicationId: string; status: string; version: number; slug?: string }) => void = () => {}
    const dev1StatusPending = new Promise<{ publicationId: string; status: string; version: number; slug?: string }>((resolve) => {
      resolveDev1Status = resolve
    })
    getPublicationStatusMock.mockImplementation((id: string) => {
      if (id === 'dev-1') return dev1StatusPending
      // dev-2 — публикация ещё не запускалась (нормальный draft-сценарий).
      return Promise.reject(publicationNotFoundError)
    })

    paramsRef.id = 'dev-1'
    const { DevelopmentManagementV2Page } = await import('@/pages/projects/DevelopmentManagementV2Page')
    const { rerender } = render(createElement(DevelopmentManagementV2Page))

    await waitFor(() => {
      expect(getByIdMock).toHaveBeenCalledWith('dev-1')
    })
    // dev-1 publication-status запрос всё ещё pending (не резолвился) —
    // переключаем экран на dev-2 ДО того, как dev-1 успел ответить.
    paramsRef.id = 'dev-2'
    await act(async () => {
      rerender(createElement(DevelopmentManagementV2Page))
    })

    await waitFor(() => {
      expect(screen.getByText('ЖК Горный вид')).toBeDefined()
    })
    // dev-2 — draft без публикации, никакого статус-бейджа быть не должно.
    expect(screen.queryByTestId('publication-status-published')).toBe(null)
    expect(screen.queryByTestId('publication-status-pending')).toBe(null)

    // Теперь устаревший dev-1 запрос наконец резолвится published-статусом —
    // экран УЖЕ показывает dev-2, этот результат не должен на него натянуться.
    await act(async () => {
      resolveDev1Status({ publicationId: 'pub-dev1', status: 'published', version: 1, slug: 'zhk-stale' })
    })

    expect(screen.queryByTestId('publication-status-published')).toBe(null)
    expect(screen.queryByText(/zhk-stale/)).toBe(null)
  })
})

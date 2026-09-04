import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IInstallmentPlan, NewInstallmentPlan } from '@/types/installment'

const listMock = vi.fn()
const createMock = vi.fn()
const updateMock = vi.fn()
const removeMock = vi.fn()

vi.mock('@/services/installmentPlansApiV2', () => ({
  installmentPlansApiV2: {
    list: listMock,
    create: createMock,
    update: updateMock,
    remove: removeMock,
  },
}))

const applyProjectInstallmentPlansMock = vi.fn()
vi.mock('@/store/useCoreStore', () => ({
  applyProjectInstallmentPlans: (projectId: string, plans: IInstallmentPlan[]) =>
    applyProjectInstallmentPlansMock(projectId, plans),
}))

vi.mock('@/services/developmentApi', () => ({
  developmentApi: {
    updateComplex: vi.fn().mockResolvedValue({ success: true }),
  },
}))

const storageMap = new Map<string, string>()
const mockLocalStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value))
  },
  removeItem: (key: string) => {
    storageMap.delete(key)
  },
  clear: () => {
    storageMap.clear()
  },
}
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
})

describe('useInstallmentStore with API V2', () => {
  beforeEach(() => {
    storageMap.clear()
    listMock.mockReset()
    createMock.mockReset()
    updateMock.mockReset()
    removeMock.mockReset()
    applyProjectInstallmentPlansMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('create() оптимистично создаёт план, синхронизирует useCoreStore и вызывает API', async () => {
    const serverSaved: IInstallmentPlan = {
      id: 'server-id-1',
      title: 'План 20/80',
      isActive: true,
      applyTo: 'project',
      projectId: 'proj-1',
      downPaymentType: 'percent',
      downPaymentValue: 20,
      termType: 'months_from_current_date',
      termMonths: 12,
      paymentFrequency: 'monthly',
      useDiscount: false,
      sortOrder: 0,
      version: 0,
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    }
    createMock.mockResolvedValue(serverSaved)

    const { getInstallmentStore } = await import('@/store/useInstallmentStore')
    const store = getInstallmentStore()

    const newPlan: NewInstallmentPlan = {
      title: 'План 20/80',
      isActive: true,
      applyTo: 'project',
      projectId: 'proj-1',
      downPaymentType: 'percent',
      downPaymentValue: 20,
      termType: 'months_from_current_date',
      termMonths: 12,
      paymentFrequency: 'monthly',
      useDiscount: false,
      sortOrder: 0,
    }

    const created = store.create(newPlan)
    expect(created.title).toBe('План 20/80')
    expect(store.plans.some((p) => p.title === 'План 20/80')).toBe(true)
    expect(applyProjectInstallmentPlansMock).toHaveBeenCalledWith('proj-1', expect.any(Array))
    expect(createMock).toHaveBeenCalledWith('proj-1', newPlan)

    // Даём промису разрешиться
    await Promise.resolve()
    await Promise.resolve()

    // После ответа сервера локальный ID заменился на server-id-1
    expect(store.plans.some((p) => p.id === 'server-id-1')).toBe(true)
  })

  it('update() обновляет план в сторе и вызывает API update с expectedVersion', async () => {
    const initialPlan: IInstallmentPlan = {
      id: 'plan-10',
      title: 'Исходный',
      isActive: true,
      applyTo: 'project',
      projectId: 'proj-1',
      downPaymentType: 'percent',
      downPaymentValue: 20,
      termType: 'months_from_current_date',
      paymentFrequency: 'monthly',
      useDiscount: false,
      version: 2,
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    }
    updateMock.mockResolvedValue({ ...initialPlan, title: 'Обновлённый', version: 3 })

    const { getInstallmentStore } = await import('@/store/useInstallmentStore')
    const store = getInstallmentStore()
    store.hydrateForProject('proj-1', [initialPlan])

    store.update('plan-10', { title: 'Обновлённый' })

    const updated = store.plans.find((p) => p.id === 'plan-10')
    expect(updated?.title).toBe('Обновлённый')
    expect(updateMock).toHaveBeenCalledWith('proj-1', 'plan-10', { title: 'Обновлённый' }, 2)
  })

  it('remove() удаляет план из стора и вызывает API remove', async () => {
    const initialPlan: IInstallmentPlan = {
      id: 'plan-del',
      title: 'Удаляемый',
      isActive: true,
      applyTo: 'project',
      projectId: 'proj-1',
      downPaymentType: 'percent',
      downPaymentValue: 50,
      termType: 'months_from_current_date',
      paymentFrequency: 'monthly',
      useDiscount: false,
      version: 0,
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    }
    removeMock.mockResolvedValue(undefined)

    const { getInstallmentStore } = await import('@/store/useInstallmentStore')
    const store = getInstallmentStore()
    store.hydrateForProject('proj-1', [initialPlan])

    store.remove('plan-del')

    expect(store.plans.find((p) => p.id === 'plan-del')).toBeUndefined()
    expect(removeMock).toHaveBeenCalledWith('proj-1', 'plan-del', 0)
    expect(applyProjectInstallmentPlansMock).toHaveBeenCalledWith('proj-1', [])
  })

  it('toggleActive() инвертирует статус активности плана', async () => {
    const initialPlan: IInstallmentPlan = {
      id: 'plan-toggle',
      title: 'Активный',
      isActive: true,
      applyTo: 'project',
      projectId: 'proj-1',
      downPaymentType: 'percent',
      downPaymentValue: 30,
      termType: 'months_from_current_date',
      paymentFrequency: 'monthly',
      useDiscount: false,
      version: 0,
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    }
    updateMock.mockResolvedValue({ ...initialPlan, isActive: false, version: 1 })

    const { getInstallmentStore } = await import('@/store/useInstallmentStore')
    const store = getInstallmentStore()
    store.hydrateForProject('proj-1', [initialPlan])

    store.toggleActive('plan-toggle')

    const toggled = store.plans.find((p) => p.id === 'plan-toggle')
    expect(toggled?.isActive).toBe(false)
    expect(updateMock).toHaveBeenCalledWith('proj-1', 'plan-toggle', { isActive: false }, 0)
  })

  it('fetchForProject() загружает планы с сервера и гидрирует стор', async () => {
    const serverPlans: IInstallmentPlan[] = [
      {
        id: 'plan-f1',
        title: 'Загруженный',
        isActive: true,
        applyTo: 'project',
        projectId: 'proj-fetch',
        downPaymentType: 'percent',
        downPaymentValue: 25,
        termType: 'months_from_current_date',
        paymentFrequency: 'monthly',
        useDiscount: false,
        version: 1,
        createdAt: '2026-09-04T00:00:00.000Z',
        updatedAt: '2026-09-04T00:00:00.000Z',
      },
    ]
    listMock.mockResolvedValue(serverPlans)

    const { getInstallmentStore } = await import('@/store/useInstallmentStore')
    const store = getInstallmentStore()

    const result = await store.fetchForProject('proj-fetch')

    expect(listMock).toHaveBeenCalledWith('proj-fetch')
    expect(result).toHaveLength(1)
    expect(store.plans.some((p) => p.id === 'plan-f1')).toBe(true)
    expect(applyProjectInstallmentPlansMock).toHaveBeenCalledWith('proj-fetch', serverPlans)
  })
})

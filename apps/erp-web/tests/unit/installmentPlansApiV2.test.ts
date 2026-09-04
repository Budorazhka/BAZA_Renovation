import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewInstallmentPlan } from '@/types/installment'

const getMock = vi.fn()
const postMock = vi.fn()
const patchMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: getMock,
      post: postMock,
      patch: patchMock,
      delete: deleteMock,
    }),
  },
}))

describe('installmentPlansApiV2', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    patchMock.mockReset()
    deleteMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('list', () => {
    it('запрашивает GET /api/v1/developments/:id/installment-plans и маппит поля', async () => {
      const apiPlan = {
        _id: 'plan-1',
        developmentId: 'dev-1',
        organizationId: 'org-1',
        title: '30/70',
        isActive: true,
        applyTo: 'project',
        downPaymentType: 'percent',
        downPaymentValue: 30,
        termType: 'months_from_current_date',
        termMonths: 24,
        paymentFrequency: 'monthly',
        useDiscount: false,
        sortOrder: 1,
        version: 0,
        createdAt: '2026-09-04T00:00:00.000Z',
        updatedAt: '2026-09-04T00:00:00.000Z',
      }
      getMock.mockResolvedValue({ data: [apiPlan] })

      const { installmentPlansApiV2 } = await import('@/services/installmentPlansApiV2')
      const result = await installmentPlansApiV2.list('dev-1')

      expect(getMock).toHaveBeenCalledTimes(1)
      expect(getMock).toHaveBeenCalledWith('/api/v1/developments/dev-1/installment-plans', {
        params: undefined,
      })
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('plan-1')
      expect(result[0]!.projectId).toBe('dev-1')
      expect(result[0]!.title).toBe('30/70')
    })

    it('передаёт unitId в query-параметрах при наличии', async () => {
      getMock.mockResolvedValue({ data: [] })
      const { installmentPlansApiV2 } = await import('@/services/installmentPlansApiV2')
      await installmentPlansApiV2.list('dev-1', 'unit-99')

      expect(getMock).toHaveBeenCalledWith('/api/v1/developments/dev-1/installment-plans', {
        params: { unitId: 'unit-99' },
      })
    })
  })

  describe('create', () => {
    it('отправляет POST с заголовком Idempotency-Key и телом плана', async () => {
      const savedPlan = {
        _id: 'plan-created',
        developmentId: 'dev-1',
        organizationId: 'org-1',
        title: '50/50',
        isActive: true,
        applyTo: 'project',
        downPaymentType: 'percent',
        downPaymentValue: 50,
        termType: 'fixed_end_date',
        endDate: '2027-12-31',
        paymentFrequency: 'quarterly',
        useDiscount: true,
        discountPercent: 3,
        sortOrder: 0,
        version: 0,
        createdAt: '2026-09-04T00:00:00.000Z',
        updatedAt: '2026-09-04T00:00:00.000Z',
      }
      postMock.mockResolvedValue({ data: savedPlan })

      const { installmentPlansApiV2 } = await import('@/services/installmentPlansApiV2')
      const newPlan: NewInstallmentPlan = {
        title: '50/50',
        isActive: true,
        applyTo: 'project',
        projectId: 'dev-1',
        downPaymentType: 'percent',
        downPaymentValue: 50,
        termType: 'fixed_end_date',
        endDate: '2027-12-31',
        paymentFrequency: 'quarterly',
        useDiscount: true,
        discountPercent: 3,
        sortOrder: 0,
      }

      const result = await installmentPlansApiV2.create('dev-1', newPlan)

      expect(postMock).toHaveBeenCalledTimes(1)
      const [url, body, config] = postMock.mock.calls[0]!
      expect(url).toBe('/api/v1/developments/dev-1/installment-plans')
      expect(body.title).toBe('50/50')
      expect(body.downPaymentValue).toBe(50)
      const idempotencyKey = config?.headers?.['Idempotency-Key']
      expect(idempotencyKey).toBeTruthy()
      expect(result.id).toBe('plan-created')
      expect(result.projectId).toBe('dev-1')
    })
  })

  describe('update', () => {
    it('отправляет PATCH с ожидаемой версией expectedVersion и Idempotency-Key', async () => {
      patchMock.mockResolvedValue({
        data: {
          _id: 'plan-1',
          developmentId: 'dev-1',
          organizationId: 'org-1',
          title: '30/70 обновлённая',
          isActive: true,
          applyTo: 'project',
          downPaymentType: 'percent',
          downPaymentValue: 35,
          termType: 'months_from_current_date',
          paymentFrequency: 'monthly',
          useDiscount: false,
          version: 1,
          createdAt: '2026-09-04T00:00:00.000Z',
          updatedAt: '2026-09-04T01:00:00.000Z',
        },
      })

      const { installmentPlansApiV2 } = await import('@/services/installmentPlansApiV2')
      const result = await installmentPlansApiV2.update(
        'dev-1',
        'plan-1',
        { title: '30/70 обновлённая', downPaymentValue: 35 },
        0,
      )

      expect(patchMock).toHaveBeenCalledTimes(1)
      const [url, body, config] = patchMock.mock.calls[0]!
      expect(url).toBe('/api/v1/developments/dev-1/installment-plans/plan-1')
      expect(body.expectedVersion).toBe(0)
      expect(body.title).toBe('30/70 обновлённая')
      expect(config?.headers?.['Idempotency-Key']).toBeTruthy()
      expect(result.version).toBe(1)
    })
  })

  describe('remove', () => {
    it('отправляет DELETE с Idempotency-Key и expectedVersion в params', async () => {
      deleteMock.mockResolvedValue({ status: 204 })

      const { installmentPlansApiV2 } = await import('@/services/installmentPlansApiV2')
      await installmentPlansApiV2.remove('dev-1', 'plan-1', 2)

      expect(deleteMock).toHaveBeenCalledTimes(1)
      const [url, config] = deleteMock.mock.calls[0]!
      expect(url).toBe('/api/v1/developments/dev-1/installment-plans/plan-1')
      expect(config?.params?.expectedVersion).toBe(2)
      expect(config?.headers?.['Idempotency-Key']).toBeTruthy()
    })
  })
})

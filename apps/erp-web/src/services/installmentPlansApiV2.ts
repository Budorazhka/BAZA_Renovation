import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'
import type { IInstallmentPlan, NewInstallmentPlan } from '@/types/installment'

const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface ApiInstallmentPlanResponse {
  id?: string
  _id?: string
  developmentId: string
  organizationId: string
  unitId?: string
  title: string
  isActive: boolean
  applyTo: 'project' | 'unit'
  downPaymentType: 'percent' | 'amount'
  downPaymentValue: number
  termType: 'months_from_current_date' | 'fixed_end_date'
  termMonths?: number
  endDate?: string
  paymentFrequency: 'monthly' | 'quarterly'
  useDiscount: boolean
  discountFromDownPayment?: boolean
  discountPercent?: number
  description?: string
  sortOrder?: number
  version?: number
  createdAt: string
  updatedAt: string
}

export function mapApiPlanToFrontend(raw: ApiInstallmentPlanResponse): IInstallmentPlan {
  const id = raw.id || raw._id || ''
  return {
    id,
    title: raw.title,
    isActive: raw.isActive ?? true,
    applyTo: raw.applyTo ?? 'project',
    projectId: raw.developmentId,
    unitId: raw.unitId,
    downPaymentType: raw.downPaymentType,
    downPaymentValue: raw.downPaymentValue,
    termType: raw.termType,
    termMonths: raw.termMonths,
    endDate: raw.endDate,
    paymentFrequency: raw.paymentFrequency,
    useDiscount: raw.useDiscount ?? false,
    discountFromDownPayment: raw.discountFromDownPayment,
    discountPercent: raw.discountPercent,
    description: raw.description,
    sortOrder: raw.sortOrder ?? 0,
    version: raw.version ?? 0,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

/** Трекинг ключей идемпотентности на операцию */
const mutationAttemptKeys = new Map<string, string>()

function attemptKey(operationId: string): string {
  let key = mutationAttemptKeys.get(operationId)
  if (!key) {
    key = uid()
    mutationAttemptKeys.set(operationId, key)
  }
  return key
}

function clearAttemptKey(operationId: string) {
  mutationAttemptKeys.delete(operationId)
}

export const installmentPlansApiV2 = {
  /**
   * Список планов рассрочки ЖК
   * GET /api/v1/developments/:developmentId/installment-plans
   */
  async list(developmentId: string, unitId?: string): Promise<IInstallmentPlan[]> {
    if (!developmentId) return []
    const { data } = await api.get<ApiInstallmentPlanResponse[]>(
      `/api/v1/developments/${developmentId}/installment-plans`,
      { params: unitId ? { unitId } : undefined },
    )
    return Array.isArray(data) ? data.map(mapApiPlanToFrontend) : []
  },

  /**
   * Создать план рассрочки
   * POST /api/v1/developments/:developmentId/installment-plans
   */
  async create(developmentId: string, plan: NewInstallmentPlan, customKey?: string): Promise<IInstallmentPlan> {
    const opKey = `create:${developmentId}:${plan.title}`
    const idempotencyKey = customKey || attemptKey(opKey)
    try {
      const payload = {
        title: plan.title,
        isActive: plan.isActive,
        applyTo: plan.applyTo,
        unitId: plan.unitId,
        downPaymentType: plan.downPaymentType,
        downPaymentValue: plan.downPaymentValue,
        termType: plan.termType,
        termMonths: plan.termMonths,
        endDate: plan.endDate,
        paymentFrequency: plan.paymentFrequency,
        useDiscount: plan.useDiscount,
        discountFromDownPayment: plan.discountFromDownPayment,
        discountPercent: plan.discountPercent,
        description: plan.description,
        sortOrder: plan.sortOrder,
      }
      const { data } = await api.post<ApiInstallmentPlanResponse>(
        `/api/v1/developments/${developmentId}/installment-plans`,
        payload,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      clearAttemptKey(opKey)
      return mapApiPlanToFrontend(data)
    } catch (err) {
      throw err
    }
  },

  /**
   * Обновить план рассрочки (с проверкой версии expectedVersion)
   * PATCH /api/v1/developments/:developmentId/installment-plans/:id
   */
  async update(
    developmentId: string,
    planId: string,
    patch: Partial<NewInstallmentPlan>,
    expectedVersion: number,
    customKey?: string,
  ): Promise<IInstallmentPlan> {
    const opKey = `update:${developmentId}:${planId}:${expectedVersion}`
    const idempotencyKey = customKey || attemptKey(opKey)
    try {
      const { data } = await api.patch<ApiInstallmentPlanResponse>(
        `/api/v1/developments/${developmentId}/installment-plans/${planId}`,
        { ...patch, expectedVersion },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      clearAttemptKey(opKey)
      return mapApiPlanToFrontend(data)
    } catch (err) {
      throw err
    }
  },

  /**
   * Удалить план рассрочки
   * DELETE /api/v1/developments/:developmentId/installment-plans/:id
   */
  async remove(
    developmentId: string,
    planId: string,
    expectedVersion = 0,
    customKey?: string,
  ): Promise<void> {
    const opKey = `delete:${developmentId}:${planId}`
    const idempotencyKey = customKey || attemptKey(opKey)
    try {
      await api.delete(
        `/api/v1/developments/${developmentId}/installment-plans/${planId}`,
        {
          params: { expectedVersion },
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )
      clearAttemptKey(opKey)
    } catch (err) {
      throw err
    }
  },
}

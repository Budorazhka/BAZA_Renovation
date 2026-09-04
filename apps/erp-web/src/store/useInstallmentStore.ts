import { useSyncExternalStore } from 'react'

import { developmentApi } from '@/services/developmentApi'
import { installmentPlansApiV2 } from '@/services/installmentPlansApiV2'
import { applyProjectInstallmentPlans } from '@/store/useCoreStore'
import type { IInstallmentPlan, NewInstallmentPlan } from '@/types/installment'

const STORAGE_KEY = 'installment.plans.v1'

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function load(): IInstallmentPlan[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as IInstallmentPlan[]
  } catch {
    return []
  }
}

function persist(plans: IInstallmentPlan[]) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans))
  } catch {
    /* best-effort */
  }
}

interface State {
  plans: IInstallmentPlan[]
  create: (data: NewInstallmentPlan) => IInstallmentPlan
  update: (id: string, patch: Partial<NewInstallmentPlan>) => void
  remove: (id: string) => void
  toggleActive: (id: string) => void
  /** Replace all plans for a given project with the provided ones (used to hydrate from API on edit). */
  hydrateForProject: (projectId: string, plans: IInstallmentPlan[]) => void
  /** Fetch fresh plans from backend /api/v1/developments/:id/installment-plans and hydrate */
  fetchForProject: (projectId: string) => Promise<IInstallmentPlan[]>
}

let state: State
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/**
 * Fallback-синхронизация со старым API (PATCH комплекса installmentPlans) для обратной совместимости.
 */
function syncProjectPlansToApi(projectId: string | undefined) {
  if (!projectId) return
  const plans = get().plans.filter((p) => p.projectId === projectId)
  developmentApi
    .updateComplex(projectId, { installmentPlans: plans })
    .then((resp) => {
      if (resp.success) applyProjectInstallmentPlans(projectId, plans)
    })
    .catch((err) => {
      console.error('Не удалось сохранить рассрочки ЖК в legacy-комплексе:', err)
    })
}

function set(next: Partial<State>) {
  state = { ...state, ...next }
  persist(state.plans)
  emit()
}

function get() {
  return state
}

state = {
  plans: load(),

  create(data) {
    const now = new Date().toISOString()
    const tempId = uid()
    const plan: IInstallmentPlan = {
      ...data,
      id: tempId,
      version: 0,
      createdAt: now,
      updatedAt: now,
    }

    const updatedList = [...get().plans, plan]
    set({ plans: updatedList })

    if (plan.projectId) {
      applyProjectInstallmentPlans(
        plan.projectId,
        updatedList.filter((p) => p.projectId === plan.projectId),
      )

      installmentPlansApiV2
        .create(plan.projectId, data)
        .then((saved) => {
          const currentPlans = get().plans.map((p) => (p.id === tempId ? saved : p))
          set({ plans: currentPlans })
          applyProjectInstallmentPlans(
            plan.projectId,
            currentPlans.filter((p) => p.projectId === plan.projectId),
          )
        })
        .catch((err) => {
          console.error('Ошибка сохранения плана рассрочки на сервере:', err)
          syncProjectPlansToApi(plan.projectId)
        })
    }

    return plan
  },

  update(id, patch) {
    const target = get().plans.find((p) => p.id === id)
    if (!target) return

    const now = new Date().toISOString()
    const updatedPlan: IInstallmentPlan = { ...target, ...patch, updatedAt: now }
    const updatedList = get().plans.map((p) => (p.id === id ? updatedPlan : p))
    set({ plans: updatedList })

    if (target.projectId) {
      applyProjectInstallmentPlans(
        target.projectId,
        updatedList.filter((p) => p.projectId === target.projectId),
      )

      installmentPlansApiV2
        .update(target.projectId, id, patch, target.version ?? 0)
        .then((saved) => {
          const currentPlans = get().plans.map((p) => (p.id === id ? saved : p))
          set({ plans: currentPlans })
          applyProjectInstallmentPlans(
            target.projectId,
            currentPlans.filter((p) => p.projectId === target.projectId),
          )
        })
        .catch((err) => {
          console.error('Ошибка обновления плана рассрочки на сервере:', err)
          syncProjectPlansToApi(target.projectId)
        })
    }
  },

  remove(id) {
    const removed = get().plans.find((p) => p.id === id)
    if (!removed) return

    const remainingPlans = get().plans.filter((p) => p.id !== id)
    set({ plans: remainingPlans })

    if (removed.projectId) {
      applyProjectInstallmentPlans(
        removed.projectId,
        remainingPlans.filter((p) => p.projectId === removed.projectId),
      )

      installmentPlansApiV2
        .remove(removed.projectId, id, removed.version ?? 0)
        .catch((err) => {
          console.error('Ошибка удаления плана рассрочки на сервере:', err)
          syncProjectPlansToApi(removed.projectId)
        })
    }
  },

  toggleActive(id) {
    const target = get().plans.find((p) => p.id === id)
    if (!target) return
    get().update(id, { isActive: !target.isActive })
  },

  hydrateForProject(projectId, plans) {
    const others = get().plans.filter((p) => p.projectId !== projectId)
    const combined = [...others, ...plans]
    set({ plans: combined })
    applyProjectInstallmentPlans(projectId, plans)
  },

  async fetchForProject(projectId: string): Promise<IInstallmentPlan[]> {
    if (!projectId) return []
    try {
      const plans = await installmentPlansApiV2.list(projectId)
      get().hydrateForProject(projectId, plans)
      return plans
    } catch (err) {
      console.error('Не удалось получить планы рассрочки с сервера:', err)
      return get().plans.filter((p) => p.projectId === projectId)
    }
  },
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useInstallmentStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(get()))
}

export function getInstallmentStore(): State {
  return new Proxy({} as State, {
    get(_target, prop: keyof State) {
      return get()[prop]
    },
  })
}

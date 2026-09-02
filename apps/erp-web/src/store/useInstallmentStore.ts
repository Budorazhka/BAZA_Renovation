import { useSyncExternalStore } from 'react'

import { developmentApi } from '@/services/developmentApi'
import { applyProjectInstallmentPlans } from '@/store/useCoreStore'
import type { IInstallmentPlan, NewInstallmentPlan } from '@/types/installment'

const STORAGE_KEY = 'installment.plans.v1'

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function load(): IInstallmentPlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as IInstallmentPlan[]
  } catch {
    return []
  }
}

function persist(plans: IInstallmentPlan[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plans)) } catch { /* best-effort */ }
}

interface State {
  plans: IInstallmentPlan[]
  create: (data: NewInstallmentPlan) => IInstallmentPlan
  update: (id: string, patch: Partial<NewInstallmentPlan>) => void
  remove: (id: string) => void
  toggleActive: (id: string) => void
  /** Replace all plans for a given project with the provided ones (used to hydrate from API on edit). */
  hydrateForProject: (projectId: string, plans: IInstallmentPlan[]) => void
}

let state: State
const listeners = new Set<() => void>()

function emit() { for (const l of listeners) l() }

/**
 * Сохраняет рассрочки проекта на сервере (PATCH комплекса `installmentPlans`) —
 * иначе планы живут только в localStorage и другие аккаунты их не видят.
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
      console.error('Не удалось сохранить рассрочки ЖК на сервере:', err)
    })
}
function set(next: Partial<State>) {
  state = { ...state, ...next }
  persist(state.plans)
  emit()
}
function get() { return state }

state = {
  plans: load(),

  create(data) {
    const now = new Date().toISOString()
    const plan: IInstallmentPlan = { ...data, id: uid(), createdAt: now, updatedAt: now }
    set({ plans: [...get().plans, plan] })
    syncProjectPlansToApi(plan.projectId)
    return plan
  },

  update(id, patch) {
    const now = new Date().toISOString()
    set({
      plans: get().plans.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: now } : p)),
    })
    syncProjectPlansToApi(get().plans.find((p) => p.id === id)?.projectId)
  },

  remove(id) {
    const removed = get().plans.find((p) => p.id === id)
    set({ plans: get().plans.filter((p) => p.id !== id) })
    syncProjectPlansToApi(removed?.projectId)
  },

  toggleActive(id) {
    const now = new Date().toISOString()
    set({
      plans: get().plans.map((p) => (p.id === id ? { ...p, isActive: !p.isActive, updatedAt: now } : p)),
    })
    syncProjectPlansToApi(get().plans.find((p) => p.id === id)?.projectId)
  },

  hydrateForProject(projectId, plans) {
    const others = get().plans.filter((p) => p.projectId !== projectId)
    set({ plans: [...others, ...plans] })
  },
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useInstallmentStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(get()))
}

export function getInstallmentStore(): State { return get() }

import { useSyncExternalStore } from 'react'
import type { DevSelection, DevSelectionItem, DevSelectionReaction, DevSelectionStatus } from '@/types/dev-selection'
import { DEFAULT_DEV_CUSTOMIZATION, type DevSelectionCustomization } from '@/config/dev-selection-customization'

const STORAGE_KEY = 'dev.selections.v1'

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function token(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function load(): DevSelection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as DevSelection[]
  } catch {
    return []
  }
}

function save(selections: DevSelection[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selections))
  } catch { /* best-effort */ }
}

interface State {
  selections: DevSelection[]
  create: (params: { title: string; unitIds: string[]; leadId?: string; clientName?: string; clientPhone?: string; agentNote?: string; customization?: DevSelectionCustomization }) => DevSelection
  update: (id: string, patch: Partial<Omit<DevSelection, 'id' | 'publicToken' | 'createdAt'>>) => void
  setStatus: (id: string, status: DevSelectionStatus) => void
  setReaction: (selectionId: string, unitId: string, reaction: DevSelectionReaction | undefined) => void
  markViewed: (publicToken: string) => void
  updateItemNote: (selectionId: string, unitId: string, note: string) => void
  addUnits: (selectionId: string, unitIds: string[]) => void
  removeUnit: (selectionId: string, unitId: string) => void
  remove: (id: string) => void
  getByToken: (publicToken: string) => DevSelection | undefined
}

let state: State
const listeners = new Set<() => void>()

function emit() { for (const l of listeners) l() }
function set(next: Partial<State>) { state = { ...state, ...next }; emit() }
function get() { return state }

state = {
  selections: load(),

  create({ title, unitIds, leadId, clientName, clientPhone, agentNote, customization }) {
    const now = new Date().toISOString()
    const sel: DevSelection = {
      id: uid(),
      publicToken: token(),
      title,
      leadId,
      clientName,
      clientPhone,
      agentNote,
      status: 'draft',
      items: unitIds.map((unitId): DevSelectionItem => ({ unitId })),
      createdAt: now,
      viewCount: 0,
      customization: customization ?? DEFAULT_DEV_CUSTOMIZATION,
    }
    const next = [sel, ...get().selections]
    save(next)
    set({ selections: next })
    return sel
  },

  update(id, patch) {
    const next = get().selections.map((s) => s.id === id ? { ...s, ...patch } : s)
    save(next)
    set({ selections: next })
  },

  setStatus(id, status) {
    const patch: Partial<DevSelection> = { status }
    if (status === 'sent' && !get().selections.find((s) => s.id === id)?.sentAt) {
      patch.sentAt = new Date().toISOString()
    }
    get().update(id, patch)
  },

  setReaction(selectionId, unitId, reaction) {
    const next = get().selections.map((s) => {
      if (s.id !== selectionId) return s
      return {
        ...s,
        items: s.items.map((item) =>
          item.unitId === unitId ? { ...item, reaction, viewedAt: new Date().toISOString() } : item
        ),
      }
    })
    save(next)
    set({ selections: next })
  },

  markViewed(publicToken) {
    const now = new Date().toISOString()
    const next = get().selections.map((s) => {
      if (s.publicToken !== publicToken) return s
      return {
        ...s,
        status: s.status === 'sent' ? ('viewed' as const) : s.status,
        lastOpenedAt: now,
        viewCount: (s.viewCount ?? 0) + 1,
      }
    })
    save(next)
    set({ selections: next })
  },

  updateItemNote(selectionId, unitId, note) {
    const next = get().selections.map((s) => {
      if (s.id !== selectionId) return s
      return {
        ...s,
        items: s.items.map((item) =>
          item.unitId === unitId ? { ...item, agentNote: note } : item
        ),
      }
    })
    save(next)
    set({ selections: next })
  },

  addUnits(selectionId, unitIds) {
    const next = get().selections.map((s) => {
      if (s.id !== selectionId) return s
      const existing = new Set(s.items.map((i) => i.unitId))
      const newItems = unitIds.filter((id) => !existing.has(id)).map((unitId): DevSelectionItem => ({ unitId }))
      return { ...s, items: [...s.items, ...newItems] }
    })
    save(next)
    set({ selections: next })
  },

  removeUnit(selectionId, unitId) {
    const next = get().selections.map((s) =>
      s.id !== selectionId ? s : { ...s, items: s.items.filter((i) => i.unitId !== unitId) }
    )
    save(next)
    set({ selections: next })
  },

  remove(id) {
    const next = get().selections.filter((s) => s.id !== id)
    save(next)
    set({ selections: next })
  },

  getByToken(publicToken) {
    return get().selections.find((s) => s.publicToken === publicToken)
  },
}

export function useDevSelectionsStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => selector(get()),
    () => selector(get()),
  )
}

export function getDevSelectionsState() { return state }

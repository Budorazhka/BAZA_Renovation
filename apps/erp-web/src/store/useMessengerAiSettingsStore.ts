import { useSyncExternalStore } from 'react'
import {
  DEFAULT_AI_PERSONALITY,
  messengerApi,
  type AiPersonalitySettings,
  type Dialog,
} from '@/services/messengerApi'

const SAVE_DEBOUNCE_MS = 450

type DialogId = string

interface MessengerAiSettingsState {
  byDialogId: Record<DialogId, AiPersonalitySettings>
  /** Локально изменено, ждём подтверждения сервера */
  pending: Set<DialogId>
  getForDialog: (dialogId: DialogId | undefined, dialog?: Dialog | null) => AiPersonalitySettings
  isPending: (dialogId: DialogId) => boolean
  seedFromDialogs: (dialogs: Dialog[]) => void
  updateField: (
    dialogId: DialogId,
    key: keyof AiPersonalitySettings,
    level: AiPersonalitySettings[keyof AiPersonalitySettings],
    fallback?: AiPersonalitySettings
  ) => AiPersonalitySettings
  confirmFromServer: (dialogId: DialogId, settings: AiPersonalitySettings) => void
  flush: (dialogId: DialogId) => void
  flushAll: () => void
}

const saveTimers: Record<DialogId, ReturnType<typeof setTimeout>> = {}
const saveSeq: Record<DialogId, number> = {}

const listeners = new Set<() => void>()
const confirmListeners = new Set<(dialogId: DialogId, settings: AiPersonalitySettings) => void>()
const errorListeners = new Set<(dialogId: DialogId) => void>()

function emit() {
  for (const l of listeners) l()
}

export function onMessengerAiSettingsConfirmed(
  listener: (dialogId: DialogId, settings: AiPersonalitySettings) => void
) {
  confirmListeners.add(listener)
  return () => {
    confirmListeners.delete(listener)
  }
}

export function onMessengerAiSettingsSaveError(listener: (dialogId: DialogId) => void) {
  errorListeners.add(listener)
  return () => {
    errorListeners.delete(listener)
  }
}

function normalizeDialogId(value: unknown): DialogId | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return normalizeDialogId((value as { _id: unknown })._id)
  }
  return String(value)
}

function scheduleSave(dialogId: DialogId, settings: AiPersonalitySettings) {
  const existing = saveTimers[dialogId]
  if (existing) clearTimeout(existing)

  saveTimers[dialogId] = setTimeout(() => {
    delete saveTimers[dialogId]
    persistToServer(dialogId, settings)
  }, SAVE_DEBOUNCE_MS)
}

function persistToServer(dialogId: DialogId, settings: AiPersonalitySettings) {
  const seq = (saveSeq[dialogId] ?? 0) + 1
  saveSeq[dialogId] = seq

  messengerApi
    .setDialogAiSettings(dialogId, settings)
    .then((res) => {
      if (saveSeq[dialogId] !== seq) return

      const latest = getState().byDialogId[dialogId]
      if (!latest || JSON.stringify(latest) !== JSON.stringify(settings)) return

      const saved = res.dialog?.aiSettings ?? settings
      getState().confirmFromServer(dialogId, saved)
      for (const l of confirmListeners) l(dialogId, saved)
    })
    .catch((error) => {
      if (saveSeq[dialogId] !== seq) return
      console.error('Failed to save AI settings:', error)
      state.pending.delete(dialogId)
      emit()
      for (const l of errorListeners) l(dialogId)
    })
}

let state: MessengerAiSettingsState

function getState() {
  return state
}

function setByDialogId(next: Record<DialogId, AiPersonalitySettings>) {
  state = { ...state, byDialogId: next }
  emit()
}

function setPending(next: Set<DialogId>) {
  state = { ...state, pending: next }
  emit()
}

state = {
  byDialogId: {},
  pending: new Set(),

  getForDialog(dialogId, dialog) {
    const key = normalizeDialogId(dialogId)
    if (key && state.byDialogId[key]) return state.byDialogId[key]
    if (dialog?.aiSettings) return dialog.aiSettings
    return DEFAULT_AI_PERSONALITY
  },

  isPending(dialogId) {
    return state.pending.has(dialogId)
  },

  seedFromDialogs(dialogs) {
    let changed = false
    const next = { ...state.byDialogId }
    for (const dialog of dialogs) {
      const id = normalizeDialogId(dialog._id)
      if (!id || !dialog.aiSettings) continue
      if (state.pending.has(id) || next[id]) continue
      next[id] = dialog.aiSettings
      changed = true
    }
    if (changed) setByDialogId(next)
  },

  updateField(dialogId, key, level, fallback) {
    const previous =
      state.byDialogId[dialogId] ?? fallback ?? DEFAULT_AI_PERSONALITY
    const nextSettings = { ...previous, [key]: level }
    setByDialogId({ ...state.byDialogId, [dialogId]: nextSettings })

    const pending = new Set(state.pending)
    pending.add(dialogId)
    setPending(pending)

    scheduleSave(dialogId, nextSettings)
    return nextSettings
  },

  confirmFromServer(dialogId, settings) {
    const pending = new Set(state.pending)
    pending.delete(dialogId)
    setByDialogId({ ...state.byDialogId, [dialogId]: settings })
    setPending(pending)
  },

  flush(dialogId) {
    const timer = saveTimers[dialogId]
    if (timer) {
      clearTimeout(timer)
      delete saveTimers[dialogId]
    }
    const settings = state.byDialogId[dialogId]
    if (settings && state.pending.has(dialogId)) {
      persistToServer(dialogId, settings)
    }
  },

  flushAll() {
    for (const dialogId of Object.keys(saveTimers)) {
      state.flush(dialogId)
    }
  },
}

export function useMessengerAiSettingsStore<T>(
  selector: (s: MessengerAiSettingsState) => T
): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => selector(getState()),
    () => selector(getState())
  )
}

useMessengerAiSettingsStore.getState = getState

export function resolveDialogAiSettingsFromStore(
  dialogId: unknown,
  dialog?: Dialog | null
): AiPersonalitySettings {
  return getState().getForDialog(normalizeDialogId(dialogId), dialog)
}

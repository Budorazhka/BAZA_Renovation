import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'bz26.chats.aiGloballyEnabled'

function readInitial(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

let state = readInitial()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function getGlobalAiEnabled(): boolean {
  return state
}

export function setGlobalAiEnabled(enabled: boolean) {
  if (state === enabled) return
  state = enabled
  try {
    window.localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // приватный режим браузера / storage недоступен — состояние останется только в памяти
  }
  emit()
}

export function useGlobalAiEnabled(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getGlobalAiEnabled,
    () => true
  )
}

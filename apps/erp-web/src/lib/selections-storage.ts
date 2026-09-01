import type { Selection } from '@/types/selections'
import type { AgencySelectionCustomization } from '@/config/agency-selection-customization'

const STORAGE_KEY = 'agency-new.selections.extra'
/** Карта настроек кастомизации по id подборки — работает и для моков, и для extra. */
const CUSTOMIZATION_KEY = 'agency-new.selections.customization'

export function loadExtraSelections(): Selection[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as Selection[]) : []
  } catch {
    return []
  }
}

export function prependSelections(entries: Selection[]) {
  if (entries.length === 0) return
  try {
    const cur = loadExtraSelections()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...entries, ...cur]))
  } catch {
    /* ignore */
  }
}

type CustomizationMap = Record<string, AgencySelectionCustomization>

function loadCustomizationMap(): CustomizationMap {
  try {
    const raw = window.localStorage.getItem(CUSTOMIZATION_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as CustomizationMap) : {}
  } catch {
    return {}
  }
}

export function loadSelectionCustomization(id: string): AgencySelectionCustomization | undefined {
  return loadCustomizationMap()[id]
}

export function saveSelectionCustomization(id: string, customization: AgencySelectionCustomization) {
  try {
    const map = loadCustomizationMap()
    map[id] = customization
    window.localStorage.setItem(CUSTOMIZATION_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

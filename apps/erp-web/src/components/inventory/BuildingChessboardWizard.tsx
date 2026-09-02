import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FloorPlanModal } from '@/components/inventory/FloorPlanModal'
import { buildUnitNumber, buildingNamePrefix, formatPrice, getCurrencySymbol } from '@/lib/chessboard'
import {
  getPrimaryFinishPrice,
  resolveFinishTypesForEditing,
} from '@/lib/unit-finish-pricing'
import type { FloorPlan } from '@/store/useCoreStore'
import { useCoreStore } from '@/store/useCoreStore'
import type {
  BuildingFloorType,
  FinishType,
  FloorPurpose,
  FloorTemplateSlot,
  IBuilding,
  IUnit,
  NumberingRule,
  UnitFinishPrices,
} from '@/types/core'
import { useI18n } from "@/i18n";
import {
  COMMERCIAL_UNIT_TYPE_OPTIONS,
  OFFICE_UNIT_TYPE_OPTIONS,
  OTHER_UNIT_TYPE_OPTIONS,
  PARKING_UNIT_TYPE_OPTIONS,
  ROOM_TYPE_OPTIONS,
  TECHNICAL_UNIT_TYPE_OPTIONS,
  VIEW_TYPE_OPTIONS,
  normalizeOptionValue,
  normalizeRooms,
  normalizeViewType,
  optionLabel,
  type OptionGroup,
} from '@/lib/project-options'

// Канонические значения (английские слаги) из project-options; подписи — через i18n.
const RESIDENTIAL_ROOM_OPTIONS = ROOM_TYPE_OPTIONS
const COMMERCIAL_UNIT_OPTIONS = COMMERCIAL_UNIT_TYPE_OPTIONS
const OFFICE_UNIT_OPTIONS = OFFICE_UNIT_TYPE_OPTIONS
const TECHNICAL_UNIT_OPTIONS = TECHNICAL_UNIT_TYPE_OPTIONS
const PARKING_UNIT_OPTIONS = PARKING_UNIT_TYPE_OPTIONS
const OTHER_UNIT_OPTIONS = OTHER_UNIT_TYPE_OPTIONS
/** '' — вид не указан (в интерфейсе показывается как «—»). */
const VIEW_OPTIONS = ['', ...VIEW_TYPE_OPTIONS]
const TYPE_COLORS = ['#c9a84c', '#7cb9e8', '#90ee90', '#f4a261', '#e76f51', '#48cae4', '#f4d35e'] as const
const FLOOR_PURPOSE_OPTIONS: Array<{ value: FloorPurpose; label: string }> = [
  { value: 'residential', label: 'Жилое' },
  { value: 'commercial', label: 'Коммерция' },
  { value: 'penthouse', label: 'Пентхаусы' },
  { value: 'office', label: 'Офисы' },
  { value: 'technical', label: 'Технический' },
  { value: 'parking', label: 'Паркинг / кладовые' },
  { value: 'other', label: 'Другое' },
]

const INPUT =
  'h-9 rounded-md border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.3)] px-3 text-sm text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.3)] outline-none transition-colors focus:border-[rgba(242,207,141,0.5)]'
const SELECT =
  'h-9 rounded-md border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.3)] px-2 text-sm text-[#fcecc8] outline-none transition-colors focus:border-[rgba(242,207,141,0.5)]'
const LABEL = 'text-[11px] uppercase tracking-wide text-[rgba(242,207,141,0.5)]'

type Step = 1 | 2 | 3 | 4 | 5

interface FloorTypeDraft {
  id: string
  name: string
  purpose: FloorPurpose
  description: string
  rangeFrom: number
  rangeTo: number
  units: FloorTemplateSlot[]
  color: string
}

interface BuildingWizardDraft {
  id: string
  existingBuildingId?: string
  name: string
  buildingCode: string
  floors: string
  floorTypes: FloorTypeDraft[]
  numberingRule: NumberingRule
  prefixOverride: string
  skipUnit13: boolean
}

interface InferredFloorTypeAccumulator {
  from: number
  to: number
  slots: FloorTemplateSlot[]
  signature: string
}

interface DraftMetrics {
  totalFloors: number
  allFloors: number[]
  floorAssignments: Map<number, FloorTypeDraft[]>
  floorTypeMap: Map<number, FloorTypeDraft>
  uncoveredFloors: number[]
  overlappingFloors: number[]
  outOfBoundsTypes: FloorTypeDraft[]
  preview: {
    rows: PreviewRow[]
    totalArea: number
    totalValue: number
  }
  maxUnitsPerFloor: number
  typesValid: boolean
  rangesValid: boolean
}

interface PreviewRow {
  key: string
  number: string
  floor: number
  pos: number
  area?: number
  pricePerSqm?: number
  finishPrices?: UnitFinishPrices
  rooms?: string
  viewType?: string
  total?: number
  typeId: string
  typeName: string
  purpose: FloorPurpose
  color: string
}

interface Props {
  projectId: string
  buildings: IBuilding[]
  initialBuildingId?: string | null
  mode: 'create' | 'edit'
  currency?: string
  onClose: () => void
  onApplied?: (buildingId: string) => void
}

let typeCounter = 0
let draftBuildingCounter = 0

function genTypeId() {
  typeCounter += 1
  return `ft-${Date.now()}-${typeCounter}`
}

function genDraftBuildingId() {
  draftBuildingCounter += 1
  return `draft-building-${Date.now()}-${draftBuildingCounter}`
}

function defaultBuildingCode(index: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return alphabet[index] ?? `B${index + 1}`
}

function makeNewType(
  rangeFrom: number,
  rangeTo: number,
  name: string,
  color: string,
  description = '',
  purpose: FloorPurpose = 'residential',
): FloorTypeDraft {
  return {
    id: genTypeId(),
    name,
    purpose,
    description,
    rangeFrom,
    rangeTo,
    color,
    units: [
      { positionInFloor: 1, rooms: '1+1', area: undefined, pricePerSqm: undefined, viewType: undefined },
      { positionInFloor: 2, rooms: '2+1', area: undefined, pricePerSqm: undefined, viewType: undefined },
    ],
  }
}

function makeDefaultFloorType(totalFloors: number): FloorTypeDraft {
  return makeNewType(1, totalFloors, 'Типовой жилой этаж', TYPE_COLORS[0], 'Базовая жилая структура корпуса')
}

function floorTypeToDraft(type: BuildingFloorType, index: number): FloorTypeDraft {
  return {
    id: type.id || genTypeId(),
    name: type.name,
    purpose: type.purpose ?? 'residential',
    description: type.description ?? '',
    rangeFrom: type.rangeFrom,
    rangeTo: type.rangeTo,
    color: type.color ?? TYPE_COLORS[index % TYPE_COLORS.length],
    units:
      type.units.length > 0
        ? type.units.map((slot) => ({ ...slot }))
        : makeDefaultFloorType(Math.max(1, type.rangeTo)).units,
  }
}

function draftToFloorType(type: FloorTypeDraft): BuildingFloorType {
  return {
    id: type.id,
    name: type.name.trim(),
    purpose: type.purpose,
    ...(type.description.trim() ? { description: type.description.trim() } : {}),
    rangeFrom: type.rangeFrom,
    rangeTo: type.rangeTo,
    color: type.color,
    units: type.units.map((slot, index) => ({
      ...slot,
      positionInFloor: resolveSlotPosition(slot, index + 1),
    })),
  }
}

function resolveSlotPosition(slot: FloorTemplateSlot, fallbackPosition: number): number {
  return Number.isInteger(slot.positionInFloor) && (slot.positionInFloor ?? 0) > 0
    ? slot.positionInFloor!
    : fallbackPosition
}

function nextSlotPosition(units: FloorTemplateSlot[]): number {
  const used = units
    .map((unit, index) => unit.positionInFloor ?? index + 1)
    .filter((position): position is number => Number.isInteger(position) && position > 0)
  return used.length > 0 ? Math.max(...used) + 1 : 1
}

function hasUniqueSlotPositions(units: FloorTemplateSlot[]): boolean {
  const anyExplicit = units.some((s) => s.templateFloor != null)
  if (anyExplicit) {
    if (!units.every((s) => s.templateFloor != null && Number.isInteger(s.templateFloor) && (s.templateFloor ?? 0) > 0)) {
      return false
    }
    const keys = units.map((slot, index) => `${slot.templateFloor}:${resolveSlotPosition(slot, index + 1)}`)
    return new Set(keys).size === keys.length
  }
  const positions = units.map((slot, index) => resolveSlotPosition(slot, index + 1))
  return positions.every((position) => Number.isInteger(position) && position > 0) && new Set(positions).size === positions.length
}

function layoutSlotsByUnitsPerFloor(type: FloorTypeDraft, unitsPerFloor: number): FloorTemplateSlot[] {
  const step = Math.max(1, Math.min(50, Math.floor(unitsPerFloor)))
  const from = Math.max(1, type.rangeFrom)
  const to = Math.max(from, type.rangeTo)
  return type.units.map((slot, index) => ({
    ...slot,
    templateFloor: Math.min(from + Math.floor(index / step), to),
    positionInFloor: (index % step) + 1,
  }))
}

function getPurposeSlotOptions(purpose: FloorPurpose): readonly string[] {
  switch (purpose) {
    case 'commercial':
      return COMMERCIAL_UNIT_OPTIONS
    case 'office':
      return OFFICE_UNIT_OPTIONS
    case 'technical':
      return TECHNICAL_UNIT_OPTIONS
    case 'parking':
      return PARKING_UNIT_OPTIONS
    case 'other':
      return OTHER_UNIT_OPTIONS
    case 'penthouse':
    case 'residential':
    default:
      return RESIDENTIAL_ROOM_OPTIONS
  }
}

function getSlotFieldLabel(purpose: FloorPurpose): string {
  switch (purpose) {
    case 'commercial':
    case 'office':
    case 'technical':
    case 'parking':
    case 'other':
      return 'Тип помещения'
    case 'penthouse':
    case 'residential':
    default:
      return 'Комнатность'
  }
}

/** Группа i18n-подписей для значений слота данного назначения этажа. */
function getSlotOptionsGroup(purpose: FloorPurpose): OptionGroup {
  return purpose === 'residential' || purpose === 'penthouse' ? 'rooms' : 'unitTypes'
}

function normalizeUnitsForPurpose(units: FloorTemplateSlot[], purpose: FloorPurpose): FloorTemplateSlot[] {
  const options = getPurposeSlotOptions(purpose)
  const group = getSlotOptionsGroup(purpose)
  const fallback = options[0]
  return units.map((slot) => {
    // Слоты из сохранённых шаблонов могут содержать legacy-русские значения.
    const normalized = group === 'rooms'
      ? normalizeRooms(slot.rooms)
      : normalizeOptionValue('unitTypes', slot.rooms)
    if (normalized && options.includes(normalized)) {
      return normalized === slot.rooms ? slot : { ...slot, rooms: normalized }
    }
    return { ...slot, rooms: fallback }
  })
}

function findSuggestedRange(floorTypes: FloorTypeDraft[], totalFloors: number): { from: number; to: number } {
  const occupied = new Set<number>()
  for (const type of floorTypes) {
    const from = Math.max(1, type.rangeFrom)
    const to = Math.min(totalFloors, type.rangeTo)
    for (let floor = from; floor <= to; floor += 1) occupied.add(floor)
  }

  const firstFree = Array.from({ length: totalFloors }, (_, index) => index + 1).find((floor) => !occupied.has(floor))
  const from = firstFree ?? totalFloors
  let to = from
  while (to < totalFloors && to < from + 2 && !occupied.has(to + 1)) {
    to += 1
  }
  return { from, to }
}

function inferFloorTypesFromUnits(building: IBuilding, units: IUnit[]): FloorTypeDraft[] {
  const totalFloors = building.floors && building.floors > 0 ? building.floors : 0
  if (units.length === 0) {
    return [makeDefaultFloorType(totalFloors > 0 ? totalFloors : 17)]
  }

  const floors = totalFloors > 0
    ? Array.from({ length: totalFloors }, (_, index) => index + 1)
    : Array.from(new Set(units.map((unit) => unit.floor))).sort((a, b) => a - b)

  const signatures = floors.map((floor) => {
    const rawFloorUnits = units.filter((unit) => unit.floor === floor)

    // Дедупликация: если в базе уже скопились дубли по номеру или позиции, берем только уникальные
    const seenNumbers = new Set<string>()
    const seenPositions = new Set<number>()
    const floorUnits: IUnit[] = []

    for (const unit of rawFloorUnits) {
      const num = unit.number?.trim() || null
      const pos = typeof unit.positionInFloor === 'number' && unit.positionInFloor > 0 ? unit.positionInFloor : null
      if (num && seenNumbers.has(num)) continue
      if (pos !== null && seenPositions.has(pos)) continue
      if (num) seenNumbers.add(num)
      if (pos !== null) seenPositions.add(pos)
      floorUnits.push(unit)
    }

    const slots = floorUnits
      .sort((left, right) => (left.positionInFloor ?? 999) - (right.positionInFloor ?? 999))
      .map((unit, index) => ({
        positionInFloor: resolveSlotPosition(unit, index + 1),
        rooms: unit.rooms,
        area: unit.area,
        pricePerSqm: unit.pricePerSqm,
        finishPrices: unit.finishPrices,
        viewType: unit.viewType,
      }))

    if (slots.length === 0) return { floor, slots: null as FloorTemplateSlot[] | null, signature: null as string | null }
    const signature = JSON.stringify(
      slots.map((slot) => [
        slot.positionInFloor,
        slot.rooms ?? '',
        slot.area ?? null,
        slot.pricePerSqm ?? null,
        slot.finishPrices ?? null,
        slot.viewType ?? '',
      ]),
    )
    return { floor, slots, signature }
  })

  const result: FloorTypeDraft[] = []
  let current: InferredFloorTypeAccumulator | null = null

  signatures.forEach(({ floor, slots, signature }) => {
    if (!slots || !signature) {
      if (current) {
        result.push(
          makeNewType(
            current.from,
            current.to,
            current.from === current.to ? `Этаж ${current.from}` : `Этажи ${current.from}-${current.to}`,
            TYPE_COLORS[result.length % TYPE_COLORS.length],
          ),
        )
        result[result.length - 1].units = current.slots
        current = null
      }
      return
    }

    if (current && current.signature === signature && floor === current.to + 1) {
      current.to = floor
      return
    }

    if (current) {
      result.push(
        makeNewType(
          current.from,
          current.to,
          current.from === current.to ? `Этаж ${current.from}` : `Этажи ${current.from}-${current.to}`,
          TYPE_COLORS[result.length % TYPE_COLORS.length],
        ),
      )
      result[result.length - 1].units = current.slots
    }

    current = { from: floor, to: floor, slots, signature }
  })

  if (current) {
    const tail = current as InferredFloorTypeAccumulator
    result.push(
      makeNewType(
        tail.from,
        tail.to,
        tail.from === tail.to ? `Этаж ${tail.from}` : `Этажи ${tail.from}-${tail.to}`,
        TYPE_COLORS[result.length % TYPE_COLORS.length],
      ),
    )
    result[result.length - 1].units = tail.slots
  }

  return result.length > 0 ? result : [makeDefaultFloorType(totalFloors > 0 ? totalFloors : 17)]
}

function buildDraftFromBuilding(building: IBuilding, units: IUnit[], index: number): BuildingWizardDraft {
  const initialFloors = building.floors && building.floors > 0 ? building.floors : 17
  const floorTypes =
    building.floorTypes && building.floorTypes.length > 0
      ? building.floorTypes.map(floorTypeToDraft)
      : inferFloorTypesFromUnits(building, units)

  return {
    id: building._id,
    existingBuildingId: building._id,
    name: building.name?.trim() || `Корпус ${index + 1}`,
    buildingCode: building.buildingCode?.trim() || '',
    floors: String(initialFloors),
    floorTypes,
    numberingRule: 'floor-position',
    prefixOverride: '',
    skipUnit13: false,
  }
}

function createBuildingDraft(index: number, floors = 17): BuildingWizardDraft {
  return {
    id: genDraftBuildingId(),
    name: `Корпус ${index + 1}`,
    buildingCode: defaultBuildingCode(index),
    floors: String(floors),
    floorTypes: [makeDefaultFloorType(floors)],
    numberingRule: 'floor-position',
    prefixOverride: '',
    skipUnit13: false,
  }
}

function getDraftMetrics(draft: BuildingWizardDraft): DraftMetrics {
  const totalFloors = Math.max(1, parseInt(draft.floors, 10) || 0)
  const allFloors = Array.from({ length: totalFloors }, (_, index) => index + 1)

  const floorAssignments = new Map<number, FloorTypeDraft[]>()
  allFloors.forEach((floor) => floorAssignments.set(floor, []))
  draft.floorTypes.forEach((type) => {
    const from = Math.max(1, type.rangeFrom)
    const to = Math.min(totalFloors, type.rangeTo)
    for (let floor = from; floor <= to; floor += 1) {
      floorAssignments.get(floor)?.push(type)
    }
  })

  const floorTypeMap = new Map<number, FloorTypeDraft>()
  allFloors.forEach((floor) => {
    const assigned = floorAssignments.get(floor) ?? []
    if (assigned.length === 1) floorTypeMap.set(floor, assigned[0])
  })

  const uncoveredFloors = allFloors.filter((floor) => (floorAssignments.get(floor)?.length ?? 0) === 0)
  const overlappingFloors = allFloors.filter((floor) => (floorAssignments.get(floor)?.length ?? 0) > 1)
  const outOfBoundsTypes = draft.floorTypes.filter(
    (type) =>
      type.rangeFrom < 1 ||
      type.rangeFrom > totalFloors ||
      type.rangeTo < type.rangeFrom ||
      type.rangeTo > totalFloors,
  )

  const prefixBase = draft.prefixOverride.trim() || draft.buildingCode.trim() || buildingNamePrefix(draft.name)
  const prefix = prefixBase.toUpperCase()

  const rows: PreviewRow[] = []
  let totalArea = 0
  let totalValue = 0
  let seq = 0

  allFloors.forEach((floor) => {
    const type = floorTypeMap.get(floor)
    if (!type) return
    const anyTf = type.units.some((s) => s.templateFloor != null)
    const allTf =
      type.units.length > 0 &&
      type.units.every((s) => s.templateFloor != null && Number.isInteger(s.templateFloor) && (s.templateFloor ?? 0) > 0)
    const explicitFloors = allTf
    let fallbackPos = 0
    type.units.forEach((slot) => {
      if (anyTf && !allTf && slot.templateFloor != null) return
      if (explicitFloors) {
        if (slot.templateFloor !== floor) return
      }
      fallbackPos += 1
      if (draft.skipUnit13 && fallbackPos === 13) fallbackPos += 1
      seq += 1
      const pos = resolveSlotPosition(slot, fallbackPos)
      const effectivePricePerSqm = slot.pricePerSqm ?? getPrimaryFinishPrice(slot.finishPrices)
      const total =
        typeof effectivePricePerSqm === 'number' && typeof slot.area === 'number'
          ? Math.round(effectivePricePerSqm * slot.area)
          : undefined

      rows.push({
        key: `${draft.id}-${floor}-${pos}`,
        number: draft.numberingRule === 'sequential' ? `${prefix}-${seq}` : buildUnitNumber(prefix, floor, pos),
        floor,
        pos,
        rooms: slot.rooms,
        area: slot.area,
        pricePerSqm: slot.pricePerSqm,
        finishPrices: slot.finishPrices,
        viewType: slot.viewType,
        total,
        typeId: type.id,
        typeName: type.name.trim(),
        purpose: type.purpose,
        color: type.color,
      })

      if (typeof slot.area === 'number') totalArea += slot.area
      if (typeof total === 'number') totalValue += total
    })
  })

  const perFloorCounts = new Map<number, number>()
  for (const row of rows) {
    perFloorCounts.set(row.floor, (perFloorCounts.get(row.floor) ?? 0) + 1)
  }
  const maxFromPreview = perFloorCounts.size > 0 ? Math.max(...perFloorCounts.values()) : 1
  const maxFromTemplates = Math.max(1, ...draft.floorTypes.map((type) => type.units.length))

  const typesValid =
    draft.floorTypes.length > 0 &&
    draft.floorTypes.every(
      (type) =>
        type.name.trim().length > 0 &&
        type.units.length > 0 &&
        type.units.every((slot) => typeof slot.area === 'number' && slot.area > 0 && (slot.rooms ?? '').length > 0) &&
        hasUniqueSlotPositions(type.units),
    )

  return {
    totalFloors,
    allFloors,
    floorAssignments,
    floorTypeMap,
    uncoveredFloors,
    overlappingFloors,
    outOfBoundsTypes,
    preview: { rows, totalArea, totalValue },
    maxUnitsPerFloor: Math.max(maxFromPreview, maxFromTemplates),
    typesValid,
    rangesValid: outOfBoundsTypes.length === 0 && overlappingFloors.length === 0,
  }
}

function getFloorTypeValidationIssues(type: FloorTypeDraft): string[] {
  const issues: string[] = []

  if (!type.name.trim()) issues.push('нет названия типа')

  const missingRooms = type.units.some((slot) => !(slot.rooms ?? '').trim())
  const missingArea = type.units.some((slot) => typeof slot.area !== 'number' || slot.area <= 0)
  const duplicatePositions = !hasUniqueSlotPositions(type.units)
  const anyFloor = type.units.some((s) => s.templateFloor != null)
  const mixedFloors = anyFloor && !type.units.every((s) => s.templateFloor != null)
  const floorOutOfRange =
    anyFloor &&
    type.units.some(
      (s) =>
        s.templateFloor != null &&
        (s.templateFloor < type.rangeFrom || s.templateFloor > type.rangeTo),
    )

  if (type.units.length === 0) issues.push('нет помещений')
  if (missingRooms) issues.push('не выбран тип помещения')
  if (missingArea) issues.push('не заполнена площадь')
  if (mixedFloors) {
    issues.push('столбец «Этаж» заполнен только в части строк — нажмите «Сбросить этажи» или укажите этаж во всех строках')
  } else if (duplicatePositions) {
    issues.push('повторяются значения в столбце «Поз.»')
  }
  if (floorOutOfRange) issues.push('значение в столбце «Этаж» вне диапазона типа (с этажа — по этаж)')

  return issues
}

function getDraftStep2Issues(draft: BuildingWizardDraft, metrics: DraftMetrics): string[] {
  const issues: string[] = []

  if (metrics.outOfBoundsTypes.length > 0) {
    issues.push('есть диапазоны вне этажности корпуса')
  }

  if (metrics.overlappingFloors.length > 0) {
    issues.push(`этажи назначены нескольким типам: ${metrics.overlappingFloors.join(', ')}`)
  }

  draft.floorTypes.forEach((type) => {
    const typeIssues = getFloorTypeValidationIssues(type)
    if (typeIssues.length > 0) {
      issues.push(`${type.name || 'Без имени'}: ${typeIssues.join(', ')}`)
    }
  })

  return issues
}

function getStep2BlockReason(drafts: BuildingWizardDraft[], metricsByDraft: Map<string, DraftMetrics>): string | undefined {
  const reasons: string[] = []
  drafts.forEach((draft, index) => {
    const label = draft.name.trim() || `Корпус ${index + 1}`
    const metrics = metricsByDraft.get(draft.id)
    if (!metrics) {
      reasons.push(`${label}: данные корпуса еще не рассчитаны`)
      return
    }

    const issues = getDraftStep2Issues(draft, metrics)
    if (issues.length > 0) reasons.push(`${label}: ${issues[0]}`)
  })

  return reasons.length > 0 ? reasons.join('; ') : undefined
}

function describeApplyError(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { message?: string } } })?.response
  const status = response?.status
  const serverMessage = response?.data?.message
  if (status === 401 || status === 403) {
    return `Сервер отклонил сохранение (${status}). Нет прав на изменение этого ЖК — войдите заново и проверьте, что у аккаунта есть доступ к девелопменту, а ЖК создан на сервере (а не демо-данные).`
  }
  if (status === 404) {
    return 'ЖК не найден на сервере (404) — похоже, открыты демо-данные. Создайте или выберите реальный ЖК.'
  }
  if (status) {
    return `Сервер вернул ошибку ${status}${serverMessage ? `: ${serverMessage}` : ''}.`
  }
  const message = error instanceof Error ? error.message : ''
  if (message.includes('Network') || message.includes('timeout')) {
    return 'Сервер недоступен. Проверьте подключение и попробуйте снова.'
  }
  return message || 'Не удалось сохранить шахматку. Попробуйте снова.'
}

const DRAFT_STORAGE_PREFIX = 'chessboard.wizard.draft.'

interface WizardDraftSnapshot {
  version: 1
  savedAt: number
  step: Step
  activeBuildingDraftId: string
  buildingDrafts: BuildingWizardDraft[]
}

function draftStorageKey(projectId: string): string | null {
  return projectId ? `${DRAFT_STORAGE_PREFIX}${projectId}` : null
}

function readWizardDraft(projectId: string): WizardDraftSnapshot | null {
  const key = draftStorageKey(projectId)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WizardDraftSnapshot
    if (parsed?.version !== 1 || !Array.isArray(parsed.buildingDrafts) || parsed.buildingDrafts.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function writeWizardDraft(projectId: string, snapshot: WizardDraftSnapshot): void {
  const key = draftStorageKey(projectId)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(snapshot))
  } catch {
    // переполнение квоты или ошибка сериализации — черновик просто не сохранится
  }
}

function clearWizardDraft(projectId: string): void {
  const key = draftStorageKey(projectId)
  if (!key) return
  try {
    localStorage.removeItem(key)
  } catch {
    // нечего чистить
  }
}

function formatDraftSavedAt(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function BuildingChessboardWizard({
  projectId,
  buildings,
  initialBuildingId,
  mode,
  currency,
  onClose,
  onApplied,
}: Props) {
    const { t } = useI18n();
  const allUnits = useCoreStore((s) => s.allUnits)
  const projects = useCoreStore((s) => s.projects)
  const floorPlans = useCoreStore((s) => s.floorPlans)
  const addBuilding = useCoreStore((s) => s.addBuilding)
  const updateBuilding = useCoreStore((s) => s.updateBuilding)
  const deleteBuilding = useCoreStore((s) => s.deleteBuilding)
  const replaceBuildingUnits = useCoreStore((s) => s.replaceBuildingUnits)
  const fetchUnits = useCoreStore((s) => s.fetchUnits)

  useEffect(() => {
    buildings.forEach((b) => {
      if (b._id && !allUnits.some((u) => u.building === b._id)) {
        void fetchUnits(b._id)
      }
    })
  }, [buildings, allUnits, fetchUnits])
  const project = projects.find((candidate) => candidate._id === projectId)
  const projectCurrency = currency || project?.currency || 'USD'
  const projectFinishTypes = useMemo(
    () => {
      const buildingIds = new Set(buildings.map((building) => building._id))
      const existingPrices = Object.assign(
        {},
        ...allUnits
          .filter((unit) => buildingIds.has(unit.building))
          .map((unit) => unit.finishPrices ?? {}),
      )
      return resolveFinishTypesForEditing(project?.finishTypes, existingPrices)
    },
    [allUnits, buildings, project?.finishTypes],
  )

  const initialDrafts = useMemo(
    () =>
      buildings.length > 0
        ? buildings.map((building, index) =>
            buildDraftFromBuilding(
              building,
              allUnits.filter((unit) => unit.building === building._id),
              index,
            ),
          )
        : [createBuildingDraft(0)],
    [allUnits, buildings],
  )

  const [restoredDraft, setRestoredDraft] = useState<WizardDraftSnapshot | null>(() => readWizardDraft(projectId))
  const [step, setStep] = useState<Step>(() => restoredDraft?.step ?? 1)
  const [buildingDrafts, setBuildingDrafts] = useState<BuildingWizardDraft[]>(
    () => restoredDraft?.buildingDrafts ?? initialDrafts,
  )
  const [activeBuildingDraftId, setActiveBuildingDraftId] = useState<string>(
    () => restoredDraft?.activeBuildingDraftId ?? initialBuildingId ?? initialDrafts[0]?.id ?? '',
  )
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(restoredDraft?.savedAt ?? null)
  const [floorPlanModal, setFloorPlanModal] = useState<{ buildingId: string; floor: number; title: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  useEffect(() => {
    if (!buildingDrafts.some((draft) => draft.id === activeBuildingDraftId)) {
      setActiveBuildingDraftId(buildingDrafts[0]?.id ?? '')
    }
  }, [activeBuildingDraftId, buildingDrafts])

  const draftMetrics = useMemo(() => {
    const map = new Map<string, DraftMetrics>()
    buildingDrafts.forEach((draft) => {
      map.set(draft.id, getDraftMetrics(draft))
    })
    return map
  }, [buildingDrafts])

  const activeDraft = useMemo(
    () => buildingDrafts.find((draft) => draft.id === activeBuildingDraftId) ?? null,
    [activeBuildingDraftId, buildingDrafts],
  )
  const activeMetrics = activeDraft ? draftMetrics.get(activeDraft.id) ?? null : null

  const step1Valid = buildingDrafts.length > 0 && buildingDrafts.every((draft) => draft.name.trim().length > 0 && (parseInt(draft.floors, 10) || 0) > 0)
  const step2Valid = buildingDrafts.every((draft) => {
    const metrics = draftMetrics.get(draft.id)
    return Boolean(metrics?.typesValid && metrics.rangesValid)
  })
  const step2BlockReason = step2Valid ? undefined : getStep2BlockReason(buildingDrafts, draftMetrics)
  const canApply = step1Valid && step2Valid

  const totalPreviewRows = useMemo(
    () => Array.from(draftMetrics.values()).reduce((sum, metrics) => sum + metrics.preview.rows.length, 0),
    [draftMetrics],
  )

  function updateBuildingDraft(draftId: string, patch: Partial<BuildingWizardDraft>) {
    setBuildingDrafts((prev) =>
      prev.map((draft) => {
        if (draft.id !== draftId) return draft
        const next = { ...draft, ...patch }
        if (patch.floors != null) {
          const previousFloors = Math.max(1, parseInt(draft.floors, 10) || 0)
          const nextFloors = Math.max(1, parseInt(patch.floors, 10) || 0)
          if (
            next.floorTypes.length === 1 &&
            next.floorTypes[0].rangeFrom === 1 &&
            next.floorTypes[0].rangeTo === previousFloors
          ) {
            next.floorTypes = [{ ...next.floorTypes[0], rangeTo: nextFloors }]
          }
        }
        return next
      }),
    )
  }

  function setBuildingCount(count: number) {
    const safe = Math.max(1, Math.min(20, count))
    setBuildingDrafts((prev) => {
      if (safe === prev.length) return prev
      if (safe < prev.length) return prev.slice(0, safe)
      const next = [...prev]
      while (next.length < safe) next.push(createBuildingDraft(next.length))
      return next
    })
  }

  function removeBuildingDraft(draftId: string) {
    setBuildingDrafts((prev) => prev.filter((draft) => draft.id !== draftId))
  }

  function addFloorType() {
    if (!activeDraft || !activeMetrics) return
    const used = activeDraft.floorTypes.length
    const suggested = findSuggestedRange(activeDraft.floorTypes, activeMetrics.totalFloors)
    const letter = String.fromCharCode(65 + used)
    const nextType = makeNewType(suggested.from, suggested.to, `Тип ${letter}`, TYPE_COLORS[used % TYPE_COLORS.length])
    updateBuildingDraft(activeDraft.id, { floorTypes: [...activeDraft.floorTypes, nextType] })
  }

  function updateFloorType(typeId: string, patch: Partial<FloorTypeDraft>) {
    if (!activeDraft) return
    updateBuildingDraft(activeDraft.id, {
      floorTypes: activeDraft.floorTypes.map((type) => (type.id === typeId ? { ...type, ...patch } : type)),
    })
  }

  function removeFloorType(typeId: string) {
    if (!activeDraft || activeDraft.floorTypes.length <= 1) return
    updateBuildingDraft(activeDraft.id, {
      floorTypes: activeDraft.floorTypes.filter((type) => type.id !== typeId),
    })
  }

  function updateFloorTypeUnit(typeId: string, index: number, patch: Partial<FloorTemplateSlot>) {
    if (!activeDraft) return
    updateBuildingDraft(activeDraft.id, {
      floorTypes: activeDraft.floorTypes.map((type) =>
        type.id === typeId
          ? { ...type, units: type.units.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)) }
          : type,
      ),
    })
  }

  function setFloorTypeUnitsCount(typeId: string, count: number) {
    if (!activeDraft) return
    updateBuildingDraft(activeDraft.id, {
      floorTypes: activeDraft.floorTypes.map((type) => {
        if (type.id !== typeId) return type
        const safe = Math.max(1, Math.min(50, count))
        if (safe === type.units.length) return type
        if (safe < type.units.length) return { ...type, units: type.units.slice(0, safe) }
        const startPosition = nextSlotPosition(type.units)
        return {
          ...type,
          units: [
            ...type.units,
            ...Array.from({ length: safe - type.units.length }, (_, index) => ({
              positionInFloor: startPosition + index,
              rooms: '1+1' as string,
              area: undefined,
              pricePerSqm: undefined,
              viewType: undefined,
            })),
          ],
        }
      }),
    })
  }

  function addFloorTypeUnit(typeId: string) {
    if (!activeDraft) return
    updateBuildingDraft(activeDraft.id, {
      floorTypes: activeDraft.floorTypes.map((type) =>
        type.id === typeId
          ? {
              ...type,
              units: [
                ...type.units,
                {
                  positionInFloor: nextSlotPosition(type.units),
                  rooms: '1+1',
                  area: undefined,
                  pricePerSqm: undefined,
                  viewType: undefined,
                },
              ],
            }
          : type,
      ),
    })
  }

  function removeFloorTypeUnit(typeId: string, index: number) {
    if (!activeDraft) return
    updateBuildingDraft(activeDraft.id, {
      floorTypes: activeDraft.floorTypes.map((type) =>
        type.id === typeId ? { ...type, units: type.units.filter((_, unitIndex) => unitIndex !== index) } : type,
      ),
    })
  }

  function saveDraft() {
    if (!projectId) return
    const savedAt = Date.now()
    writeWizardDraft(projectId, {
      version: 1,
      savedAt,
      step,
      activeBuildingDraftId,
      buildingDrafts,
    })
    setDraftSavedAt(savedAt)
    setRestoredDraft(null)
  }

  function discardRestoredDraft() {
    clearWizardDraft(projectId)
    setRestoredDraft(null)
    setDraftSavedAt(null)
    setBuildingDrafts(initialDrafts)
    setActiveBuildingDraftId(initialBuildingId ?? initialDrafts[0]?.id ?? '')
    setStep(1)
  }

  async function apply() {
    if (!canApply || saving) return

    setSaving(true)
    setApplyError(null)
    try {
      if (!projectId) {
        throw new Error('Не выбран ЖК (projectId) — невозможно сохранить корпуса')
      }

      const existingIds = new Set(buildings.map((building) => building._id))
      const usedExistingIds = new Set<string>()
      let preferredBuildingId = activeDraft?.existingBuildingId ?? ''

      for (const draft of buildingDrafts) {
        const metrics = draftMetrics.get(draft.id)
        if (!metrics) continue

        const payload = {
          name: draft.name.trim(),
          ...(draft.buildingCode.trim() ? { buildingCode: draft.buildingCode.trim().toUpperCase() } : { buildingCode: undefined }),
          floors: metrics.totalFloors,
          unitsPerFloor: metrics.maxUnitsPerFloor,
          floorTypes: draft.floorTypes.map(draftToFloorType),
        }

        let buildingId = draft.existingBuildingId
        if (buildingId) {
          usedExistingIds.add(buildingId)
          await updateBuilding(buildingId, payload)
        } else {
          buildingId = await addBuilding(projectId, payload)
        }

        if (!buildingId) {
          throw new Error(`Корпус «${draft.name.trim() || 'без названия'}» не создан — сервер не вернул id`)
        }

        await replaceBuildingUnits(
          buildingId,
          metrics.preview.rows.map((row) => ({
            floor: row.floor,
            positionInFloor: row.pos,
            number: row.number,
            currency: projectCurrency,
            rooms: row.rooms,
            area: row.area,
            pricePerSqm: row.pricePerSqm,
            finishPrices: row.finishPrices,
            price: row.total,
            ...(row.viewType ? { viewType: row.viewType } : {}),
            customFields: {
              usagePurpose: row.purpose,
              usagePurposeLabel: FLOOR_PURPOSE_OPTIONS.find((option) => option.value === row.purpose)?.label ?? row.purpose,
              floorTypeName: row.typeName,
            },
            status: 'free' as const,
          })),
        )

        if (draft.id === activeBuildingDraftId) preferredBuildingId = buildingId
      }

      Array.from(existingIds)
        .filter((buildingId) => !usedExistingIds.has(buildingId))
        .forEach((buildingId) => deleteBuilding(buildingId))

      clearWizardDraft(projectId)
      onApplied?.(preferredBuildingId || buildingDrafts[0]?.existingBuildingId || buildings[0]?._id || '')
      onClose()
    } catch (error) {
      console.error('Не удалось сохранить шахматку:', error)
      setApplyError(describeApplyError(error))
    } finally {
      setSaving(false)
    }
  }

  const title = mode === 'edit'
    ? t('inventory.buildingChessboardWizard.редактирование_шахматки')
    : t('inventory.buildingChessboardWizard.создание_шахматки')

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[rgba(242,207,141,0.2)] bg-[#0e1a12] shadow-[0_32px_120px_rgba(0,0,0,0.62)]">
          <header className="flex items-center justify-between border-b border-[rgba(242,207,141,0.15)] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-[rgba(201,168,76,0.12)]">
                {mode === 'edit' ? <Pencil size={16} className="text-[#c9a84c]" /> : <Wand2 size={16} className="text-[#c9a84c]" />}
              </div>
              <div>
                <h2 className="text-sm font-normal text-[#fcecc8]">{title}</h2>
                <p className="text-xs text-[rgba(242,207,141,0.5)]">
                  {mode === 'edit'
                    ? t('inventory.buildingChessboardWizard.вы_редактируете_черновик')
                    : t('inventory.buildingChessboardWizard.настройте_корпуса')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[rgba(242,207,141,0.5)] transition-colors hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]"
            >
              <X size={16} />
            </button>
          </header>

          <StepIndicator step={step} />

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {step >= 2 && buildingDrafts.length > 1 ? (
              <BuildingTabs
                drafts={buildingDrafts}
                metrics={draftMetrics}
                activeId={activeBuildingDraftId}
                onSelect={setActiveBuildingDraftId}
              />
            ) : null}

            {step === 1 ? (
              <Step1
                drafts={buildingDrafts}
                onCountChange={setBuildingCount}
                onDraftChange={updateBuildingDraft}
                onRemoveDraft={removeBuildingDraft}
              />
            ) : null}

            {step === 2 && activeDraft && activeMetrics ? (
              <Step2
                draft={activeDraft}
                metrics={activeMetrics}
                currency={projectCurrency}
                addFloorType={addFloorType}
                updateFloorType={updateFloorType}
                removeFloorType={removeFloorType}
                updateUnit={updateFloorTypeUnit}
                addUnitToType={addFloorTypeUnit}
                removeUnitFromType={removeFloorTypeUnit}
                setUnitsCount={setFloorTypeUnitsCount}
                finishTypes={projectFinishTypes}
              />
            ) : null}

            {step === 3 && activeDraft && activeMetrics ? (
              <Step3
                draft={activeDraft}
                previewNumbers={activeMetrics.preview.rows.slice(0, 12).map((row) => row.number)}
                onChange={(patch) => updateBuildingDraft(activeDraft.id, patch)}
              />
            ) : null}

            {step === 4 && activeDraft && activeMetrics ? (
              <Step4
                draft={activeDraft}
                metrics={activeMetrics}
                floorPlans={floorPlans}
                onOpenFloorPlan={(floor) => {
                  if (!activeDraft.existingBuildingId) return
                  setFloorPlanModal({
                    buildingId: activeDraft.existingBuildingId,
                    floor,
                    title: `${activeDraft.name} · поэтажный план`,
                  })
                }}
              />
            ) : null}

            {step === 5 ? (
              <Step5 drafts={buildingDrafts} metrics={draftMetrics} currency={projectCurrency} />
            ) : null}
          </div>

          {applyError ? (
            <div className="border-t border-[rgba(255,180,171,0.3)] bg-[rgba(255,180,171,0.08)] px-6 py-3 text-[16px] text-[#ffb4ab]">
              {applyError}
            </div>
          ) : null}

          {step === 2 && step2BlockReason ? (
            <div className="flex items-start gap-2 border-t border-amber-400/40 bg-amber-500/10 px-6 py-3 text-[16px] text-amber-200">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                {t('inventory.buildingChessboardWizard.чтобы_продолжить_исп')}{step2BlockReason}
              </div>
            </div>
          ) : null}

          {restoredDraft ? (
            <div className="flex items-center justify-between gap-3 border-t border-[rgba(242,207,141,0.25)] bg-[rgba(242,207,141,0.08)] px-6 py-3 text-[16px] text-[#fcecc8]">
              <span>
                {t('inventory.buildingChessboardWizard.открыт_сохран_нный_ч')}{formatDraftSavedAt(restoredDraft.savedAt)}{t('inventory.buildingChessboardWizard.продолжите_заполнен')}</span>
              <Button
                type="button"
                variant="outline"
                onClick={discardRestoredDraft}
                className="shrink-0 border-[rgba(242,207,141,0.3)] bg-transparent text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)]"
              >
                <RotateCcw size={14} />
                {t('inventory.buildingChessboardWizard.начать_заново')}</Button>
            </div>
          ) : draftSavedAt ? (
            <div className="flex items-center gap-2 border-t border-[rgba(208,232,223,0.2)] bg-[rgba(208,232,223,0.06)] px-6 py-2.5 text-[16px] text-[#d0e8df]">
              <Check size={16} className="shrink-0" />
              {t('inventory.buildingChessboardWizard.черновик_сохран_н')}{formatDraftSavedAt(draftSavedAt)}
            </div>
          ) : null}

          <footer className="flex items-center justify-between border-t border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.15)] px-6 py-4">
            <div className="flex items-center gap-3 text-[11px] text-[rgba(242,207,141,0.5)]">
              <span>
                {t('inventory.buildingChessboardWizard.корпусов')}<b className="text-[#fcecc8]">{buildingDrafts.length}</b>
              </span>
              <span>
                {t('inventory.buildingChessboardWizard.лотов_в_превью')}<b className="text-[#fcecc8]">{totalPreviewRows}</b>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={saveDraft}
                disabled={!projectId}
                title={!projectId ? 'Сохранение черновика недоступно для демо-данных' : undefined}
                className="border-[rgba(242,207,141,0.3)] bg-transparent text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={14} />
                {t('inventory.buildingChessboardWizard.сохранить_черновик')}</Button>
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((current) => (current > 1 ? ((current - 1) as Step) : current))}
                  className="border-[rgba(242,207,141,0.3)] bg-transparent text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)]"
                >
                  <ArrowLeft size={14} />
                  {t('inventory.buildingChessboardWizard.назад')}</Button>
              ) : null}
              {step < 5 ? (
                <Button
                  type="button"
                  onClick={() => setStep((current) => (current < 5 ? ((current + 1) as Step) : current))}
                  disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
                  title={step === 2 && step2BlockReason ? step2BlockReason : undefined}
                  className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('inventory.buildingChessboardWizard.далее')}<ArrowRight size={14} />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={apply}
                  disabled={!canApply || saving}
                  className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wand2 size={14} />
                  {saving ? 'Сохранение…' : 'Сохранить шахматку'}
                </Button>
              )}
            </div>
          </footer>
        </div>
      </div>

      {floorPlanModal ? (
        <FloorPlanModal
          buildingId={floorPlanModal.buildingId}
          floor={floorPlanModal.floor}
          title={floorPlanModal.title}
          onClose={() => setFloorPlanModal(null)}
        />
      ) : null}
    </>
  )
}

function StepIndicator({ step }: { step: Step }) {
  const { t } = useI18n()
  const items: Array<[Step, string]> = [
    [1, t('inventory.buildingChessboardWizard.шаг_корпуса')],
    [2, t('inventory.buildingChessboardWizard.шаг_типы_этажей')],
    [3, t('inventory.buildingChessboardWizard.шаг_нумерация')],
    [4, t('inventory.buildingChessboardWizard.шаг_поэтажки')],
    [5, t('inventory.buildingChessboardWizard.шаг_превью')],
  ]

  return (
    <div className="flex items-center gap-2 border-b border-[rgba(242,207,141,0.1)] bg-[rgba(0,0,0,0.18)] px-6 py-3">
      {items.map(([number, label], index) => {
        const active = step === number
        const done = step > number
        return (
          <div key={number} className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-normal transition-colors ${
                done
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : active
                    ? 'bg-[#c9a84c] text-[#0a1f12]'
                    : 'bg-[rgba(242,207,141,0.1)] text-[rgba(242,207,141,0.5)]'
              }`}
            >
              {done ? <Check size={12} /> : number}
            </div>
            <span
              className={`text-[11px] font-medium ${
                active ? 'text-[#fcecc8]' : done ? 'text-[rgba(242,207,141,0.7)]' : 'text-[rgba(242,207,141,0.45)]'
              }`}
            >
              {label}
            </span>
            {index < items.length - 1 ? <div className="h-px w-6 bg-[rgba(242,207,141,0.15)]" /> : null}
          </div>
        )
      })}
    </div>
  )
}

function BuildingTabs({
  drafts,
  metrics,
  activeId,
  onSelect,
}: {
  drafts: BuildingWizardDraft[]
  metrics: Map<string, DraftMetrics>
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {drafts.map((draft, index) => {
        const draftMetrics = metrics.get(draft.id)
        const hasIssues = Boolean(
          draftMetrics && (!draftMetrics.typesValid || !draftMetrics.rangesValid || draftMetrics.uncoveredFloors.length > 0),
        )
        return (
          <button
            key={draft.id}
            type="button"
            onClick={() => onSelect(draft.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
              draft.id === activeId
                ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.12)] text-[#fcecc8]'
                : 'border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.2)] text-[rgba(242,207,141,0.75)] hover:border-[rgba(242,207,141,0.35)] hover:text-[#fcecc8]'
            }`}
          >
            <Building2 size={12} />
            {draft.name || `Корпус ${index + 1}`}
            {hasIssues ? <AlertTriangle size={11} className="text-amber-300" /> : null}
          </button>
        )
      })}
    </div>
  )
}

function Step1({
  drafts,
  onCountChange,
  onDraftChange,
  onRemoveDraft,
}: {
  drafts: BuildingWizardDraft[]
  onCountChange: (count: number) => void
  onDraftChange: (id: string, patch: Partial<BuildingWizardDraft>) => void
  onRemoveDraft: (id: string) => void
}) {
    const { t } = useI18n();
  const [countInput, setCountInput] = useState(() => String(drafts.length))

  useEffect(() => {
    setCountInput(String(drafts.length))
  }, [drafts.length])

  function commitCount() {
    const next = parseInt(countInput, 10)
    if (Number.isFinite(next) && next >= 1) {
      onCountChange(next)
    } else {
      setCountInput(String(drafts.length))
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1 text-sm font-normal text-[#fcecc8]">{t('inventory.buildingChessboardWizard.корпуса_в_жк')}</h3>
        <p className="text-xs text-[rgba(242,207,141,0.55)]">
          {t('inventory.buildingChessboardWizard.сначала_задайте_коли')}</p>
      </div>

      <label className="flex max-w-[220px] flex-col gap-1.5">
        <span className={LABEL}>{t('inventory.buildingChessboardWizard.количество_корпусов')}</span>
        <input
          type="number"
          min={1}
          max={20}
          value={countInput}
          onChange={(event) => setCountInput(event.target.value.replace(/^0+(?=\d)/, ''))}
          onBlur={commitCount}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          className={INPUT}
        />
      </label>

      <div className="space-y-3">
        {drafts.map((draft, index) => (
          <div
            key={draft.id}
            className="grid grid-cols-[minmax(0,1fr)_140px_120px_44px] items-end gap-3 rounded-xl border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.22)] p-4"
          >
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t('inventory.buildingChessboardWizard.название_номер_корпу')}</span>
              <input
                value={draft.name}
                onChange={(event) => onDraftChange(draft.id, { name: event.target.value })}
                className={INPUT}
                placeholder={`Корпус ${index + 1}`}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t('inventory.buildingChessboardWizard.буквенный_индекс')}</span>
              <input
                value={draft.buildingCode}
                onChange={(event) => onDraftChange(draft.id, { buildingCode: event.target.value.toUpperCase() })}
                className={INPUT}
                placeholder="A"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t('inventory.buildingChessboardWizard.этажей')}</span>
              <input
                type="number"
                min={1}
                value={draft.floors}
                onChange={(event) => onDraftChange(draft.id, { floors: event.target.value })}
                className={INPUT}
                placeholder="17"
              />
            </label>
            <button
              type="button"
              onClick={() => onRemoveDraft(draft.id)}
              disabled={drafts.length <= 1}
              className="inline-flex h-9 items-center justify-center rounded-md border border-rose-400/30 text-rose-300 transition-colors hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-30"
              title={t('inventory.buildingChessboardWizard.удалить_корпус')}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Step2({
  draft,
  metrics,
  currency = 'USD',
  addFloorType,
  updateFloorType,
  removeFloorType,
  updateUnit,
  addUnitToType,
  removeUnitFromType,
  setUnitsCount,
  finishTypes,
}: {
  draft: BuildingWizardDraft
  metrics: DraftMetrics
  currency?: string
  addFloorType: () => void
  updateFloorType: (typeId: string, patch: Partial<FloorTypeDraft>) => void
  removeFloorType: (typeId: string) => void
  updateUnit: (typeId: string, index: number, patch: Partial<FloorTemplateSlot>) => void
  addUnitToType: (typeId: string) => void
  removeUnitFromType: (typeId: string, index: number) => void
  setUnitsCount: (typeId: string, count: number) => void
  finishTypes: FinishType[]
}) {
    const { t } = useI18n();
  const [activeTypeId, setActiveTypeId] = useState<string>(draft.floorTypes[0]?.id ?? '')

  useEffect(() => {
    if (!draft.floorTypes.some((type) => type.id === activeTypeId)) {
      setActiveTypeId(draft.floorTypes[0]?.id ?? '')
    }
  }, [activeTypeId, draft.floorTypes])

  const activeType = draft.floorTypes.find((type) => type.id === activeTypeId) ?? null
  const validationIssues = getDraftStep2Issues(draft, metrics)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="mb-1 text-sm font-normal text-[#fcecc8]">{t('inventory.buildingChessboardWizard.типы_этажей')}{draft.name}</h3>
          <p className="text-xs text-[rgba(242,207,141,0.55)]">
            {t('inventory.buildingChessboardWizard.у_каждого_типа_долже')}</p>
        </div>
        <Button type="button" onClick={addFloorType} className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]">
          <Plus size={14} />
          {t('inventory.buildingChessboardWizard.тип_этажа')}</Button>
      </div>

      <FloorCoverage metrics={metrics} />

      {validationIssues.length > 0 ? (
        <div className="space-y-1 rounded-md border border-amber-400/35 bg-amber-500/10 p-3 text-xs text-amber-100">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={14} />
            {t('inventory.buildingChessboardWizard.чтобы_перейти_дальше')}</div>
          {validationIssues.slice(0, 4).map((issue) => (
            <div key={issue}>{issue}</div>
          ))}
          {validationIssues.length > 4 ? <div>{t('inventory.buildingChessboardWizard.еще_проблем')}{validationIssues.length - 4}</div> : null}
        </div>
      ) : null}

      {metrics.outOfBoundsTypes.length > 0 || metrics.overlappingFloors.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-rose-400/35 bg-rose-500/10 p-3 text-xs text-rose-100">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={14} />
            {t('inventory.buildingChessboardWizard.диапазоны_этажей_нуж')}</div>
          {metrics.outOfBoundsTypes.map((type) => (
            <div key={type.id}>
              {t('inventory.buildingChessboardWizard.тип')}{type.name || 'Без имени'}{t('inventory.buildingChessboardWizard.имеет_диапазон')}{type.rangeFrom}-{type.rangeTo}{t('inventory.buildingChessboardWizard.а_в_корпусе_только')}{' '}
              {metrics.totalFloors} {t('inventory.buildingChessboardWizard.этажей')}</div>
          ))}
          {metrics.overlappingFloors.length > 0 ? (
            <div>{t('inventory.buildingChessboardWizard.одни_и_те_же_этажи_н')}{metrics.overlappingFloors.join(', ')}.</div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-4">
        <div className="flex flex-col gap-1.5">
          {draft.floorTypes.map((type) => {
            const isOutOfBounds = metrics.outOfBoundsTypes.some((item) => item.id === type.id)
            const typeIssues = getFloorTypeValidationIssues(type)
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setActiveTypeId(type.id)}
                className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                  type.id === activeTypeId
                    ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.08)]'
                    : 'border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.2)] hover:border-[rgba(242,207,141,0.35)]'
                }`}
              >
                <span className="mt-0.5 inline-block size-2 shrink-0 rounded-full" style={{ background: type.color }} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-xs font-medium text-[#fcecc8]">{type.name || 'Без имени'}</span>
                  <span className="text-[10px] text-[rgba(242,207,141,0.5)]">
                    {t('inventory.buildingChessboardWizard.этажи')}{type.rangeFrom}-{type.rangeTo} · {type.units.length} {t('inventory.buildingChessboardWizard.помещений')}</span>
                  <span className="text-[10px] text-[rgba(242,207,141,0.45)]">
                    {FLOOR_PURPOSE_OPTIONS.find((option) => option.value === type.purpose)?.label ?? 'Назначение не задано'}
                  </span>
                  {type.description ? (
                    <span className="truncate text-[10px] text-[rgba(242,207,141,0.38)]">{type.description}</span>
                  ) : null}
                  {isOutOfBounds ? <span className="text-[10px] text-rose-200">{t('inventory.buildingChessboardWizard.диапазон_вне_этажнос')}</span> : null}
                  {typeIssues.length > 0 ? (
                    <span className="text-[10px] text-amber-200">{typeIssues[0]}</span>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>

        <div className="rounded-xl border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.22)] p-4">
          {activeType ? (
            <FloorTypeEditor
              type={activeType}
              canDelete={draft.floorTypes.length > 1}
              currency={currency}
              onChange={(patch) => updateFloorType(activeType.id, patch)}
              onRemove={() => removeFloorType(activeType.id)}
              onUnitChange={(index, patch) => updateUnit(activeType.id, index, patch)}
              onAddUnit={() => addUnitToType(activeType.id)}
              onRemoveUnit={(index) => removeUnitFromType(activeType.id, index)}
              onSetUnitsCount={(count) => setUnitsCount(activeType.id, count)}
              finishTypes={finishTypes}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-[rgba(242,207,141,0.5)]">
              <Layers size={28} className="text-[rgba(242,207,141,0.25)]" />
              {t('inventory.buildingChessboardWizard.добавьте_тип_этажа_ч')}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function FloorCoverage({ metrics }: { metrics: DraftMetrics }) {
    const { t } = useI18n();
  return (
    <div className="rounded-xl border border-[rgba(242,207,141,0.12)] bg-[rgba(0,0,0,0.22)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-[rgba(242,207,141,0.45)]">{t('inventory.buildingChessboardWizard.покрытие_этажей')}</span>
        {metrics.overlappingFloors.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200">
            <AlertTriangle size={10} />
            {t('inventory.buildingChessboardWizard.конфликт')}{metrics.overlappingFloors.join(', ')}
          </span>
        ) : metrics.uncoveredFloors.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
            <AlertTriangle size={10} />
            {t('inventory.buildingChessboardWizard.без_типа')}{metrics.uncoveredFloors.join(', ')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
            <Check size={10} />
            {t('inventory.buildingChessboardWizard.все_этажи_покрыты')}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {metrics.allFloors.map((floor) => {
          const assigned = metrics.floorAssignments.get(floor) ?? []
          const type = metrics.floorTypeMap.get(floor)
          const conflicted = assigned.length > 1
          return (
            <span
              key={floor}
              title={
                conflicted
                  ? `Конфликт: ${assigned.map((item) => item.name).join(', ')}`
                  : type
                    ? `${type.name} · ${type.units.length} помещений`
                    : 'Без типа'
              }
              className="inline-flex h-6 min-w-[28px] items-center justify-center rounded text-[10px] font-medium"
              style={{
                background: conflicted ? 'rgba(244,63,94,0.2)' : type ? `${type.color}33` : 'rgba(242,207,141,0.05)',
                color: conflicted ? '#ffe4e6' : type ? '#fcecc8' : 'rgba(242,207,141,0.4)',
                border: conflicted
                  ? '1px solid rgba(251,113,133,0.7)'
                  : type
                    ? `1px solid ${type.color}66`
                    : '1px dashed rgba(242,207,141,0.18)',
              }}
            >
              {floor}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function FloorTypeEditor({
  type,
  canDelete,
  currency = 'USD',
  onChange,
  onRemove,
  onUnitChange,
  onAddUnit,
  onRemoveUnit,
  onSetUnitsCount,
  finishTypes,
}: {
  type: FloorTypeDraft
  canDelete: boolean
  currency?: string
  onChange: (patch: Partial<FloorTypeDraft>) => void
  onRemove: () => void
  onUnitChange: (index: number, patch: Partial<FloorTemplateSlot>) => void
  onAddUnit: () => void
  onRemoveUnit: (index: number) => void
  onSetUnitsCount: (count: number) => void
  finishTypes: FinishType[]
}) {
    const { t } = useI18n();
  const currencySymbol = getCurrencySymbol(currency)
  const slotOptions = getPurposeSlotOptions(type.purpose)
  const slotFieldLabel = getSlotFieldLabel(type.purpose)
  const [autoN, setAutoN] = useState(() => Math.min(10, Math.max(1, type.units.length || 1)))
  const [autoNInput, setAutoNInput] = useState(() => String(Math.min(10, Math.max(1, type.units.length || 1))))
  const [unitsCountInput, setUnitsCountInput] = useState(() => String(type.units.length))

  useEffect(() => {
    setAutoN((n) => {
      const cap = Math.max(1, type.units.length || 1)
      return Math.min(Math.max(1, n), 50, cap)
    })
    setUnitsCountInput(String(type.units.length))
  }, [type.id, type.units.length])

  // Поле редактируется по сырой строке, а в autoNInput отражаем зафиксированное число.
  useEffect(() => {
    setAutoNInput(String(autoN))
  }, [autoN])

  function commitUnitsCount() {
    const next = parseInt(unitsCountInput, 10)
    if (Number.isFinite(next) && next >= 1) {
      onSetUnitsCount(next)
    } else {
      setUnitsCountInput(String(type.units.length))
    }
  }

  function commitAutoN() {
    const parsed = parseInt(autoNInput, 10)
    if (Number.isFinite(parsed) && parsed >= 1) {
      const cap = Math.max(1, type.units.length || 1)
      setAutoN(Math.min(parsed, 50, cap))
    } else {
      setAutoNInput(String(autoN))
    }
  }

  function updateFinishPrice(index: number, finishType: FinishType, rawValue: string) {
    const next = { ...(type.units[index]?.finishPrices ?? {}) }
    if (rawValue === '') delete next[finishType]
    else next[finishType] = Number(rawValue)
    onUnitChange(index, {
      finishPrices: Object.keys(next).length > 0 ? next : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_120px_120px_auto] items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('inventory.buildingChessboardWizard.название_типа')}</span>
          <input value={type.name} onChange={(event) => onChange({ name: event.target.value })} className={INPUT} placeholder={t('inventory.buildingChessboardWizard.коммерция')} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('inventory.buildingChessboardWizard.назначение')}</span>
          <select
            value={type.purpose}
            onChange={(event) => {
              const purpose = event.target.value as FloorPurpose
              onChange({
                purpose,
                units: normalizeUnitsForPurpose(type.units, purpose),
              })
            }}
            className={SELECT}
          >
            {FLOOR_PURPOSE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('inventory.buildingChessboardWizard.описание_типа')}</span>
          <input
            value={type.description}
            onChange={(event) => onChange({ description: event.target.value })}
            className={INPUT}
            placeholder={t('inventory.buildingChessboardWizard.например_витрины_и_в')}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('inventory.buildingChessboardWizard.с_этажа')}</span>
          <input
            type="number"
            min={1}
            value={type.rangeFrom || ''}
            onChange={(event) => onChange({ rangeFrom: parseInt(event.target.value, 10) || 0 })}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('inventory.buildingChessboardWizard.по_этаж')}</span>
          <input
            type="number"
            min={type.rangeFrom}
            value={type.rangeTo || ''}
            onChange={(event) => onChange({ rangeTo: parseInt(event.target.value, 10) || 0 })}
            className={INPUT}
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canDelete}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-rose-400/30 px-2.5 text-xs text-rose-300 transition-colors hover:border-rose-400/60 hover:bg-rose-500/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 size={13} />
          {t('inventory.buildingChessboardWizard.удалить')}</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className={LABEL}>{t('inventory.buildingChessboardWizard.помещений_на_этаже')}</span>
          <input
            type="number"
            min={1}
            max={50}
            value={unitsCountInput}
            onChange={(event) => setUnitsCountInput(event.target.value.replace(/^0+(?=\d)/, ''))}
            onBlur={commitUnitsCount}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            className={`${INPUT} w-20 text-center`}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 border-l border-[rgba(242,207,141,0.12)] pl-3">
          <label className="flex items-center gap-2">
            <span className={LABEL}>{t('inventory.buildingChessboardWizard.квартир_на_этаж_авто')}</span>
            <input
              type="number"
              min={1}
              max={50}
              value={autoNInput}
              onChange={(event) => setAutoNInput(event.target.value.replace(/^0+(?=\d)/, ''))}
              onBlur={commitAutoN}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
              }}
              className={`${INPUT} w-16 text-center`}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const parsed = parseInt(autoNInput, 10)
              const cap = Math.max(1, type.units.length || 1)
              const perFloor = Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 50, cap) : autoN
              onChange({ units: layoutSlotsByUnitsPerFloor(type, perFloor) })
            }}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-[rgba(242,207,141,0.28)] bg-[rgba(201,168,76,0.08)] px-3 text-xs font-normal text-[#fcecc8] transition-colors hover:border-[#c9a84c] hover:bg-[rgba(201,168,76,0.14)]"
          >
            {t('inventory.buildingChessboardWizard.разнести_по_этажам')}</button>
          <button
            type="button"
            onClick={() =>
              onChange({
                units: type.units.map((s) => {
                  const { templateFloor: _tf, ...rest } = s
                  return rest
                }),
              })
            }
            className="inline-flex h-9 items-center rounded-md border border-[rgba(242,207,141,0.15)] px-2.5 text-xs font-normal text-[rgba(242,207,141,0.75)] transition-colors hover:border-[rgba(242,207,141,0.35)] hover:text-[#fcecc8]"
          >
            {t('inventory.buildingChessboardWizard.сбросить_этажи')}</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-[rgba(242,207,141,0.12)]">
        <div className="grid grid-cols-[64px_56px_minmax(0,1fr)_110px_110px_minmax(0,1fr)_36px] gap-2 border-b border-[rgba(242,207,141,0.1)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-[10px] uppercase tracking-wide text-[rgba(242,207,141,0.45)]">
          <span>{t('inventory.buildingChessboardWizard.этаж')}</span>
          <span>{t('inventory.buildingChessboardWizard.поз')}</span>
          <span>{slotFieldLabel}</span>
          <span>{t('inventory.buildingChessboardWizard.площадь_м')}</span>
          <span>{t('inventory.buildingChessboardWizard.базовая_м', `Базовая, ${currencySymbol}/м²`)}</span>
          <span>{t('inventory.buildingChessboardWizard.вид')}</span>
          <span />
        </div>
        {type.units.map((slot, index) => (
          <div
            key={index}
            className="grid grid-cols-[64px_56px_minmax(0,1fr)_110px_110px_minmax(0,1fr)_36px] items-center gap-2 border-b border-[rgba(242,207,141,0.06)] px-3 py-1.5 last:border-0"
          >
            <input
              type="number"
              min={1}
              value={slot.templateFloor ?? ''}
              placeholder={t('inventory.buildingChessboardWizard.все')}
              title={t('inventory.buildingChessboardWizard.пусто_на_всех_этажах')}
              onChange={(event) => {
                const raw = event.target.value
                if (raw === '') onUnitChange(index, { templateFloor: undefined })
                else {
                  const n = parseInt(raw, 10)
                  onUnitChange(index, { templateFloor: Number.isFinite(n) && n > 0 ? n : undefined })
                }
              }}
              className={`${INPUT} text-center text-xs`}
            />
            <input
              type="number"
              min={1}
              value={slot.positionInFloor ?? index + 1}
              onChange={(event) => onUnitChange(index, { positionInFloor: event.target.value === '' ? undefined : Number(event.target.value) })}
              className={`${INPUT} text-center text-xs`}
            />
            <select value={slot.rooms ?? ''} onChange={(event) => onUnitChange(index, { rooms: event.target.value })} className={SELECT}>
              {slotOptions.map((option) => (
                <option key={option} value={option}>
                  {optionLabel(t, getSlotOptionsGroup(type.purpose), option)}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.1"
              min={0}
              value={slot.area ?? ''}
              placeholder="0"
              onChange={(event) => onUnitChange(index, { area: event.target.value === '' ? undefined : Number(event.target.value) })}
              className={INPUT}
            />
            <input
              type="number"
              min={0}
              value={slot.pricePerSqm ?? ''}
              placeholder="0"
              onChange={(event) => onUnitChange(index, { pricePerSqm: event.target.value === '' ? undefined : Number(event.target.value) })}
              className={INPUT}
            />
            <select
              value={normalizeViewType(slot.viewType)}
              onChange={(event) => onUnitChange(index, { viewType: event.target.value || undefined })}
              className={SELECT}
            >
              {VIEW_OPTIONS.map((view) => (
                <option key={view} value={view}>
                  {view ? optionLabel(t, 'views', view) : '—'}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onRemoveUnit(index)}
              disabled={type.units.length <= 1}
              className="inline-flex size-7 items-center justify-center rounded-md text-rose-300/70 transition-colors hover:bg-rose-500/10 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 size={13} />
            </button>
            <div className="col-span-full mt-1 grid gap-2 rounded-[4px] bg-[rgba(3,29,22,0.55)] p-3 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)] sm:grid-cols-2 xl:grid-cols-3">
              {finishTypes.map((finishType) => (
                <label key={finishType} className="flex min-w-0 flex-col gap-1.5">
                  <span className="truncate text-[16px] text-[rgba(255,255,255,0.72)]">
                    {optionLabel(t, 'finishTypes', finishType)}, {currencySymbol}/м²
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={slot.finishPrices?.[finishType] ?? ''}
                    placeholder={t('inventory.buildingChessboardWizard.не_предлагается')}
                    onChange={(event) => updateFinishPrice(index, finishType, event.target.value)}
                    className={INPUT}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddUnit}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[rgba(242,207,141,0.3)] py-2 text-xs font-medium text-[rgba(242,207,141,0.7)] transition-colors hover:border-[#c9a84c] hover:bg-[rgba(201,168,76,0.06)] hover:text-[#fcecc8]"
      >
        <Plus size={13} />
        {t('inventory.buildingChessboardWizard.добавить_помещение')}</button>
    </div>
  )
}

function Step3({
  draft,
  previewNumbers,
  onChange,
}: {
  draft: BuildingWizardDraft
  previewNumbers: string[]
  onChange: (patch: Partial<BuildingWizardDraft>) => void
}) {
    const { t } = useI18n();
  const prefix = (draft.prefixOverride.trim() || draft.buildingCode.trim() || buildingNamePrefix(draft.name)).toUpperCase()

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1 text-sm font-normal text-[#fcecc8]">{t('inventory.buildingChessboardWizard.нумерация')}{draft.name}</h3>
        <p className="text-xs text-[rgba(242,207,141,0.55)]">
          {t('inventory.buildingChessboardWizard.префикс_можно_задать')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('inventory.buildingChessboardWizard.префикс_корпуса')}</span>
          <input value={draft.prefixOverride} onChange={(event) => onChange({ prefixOverride: event.target.value.toUpperCase() })} className={INPUT} placeholder={prefix} />
          <span className="text-[10px] text-[rgba(242,207,141,0.4)]">
            {t('inventory.buildingChessboardWizard.используется')}<b className="text-[#fcecc8]">{prefix}</b>
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('inventory.buildingChessboardWizard.правило')}</span>
          <div className="flex flex-col gap-1.5">
            <RuleOption
              active={draft.numberingRule === 'floor-position'}
              title={t('inventory.buildingChessboardWizard.поэтажная')}
              hint="A-0101, A-0102…"
              onClick={() => onChange({ numberingRule: 'floor-position' })}
            />
            <RuleOption
              active={draft.numberingRule === 'sequential'}
              title={t('inventory.buildingChessboardWizard.сквозная_по_корпусу')}
              hint="A-1, A-2…"
              onClick={() => onChange({ numberingRule: 'sequential' })}
            />
          </div>
        </div>
      </div>

      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[rgba(242,207,141,0.7)]">
        <input
          type="checkbox"
          checked={draft.skipUnit13}
          onChange={(event) => onChange({ skipUnit13: event.target.checked })}
          className="h-4 w-4 accent-[#c9a84c]"
        />
        {t('inventory.buildingChessboardWizard.пропустить_13_й_номе')}</label>

      <div className="rounded-xl border border-[rgba(242,207,141,0.12)] bg-[rgba(0,0,0,0.22)] p-4">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-[rgba(242,207,141,0.45)]">{t('inventory.buildingChessboardWizard.превью_первых_12_ном')}</p>
        <div className="flex flex-wrap gap-1">
          {previewNumbers.map((number) => (
            <span key={number} className="rounded bg-[rgba(242,207,141,0.08)] px-2 py-0.5 text-[11px] font-medium text-[#fcecc8]">
              {number}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function RuleOption({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors ${
        active
          ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.12)]'
          : 'border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.25)] hover:border-[rgba(242,207,141,0.4)]'
      }`}
    >
      <span className={`text-xs font-medium ${active ? 'text-[#fcecc8]' : 'text-[rgba(242,207,141,0.85)]'}`}>{title}</span>
      <span className="text-[10px] text-[rgba(242,207,141,0.5)]">{hint}</span>
    </button>
  )
}

function Step4({
  draft,
  metrics,
  floorPlans,
  onOpenFloorPlan,
}: {
  draft: BuildingWizardDraft
  metrics: DraftMetrics
  floorPlans: FloorPlan[]
  onOpenFloorPlan: (floor: number) => void
}) {
    const { t } = useI18n();
  if (!draft.existingBuildingId) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="mb-1 text-sm font-normal text-[#fcecc8]">{t('inventory.buildingChessboardWizard.поэтажные_планы')}{draft.name}</h3>
          <p className="text-xs text-[rgba(242,207,141,0.55)]">
            {t('inventory.buildingChessboardWizard.для_нового_корпуса_с')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1 text-sm font-normal text-[#fcecc8]">{t('inventory.buildingChessboardWizard.поэтажные_планы')}{draft.name}</h3>
        <p className="text-xs text-[rgba(242,207,141,0.55)]">
          {t('inventory.buildingChessboardWizard.здесь_открывается_ре')}</p>
      </div>

      <div className="space-y-2">
        {metrics.allFloors.map((floor) => {
          const plan = floorPlans.find((item) => item.buildingId === draft.existingBuildingId && item.floor === floor)
          const floorUnits = metrics.preview.rows.filter((row) => row.floor === floor)
          return (
            <div
              key={floor}
              className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.22)] p-3"
            >
              <div>
                <div className="text-sm font-normal text-[#fcecc8]">{t('inventory.buildingChessboardWizard.этаж')}{floor}</div>
                <div className="text-xs text-[rgba(242,207,141,0.5)]">
                  {floorUnits.length} {t('inventory.buildingChessboardWizard.помещений')}{plan?.imageDataUrl ? 'поэтажка загружена' : 'поэтажка не загружена'} ·{' '}
                  {plan?.polygons.length ?? 0} {t('inventory.buildingChessboardWizard.обрисованных_контуро')}</div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenFloorPlan(floor)}
                className="border-[rgba(242,207,141,0.3)] bg-transparent text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)]"
              >
                {t('inventory.buildingChessboardWizard.открыть_редактор_поэ')}</Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Step5({
  drafts,
  metrics,
  currency = 'USD',
}: {
  drafts: BuildingWizardDraft[]
  metrics: Map<string, DraftMetrics>
  currency?: string
}) {
    const { t } = useI18n();
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1 text-sm font-normal text-[#fcecc8]">{t('inventory.buildingChessboardWizard.превью_шахматки')}</h3>
        <p className="text-xs text-[rgba(242,207,141,0.55)]">
          {t('inventory.buildingChessboardWizard.проверьте_итог_по_ко')}</p>
      </div>

      {drafts.map((draft) => {
        const draftMetrics = metrics.get(draft.id)
        if (!draftMetrics) return null

        const floorRows = Array.from(
          draftMetrics.preview.rows.reduce((map, row) => {
            const rows = map.get(row.floor) ?? []
            rows.push(row)
            map.set(row.floor, rows)
            return map
          }, new Map<number, PreviewRow[]>()),
        )
          .sort((left, right) => right[0] - left[0])
          .map(([floor, rows]) => ({ floor, rows: rows.slice().sort((left, right) => left.pos - right.pos) }))

        return (
          <div key={draft.id} className="space-y-3 rounded-xl border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.22)] p-4">
            <div className="flex flex-col items-center gap-4 text-center xl:grid xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-start xl:text-left">
              <div className="xl:justify-self-start">
                <h4 className="text-sm font-normal text-[#fcecc8]">{draft.name}</h4>
                <p className="text-xs text-[rgba(242,207,141,0.5)]">
                  {draftMetrics.totalFloors} {t('inventory.buildingChessboardWizard.этажей')}{draftMetrics.preview.rows.length} {t('inventory.buildingChessboardWizard.лотов')}{draftMetrics.maxUnitsPerFloor} {t('inventory.buildingChessboardWizard.макс_на_этаже')}</p>
              </div>
              <div className="mx-auto grid grid-cols-3 gap-2 text-center xl:justify-self-center">
                <MetricCard label={t('inventory.buildingChessboardWizard.лотов')} value={String(draftMetrics.preview.rows.length)} />
                <MetricCard label={t('inventory.buildingChessboardWizard.площадь')} value={`${draftMetrics.preview.totalArea.toFixed(1)} м²`} />
                <MetricCard label={t('inventory.buildingChessboardWizard.стоимость')} value={formatPrice(draftMetrics.preview.totalValue, currency)} />
              </div>
              <div className="hidden xl:block" />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[rgba(242,207,141,0.55)]">
              {draft.floorTypes.map((type) => (
                <span key={type.id} className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,0,0,0.25)] px-2 py-0.5">
                  <span className="size-2 rounded-full" style={{ background: type.color }} />
                  {type.name} {t('inventory.buildingChessboardWizard.этажи')}{type.rangeFrom}-{type.rangeTo}
                </span>
              ))}
            </div>

            {draftMetrics.uncoveredFloors.length > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <div>{t('inventory.buildingChessboardWizard.этажи_без_типа')}{draftMetrics.uncoveredFloors.join(', ')}{t('inventory.buildingChessboardWizard.после_сохранения_он')}</div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-[rgba(242,207,141,0.12)] bg-[rgba(0,0,0,0.18)]">
              <div className="max-h-[280px] overflow-auto p-3">
                {floorRows.map(({ floor, rows }) => (
                  <div key={floor} className="flex items-start gap-2 py-1">
                    <span className="w-8 shrink-0 pt-1 text-[11px] font-normal text-[rgba(242,207,141,0.55)]">{floor}</span>
                    <div className="flex flex-wrap gap-1">
                      {rows.map((row) => (
                        <span
                          key={row.key}
                          className="rounded px-2 py-0.5 text-[10px] font-medium text-[#0a1f12]"
                          style={{ background: row.color }}
                          title={`${row.number} · ${row.rooms ?? ''} · ${row.area ?? '—'} м² · ${formatPrice(row.total, currency)}`}
                        >
                          {row.number}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[rgba(242,207,141,0.12)] bg-[rgba(0,0,0,0.22)] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[rgba(242,207,141,0.45)]">{label}</div>
      <div className="mt-1 text-sm font-normal text-[#fcecc8]">{value}</div>
    </div>
  )
}

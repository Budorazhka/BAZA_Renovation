import { useSyncExternalStore } from 'react'

import type { IBuilding, ILayout, IProject, IUnit, NewProjectData, UnitPromotion, UnitStatus } from '@/types/core'
import type { IInstallmentPlan } from '@/types/installment'
import { roundArea } from '@/lib/chessboard'
import { normalizeOptionValue, normalizeOptionValues, normalizeRooms, normalizeViewType } from '@/lib/project-options'
import { detectImageContentBounds, mergeCopiedPolygons, remapPolygonToBounds } from '@/lib/floor-plan'
import {
  getPrimaryFinishPrice,
  hydrateUnitFinishPrices,
  normalizeFinishPrices,
  persistUnitFinishPrices,
} from '@/lib/unit-finish-pricing'
import {
  developmentApi,
  parsePlotToPolygon,
  UnitStatus as ApiUnitStatus,
  type Unit as ApiUnit,
  type UnitsExcelUploadResult,
} from '@/services/developmentApi'
import { developmentsApiV2 } from '@/services/developmentsApiV2'
import {
  BUILDINGS_MOCK,
  DEMO_PROJECT_ID,
  FLOOR_PLANS_MOCK,
  LAYOUTS_MOCK,
  PROJECTS_MOCK,
  UNITS_MOCK,
} from '@/data/projects-mock'

/** Map our UI status to the status vocabulary the units API expects. */
const STATUS_TO_API: Record<UnitStatus, string> = {
  free: 'available',
  booked: 'reserved',
  sold: 'sold',
  withdrawn: 'hidden',
}

/**
 * Convert a UI rooms value (e.g. "Студия", "1", "2", "4+", "1+1") into the
 * numeric `rooms` the layouts API expects. Студия → 0; any leading digit wins.
 */
function roomsToNumber(rooms: unknown): number {
  if (typeof rooms === 'number') return Number.isFinite(rooms) ? rooms : 0
  const str = String(rooms ?? '').trim()
  if (/студ|studio/i.test(str)) return 0
  const match = str.match(/\d+/)
  return match ? Number(match[0]) : 0
}

/**
 * Inverse of {@link roomsToNumber}: turn the numeric `rooms` from the layouts
 * API back into the UI label the <select> options use. 0 → "Студия", любое
 * число N → "N+1" (все ненулевые опции каталога — формата "N+1"). Без этого
 * "1+1" → 1 → "1" не совпадает ни с одной опцией и select откатывается на
 * первую («Студия»).
 */
function roomsFromNumber(rooms: unknown): string {
  if (typeof rooms === 'string' && /\D/.test(rooms)) return normalizeRooms(rooms) || rooms
  const n = Number(rooms)
  if (!Number.isFinite(n) || n <= 0) return 'studio'
  return n >= 4 ? '4+' : `${n}+1`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** API media fields may arrive as URL strings or `{ url }` file entities. */
function mapFileEntities(items: Array<{ url?: string } | string> | undefined): string[] | undefined {
  return items?.map((item) => (typeof item === 'string' ? item : item.url)).filter(Boolean) as string[] | undefined
}

type NewUnitData = Omit<IUnit, '_id' | 'building'>
type UnitUpdateData = Partial<Omit<IUnit, '_id'>>
type UnitBulkUpdateData = Partial<IUnit>

export type BulkPromotionInput =
  | { kind: 'price_discount'; discountPercent?: number; discountPerSqm?: number; label: string; expiresAt?: string }
  | { kind: 'installment'; downPaymentPercent: number; installmentMonths: number; label: string; expiresAt?: string }
  | { kind: 'gift'; giftText?: string; label: string; expiresAt?: string }

export type BulkUpdateResult = { ok: number; fail: number }

export type BulkUpdateEntry = { unitId: string; updatedData: Partial<IUnit> }

export interface UnitPolygon {
  unitId: string
  points: [number, number][]
}

export interface FloorPlanPlace {
  id: string
  label: string
  points: [number, number][]
}

export interface FloorPlan {
  buildingId: string
  floor: number
  imageDataUrl: string
  /** CDN file id of the floor image; required to persist the interactive floor map. */
  imageId?: string
  polygons: UnitPolygon[]
  places: FloorPlanPlace[]
}

export interface ISharedUnit {
  unit: IUnit
  buildingName: string
  projectName: string
  sharedAt: number // timestamp
  messageText: string
}

type NewBuildingData = Omit<IBuilding, '_id' | 'project'>
type BuildingUpdateData = Partial<Omit<IBuilding, '_id' | 'project'>>

interface CoreStoreState {
  projects: IProject[]
  activeProjectId: string | null
  activeBuildingId: string | null
  /** Проект, к которому относятся текущие `buildings`/`units`. null — данные ещё не загружены. */
  buildingsProjectId: string | null
  allBuildings: IBuilding[]
  buildings: IBuilding[]
  allUnits: IUnit[]
  units: IUnit[]
  layouts: ILayout[]
  floorPlans: FloorPlan[]
  setActiveProject: (id: string | null) => void
  fetchProjects: () => Promise<void>
  fetchProjectDetail: (id: string) => Promise<IProject | undefined>
  fetchBuildings: (projectId: string) => Promise<void>
  fetchUnits: (buildingId: string) => Promise<void>
  fetchLayouts: (buildingId: string) => Promise<void>
  addProject: (data: NewProjectData) => Promise<string>
  addProjectWithFormData: (formData: FormData) => Promise<string>
  addProjectWithId: (id: string, data: NewProjectData) => Promise<string>
  updateProject: (id: string, data: Partial<NewProjectData>) => Promise<void>
  updateProjectWithFormData: (id: string, formData: FormData) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  addBuilding: (projectId: string, data: NewBuildingData) => Promise<string>
  updateBuilding: (buildingId: string, data: BuildingUpdateData) => Promise<void>
  deleteBuilding: (buildingId: string) => Promise<void>
  addUnit: (buildingId: string, newUnitData: NewUnitData) => Promise<void>
  addUnitWithId: (buildingId: string, unitId: string, newUnitData: NewUnitData) => Promise<void>
  addUnitsBulk: (buildingId: string, items: NewUnitData[]) => Promise<void[]>
  replaceBuildingUnits: (buildingId: string, items: NewUnitData[]) => Promise<void>
  uploadUnitsExcel: (buildingId: string, file: File) => Promise<UnitsExcelUploadResult>
  applyImportedFinishPrices: (
    buildingId: string,
    rows: Array<Pick<IUnit, 'number' | 'finishPrices'>>,
  ) => void
  deleteUnit: (unitId: string) => Promise<void>
  updateUnit: (unitId: string, updatedData: UnitUpdateData) => Promise<void>
  updateUnitsBulk: (unitIds: string[], updatedData: UnitBulkUpdateData) => Promise<BulkUpdateResult>
  updateUnitsBulkEntries: (entries: BulkUpdateEntry[]) => Promise<BulkUpdateResult>
  applyBulkPriceChange: (unitIds: string[], value: number, type: 'fixed' | 'percentage') => Promise<BulkUpdateResult>
  applyBulkPromotion: (unitIds: string[], promotion: BulkPromotionInput) => void
  clearBulkPromotion: (unitIds: string[]) => void
  replaceAllUnits: (units: IUnit[]) => void
  addLayout: (buildingId: string, data: Omit<ILayout, '_id' | 'buildingId'>) => Promise<void>
  updateLayout: (layoutId: string, data: Partial<ILayout>) => Promise<void>
  deleteLayout: (layoutId: string) => Promise<void>
  setUnitsLayoutImage: (unitIds: string[], imageUrl: string) => void
  /** Привязать планировку из библиотеки к выбранным лотам (PATCH /units/:id { layoutId }). */
  attachLayoutToUnits: (unitIds: string[], layout: ILayout) => Promise<{ ok: number; failed: number }>
  /** Привязать/отвязать план лота из библиотеки (CdnFile). Передайте null для отвязки. */
  setUnitPlanImage: (unitId: string, imageFileId: string | null) => Promise<void>
  setFloorPlanImage: (buildingId: string, floor: number, imageDataUrl: string, imageId?: string) => void
  fetchBuildingPlans: (buildingId: string) => Promise<void>
  uploadFloorPlanImage: (
    buildingId: string,
    floor: number,
    file: File,
    applyToType?: boolean,
  ) => Promise<{ floors: number[]; persisted: boolean; error?: string }>
  saveFloorMap: (buildingId: string, floor: number) => Promise<void>
  /** Persist a single apartment's contour to its own unit record (PUT /units/:id/plot). */
  saveUnitPlot: (unitId: string, points: [number, number][]) => Promise<void>
  upsertFloorPlanPolygon: (buildingId: string, floor: number, unitId: string, points: [number, number][]) => void
  removeFloorPlanPolygon: (buildingId: string, floor: number, unitId: string) => void
  addFloorPlanPlace: (buildingId: string, floor: number, label?: string) => string
  upsertFloorPlanPlacePolygon: (buildingId: string, floor: number, placeId: string, points: [number, number][]) => void
  removeFloorPlanPlace: (buildingId: string, floor: number, placeId: string) => void
  setFloorPlanImageForType: (buildingId: string, floor: number, imageDataUrl: string) => number[]
  upsertFloorPlanPolygonForType: (buildingId: string, floor: number, unitId: string, points: [number, number][]) => number[]
  removeFloorPlanPolygonForType: (buildingId: string, floor: number, unitId: string) => number[]
  copyFloorPolygons: (buildingId: string, fromFloor: number, toFloors: number[]) => Promise<void>
  sharedUnits: ISharedUnit[]
  /** Текст для вставки в поле сообщения при выборе чата после «Поделиться». */
  pendingChatDraft: string | null
  shareUnit: (unit: IUnit, buildingName: string, projectName: string, messageText: string) => void
  clearPendingChatDraft: () => void
  clearExpiredSharedUnits: () => void
}

let storeState: CoreStoreState
const listeners = new Set<() => void>()

/** Monotonic request counters: only the freshest request is allowed to write its data into the store. */
let buildingsRequestSeq = 0
let unitsRequestSeq = 0
let buildingPlansRequestSeq = 0
let layoutsRequestSeq = 0

function emit() {
  for (const listener of listeners) listener()
}

function setStoreState(
  updater: Partial<CoreStoreState> | ((state: CoreStoreState) => Partial<CoreStoreState> | CoreStoreState),
) {
  const partial = typeof updater === 'function' ? updater(storeState) : updater
  storeState = { ...storeState, ...partial }
  emit()
}

function getStoreState() {
  return storeState
}

/**
 * Обновляет рассрочки проекта в сторе после успешного PATCH комплекса
 * (вызывается из useInstallmentStore, чтобы вкладка «Рассрочка» видела свежие планы).
 */
export function applyProjectInstallmentPlans(projectId: string, plans: IInstallmentPlan[]) {
  setStoreState((state) => ({
    projects: state.projects.map((p) => (p._id === projectId ? { ...p, installmentPlans: plans } : p)),
  }))
}

function mergeById<T extends { _id: string }>(primary: T[], secondary: T[]): T[] {
  const primaryIds = new Set(primary.map((item) => item._id))
  return [...primary, ...secondary.filter((item) => !primaryIds.has(item._id))]
}

function isMockUnitId(unitId: string): boolean {
  return UNITS_MOCK.some((u) => u._id === unitId)
}

function toApiUnitPatch(
  updatedData: UnitBulkUpdateData,
  existing?: Pick<IUnit, 'area' | 'price' | 'pricePerSqm' | 'currency'>,
) {
  const apiStatus: ApiUnitStatus | undefined = updatedData.status
    ? (STATUS_TO_API[updatedData.status] as ApiUnitStatus)
    : undefined
  const finishPrices =
    'finishPrices' in updatedData
      ? normalizeFinishPrices(updatedData.finishPrices) ?? {}
      : undefined

  const area = updatedData.area ?? existing?.area
  const price = updatedData.price
  let pricePerSqm = updatedData.pricePerSqm
  if (pricePerSqm == null && price != null && typeof area === 'number' && area > 0) {
    pricePerSqm = Math.round(price / area)
  }

  return {
    number: updatedData.number,
    rooms: updatedData.rooms != null ? normalizeRooms(updatedData.rooms) : undefined,
    area: roundArea(updatedData.area),
    currency: updatedData.currency ?? existing?.currency,
    price,
    pricePerSqm,
    finishPrices,
    status: apiStatus,
  }
}

function isUnsupportedFinishPricesError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const status = (error as { response?: { status?: number } }).response?.status
  return status === 400 || status === 422
}

function withoutFinishPrices(payload: Partial<ApiUnit>): Partial<ApiUnit> {
  const fallback = { ...payload }
  delete fallback.finishPrices
  return fallback
}

async function createUnitWithFinishPricesFallback(payload: Partial<ApiUnit>) {
  try {
    return await developmentApi.createUnit(payload)
  } catch (error) {
    if (!payload.finishPrices || !isUnsupportedFinishPricesError(error)) throw error
    return developmentApi.createUnit(withoutFinishPrices(payload))
  }
}

async function updateUnitWithFinishPricesFallback(unitId: string, payload: Partial<ApiUnit>) {
  try {
    return await developmentApi.updateUnit(unitId, payload)
  } catch (error) {
    if (!payload.finishPrices || !isUnsupportedFinishPricesError(error)) throw error
    return developmentApi.updateUnit(unitId, withoutFinishPrices(payload))
  }
}

function applyLocalUnitsPatch(entries: BulkUpdateEntry[]): void {
  if (entries.length === 0) return
  const patchById = new Map(entries.map((entry) => [entry.unitId, entry.updatedData]))
  setStoreState((state) => {
    const nextAllUnits = state.allUnits.map((unit) => {
      const patch = patchById.get(unit._id)
      return patch ? { ...unit, ...patch, _id: unit._id } : unit
    })
    return {
      allUnits: nextAllUnits,
      units: state.activeBuildingId ? nextAllUnits.filter((u) => u.building === state.activeBuildingId) : [],
    }
  })
}

async function refreshUnitsAfterBulkUpdate(): Promise<void> {
  const { activeProjectId, activeBuildingId } = getStoreState()
  if (activeProjectId) {
    await getStoreState().fetchBuildings(activeProjectId)
  } else if (activeBuildingId) {
    await getStoreState().fetchUnits(activeBuildingId)
  }
}

async function patchUnitsBatch(entries: BulkUpdateEntry[]): Promise<BulkUpdateResult> {
  if (entries.length === 0) return { ok: 0, fail: 0 }

  let ok = 0
  let fail = 0
  let lastError: unknown = null
  const mockEntries: BulkUpdateEntry[] = []

  for (const entry of entries) {
    if (isMockUnitId(entry.unitId)) {
      mockEntries.push(entry)
      ok++
      continue
    }

    try {
      const existing = getStoreState().allUnits.find((u) => u._id === entry.unitId)
      const resp = await updateUnitWithFinishPricesFallback(
        entry.unitId,
        toApiUnitPatch(entry.updatedData, existing),
      )
      if (resp.success) {
        if ('finishPrices' in entry.updatedData) {
          persistUnitFinishPrices(entry.unitId, entry.updatedData.finishPrices)
        }
        ok++
      } else {
        fail++
        lastError = new Error(resp.message || 'Update failed')
      }
    } catch (error) {
      fail++
      lastError = error
      console.error(`Failed to update unit ${entry.unitId}:`, error)
    }
  }

  if (mockEntries.length > 0) {
    mockEntries.forEach((entry) => {
      if ('finishPrices' in entry.updatedData) {
        persistUnitFinishPrices(entry.unitId, entry.updatedData.finishPrices)
      }
    })
    applyLocalUnitsPatch(mockEntries)
  }

  if (ok > mockEntries.length) {
    await refreshUnitsAfterBulkUpdate()
  }

  if (fail > 0 && ok === 0) {
    throw lastError instanceof Error ? lastError : new Error('Не удалось обновить лоты')
  }

  return { ok, fail }
}

function cloneMockFloorPlans(): FloorPlan[] {
  return FLOOR_PLANS_MOCK.map((plan) => ({
    ...plan,
    polygons: plan.polygons.map((polygon) => ({
      ...polygon,
      points: polygon.points.map(([x, y]) => [x, y] as [number, number]),
    })),
    places: plan.places.map((place) => ({
      ...place,
      points: place.points.map(([x, y]) => [x, y] as [number, number]),
    })),
  }))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const generateProjectId = (): string => `project-${Date.now()}`
export const generateUnitId = (): string => `unit-${Date.now()}`
export const generateBuildingId = (): string => `building-${Date.now()}`

storeState = {
  projects: PROJECTS_MOCK,
  activeProjectId: DEMO_PROJECT_ID,
  activeBuildingId: BUILDINGS_MOCK[0]?._id ?? null,
  buildingsProjectId: BUILDINGS_MOCK[0]?.project ?? DEMO_PROJECT_ID,
  allBuildings: BUILDINGS_MOCK,
  buildings: BUILDINGS_MOCK,
  allUnits: UNITS_MOCK.map(hydrateUnitFinishPrices),
  units: UNITS_MOCK.map(hydrateUnitFinishPrices),
  layouts: LAYOUTS_MOCK,
  floorPlans: cloneMockFloorPlans(),
  sharedUnits: (() => {
    try {
      const raw = localStorage.getItem('bz26_shared_units')
      if (!raw) return []
      const parsed = JSON.parse(raw) as ISharedUnit[]
      if (!Array.isArray(parsed)) return []
      const now = Date.now()
      return parsed.filter(u => now - u.sharedAt < 30 * 60 * 1000)
    } catch {
      return []
    }
  })(),
  pendingChatDraft: (() => {
    try {
      return localStorage.getItem('bz26_pending_chat_draft')
    } catch {
      return null
    }
  })(),

  setActiveProject: (id) => {
    setStoreState({ activeProjectId: id })
  },

  /**
   * D-02 (26.08.2026): подключено к НОВОМУ backend (developmentsApiV2,
   * apps/api D-01 Development-агрегат), не legacy developmentApi.getComplexes.
   * Owner decision: маркетинговые поля legacy IProject (renders/promotions/
   * installmentPlans/realtorScripts/инфраструктура/priceFrom-To/areaFrom-To/
   * floorsFrom-To и т.д.) НЕ имеют источника в новой Development-схеме —
   * намеренно оставлены undefined (карточки на странице «Объекты» временно
   * без фото/цен/акций), заполнение — отдельная будущая задача, не эта.
   * addProject/updateProject/deleteProject НЕ переключены в этом проходе —
   * не вызываются реальным UI нигде в кодовой базе (проверено grep'ом),
   * остаются на legacy до появления реального create/edit-флоу с полями,
   * которые новый backend требует (contact.phone обязателен, D-05 owner
   * decision — IProject не имеет такого поля вообще).
   */
  fetchProjects: async () => {
    try {
      const { items } = await developmentsApiV2.list({ limit: 100 })
      const mappedProjects: IProject[] = items.map((d) => ({
        _id: d._id,
        name: d.name,
        developer: 'Development Group',
        location: d.location.city,
        classType: (normalizeOptionValue('classTypes', d.classType) || 'comfort') as IProject['classType'],
        coastline: '',
        buildingsCount: 0,
        totalUnits: 0,
        completionDate: d.completionDate ?? '',
        startDate: d.startDate ?? '',
        description: d.description ?? '',
        paymentTypes: [],
        status: d.status === 'active' ? 'active' : d.status === 'archived' ? 'completed' : 'draft',
        country: normalizeOptionValue('countries', d.location.country) || undefined,
        city: normalizeOptionValue('cities', d.location.city) || undefined,
        address: d.location.address,
      }))

      const projects = mergeById(PROJECTS_MOCK, mappedProjects)
      const currentActiveProjectId = getStoreState().activeProjectId
      const nextActiveProjectId =
        currentActiveProjectId && projects.some((project) => project._id === currentActiveProjectId)
          ? currentActiveProjectId
          : projects[0]?._id ?? null

      setStoreState({
        projects,
        activeProjectId: nextActiveProjectId,
      })

      if (nextActiveProjectId) {
        await getStoreState().fetchBuildings(nextActiveProjectId)
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
      if (getStoreState().projects.length === 0) {
        const firstId = PROJECTS_MOCK[0]?._id ?? null
        setStoreState({
          projects: PROJECTS_MOCK,
          activeProjectId: firstId,
        })
        if (firstId) {
          await getStoreState().fetchBuildings(firstId)
        }
      }
    }
  },

  fetchProjectDetail: async (id) => {
    if (PROJECTS_MOCK.some((project) => project._id === id)) {
      return PROJECTS_MOCK.find((project) => project._id === id)
    }

    try {
      const resp = await developmentApi.getComplexById(id)
      if (resp.success) {
        const c = resp.data
        const mappedProject: IProject = {
          _id: c.id,
          author: c.author,
          name: c.name,
          developer: c.developer || 'Development Group',
          location: c.city || '',
          classType: (normalizeOptionValue('classTypes', c.class) || 'comfort') as IProject['classType'],
          coastline: normalizeOptionValue('coastline', c.coastline),
          buildingsCount: 0,
          totalUnits: 0,
          completionDate: c.completionDate || c.construction?.endDate || '',
          startDate: c.startDate || c.construction?.startDate || '',
          description: c.description || '',
          descriptionSuccess: c.descriptionSuccess,
          descriptionAudience: c.descriptionAudience,
          paymentTypes: normalizeOptionValues('paymentTypes', c.paymentTypes),
          installmentTerms: c.installmentTerms,
          installmentPlans: c.installmentPlans,
          mortgageTerm: c.mortgageTerm,
          realtorScripts: c.realtorScripts,
          status: c.status === 'active' ? 'active' : c.status === 'archived' ? 'completed' : 'draft',
          
          // Значения опций из API могут быть legacy-русскими — нормализуем к каноническим слагам.
          country: normalizeOptionValue('countries', c.country) || undefined,
          city: normalizeOptionValue('cities', c.city) || undefined,
          address: c.location,
          propertyType: normalizeOptionValues('propertyTypes', c.propertyType) as IProject['propertyType'],
          wallMaterial: (normalizeOptionValue('wallMaterials', c.wallMaterial) || undefined) as IProject['wallMaterial'],
          finishTypes: normalizeOptionValues('finishTypes', c.finishTypes) as IProject['finishTypes'],
          ceilingHeight: normalizeOptionValue('ceilingHeights', c.ceilingHeight) || undefined,
          elevatorTypes: normalizeOptionValues('elevatorTypes', c.elevatorTypes) as IProject['elevatorTypes'],
          parkingTypes: normalizeOptionValues('parkingTypes', c.parkingTypes) as IProject['parkingTypes'],
          parkingSpots: c.parkingSpots,
          viewTypes: normalizeOptionValues('views', c.viewTypes) as IProject['viewTypes'],
          hasGas: c.hasGas,
          waterSupply: (normalizeOptionValue('waterSupply', c.waterSupply) || undefined) as IProject['waterSupply'],
          sewerage: (normalizeOptionValue('sewerage', c.sewerage) || undefined) as IProject['sewerage'],
          buildingPermit: c.buildingPermit,
          infrastructureExternal: normalizeOptionValues('infraExternal', c.infrastructureExternal),
          infrastructureInternal: normalizeOptionValues('infraInternal', c.infrastructureInternal),
          infrastructureLocation: normalizeOptionValues('infraLocation', c.infrastructureLocation),
          renders: mapFileEntities(c.renders),
          constructionProgress: mapFileEntities(c.constructionProgress),
          districtGallery: mapFileEntities(c.districtGallery),
          districtText: c.districtText,
          documents: mapFileEntities(c.documents),
          rentalYieldShort: c.rentalYieldShort,
          rentalYieldLong: c.rentalYieldLong,
          investmentYield: c.investmentYield,
          rentalText: c.rentalText,
          investmentText: c.investmentText,
          youtubeLink: c.youtubeLink,
          areaPolygon: c.areaPolygon,
          locationCenter: c.locationCenter,
          promotions: c.promotions,
          areaFrom: c.areaFrom,
          areaTo: c.areaTo,
          priceFrom: c.priceFrom,
          priceTo: c.priceTo,
          priceFromUsd: c.priceFromUsd,
          priceToUsd: c.priceToUsd,
          floorsFrom: c.floorsFrom,
          floorsTo: c.floorsTo,
        }

        setStoreState((state) => ({
          projects: state.projects.map(p => p._id === id ? mappedProject : p)
        }))
        return mappedProject
      }
    } catch (error) {
      console.error('Failed to fetch project detail:', error)
    }
    return undefined
  },

  fetchBuildings: async (projectId) => {
    const requestId = ++buildingsRequestSeq
    // Immediately mark "no complex loaded yet" so the chessboard shows a loader
    // instead of the previous complex's buildings/units while this request is in flight.
    setStoreState({ buildingsProjectId: null })
    try {
    const directMockBuildings = BUILDINGS_MOCK.filter((building) => building.project === projectId)
    if (directMockBuildings.length > 0) {
      const directMockBuildingIds = new Set(directMockBuildings.map((building) => building._id))
      const directMockUnits = UNITS_MOCK
        .filter((unit) => directMockBuildingIds.has(unit.building))
        .map(hydrateUnitFinishPrices)
      const directMockPlans = cloneMockFloorPlans().filter((plan) => directMockBuildingIds.has(plan.buildingId))
      setStoreState((state) => ({
        allBuildings: mergeById(directMockBuildings, state.allBuildings),
        buildings: directMockBuildings,
        activeBuildingId: directMockBuildings[0]._id,
        allUnits: mergeById(directMockUnits, state.allUnits),
        units: directMockUnits,
        floorPlans: [
          ...state.floorPlans.filter((plan) => !directMockBuildingIds.has(plan.buildingId)),
          ...directMockPlans,
        ],
      }))
      return
    }

    // DEV: use mock chessboard for these complexes until real API data is available
    // const DEV_MOCK_PROJECT_IDS = ['69ad2bf244b7243fe62ad279', 'c1', 'c2']
    const DEV_MOCK_PROJECT_IDS = ['c1', 'c2']
    const useMockFallback = (pid: string) => {
      const mockProjectId = 'proj-zarechye'
      const mockBuildings = BUILDINGS_MOCK.filter(b => b.project === mockProjectId)
        .map(b => ({ ...b, project: pid }))
      if (mockBuildings.length > 0) {
        setStoreState({
          allBuildings: mockBuildings,
          buildings: mockBuildings,
          activeBuildingId: mockBuildings[0]._id,
          units: [],
        })
        return mockBuildings[0]._id
      }
      return null
    }

    if (DEV_MOCK_PROJECT_IDS.includes(projectId)) {
      const firstBuildingId = useMockFallback(projectId)
      if (firstBuildingId) await getStoreState().fetchUnits(firstBuildingId)
      return
    }

    try {
      const resp = await developmentApi.getBuildings(projectId)
      // A newer complex request started while this one was in flight — drop this
      // (now stale) result so it can't clobber the store with the previous complex.
      if (requestId !== buildingsRequestSeq) return
      if (resp.success) {
        const mappedBuildings: IBuilding[] = resp.data.map(b => ({
          _id: b.id,
          project: projectId,
          name: b.name,
          floors: b.floors || 0,
          unitsPerFloor: 0,
          completionDate: b.completionDate || '',
          startDate: b.startDate || '',
          polygon: b.polygon,
        }))

        const firstBuildingId = mappedBuildings[0]?._id ?? null
        const projectCurrency = getStoreState().projects.find((p) => p._id === projectId)?.currency || 'USD'

        if (resp.units && resp.units.length > 0) {
          const mappedUnits: IUnit[] = resp.units.map((u: any) => hydrateUnitFinishPrices({
            _id: u.id,
            building: u.buildingId,
            sectionId: u.sectionId ?? undefined,
            sectionName: u.sectionName ?? undefined,
            floor: u.floor,
            positionInFloor: u.positionInFloor,
            number: u.number,
            rooms: normalizeRooms(u.roomsStr || u.rooms),
            area: roundArea(u.area),
            price: u.price,
            pricePerSqm: u.pricePerSqm ?? (u.area ? Math.round(u.price / u.area) : 0),
            finishPrices: normalizeFinishPrices(u.finishPrices ?? u.details?.finishPrices),
            currency: u.currency || projectCurrency,
            status: u.status === 'available' ? 'free' as const : u.status === 'reserved' ? 'booked' as const : u.status === 'sold' ? 'sold' as const : 'withdrawn' as const,
            layoutImageUrl: u.image?.url,
            imageFileId: u.image?.id ?? u.imageFileId ?? undefined,
            floorPlanUrl: u.floorPlanUrl ?? undefined,
            plot: parsePlotToPolygon(u.plot),
          }))

          const maxPosByBuilding = new Map<string, number>()
          for (const u of mappedUnits) {
            const pos = u.positionInFloor ?? 0
            const cur = maxPosByBuilding.get(u.building) ?? 0
            if (pos > cur) maxPosByBuilding.set(u.building, pos)
          }
          const fixedBuildings = mappedBuildings.map(b => ({
            ...b,
            floors: 0,
            unitsPerFloor: maxPosByBuilding.get(b._id) ?? undefined,
          }))

          setStoreState((state) => ({
            allBuildings: mergeById(BUILDINGS_MOCK, [
              ...state.allBuildings.filter((building) => building.project !== projectId),
              ...fixedBuildings,
            ]),
            buildings: fixedBuildings,
            activeBuildingId: firstBuildingId,
            allUnits: mergeById(UNITS_MOCK, [
              ...state.allUnits.filter((unit) => !fixedBuildings.some((building) => building._id === unit.building)),
              ...mappedUnits,
            ]),
            units: mappedUnits,
          }))
        }

        if (resp.installment) {
          try {
            const key = `developer.sales.installments.${projectId}`
            localStorage.setItem(key, JSON.stringify(resp.installment))
          } catch { /* ignore */ }
        }

        if (!(resp.units && resp.units.length > 0)) {
          setStoreState((state) => ({
            allBuildings: mergeById(BUILDINGS_MOCK, [
              ...state.allBuildings.filter((building) => building.project !== projectId),
              ...mappedBuildings,
            ]),
            buildings: mappedBuildings,
            activeBuildingId: firstBuildingId,
            units: [],
          }))

          if (firstBuildingId) {
            await getStoreState().fetchUnits(firstBuildingId)
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch buildings:', error)
      if (requestId !== buildingsRequestSeq) return
      const mockBuildings = BUILDINGS_MOCK.filter(b => b.project === projectId)
      if (mockBuildings.length > 0) {
        setStoreState({
          allBuildings: mockBuildings,
          buildings: mockBuildings,
          activeBuildingId: mockBuildings[0]._id,
          units: [],
        })
        await getStoreState().fetchUnits(mockBuildings[0]._id)
      }
    }
    } finally {
      // Помечаем загруженный проект только для самого свежего запроса,
      // чтобы поздно завершившийся старый запрос не сбил состояние загрузки.
      if (requestId === buildingsRequestSeq) {
        setStoreState({ buildingsProjectId: projectId })
      }
    }
  },

  fetchUnits: async (buildingId) => {
    const requestId = ++unitsRequestSeq
    // DEV: skip API for mock building IDs
    const isMockBuilding = BUILDINGS_MOCK.some(b => b._id === buildingId)
    if (isMockBuilding) {
      const mockUnits = UNITS_MOCK.filter(u => u.building === buildingId).map(hydrateUnitFinishPrices)
      setStoreState({
        activeBuildingId: buildingId,
        allUnits: mergeById(mockUnits, getStoreState().allUnits),
        units: mockUnits,
      })
      return
    }

    try {
      const resp = await developmentApi.getUnits({ buildingId, limit: 1000 })
      // A newer units request started meanwhile — drop this stale result.
      if (requestId !== unitsRequestSeq) return
      if (resp.success) {
        const building =
          getStoreState().allBuildings.find((b) => b._id === buildingId) ||
          getStoreState().buildings.find((b) => b._id === buildingId)
        const projectId = building?.project || getStoreState().activeProjectId
        const projectCurrency =
          getStoreState().projects.find((p) => p._id === projectId)?.currency || 'USD'

        const mappedUnits: IUnit[] = resp.data.items.map((u) => hydrateUnitFinishPrices({
          _id: u.id,
          building: buildingId,
          floor: u.floor,
          positionInFloor: u.positionInFloor ?? 1,
          number: u.number,
          rooms: normalizeRooms(u.rooms),
          area: roundArea(u.area),
          price: u.price,
          pricePerSqm: u.pricePerSqm ?? (u.area ? Math.round(u.price / u.area) : 0),
          finishPrices: normalizeFinishPrices(u.finishPrices),
          currency: u.currency || projectCurrency,
          status: u.status === 'available' ? 'free' : u.status === 'reserved' ? 'booked' : u.status === 'sold' ? 'sold' : 'withdrawn',
          plot: parsePlotToPolygon(u.plot),
        }))

        setStoreState((state) => ({
          activeBuildingId: buildingId,
          allUnits: mergeById(UNITS_MOCK, [
            ...state.allUnits.filter((unit) => unit.building !== buildingId),
            ...mappedUnits,
          ]),
          units: mappedUnits,
        }))
      }
    } catch (error) {
      console.error('Failed to fetch units:', error)
      if (requestId !== unitsRequestSeq) return
      const mockUnits = UNITS_MOCK
        .filter(u => BUILDINGS_MOCK.some(b => b._id === u.building))
        .map(hydrateUnitFinishPrices)
      if (mockUnits.length > 0) {
        setStoreState({
          activeBuildingId: buildingId,
          allUnits: mockUnits,
          units: mockUnits.filter(u => u.building === buildingId),
        })
      }
    }
  },

  fetchLayouts: async (buildingId) => {
    const requestId = ++layoutsRequestSeq
    const mockLayouts = LAYOUTS_MOCK.filter((layout) => layout.buildingId === buildingId)
    if (mockLayouts.length > 0) {
      setStoreState({ layouts: mockLayouts })
      return
    }


    try {
      const resp = await developmentApi.getLayouts({ buildingId, limit: 100 })
      // A newer layouts request started meanwhile — drop this stale result.
      if (requestId !== layoutsRequestSeq) return
      if (resp.success) {
        const mappedLayouts: ILayout[] = resp.data.items.map((l: any) => ({
          _id: l.id,
          buildingId: buildingId,
          name: l.name,
          rooms: roomsFromNumber(l.rooms),
          area: roundArea(l.area) ?? 0,
          isEuro: l.isEuro,
          imageUrl: l.plan?.url || l.imageUrl,
          tags: l.tags,
        }))
        setStoreState({ layouts: mappedLayouts })
      }
    } catch (error) {
      console.error('Failed to fetch layouts:', error)
      if (requestId !== layoutsRequestSeq) return
      const fallbackLayouts: ILayout[] = LAYOUTS_MOCK.map(l => ({
        _id: l._id,
        buildingId: l.buildingId,
        name: l.name,
        rooms: l.rooms,
        area: l.area,
        isEuro: l.isEuro,
        imageUrl: l.imageUrl,
        tags: l.tags
      }))
      setStoreState({ layouts: fallbackLayouts })
    }
  },

  addProject: async (data) => {
    try {
      const resp = await developmentApi.createComplex({
        name: data.name,
        status: 'draft',
        class: 'comfort',
        description: data.description,
        descriptionSuccess: data.descriptionSuccess,
        descriptionAudience: data.descriptionAudience,
        country: data.country,
        city: data.city || data.location,
        developer: data.developer,
        coastline: data.coastline,
        propertyType: data.propertyType,
        wallMaterial: data.wallMaterial,
        finishTypes: data.finishTypes,
        ceilingHeight: data.ceilingHeight,
        elevatorTypes: data.elevatorTypes,
        parkingTypes: data.parkingTypes,
        parkingSpots: data.parkingSpots,
        viewTypes: data.viewTypes,
        hasGas: data.hasGas,
        waterSupply: data.waterSupply,
        sewerage: data.sewerage,
        buildingPermit: data.buildingPermit,
        infrastructureExternal: data.infrastructureExternal,
        infrastructureInternal: data.infrastructureInternal,
        infrastructureLocation: data.infrastructureLocation,
        paymentTypes: data.paymentTypes,
        installmentTerms: data.installmentTerms,
        mortgageTerm: data.mortgageTerm,
        realtorScripts: data.realtorScripts,
        startDate: data.startDate,
        completionDate: data.completionDate,
        youtubeLink: data.youtubeLink,
        renders: data.renders,
        constructionProgress: data.constructionProgress,
        areaPolygon: data.areaPolygon,
        locationCenter: data.locationCenter,
      })
      if (resp.success) {
        await getStoreState().fetchProjects()
        return resp.data.id
      }
    } catch (error) {
      console.error('Failed to add project:', error)
      throw error
    }
    return ''
  },

  addProjectWithFormData: async (formData) => {
    try {
      const resp = await developmentApi.createComplexWithFormData(formData)
      if (resp.success) {
        await getStoreState().fetchProjects()
        return resp.data.id
      }
      console.error('Server returned success=false:', resp)
    } catch (error: any) {
      const respData = error?.response?.data
      const status = error?.response?.status
      console.error('❌ createComplexWithFormData failed:', { status, respData, error })
      if (respData?.field) console.error('⚠️ Problematic field:', respData.field)
    }
    return ''
  },

  addProjectWithId: (_id, data) => {
    return getStoreState().addProject(data)
  },

  updateProject: async (id, data) => {
    try {
      await developmentApi.updateComplex(id, {
        name: data.name,
        status: data.status === 'active' ? 'active' : 'draft',
        description: data.description,
        descriptionSuccess: data.descriptionSuccess,
        descriptionAudience: data.descriptionAudience,
        country: data.country,
        city: data.city || data.location,
        developer: data.developer,
        coastline: data.coastline,
        propertyType: data.propertyType,
        wallMaterial: data.wallMaterial,
        finishTypes: data.finishTypes,
        ceilingHeight: data.ceilingHeight,
        elevatorTypes: data.elevatorTypes,
        parkingTypes: data.parkingTypes,
        parkingSpots: data.parkingSpots,
        viewTypes: data.viewTypes,
        hasGas: data.hasGas,
        waterSupply: data.waterSupply,
        sewerage: data.sewerage,
        buildingPermit: data.buildingPermit,
        infrastructureExternal: data.infrastructureExternal,
        infrastructureInternal: data.infrastructureInternal,
        infrastructureLocation: data.infrastructureLocation,
        paymentTypes: data.paymentTypes,
        installmentTerms: data.installmentTerms,
        mortgageTerm: data.mortgageTerm,
        realtorScripts: data.realtorScripts,
        startDate: data.startDate,
        completionDate: data.completionDate,
        youtubeLink: data.youtubeLink,
        renders: data.renders,
        constructionProgress: data.constructionProgress,
        areaPolygon: data.areaPolygon,
        locationCenter: data.locationCenter,
      })
      await getStoreState().fetchProjects()
    } catch (error) {
      console.error('Failed to update project:', error)
      throw error
    }
  },

  updateProjectWithFormData: async (id, formData) => {
    try {
      await developmentApi.updateComplexWithFormData(id, formData)
      await getStoreState().fetchProjects()
    } catch (error: any) {
      const respData = error?.response?.data
      const status = error?.response?.status
      console.error('❌ updateComplexWithFormData failed:', { status, respData, error })
      if (respData?.field) console.error('⚠️ Problematic field:', respData.field)
    }
  },

  deleteProject: async (id) => {
    try {
      await developmentApi.deleteComplex(id)
      await getStoreState().fetchProjects()
    } catch (error) {
      console.error('Failed to delete project:', error)
      throw error
    }
  },

  addBuilding: async (projectId, data) => {
    try {
      const resp = await developmentApi.createBuilding(projectId, {
        name: data.name || 'Корпус',
        floors: data.floors,
        completionDate: data.completionDate,
        startDate: data.startDate,
        polygon: data.polygon,
      })
      if (resp.success) {
        await getStoreState().fetchBuildings(projectId)
        return resp.data.id
      }
    } catch (error) {
      console.error('Failed to add building:', error)
      throw error
    }
    return ''
  },

  updateBuilding: async (buildingId, data) => {
    try {
      const payload: { name?: string; floors?: number; completionDate?: string; startDate?: string; polygon?: [number, number][] } = {}
      if (data.name !== undefined) payload.name = data.name
      if (data.floors !== undefined) payload.floors = data.floors
      if (data.completionDate !== undefined) payload.completionDate = data.completionDate
      if (data.startDate !== undefined) payload.startDate = data.startDate
      if (data.polygon !== undefined) payload.polygon = data.polygon

      const resp = await developmentApi.updateBuilding(buildingId, payload)
      if (resp.success) {
        const projectId = getStoreState().activeProjectId
        if (projectId) await getStoreState().fetchBuildings(projectId)
      }
    } catch (error) {
      console.error('Failed to update building:', error)
      throw error
    }
  },

  deleteBuilding: async (buildingId) => {
    try {
      await developmentApi.deleteBuilding(buildingId)
      const projectId = getStoreState().activeProjectId
      if (projectId) await getStoreState().fetchBuildings(projectId)
    } catch (error) {
      console.error('Failed to delete building:', error)
      throw error
    }
  },

  addUnit: async (buildingId, newUnitData) => {
    try {
      const activeComplexId = getStoreState().activeProjectId
      if (!activeComplexId) return
      
      const finishPrices = normalizeFinishPrices(newUnitData.finishPrices)
      const pricePerSqm = newUnitData.pricePerSqm ?? getPrimaryFinishPrice(finishPrices)
      const price =
        newUnitData.price ??
        (typeof pricePerSqm === 'number' && typeof newUnitData.area === 'number'
          ? Math.round(pricePerSqm * newUnitData.area)
          : 0)
      const resp = await createUnitWithFinishPricesFallback({
        complexId: activeComplexId,
        buildingId,
        floor: newUnitData.floor,
        number: newUnitData.number,
        rooms: normalizeRooms(newUnitData.rooms) || 'studio',
        area: roundArea(newUnitData.area) ?? 0,
        price,
        pricePerSqm,
        finishPrices,
        status: newUnitData.status === 'free' ? 'available' : newUnitData.status === 'booked' ? 'reserved' : newUnitData.status === 'sold' ? 'sold' : 'hidden',
        currency: newUnitData.currency || getStoreState().projects.find(p => p._id === activeComplexId)?.currency || 'USD',
        finishing: 'none',
        windowsSide: normalizeViewType(newUnitData.viewType) || 'unknown',
      })
      if (resp.success) {
        if (finishPrices) persistUnitFinishPrices(resp.data.id, finishPrices)
        await getStoreState().fetchUnits(buildingId)
      }
    } catch (error) {
      console.error('Failed to add unit:', error)
      throw error
    }
  },

  addUnitWithId: (buildingId, _unitId, data) => {
    return getStoreState().addUnit(buildingId, data)
  },

  addUnitsBulk: (buildingId, items) => {
    return Promise.all(items.map(item => getStoreState().addUnit(buildingId, item)))
  },

  replaceBuildingUnits: async (buildingId, items) => {
    const activeComplexId = getStoreState().activeProjectId
    if (!activeComplexId) throw new Error('Не выбран ЖК')

    // Собираем ВСЕ существующие ID юнитов корпуса: как с сервера (getUnits), так и из локального стора
    const existingUnitIds = new Set<string>()

    // 1. Пытаемся получить полный список юнитов корпуса напрямую с API
    try {
      const serverUnitsResp = await developmentApi.getUnits({ buildingId, limit: 2000 })
      if (serverUnitsResp?.success && serverUnitsResp.data?.items) {
        serverUnitsResp.data.items.forEach((u) => {
          if (u.id) existingUnitIds.add(u.id)
        })
      }
    } catch (e) {
      console.warn('[replaceBuildingUnits] Не удалось загрузить существующие юниты с сервера:', e)
    }

    // 2. Также добавляем все локально известные юниты корпуса
    getStoreState()
      .allUnits.filter((u) => u.building === buildingId)
      .forEach((u) => {
        if (u._id) existingUnitIds.add(u._id)
      })

    // 3. Удаляем все существующие юниты
    if (existingUnitIds.size > 0) {
      await Promise.allSettled(
        Array.from(existingUnitIds).map(async (unitId) => {
          try {
            await developmentApi.deleteUnit(unitId)
          } catch (e) {
            console.error(`Failed to delete unit ${unitId}:`, e)
          }
        }),
      )
    }

    // 4. Создаем новые юниты
    if (items.length > 0) {
      await Promise.all(
        items.map(async (newUnitData) => {
          const finishPrices = normalizeFinishPrices(newUnitData.finishPrices)
          const pricePerSqm = newUnitData.pricePerSqm ?? getPrimaryFinishPrice(finishPrices)
          const price =
            newUnitData.price ??
            (typeof pricePerSqm === 'number' && typeof newUnitData.area === 'number'
              ? Math.round(pricePerSqm * newUnitData.area)
              : 0)
          
          const resp = await createUnitWithFinishPricesFallback({
            complexId: activeComplexId,
            buildingId,
            floor: newUnitData.floor,
            number: newUnitData.number,
            rooms: normalizeRooms(newUnitData.rooms) || 'studio',
            area: roundArea(newUnitData.area) ?? 0,
            price,
            pricePerSqm,
            finishPrices,
            status:
              newUnitData.status === 'free'
                ? 'available'
                : newUnitData.status === 'booked'
                ? 'reserved'
                : newUnitData.status === 'sold'
                ? 'sold'
                : 'hidden',
            currency: newUnitData.currency || getStoreState().projects.find(p => p._id === activeComplexId)?.currency || 'USD',
            finishing: 'none',
            windowsSide: normalizeViewType(newUnitData.viewType) || 'unknown',
          })
          if (resp.success && finishPrices) {
            persistUnitFinishPrices(resp.data.id, finishPrices)
          }
        })
      )
    }

    // 5. Очищаем старые юниты этого корпуса в сторе перед свежей подгрузкой
    setStoreState((state) => ({
      allUnits: state.allUnits.filter((unit) => unit.building !== buildingId),
      units: state.activeBuildingId === buildingId ? [] : state.units,
    }))

    await getStoreState().fetchUnits(buildingId)
  },

  uploadUnitsExcel: async (buildingId, file) => {
    const estateId = getStoreState().activeProjectId
    if (!estateId) throw new Error('Не выбран ЖК (estateId)')
    if (!buildingId) throw new Error('Не выбран корпус (buildingId)')

    const resp = await developmentApi.uploadUnitsExcel(file, estateId, buildingId)
    if (!resp.success || !resp.data) {
      throw new Error(resp.message || 'Сервер не смог обработать файл')
    }

    await getStoreState().fetchBuildings(estateId)

    return resp.data
  },

  applyImportedFinishPrices: (buildingId, rows) => {
    const pricesByNumber = new Map(
      rows.flatMap((row) => {
        const prices = normalizeFinishPrices(row.finishPrices)
        return prices ? [[row.number, prices] as const] : []
      }),
    )
    if (pricesByNumber.size === 0) return

    setStoreState((state) => {
      const nextAllUnits = state.allUnits.map((unit) => {
        if (unit.building !== buildingId) return unit
        const finishPrices = pricesByNumber.get(unit.number)
        if (!finishPrices) return unit
        persistUnitFinishPrices(unit._id, finishPrices)
        return { ...unit, finishPrices }
      })
      return {
        allUnits: nextAllUnits,
        units: state.activeBuildingId
          ? nextAllUnits.filter((unit) => unit.building === state.activeBuildingId)
          : [],
      }
    })
  },

  updateUnit: async (unitId, updatedData) => {
    try {
      const existing = getStoreState().allUnits.find((u) => u._id === unitId)
      const resp = await updateUnitWithFinishPricesFallback(unitId, toApiUnitPatch(updatedData, existing))
      if (resp.success) {
        if ('finishPrices' in updatedData) {
          persistUnitFinishPrices(unitId, updatedData.finishPrices)
        }
        const activeBuildingId = getStoreState().activeBuildingId
        if (activeBuildingId) await getStoreState().fetchUnits(activeBuildingId)
      }
    } catch (error) {
      console.error('Failed to update unit:', error)
      throw error
    }
  },

  deleteUnit: async (unitId) => {
    try {
      const resp = await developmentApi.deleteUnit(unitId)
      if (resp.success) {
        const activeBuildingId = getStoreState().activeBuildingId
        if (activeBuildingId) await getStoreState().fetchUnits(activeBuildingId)
      }
    } catch (error) {
      console.error('Failed to delete unit:', error)
      throw error
    }
  },

  updateUnitsBulk: async (unitIds, updatedData) => {
    return patchUnitsBatch(unitIds.map((unitId) => ({ unitId, updatedData })))
  },

  updateUnitsBulkEntries: async (entries) => {
    return patchUnitsBatch(entries)
  },

  applyBulkPriceChange: async (unitIds, value, type) => {
    const state = getStoreState()
    const entries: BulkUpdateEntry[] = []

    for (const unitId of unitIds) {
      const unit = state.allUnits.find((u) => u._id === unitId)
      if (!unit) continue
      const currentPrice = unit.price ?? 0
      const nextPrice =
        type === 'percentage'
          ? Math.round(currentPrice * (1 + value / 100))
          : Math.max(0, currentPrice + value)
      entries.push({
        unitId,
        updatedData: {
          price: nextPrice,
          pricePerSqm: unit.area ? Math.round(nextPrice / unit.area) : unit.pricePerSqm,
        },
      })
    }

    return patchUnitsBatch(entries)
  },

  applyBulkPromotion: (unitIds, promotion) => {
    setStoreState((state) => {
      if (unitIds.length === 0) return {}
      const ids = new Set(unitIds)
      const nextAllUnits = state.allUnits.map((unit) => {
        if (!ids.has(unit._id)) return unit
        const promo: UnitPromotion = {
          kind: promotion.kind,
          label: promotion.label,
          isActive: true,
          discountPercent: (promotion.kind === 'price_discount') ? promotion.discountPercent : undefined,
          discountPerSqm: (promotion.kind === 'price_discount') ? promotion.discountPerSqm : undefined,
          downPaymentPercent: (promotion.kind === 'installment') ? promotion.downPaymentPercent : undefined,
          installmentMonths: (promotion.kind === 'installment') ? promotion.installmentMonths : undefined,
          giftText: (promotion.kind === 'gift') ? promotion.giftText : undefined,
          expiresAt: promotion.expiresAt,
        }
        return { ...unit, promotion: promo }
      })
      return { allUnits: nextAllUnits, units: state.activeBuildingId ? nextAllUnits.filter(u => u.building === state.activeBuildingId) : [] }
    })
  },

  clearBulkPromotion: (unitIds) => {
    setStoreState((state) => {
      if (unitIds.length === 0) return {}
      const ids = new Set(unitIds)
      const nextAllUnits = state.allUnits.map((unit) => ids.has(unit._id) ? { ...unit, promotion: undefined } : unit)
      return { allUnits: nextAllUnits, units: state.activeBuildingId ? nextAllUnits.filter(u => u.building === state.activeBuildingId) : [] }
    })
  },

  replaceAllUnits: (units) => {
    const hydrated = units.map(hydrateUnitFinishPrices)
    setStoreState({
      allUnits: hydrated,
      units: storeState.activeBuildingId ? hydrated.filter((unit) => unit.building === storeState.activeBuildingId) : [],
    })
  },

  addLayout: async (buildingId, data) => {
    // Contract per api-zapros.md §5 (POST /development/layouts).
    const resp = await developmentApi.createLayout({
      complexId: getStoreState().activeProjectId,
      buildingId,
      name: data.name,
      rooms: roomsToNumber(data.rooms),
      area: roundArea(data.area),
      isEuro: !!data.isEuro,
      planFileId: data.planFileId,
      tags: data.tags ?? [],
    })
    if (resp.success) {
      await getStoreState().fetchLayouts(buildingId)
    }
  },

  updateLayout: async (layoutId, data) => {
    const resp = await developmentApi.updateLayout(layoutId, {
      complexId: getStoreState().activeProjectId,
      buildingId: data.buildingId ?? getStoreState().activeBuildingId ?? undefined,
      name: data.name,
      rooms: data.rooms != null ? roomsToNumber(data.rooms) : undefined,
      area: roundArea(data.area),
      isEuro: data.isEuro,
      planFileId: data.planFileId,
      tags: data.tags,
    })
    if (resp.success) {
      // Refresh from the edited layout's own building, not the (possibly stale)
      // activeBuildingId — the library view keeps its own building selection,
      // otherwise layouts from another block leak into the current one.
      const buildingId = data.buildingId ?? getStoreState().activeBuildingId
      if (buildingId) await getStoreState().fetchLayouts(buildingId)
    }
  },

  deleteLayout: async (layoutId) => {
    const before = getStoreState().layouts
    const target = before.find((l) => l._id === layoutId)
    const resp = await developmentApi.deleteLayout(layoutId)
    if (!resp.success) {
      throw new Error(resp.message || 'Сервер не подтвердил удаление планировки')
    }
    // Optimistically drop the card so the UI reflects the delete even if the
    // refetch below targets a stale building.
    setStoreState({ layouts: getStoreState().layouts.filter((l) => l._id !== layoutId) })
    // Refresh from the deleted layout's own building, not the (possibly stale)
    // activeBuildingId — this view keeps its own building selection.
    const buildingId = target?.buildingId ?? getStoreState().activeBuildingId
    if (buildingId) await getStoreState().fetchLayouts(buildingId)
  },

  setUnitsLayoutImage: (unitIds, imageUrl) => {
    setStoreState((state) => {
      const ids = new Set(unitIds)
      const nextAllUnits = state.allUnits.map((u) => (ids.has(u._id) ? { ...u, layoutImageUrl: imageUrl } : u))
      return {
        allUnits: nextAllUnits,
        units: state.activeBuildingId ? nextAllUnits.filter((u) => u.building === state.activeBuildingId) : [],
      }
    })
  },

  attachLayoutToUnits: async (unitIds, layout) => {
    const results = await Promise.allSettled(
      unitIds.map((id) => developmentApi.updateUnit(id, { layoutId: layout._id })),
    )
    const okIds = new Set<string>()
    let failed = 0
    results.forEach((res, i) => {
      if (res.status === 'fulfilled' && res.value.success) okIds.add(unitIds[i])
      else failed += 1
    })

    if (okIds.size > 0) {
      setStoreState((state) => {
        const nextAllUnits = state.allUnits.map((u) =>
          okIds.has(u._id)
            ? { ...u, layoutId: layout._id, layoutImageUrl: layout.imageUrl ?? u.layoutImageUrl }
            : u,
        )
        return {
          allUnits: nextAllUnits,
          units: state.activeBuildingId ? nextAllUnits.filter((u) => u.building === state.activeBuildingId) : [],
        }
      })
    }

    return { ok: okIds.size, failed }
  },

  setUnitPlanImage: async (unitId, imageFileId) => {
    const resp = await developmentApi.updateUnit(unitId, { imageFileId })
    if (!resp.success) {
      throw new Error(resp.message || 'Не удалось привязать план лота')
    }
    const nextUrl = resp.data?.image?.url
    const nextFileId = resp.data?.image?.id ?? (imageFileId || undefined)
    setStoreState((state) => {
      const nextAllUnits = state.allUnits.map((u) =>
        u._id === unitId
          ? { ...u, layoutImageUrl: imageFileId ? nextUrl ?? u.layoutImageUrl : undefined, imageFileId: imageFileId ? nextFileId : undefined }
          : u,
      )
      return {
        allUnits: nextAllUnits,
        units: state.activeBuildingId ? nextAllUnits.filter((u) => u.building === state.activeBuildingId) : [],
      }
    })
  },

  setFloorPlanImage: (buildingId, floor, imageDataUrl, imageId) => {
    setStoreState((state) => {
      const existing = state.floorPlans.find((fp) => fp.buildingId === buildingId && fp.floor === floor)
      let nextFloorPlans: FloorPlan[]
      if (existing) {
        nextFloorPlans = state.floorPlans.map((fp) =>
          fp.buildingId === buildingId && fp.floor === floor
            ? { ...fp, imageDataUrl, imageId: imageId ?? fp.imageId }
            : fp,
        )
      } else {
        nextFloorPlans = [...state.floorPlans, { buildingId, floor, imageDataUrl, imageId, polygons: [], places: [] }]
      }
      return { floorPlans: nextFloorPlans }
    })
  },

  fetchBuildingPlans: async (buildingId) => {
    const requestId = ++buildingPlansRequestSeq
    const mockPlans = cloneMockFloorPlans().filter((plan) => plan.buildingId === buildingId)
    if (mockPlans.length > 0) {
      setStoreState((state) => ({
        floorPlans: [...state.floorPlans.filter((plan) => plan.buildingId !== buildingId), ...mockPlans],
      }))
      return
    }

    try {
      const resp = await developmentApi.getBuildingPlans(buildingId)
      // A newer plans request started meanwhile — drop this stale result.
      if (requestId !== buildingPlansRequestSeq) return
      if (!resp.success) return
      // Units must be loaded so polygons can resolve to a unit at render time
      // (label / tooltip / click). The polygon geometry itself comes straight
      // from the structured `apartments` records below.
      if (!getStoreState().allUnits.some((u) => u.building === buildingId)) {
        await getStoreState().fetchUnits(buildingId)
        if (requestId !== buildingPlansRequestSeq) return
      }
      const plans: FloorPlan[] = (resp.data.floorPlansData ?? [])
        .map((fpd) => ({
          buildingId,
          floor: Number(fpd.floorNum),
          imageDataUrl: fpd.image?.url ?? '',
          imageId: fpd.imageId,
          // Each apartment record carries its unit id and contour points directly.
          polygons: (fpd.apartments ?? [])
            .map((a) => ({ unitId: a.id, points: parsePlotToPolygon(a.plot) ?? [] }))
            .filter((p): p is UnitPolygon => p.unitId != null && p.points.length >= 3),
          places: [] as FloorPlanPlace[],
        }))
        .filter((p) => !Number.isNaN(p.floor) && p.imageDataUrl !== '')
      setStoreState((state) => ({
        floorPlans: [...state.floorPlans.filter((fp) => fp.buildingId !== buildingId), ...plans],
      }))
    } catch (error) {
      console.error('Failed to fetch building plans:', error)
    }
  },

  uploadFloorPlanImage: async (buildingId, floor, file, applyToType) => {
    const state = getStoreState()
    const building = state.buildings.find((b) => b._id === buildingId)
    const floorType = applyToType
      ? building?.floorTypes?.find((ft) => floor >= ft.rangeFrom && floor <= ft.rangeTo)
      : undefined
    const floors = floorType
      ? Array.from({ length: floorType.rangeTo - floorType.rangeFrom + 1 }, (_, i) => floorType.rangeFrom + i)
      : [floor]

    // Optimistic local preview (also the offline / no-backend fallback).
    try {
      const dataUrl = await readFileAsDataUrl(file)
      floors.forEach((f) => getStoreState().setFloorPlanImage(buildingId, f, dataUrl))
    } catch {
      /* ignore preview failure */
    }

    try {
      const resp = await developmentApi.uploadFloorPlans(buildingId, [file], [`Floor ${floor}`])
      const uploaded = resp.success ? resp.data.uploaded?.[0] : undefined
      if (!uploaded) {
        return { floors, persisted: false, error: resp.message || 'Сервер не вернул загруженный файл' }
      }
      floors.forEach((f) => getStoreState().setFloorPlanImage(buildingId, f, uploaded.url, uploaded.id))
      await Promise.all(floors.map((f) => getStoreState().saveFloorMap(buildingId, f)))
      return { floors, persisted: true }
    } catch (error) {
      console.error('Failed to upload floor plan:', error)
      const message =
        (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
        (error as { message?: string })?.message ||
        'Не удалось загрузить план на сервер'
      return { floors, persisted: false, error: message }
    }
  },

  saveFloorMap: async (buildingId, floor) => {
    const state = getStoreState()
    const floorPlan = state.floorPlans.find((fp) => fp.buildingId === buildingId && fp.floor === floor)
    if (!floorPlan || !floorPlan.imageId) return
    // Apartment contours are persisted per-unit (see saveUnitPlot); this call only
    // associates the uploaded floor-plan image with the floor.
    try {
      await developmentApi.updateFloormap(buildingId, {
        imageId: floorPlan.imageId,
        floorNum: String(floor),
      })
    } catch (error) {
      console.error('Failed to save floor map:', error)
    }
  },

  saveUnitPlot: async (unitId, points) => {
    // Skip API for mock/demo units (no backend record to update).
    if (UNITS_MOCK.some((u) => u._id === unitId)) return
    const plot = points.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)] as [number, number])
    try {
      await developmentApi.updateUnitPlot(unitId, plot)
      setStoreState((state) => ({
        allUnits: state.allUnits.map((u) => (u._id === unitId ? { ...u, plot } : u)),
        units: state.units.map((u) => (u._id === unitId ? { ...u, plot } : u)),
      }))
    } catch (error) {
      console.error('Failed to save unit plot:', error)
    }
  },

  upsertFloorPlanPolygon: (buildingId, floor, unitId, points) => {
    setStoreState((state) => {
      const nextFloorPlans = state.floorPlans.map((fp) => {
        if (fp.buildingId !== buildingId || fp.floor !== floor) return fp
        const existingIdx = fp.polygons.findIndex((p) => p.unitId === unitId)
        const nextPolygons = [...fp.polygons]
        if (existingIdx >= 0) {
          nextPolygons[existingIdx] = { unitId, points }
        } else {
          nextPolygons.push({ unitId, points })
        }
        return { ...fp, polygons: nextPolygons }
      })
      return { floorPlans: nextFloorPlans }
    })
    // Persistence is per-unit now (see saveUnitPlot), triggered once by the caller.
  },

  removeFloorPlanPolygon: (buildingId, floor, unitId) => {
    setStoreState((state) => {
      const nextFloorPlans = state.floorPlans.map((fp) => {
        if (fp.buildingId !== buildingId || fp.floor !== floor) return fp
        return { ...fp, polygons: fp.polygons.filter((p) => p.unitId !== unitId) }
      })
      return { floorPlans: nextFloorPlans }
    })
    // Persistence is per-unit now (see saveUnitPlot), triggered once by the caller.
  },

  addFloorPlanPlace: (buildingId, floor, label) => {
    const id = `place-${Date.now()}`
    setStoreState((state) => {
      const nextFloorPlans = state.floorPlans.map((fp) => {
        if (fp.buildingId !== buildingId || fp.floor !== floor) return fp
        return {
          ...fp,
          places: [...fp.places, { id, label: label || 'Новое место', points: [] }],
        }
      })
      return { floorPlans: nextFloorPlans }
    })
    return id
  },

  upsertFloorPlanPlacePolygon: (buildingId, floor, placeId, points) => {
    setStoreState((state) => {
      const nextFloorPlans = state.floorPlans.map((fp) => {
        if (fp.buildingId !== buildingId || fp.floor !== floor) return fp
        return {
          ...fp,
          places: fp.places.map((p) => (p.id === placeId ? { ...p, points } : p)),
        }
      })
      return { floorPlans: nextFloorPlans }
    })
  },

  removeFloorPlanPlace: (buildingId, floor, placeId) => {
    setStoreState((state) => {
      const nextFloorPlans = state.floorPlans.map((fp) => {
        if (fp.buildingId !== buildingId || fp.floor !== floor) return fp
        return { ...fp, places: fp.places.filter((p) => p.id !== placeId) }
      })
      return { floorPlans: nextFloorPlans }
    })
  },

  setFloorPlanImageForType: (buildingId, floor, imageDataUrl) => {
    const state = getStoreState()
    const building = state.buildings.find((b) => b._id === buildingId)
    if (!building) return []
    const floorType = building.floorTypes?.find((ft) => floor >= ft.rangeFrom && floor <= ft.rangeTo)
    if (!floorType) {
      state.setFloorPlanImage(buildingId, floor, imageDataUrl)
      return [floor]
    }
    const affectedFloors: number[] = []
    for (let f = floorType.rangeFrom; f <= floorType.rangeTo; f += 1) {
      state.setFloorPlanImage(buildingId, f, imageDataUrl)
      affectedFloors.push(f)
    }
    return affectedFloors
  },

  upsertFloorPlanPolygonForType: (buildingId, floor, unitId, points) => {
    const state = getStoreState()
    const building = state.buildings.find((b) => b._id === buildingId)
    if (!building) return []
    const floorType = building.floorTypes?.find((ft) => floor >= ft.rangeFrom && floor <= ft.rangeTo)
    if (!floorType) {
      state.upsertFloorPlanPolygon(buildingId, floor, unitId, points)
      return [floor]
    }
    const affectedFloors: number[] = []
    for (let f = floorType.rangeFrom; f <= floorType.rangeTo; f += 1) {
      state.upsertFloorPlanPolygon(buildingId, f, unitId, points)
      affectedFloors.push(f)
    }
    return affectedFloors
  },

  removeFloorPlanPolygonForType: (buildingId, floor, unitId) => {
    const state = getStoreState()
    const building = state.buildings.find((b) => b._id === buildingId)
    if (!building) return []
    const floorType = building.floorTypes?.find((ft) => floor >= ft.rangeFrom && floor <= ft.rangeTo)
    if (!floorType) {
      state.removeFloorPlanPolygon(buildingId, floor, unitId)
      return [floor]
    }
    const affectedFloors: number[] = []
    for (let f = floorType.rangeFrom; f <= floorType.rangeTo; f += 1) {
      state.removeFloorPlanPolygon(buildingId, f, unitId)
      affectedFloors.push(f)
    }
    return affectedFloors
  },

  copyFloorPolygons: async (buildingId, fromFloor, toFloors) => {
    const state = getStoreState()
    const sourcePlan = state.floorPlans.find(
      (fp) => fp.buildingId === buildingId && fp.floor === fromFloor,
    )
    if (!sourcePlan || sourcePlan.polygons.length === 0) return

    const boundsByFloor = new Map<number, Awaited<ReturnType<typeof detectImageContentBounds>>>()
    if (sourcePlan.imageDataUrl) {
      boundsByFloor.set(fromFloor, await detectImageContentBounds(sourcePlan.imageDataUrl))
    }
    await Promise.all(
      toFloors.map(async (floor) => {
        const targetPlan = state.floorPlans.find((fp) => fp.buildingId === buildingId && fp.floor === floor)
        if (!targetPlan?.imageDataUrl) {
          boundsByFloor.set(floor, null)
          return
        }
        boundsByFloor.set(floor, await detectImageContentBounds(targetPlan.imageDataUrl))
      }),
    )

    // Group units by floor and order each floor's units into stable "slots" so a
    // contour can be mapped from the source apartment to the apartment in the same
    // slot on every target floor. Prefer positionInFloor; fall back to the numeric
    // apartment number (301 → 401 → 501 ...).
    const orderUnits = (units: IUnit[]) =>
      [...units].sort(
        (a, b) =>
          (a.positionInFloor ?? 0) - (b.positionInFloor ?? 0) ||
          a.number.localeCompare(b.number, undefined, { numeric: true }),
      )
    const unitsByFloor = new Map<number, IUnit[]>()
    for (const u of state.allUnits) {
      if (u.building !== buildingId) continue
      const arr = unitsByFloor.get(u.floor) ?? []
      arr.push(u)
      unitsByFloor.set(u.floor, arr)
    }

    const sourceOrdered = orderUnits(unitsByFloor.get(fromFloor) ?? [])
    const slotByUnitId = new Map(sourceOrdered.map((u, i) => [u._id, i]))
    // Each source contour, tagged with its slot index on the source floor.
    const copied = sourcePlan.polygons
      .map((p) => ({ slot: slotByUnitId.get(p.unitId), points: p.points }))
      .filter((c): c is { slot: number; points: [number, number][] } => c.slot !== undefined)
    if (copied.length === 0) return

    const assignments: { unitId: string; points: [number, number][] }[] = []
    setStoreState((s) => {
      let plans = s.floorPlans
      for (const floor of toFloors) {
        const targetOrdered = orderUnits(unitsByFloor.get(floor) ?? [])
        const existing = plans.find((fp) => fp.buildingId === buildingId && fp.floor === floor)
        // "Дублировать" только дозаполняет пустые юниты — не перезаписывает контур,
        // уже обрисованный на целевом этаже (иначе массовое копирование с одного этажа
        // затирает вручную выверенные контуры на всех остальных).
        const existingUnitIds = new Set(existing?.polygons.map((p) => p.unitId) ?? [])
        const newPolys: UnitPolygon[] = []
        for (const c of copied) {
          const targetUnit = targetOrdered[c.slot]
          if (!targetUnit || existingUnitIds.has(targetUnit._id)) continue
          const points = remapPolygonToBounds(
            c.points,
            boundsByFloor.get(fromFloor) ?? null,
            boundsByFloor.get(floor) ?? null,
          )
          newPolys.push({ unitId: targetUnit._id, points })
          assignments.push({ unitId: targetUnit._id, points })
        }
        if (existing) {
          plans = plans.map((fp) =>
            fp.buildingId === buildingId && fp.floor === floor
              ? { ...fp, polygons: mergeCopiedPolygons(fp.polygons, newPolys) }
              : fp,
          )
        } else {
          plans = [...plans, { buildingId, floor, imageDataUrl: '', polygons: newPolys, places: [] }]
        }
      }
      return { floorPlans: plans }
    })

    // Persist each copied contour to its own apartment record.
    assignments.forEach((a) => void getStoreState().saveUnitPlot(a.unitId, a.points))
  },

  shareUnit: (unit, buildingName, projectName, messageText) => {
    setStoreState((state) => {
      const now = Date.now()
      const cleanPrev = state.sharedUnits.filter(u => now - u.sharedAt < 30 * 60 * 1000)
      const filtered = cleanPrev.filter(u => u.unit._id !== unit._id)
      const nextShared = [
        { unit, buildingName, projectName, sharedAt: now, messageText },
        ...filtered
      ]
      try {
        localStorage.setItem('bz26_shared_units', JSON.stringify(nextShared))
        localStorage.setItem('bz26_pending_chat_draft', messageText)
      } catch (e) {
        console.error(e)
      }
      return { sharedUnits: nextShared, pendingChatDraft: messageText }
    })
  },

  clearPendingChatDraft: () => {
    try {
      localStorage.removeItem('bz26_pending_chat_draft')
    } catch (e) {
      console.error(e)
    }
    setStoreState({ pendingChatDraft: null })
  },

  clearExpiredSharedUnits: () => {
    setStoreState((state) => {
      const now = Date.now()
      const clean = state.sharedUnits.filter(u => now - u.sharedAt < 30 * 60 * 1000)
      if (clean.length === state.sharedUnits.length) return {}
      try {
        localStorage.setItem('bz26_shared_units', JSON.stringify(clean))
      } catch (e) {
        console.error(e)
      }
      return { sharedUnits: clean }
    })
  },
}

export function useCoreStore<T>(selector: (state: CoreStoreState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getStoreState()), () => selector(getStoreState()))
}

useCoreStore.getState = getStoreState

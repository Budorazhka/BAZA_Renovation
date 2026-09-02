import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  FileText,
  Grid3X3,
  Image,
  LayoutGrid,
  Layers,
  ListChecks,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import type {
  InstallmentTerm,
  IProject,
  MortgageTerm,
  ProjectClassType,
  ProjectStatus,
  PropertyType,
  RealtorScriptItem,
} from '@/types/core'
import { generateProjectId, useCoreStore } from '@/store/useCoreStore'
import { UNIT_FINISH_TYPES } from '@/lib/unit-finish-pricing'
import { BuildingChessboardWizard } from '@/components/inventory/BuildingChessboardWizard'
import { MapPickerModal } from '@/components/ui/MapPickerModal'
import { AddressSearchInput } from '@/components/ui/AddressSearchInput'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ProjectInstallmentEditor } from '@/components/projects/ProjectInstallmentEditor'
import { getInstallmentStore } from '@/store/useInstallmentStore'
import { developersApi } from '@/services/developersApi'
import { legacyTermToPlan } from '@/lib/installment'
import { useI18n } from '@/i18n'
import {
  CEILING_HEIGHT_OPTIONS,
  COASTLINE_OPTIONS,
  COMPLEX_CLASS_OPTIONS,
  COUNTRY_OPTIONS,
  CURRENCY_CONFIG,
  ELEVATOR_TYPE_OPTIONS,
  INFRA_EXTERNAL_OPTIONS,
  INFRA_INTERNAL_OPTIONS,
  INFRA_LOCATION_OPTIONS,
  PARKING_TYPE_OPTIONS,
  PAYMENT_TYPE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  SEWERAGE_OPTIONS,
  WALL_MATERIAL_OPTIONS,
  WATER_SUPPLY_OPTIONS,
  normalizeOptionValue,
  normalizeOptionValues,
} from '@/lib/project-options'

/* test deploy logs */

/* ─── Types ─────────────────────────────────────────────────── */

interface BuildingDraft {
  key: string
  name: string
  floors: string
  startDate: string
  completionDate: string
  polygon?: [number, number][]
}

function getPolygonCenter(points: [number, number][]): [number, number] | undefined {
  if (!points || points.length === 0) return undefined
  let lat = 0, lng = 0
  points.forEach(p => { lat += p[0]; lng += p[1] })
  return [lat / points.length, lng / points.length]
}

interface WizardData {
  // Step 1 — Основное
  country: string
  city: string
  name: string
  currency: string
  propertyType: PropertyType[]
  classType: ProjectClassType
  coastline: string
  developer: string
  location: string
  status: ProjectStatus
  areaPolygon?: [number, number][]

  // Step 2 — Корпуса
  buildings: BuildingDraft[]
  buildingPermit: boolean | null

  // Step 3 — О проекте
  description: string
  descriptionSuccess: string
  descriptionAudience: string
  startDate: string
  completionDate: string
  wallMaterial: string
  finishTypes: string[]
  ceilingHeight: string
  elevatorTypes: string[]
  parkingTypes: string[]
  parkingSpots: string
  viewTypes: string[]

  // Step 4 — Инфраструктура
  hasGas: boolean | null
  waterSupply: string
  sewerage: string
  infrastructureExternal: string[]
  infrastructureInternal: string[]
  infrastructureLocation: string[]
  districtText: string

  // Step 5 — Условия
  paymentTypes: string[]
  installmentTerms: InstallmentTerm[]
  mortgageTerm: MortgageTerm | null
  realtorScripts: RealtorScriptItem[]
  // Инвестиционно-арендный сценарий (заполняет менеджер застройщика)
  rentalYieldShort: string
  rentalYieldLong: string
  investmentYield: string
  rentalText: string
  investmentText: string

  // Step 6 — Медиа
  youtubeLink: string
  renders: string[]
  constructionProgress: string[]
  renderFiles: File[]
  constructionProgressFiles: File[]
  existingRenders: string[]
  existingConstructionProgress: string[]
  // Галерея района (фото)
  districtGallery: string[]
  districtGalleryFiles: File[]
  existingDistrictGallery: string[]
  // Документы ЖК (PDF)
  documents: string[]
  documentFiles: File[]
  existingDocuments: string[]
}

const EMPTY_DATA: WizardData = {
  country: 'ge',
  city: 'batumi',
  name: '',
  currency: 'USD',
  propertyType: [],
  classType: 'comfort',
  coastline: '',
  developer: '',
  location: '',
  status: 'draft',
  areaPolygon: undefined,
  buildings: [{ key: 'b0', name: 'Корпус 1', floors: '', startDate: '', completionDate: '' }],
  buildingPermit: null,
  description: '',
  descriptionSuccess: '',
  descriptionAudience: '',
  startDate: '',
  completionDate: '',
  wallMaterial: '',
  finishTypes: [],
  ceilingHeight: '',
  elevatorTypes: [],
  parkingTypes: [],
  parkingSpots: '',
  viewTypes: [],
  hasGas: null,
  waterSupply: '',
  sewerage: '',
  infrastructureExternal: [],
  infrastructureInternal: [],
  infrastructureLocation: [],
  districtText: '',
  paymentTypes: [],
  installmentTerms: [],
  mortgageTerm: null,
  realtorScripts: [],
  rentalYieldShort: '',
  rentalYieldLong: '',
  investmentYield: '',
  rentalText: '',
  investmentText: '',
  youtubeLink: '',
  renders: [],
  constructionProgress: [],
  renderFiles: [],
  constructionProgressFiles: [],
  existingRenders: [],
  existingConstructionProgress: [],
  districtGallery: [],
  districtGalleryFiles: [],
  existingDistrictGallery: [],
  documents: [],
  documentFiles: [],
  existingDocuments: [],
}


/* ─── Draft persistence (localStorage) ─────────────────────────
 * Черновик создаваемого ЖК: одновременно создаётся максимум один,
 * поэтому ключ фиксированный (по аналогии с шахматкой корпусов,
 * где ключ — per-project, см. BuildingChessboardWizard.tsx). ── */

const PROJECT_DRAFT_STORAGE_KEY = 'projectWizard.draft.new'

type SerializableWizardData = Omit<
  WizardData,
  'renderFiles' | 'constructionProgressFiles' | 'districtGalleryFiles' | 'documentFiles'
>

interface ProjectWizardDraftSnapshot {
  version: 1
  step: number
  savedAt: number
  data: SerializableWizardData
}

function stripFilesFromWizardData(source: WizardData): SerializableWizardData {
  const { renderFiles, constructionProgressFiles, districtGalleryFiles, documentFiles, ...rest } = source
  return rest
}

function hydrateWizardDataFromDraft(saved: SerializableWizardData): WizardData {
  // Черновик мог быть сохранён до перехода на канонические слаги — нормализуем.
  return {
    ...saved,
    country: normalizeOptionValue('countries', saved.country) || 'ge',
    city: normalizeOptionValue('cities', saved.city),
    currency: saved.currency || 'USD',
    propertyType: normalizeOptionValues('propertyTypes', saved.propertyType) as WizardData['propertyType'],
    classType: (normalizeOptionValue('classTypes', saved.classType) || 'comfort') as WizardData['classType'],
    coastline: normalizeOptionValue('coastline', saved.coastline),
    wallMaterial: normalizeOptionValue('wallMaterials', saved.wallMaterial),
    finishTypes: normalizeOptionValues('finishTypes', saved.finishTypes),
    ceilingHeight: normalizeOptionValue('ceilingHeights', saved.ceilingHeight),
    elevatorTypes: normalizeOptionValues('elevatorTypes', saved.elevatorTypes),
    parkingTypes: normalizeOptionValues('parkingTypes', saved.parkingTypes),
    viewTypes: normalizeOptionValues('views', saved.viewTypes),
    waterSupply: normalizeOptionValue('waterSupply', saved.waterSupply),
    sewerage: normalizeOptionValue('sewerage', saved.sewerage),
    infrastructureExternal: normalizeOptionValues('infraExternal', saved.infrastructureExternal),
    infrastructureInternal: normalizeOptionValues('infraInternal', saved.infrastructureInternal),
    infrastructureLocation: normalizeOptionValues('infraLocation', saved.infrastructureLocation),
    paymentTypes: normalizeOptionValues('paymentTypes', saved.paymentTypes),
    renderFiles: [],
    constructionProgressFiles: [],
    districtGalleryFiles: [],
    documentFiles: [],
  }
}

function readProjectWizardDraft(): ProjectWizardDraftSnapshot | null {
  try {
    const raw = localStorage.getItem(PROJECT_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ProjectWizardDraftSnapshot
    if (parsed?.version !== 1 || !parsed.data) return null
    return parsed
  } catch {
    return null
  }
}

function writeProjectWizardDraft(snapshot: ProjectWizardDraftSnapshot): void {
  try {
    localStorage.setItem(PROJECT_DRAFT_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // переполнение квоты или ошибка сериализации — черновик просто не сохранится
  }
}

function clearProjectWizardDraft(): void {
  try {
    localStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY)
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

/* ─── Step metadata ─────────────────────────────────────────── */

const STEPS = [
  { id: 1, labelKey: 'basic', label: 'Основное', icon: Building2 },
  { id: 2, labelKey: 'about', label: 'О проекте', icon: FileText },
  { id: 3, labelKey: 'buildings', label: 'Корпуса', icon: Layers },
  { id: 4, labelKey: 'infrastructure', label: 'Инфраструктура', icon: LayoutGrid },
  { id: 5, labelKey: 'terms', label: 'Условия', icon: ListChecks },
  { id: 6, labelKey: 'installments', label: 'Рассрочки', icon: CreditCard },
  { id: 7, labelKey: 'media', label: 'Медиа', icon: Image },
  { id: 8, labelKey: 'chessboard', label: 'Шахматка', icon: Grid3X3 },
  { id: 9, labelKey: 'scripts', label: 'Скрипты', icon: FileText },
]

/* ─── Constants ─────────────────────────────────────────────── */

/*
 * Все значения опций — канонические английские слаги из src/lib/project-options.ts.
 * В API уходят только они; русские/прочие подписи — через i18n
 * (projectWizard.options.<группа>.<значение>).
 */
const CLASS_OPTIONS: ProjectClassType[] = [...COMPLEX_CLASS_OPTIONS]
const QUARTERS = ['I', 'II', 'III', 'IV']
const YEARS = Array.from({ length: 16 }, (_, i) => String(2020 + i))

function parseQY(v: string): { q: string; y: string } {
  const parts = v.split(' квартал ')
  return { q: parts[0] ?? '', y: parts[1] ?? '' }
}
function formatQY(q: string, y: string): string {
  return q && y ? `${q} квартал ${y}` : ''
}
const PROPERTY_TYPES: PropertyType[] = [...PROPERTY_TYPE_OPTIONS]

function FlagImg({ code, size = 24 }: { code: string; size?: number }) {
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      width={size}
      height={size * 0.75}
      alt={code}
      className="shrink-0 rounded-sm object-cover"
      style={{ width: size, height: size * 0.75 }}
    />
  )
}
const FINISH_TYPES = [...UNIT_FINISH_TYPES]

/* ─── Shared input styles ───────────────────────────────────── */

const inputCls =
  'h-10 w-full rounded-md border border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.35)] px-3 text-[16px] font-normal text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.72)] outline-none focus:border-[rgba(242,207,141,0.5)] transition-colors'
const textareaCls =
  'w-full rounded-md border border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.35)] px-3 py-2 text-[16px] font-normal text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.72)] outline-none focus:border-[rgba(242,207,141,0.5)] transition-colors resize-none'
const labelCls = 'flex flex-col gap-1'
const labelTextCls = 'text-[16px] font-normal text-[rgba(242,207,141,0.85)]'

function applyProjectMediaToWizard(prev: WizardData, project: IProject): WizardData {
  // `existing*` arrays hold the server URLs already saved for the complex.
  // The `renders` / `constructionProgress` / `districtGallery` arrays hold blob
  // previews for NEW files only, so they must NOT be touched here.
  return {
    ...prev,
    existingRenders: project.renders ?? [],
    existingConstructionProgress: project.constructionProgress ?? [],
    existingDistrictGallery: project.districtGallery ?? [],
    existingDocuments: project.documents ?? [],
  }
}

/* ─── Main component ─────────────────────────────────────────── */

export function ProjectWizardPage() {
  const { t } = useI18n()
  const addProjectWithFormData = useCoreStore((s) => s.addProjectWithFormData)
  const addBuilding = useCoreStore((s) => s.addBuilding)
  const updateBuildingApi = useCoreStore((s) => s.updateBuilding)
  const deleteBuilding = useCoreStore((s) => s.deleteBuilding)
  const updateProjectWithFormData = useCoreStore((s) => s.updateProjectWithFormData)
  const projects = useCoreStore((s) => s.projects)
  const navigate = useNavigate()
  const { id: editId } = useParams<{ id?: string }>()
  const fetchProjectDetail = useCoreStore((s) => s.fetchProjectDetail)
  const fetchBuildings = useCoreStore((s) => s.fetchBuildings)
  const setActiveProject = useCoreStore((s) => s.setActiveProject)

  const editingProject = editId ? projects.find((p) => p._id === editId) ?? null : null
  const isEditMode = !!editId
  const draftProjectId = useRef(editingProject?._id ?? generateProjectId())
  const wizardProjectId = editId ?? draftProjectId.current

  // Черновик из localStorage восстанавливаем только при создании нового ЖК —
  // при редактировании существующего актуальные данные приходят с сервера.
  const restoredProjectDraftRef = useRef<ProjectWizardDraftSnapshot | null>(
    isEditMode ? null : readProjectWizardDraft(),
  )

  const buildingsFromStore = useCoreStore((s) => s.buildings)
  const buildingsForProject = editId
    ? buildingsFromStore.filter((b) => b.project === editId)
    : buildingsFromStore
  const isBuildingsLoaded = useRef(false)
  const originalBuildingIdsRef = useRef<Set<string>>(new Set())

  const hasHydratedInstallments = useRef(false)

  useEffect(() => {
    if (!editId) return
    isBuildingsLoaded.current = false
    hasHydratedInstallments.current = false
    setActiveProject(editId)
    void fetchProjectDetail(editId).then((project) => {
      if (!project) return
      setData((prev) => applyProjectMediaToWizard(prev, project))
      if (!hasHydratedInstallments.current) {
        hasHydratedInstallments.current = true
        const plansFromApi = project.installmentPlans && project.installmentPlans.length > 0
          ? project.installmentPlans.map((p) => ({ ...p, projectId: editId }))
          : (project.installmentTerms ?? []).map((term, idx) => legacyTermToPlan(term, editId, idx))
        getInstallmentStore().hydrateForProject(editId, plansFromApi)
      }
    })
    void fetchBuildings(editId)
  }, [editId, fetchProjectDetail, fetchBuildings, setActiveProject])

  const initialData = useRef<WizardData>(
    editingProject
      ? {
          // Данные из стора уже нормализованы к каноническим слагам (useCoreStore),
          // но подстрахуемся на случай прямых legacy-значений.
          country: normalizeOptionValue('countries', editingProject.country) || 'ge',
          city: normalizeOptionValue('cities', editingProject.city) || 'batumi',
          name: editingProject.name ?? '',
          currency: editingProject.currency || 'USD',
          propertyType: normalizeOptionValues('propertyTypes', editingProject.propertyType) as WizardData['propertyType'],
          classType: (normalizeOptionValue('classTypes', editingProject.classType) || 'comfort') as WizardData['classType'],
          coastline: normalizeOptionValue('coastline', editingProject.coastline),
          developer: editingProject.developer ?? '',
          // Поле «Адрес / Локация» — это address из БД (store кладёт его в
          // IProject.address; IProject.location занят городом).
          location: editingProject.address ?? '',
          status: editingProject.status ?? 'draft',
          areaPolygon: editingProject.areaPolygon,
          buildings: buildingsForProject.length > 0 
            ? buildingsForProject.map(b => ({
                key: b._id,
                name: b.name || '',
                floors: b.floors ? String(b.floors) : '',
                startDate: b.startDate || '',
                completionDate: b.completionDate || '',
                polygon: b.polygon,
              }))
            : [{ key: 'b0', name: 'Корпус 1', floors: '', startDate: '', completionDate: '' }],
          buildingPermit: editingProject.buildingPermit ?? null,
          description: editingProject.description ?? '',
          descriptionSuccess: (editingProject as any).descriptionSuccess ?? '',
          descriptionAudience: (editingProject as any).descriptionAudience ?? '',
          startDate: editingProject.startDate ?? '',
          completionDate: editingProject.completionDate ?? '',
          wallMaterial: normalizeOptionValue('wallMaterials', editingProject.wallMaterial),
          finishTypes: normalizeOptionValues('finishTypes', editingProject.finishTypes),
          ceilingHeight: normalizeOptionValue('ceilingHeights', editingProject.ceilingHeight),
          elevatorTypes: normalizeOptionValues('elevatorTypes', editingProject.elevatorTypes),
          parkingTypes: normalizeOptionValues('parkingTypes', editingProject.parkingTypes),
          parkingSpots: editingProject.parkingSpots ? String(editingProject.parkingSpots) : '',
          viewTypes: normalizeOptionValues('views', editingProject.viewTypes),
          hasGas: editingProject.hasGas ?? null,
          waterSupply: normalizeOptionValue('waterSupply', editingProject.waterSupply),
          sewerage: normalizeOptionValue('sewerage', editingProject.sewerage),
          infrastructureExternal: normalizeOptionValues('infraExternal', editingProject.infrastructureExternal),
          infrastructureInternal: normalizeOptionValues('infraInternal', editingProject.infrastructureInternal),
          infrastructureLocation: normalizeOptionValues('infraLocation', editingProject.infrastructureLocation),
          districtText: editingProject.districtText ?? '',
          paymentTypes: normalizeOptionValues('paymentTypes', editingProject.paymentTypes),
          installmentTerms: editingProject.installmentTerms ?? [],
          mortgageTerm: editingProject.mortgageTerm ?? null,
          realtorScripts: editingProject.realtorScripts ?? [],
          rentalYieldShort: editingProject.rentalYieldShort != null ? String(editingProject.rentalYieldShort) : '',
          rentalYieldLong: editingProject.rentalYieldLong != null ? String(editingProject.rentalYieldLong) : '',
          investmentYield: editingProject.investmentYield != null ? String(editingProject.investmentYield) : '',
          rentalText: editingProject.rentalText ?? '',
          investmentText: editingProject.investmentText ?? '',
          youtubeLink: editingProject.youtubeLink ?? '',
          renders: [],
          constructionProgress: [],
          renderFiles: [],
          constructionProgressFiles: [],
          existingRenders: editingProject.renders ?? [],
          existingConstructionProgress: editingProject.constructionProgress ?? [],
          districtGallery: [],
          districtGalleryFiles: [],
          existingDistrictGallery: editingProject.districtGallery ?? [],
          documents: [],
          documentFiles: [],
          existingDocuments: editingProject.documents ?? [],
          }
          : restoredProjectDraftRef.current
          ? hydrateWizardDataFromDraft(restoredProjectDraftRef.current.data)
          : EMPTY_DATA,
          )

  const [step, setStep] = useState(restoredProjectDraftRef.current?.step ?? 1)
  const [chessboardOpen, setChessboardOpen] = useState(false)
  const [data, setData] = useState<WizardData>(initialData.current)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stepErrors, setStepErrors] = useState<Partial<Record<keyof WizardData, string>>>({})
  const [isMapOpen, setIsMapOpen] = useState(false)
  const [buildingMapOpenKey, setBuildingMapOpenKey] = useState<string | null>(null)
  const imageFileRef = useRef<HTMLInputElement>(null)
  const constructionFileRef = useRef<HTMLInputElement>(null)
  const districtFileRef = useRef<HTMLInputElement>(null)
  const documentFileRef = useRef<HTMLInputElement>(null)
  const [restoredProjectDraft, setRestoredProjectDraft] = useState<ProjectWizardDraftSnapshot | null>(
    restoredProjectDraftRef.current,
  )
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(restoredProjectDraftRef.current?.savedAt ?? null)

  // Sync buildings when they load from store for the project being edited
  useEffect(() => {
    if (!isEditMode || !editId || isBuildingsLoaded.current) return
    if (buildingsForProject.length === 0) return

    setData(prev => ({
      ...prev,
      buildings: buildingsForProject.map(b => ({
        key: b._id,
        name: b.name || '',
        floors: b.floors ? String(b.floors) : '',
        startDate: b.startDate || '',
        completionDate: b.completionDate || '',
        polygon: b.polygon,
      }))
    }))
    originalBuildingIdsRef.current = new Set(buildingsForProject.map((b) => b._id))
    isBuildingsLoaded.current = true
  }, [isEditMode, editId, buildingsForProject])

  // Дозаполняем адрес и полигон ЖК, когда запись подгружается ПОСЛЕ маунта
  // (initialData считается один раз; при перезагрузке страницы редактирования
  // или позднем fetchProjectDetail поля иначе остаются пустыми). Уже введённые
  // руками значения не затираем.
  useEffect(() => {
    if (!isEditMode || !editingProject) return
    setData((prev) => {
      const nextLocation = prev.location || editingProject.address || ''
      const nextPolygon = prev.areaPolygon?.length ? prev.areaPolygon : editingProject.areaPolygon
      if (nextLocation === prev.location && nextPolygon === prev.areaPolygon) return prev
      return { ...prev, location: nextLocation, areaPolygon: nextPolygon }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, editingProject?.address, editingProject?.areaPolygon])

  // Префилл поля «Застройщик» названием компании (developer-запись команды).
  // Только при создании и пока поле пустое — черновик/ручной ввод не затираем.
  useEffect(() => {
    if (isEditMode) return
    void developersApi
      .me()
      .then((profile) => {
        if (!profile?.title) return
        setData((prev) => (prev.developer ? prev : { ...prev, developer: profile.title }))
      })
      .catch(() => {
        /* API застройщиков недоступен — поле остаётся пустым */
      })
  }, [isEditMode])

  /* ── helpers ── */

  function set<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
    setStepErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function toggleArr(key: keyof WizardData, item: string) {
    const arr = data[key] as string[]
    set(key, arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item])
  }

  function validateStep1() {
    if (!data.name.trim()) {
      setStepErrors({ name: t('projectWizard.validation.nameRequired', 'Введите название ЖК') })
      return false
    }
    return true
  }

  function goNext() {
    if (step === 1 && !validateStep1()) return
    setStep((s) => Math.min(s + 1, STEPS.length))
  }

  function goBack() {
    if (step === 1) {
      navigate('/dashboard/development/projects')
    } else {
      setStep((s) => s - 1)
    }
  }

  /* ── draft ── */

  function saveDraft() {
    const savedAt = Date.now()
    writeProjectWizardDraft({
      version: 1,
      step,
      savedAt,
      data: stripFilesFromWizardData(data),
    })
    setDraftSavedAt(savedAt)
    setRestoredProjectDraft(null)
  }

  function discardRestoredDraft() {
    clearProjectWizardDraft()
    setRestoredProjectDraft(null)
    setDraftSavedAt(null)
    setData(EMPTY_DATA)
    setStep(1)
  }

  /* ── buildings ── */

  function addBuildingRow() {
    set('buildings', [
      ...data.buildings,
      { key: Date.now().toString(), name: t('projectWizard.buildingsStep.defaultName', 'Корпус {n}').replace('{n}', String(data.buildings.length + 1)), floors: '', startDate: '', completionDate: '' },
    ])
  }

  function removeBuildingRow(key: string) {
    set('buildings', data.buildings.filter((b) => b.key !== key))
  }

  function updateBuilding(key: string, field: keyof Omit<BuildingDraft, 'key'>, value: any) {
    set(
      'buildings',
      data.buildings.map((b) => (b.key === key ? { ...b, [field]: value } : b)),
    )
  }

  /* ── realtor scripts ── */

  function addScript() {
    set('realtorScripts', [...data.realtorScripts, { question: '', answer: '' }])
  }

  function updateScript(index: number, field: 'question' | 'answer', value: string) {
    set(
      'realtorScripts',
      data.realtorScripts.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    )
  }

  /* ── renders ── */

  function handleImageFiles(files: FileList | null) {
    if (!files) return
    const totalExisting = data.existingRenders.length + data.renderFiles.length
    const remaining = 25 - totalExisting
    const fileArray = Array.from(files).slice(0, remaining)
    const validFiles = fileArray.filter((f) => f.size <= 50 * 1024 * 1024)
    if (validFiles.length === 0) return

    setData((prev) => ({
      ...prev,
      renderFiles: [...prev.renderFiles, ...validFiles],
      renders: [...prev.renders, ...validFiles.map((f) => URL.createObjectURL(f))],
    }))
  }

  function handleConstructionProgressFiles(files: FileList | null) {
    if (!files) return
    const totalExisting = data.existingConstructionProgress.length + data.constructionProgressFiles.length
    const remaining = 25 - totalExisting
    const fileArray = Array.from(files).slice(0, remaining)
    const validFiles = fileArray.filter((f) => f.size <= 50 * 1024 * 1024)
    if (validFiles.length === 0) return

    setData((prev) => ({
      ...prev,
      constructionProgressFiles: [...prev.constructionProgressFiles, ...validFiles],
      constructionProgress: [...prev.constructionProgress, ...validFiles.map((f) => URL.createObjectURL(f))],
    }))
  }

  function handleDistrictGalleryFiles(files: FileList | null) {
    if (!files) return
    const totalExisting = data.existingDistrictGallery.length + data.districtGalleryFiles.length
    const remaining = 25 - totalExisting
    const validFiles = Array.from(files)
      .slice(0, remaining)
      .filter((f) => f.size <= 10 * 1024 * 1024)
    if (validFiles.length === 0) return

    setData((prev) => ({
      ...prev,
      districtGalleryFiles: [...prev.districtGalleryFiles, ...validFiles],
      districtGallery: [...prev.districtGallery, ...validFiles.map((f) => URL.createObjectURL(f))],
    }))
  }

  function handleDocumentFiles(files: FileList | null) {
    if (!files) return
    const totalExisting = data.existingDocuments.length + data.documentFiles.length
    const remaining = 20 - totalExisting
    const validFiles = Array.from(files)
      .slice(0, remaining)
      .filter((f) => f.type === 'application/pdf' && f.size <= 20 * 1024 * 1024)
    if (validFiles.length === 0) return

    setData((prev) => ({
      ...prev,
      documentFiles: [...prev.documentFiles, ...validFiles],
      documents: [...prev.documents, ...validFiles.map((f) => f.name)],
    }))
  }

  /* ── create / save ── */

  function buildFormData(): FormData {
    const fd = new FormData()

    fd.append('name', data.name.trim())
    if (data.currency) fd.append('currency', data.currency)
    if (data.developer.trim()) fd.append('developer', data.developer.trim())
    // Все значения опций уже канонические (английские слаги) — маппинг не нужен.
    fd.append('class', data.classType || 'comfort')
    if (data.coastline) fd.append('coastline', data.coastline)
    if (data.completionDate.trim()) fd.append('completionDate', data.completionDate.trim())
    if (data.startDate.trim()) fd.append('startDate', data.startDate.trim())
    if (data.description.trim()) fd.append('description', data.description.trim())
    fd.append('status', data.status)
    if (data.country) fd.append('country', data.country)
    if (data.city) fd.append('city', data.city)
    if (data.wallMaterial) fd.append('wallMaterial', data.wallMaterial)
    if (data.ceilingHeight) fd.append('ceilingHeight', data.ceilingHeight)
    if (data.parkingSpots) fd.append('parkingSpots', data.parkingSpots)
    if (data.hasGas !== null) fd.append('hasGas', String(data.hasGas))
    if (data.waterSupply) fd.append('waterSupply', data.waterSupply)
    if (data.sewerage) fd.append('sewerage', data.sewerage)
    if (data.buildingPermit !== null) fd.append('buildingPermit', String(data.buildingPermit))
    if (data.youtubeLink.trim()) fd.append('youtubeLink', data.youtubeLink.trim())
    if (data.location.trim()) fd.append('location', data.location.trim())
    if (data.descriptionSuccess.trim()) fd.append('descriptionSuccess', data.descriptionSuccess.trim())
    if (data.descriptionAudience.trim()) fd.append('descriptionAudience', data.descriptionAudience.trim())

    if (data.paymentTypes.length > 0) fd.append('paymentTypes', JSON.stringify(data.paymentTypes))
    if (data.rentalYieldShort.trim()) fd.append('rentalYieldShort', data.rentalYieldShort.trim())
    if (data.rentalYieldLong.trim()) fd.append('rentalYieldLong', data.rentalYieldLong.trim())
    if (data.investmentYield.trim()) fd.append('investmentYield', data.investmentYield.trim())
    if (data.rentalText.trim()) fd.append('rentalText', data.rentalText.trim())
    if (data.investmentText.trim()) fd.append('investmentText', data.investmentText.trim())
    if (data.mortgageTerm) fd.append('mortgageTerm', JSON.stringify(data.mortgageTerm))
    if (data.realtorScripts.length > 0) fd.append('realtorScripts', JSON.stringify(data.realtorScripts))
    
    // Installment plans from store (more detailed) + legacy terms
    const plansFromStore = getInstallmentStore().plans.filter(p => p.projectId === wizardProjectId)
    if (plansFromStore.length > 0) {
      const terms = plansFromStore.map(p => ({
        type: p.title,
        downPaymentPercent: p.downPaymentValue,
        durationMonths: p.termMonths || 0
      }))
      fd.append('installmentTerms', JSON.stringify(terms))
      // Also send detailed plans if backend can store them
      fd.append('installmentPlans', JSON.stringify(plansFromStore))
    } else if (data.installmentTerms && data.installmentTerms.length > 0) {
      fd.append('installmentTerms', JSON.stringify(data.installmentTerms))
    }

    if (data.propertyType.length > 0) fd.append('propertyType', JSON.stringify(data.propertyType))
    if (data.finishTypes.length > 0) fd.append('finishTypes', JSON.stringify(data.finishTypes))
    if (data.elevatorTypes.length > 0) fd.append('elevatorTypes', JSON.stringify(data.elevatorTypes))
    if (data.parkingTypes.length > 0) fd.append('parkingTypes', JSON.stringify(data.parkingTypes))
    if (data.viewTypes.length > 0) fd.append('viewTypes', JSON.stringify(data.viewTypes))
    if (data.infrastructureExternal.length > 0) fd.append('infrastructureExternal', JSON.stringify(data.infrastructureExternal))
    if (data.infrastructureInternal.length > 0) fd.append('infrastructureInternal', JSON.stringify(data.infrastructureInternal))
    if (data.infrastructureLocation.length > 0) fd.append('infrastructureLocation', JSON.stringify(data.infrastructureLocation))
    if (data.districtText.trim()) fd.append('districtText', data.districtText.trim())

    if (data.areaPolygon) {
      fd.append('areaPolygon', JSON.stringify(data.areaPolygon))
      const center = getPolygonCenter(data.areaPolygon)
      if (center) fd.append('locationCenter', JSON.stringify(center))
    }

    if (data.existingRenders.length > 0) fd.append('existingRenders', JSON.stringify(data.existingRenders))
    if (data.existingConstructionProgress.length > 0) fd.append('existingConstructionProgress', JSON.stringify(data.existingConstructionProgress))

    // New image files
    data.renderFiles.forEach((file) => {
      fd.append('renders', file)
    })
    data.constructionProgressFiles.forEach((file) => {
      fd.append('constructionProgress', file)
    })

    // Галерея района
    if (data.existingDistrictGallery.length > 0) fd.append('existingDistrictGallery', JSON.stringify(data.existingDistrictGallery))
    data.districtGalleryFiles.forEach((file) => {
      fd.append('districtGallery', file)
    })

    // Документы (PDF)
    if (data.existingDocuments.length > 0) fd.append('existingDocuments', JSON.stringify(data.existingDocuments))
    data.documentFiles.forEach((file) => {
      fd.append('documents', file)
    })

    return fd
  }

  async function syncBuildings(projectId: string) {
    const originalIds = originalBuildingIdsRef.current
    const currentKeys = new Set(data.buildings.map((b) => b.key))

    // Removed rows — delete corpuses that existed before but were dropped from the list
    for (const id of originalIds) {
      if (!currentKeys.has(id)) {
        await deleteBuilding(id)
      }
    }

    // Create new rows / update existing ones
    for (const b of data.buildings) {
      if (!b.name.trim()) continue
      const payload = {
        name: b.name.trim(),
        floors: b.floors ? parseInt(b.floors, 10) : undefined,
        startDate: b.startDate || undefined,
        completionDate: b.completionDate || undefined,
        polygon: b.polygon,
      }
      if (originalIds.has(b.key)) {
        await updateBuildingApi(b.key, payload)
      } else {
        await addBuilding(projectId, payload)
      }
    }
  }

  async function handleCreate() {
    if (isSubmitting) return
    if (!validateStep1()) { setStep(1); return }

    setIsSubmitting(true)
    try {
      const fd = buildFormData()

      if (isEditMode && editingProject) {
        await updateProjectWithFormData(editingProject._id, fd)
        await syncBuildings(editingProject._id)
        navigate('/dashboard/development/projects')
        return
      }

      const projectId = await addProjectWithFormData(fd)

      if (projectId) {
        for (const b of data.buildings) {
          if (!b.name.trim()) continue
          await addBuilding(projectId, {
            name: b.name.trim(),
            floors: b.floors ? parseInt(b.floors, 10) : undefined,
            startDate: b.startDate || undefined,
            completionDate: b.completionDate || undefined,
            polygon: b.polygon,
          })
        }
      }

      clearProjectWizardDraft()
      navigate('/dashboard/development/projects')
    } finally {
      setIsSubmitting(false)
    }
  }

  /* ─── render ─────────────────────────────────────────────────── */

  return (
    <div className="felt-content flex flex-1 flex-col gap-0 min-h-0">
      {/* Page header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/dashboard/development/projects')}
          className="flex items-center gap-2 text-[16px] font-normal text-[rgba(242,207,141,0.7)] hover:text-[#fcecc8] transition-colors"
        >
          <ArrowLeft size={16} />
          {t('projectWizard.common.backToObjects', 'Объекты')}
        </button>
        <span className="text-[16px] text-[rgba(242,207,141,0.4)]">/</span>
        <span className="text-[16px] font-normal text-[#fcecc8]">
          {isEditMode
            ? t('projectWizard.common.editingComplex', 'Редактировать: {name}').replace('{name}', editingProject?.name ?? '')
            : t('projectWizard.common.newComplex', 'Новый ЖК')}
        </span>
      </div>

      {!isEditMode && restoredProjectDraft ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-[rgba(242,207,141,0.25)] bg-[rgba(242,207,141,0.08)] px-4 py-3 text-[16px] text-[#fcecc8]">
          <span>
            {t('projectWizard.draft.restoredBanner', 'Открыт сохранённый черновик от {date}. Продолжите заполнение или начните заново.').replace('{date}', formatDraftSavedAt(restoredProjectDraft.savedAt))}
          </span>
          <button
            type="button"
            onClick={discardRestoredDraft}
            className="flex shrink-0 items-center gap-2 rounded-md border border-[rgba(242,207,141,0.3)] px-3 py-1.5 text-[16px] font-normal text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)] transition-colors"
          >
            <RotateCcw size={14} />
            {t('projectWizard.draft.discardButton', 'Начать заново')}
          </button>
        </div>
      ) : !isEditMode && draftSavedAt ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-[rgba(208,232,223,0.2)] bg-[rgba(208,232,223,0.06)] px-4 py-2.5 text-[16px] text-[#d0e8df]">
          <Check size={16} className="shrink-0" />
          {t('projectWizard.draft.savedBanner', 'Черновик сохранён · {date}').replace('{date}', formatDraftSavedAt(draftSavedAt))}
        </div>
      ) : null}

      {/* Двухколоночный layout */}
      <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">

        {/* Левая колонка — навигация по шагам */}
        <div className="w-52 shrink-0 flex flex-col gap-1 overflow-y-auto">
          {STEPS.map((s) => {
            const done = step > s.id
            const active = step === s.id
            const Icon = s.icon
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => { if (isEditMode || done || active) setStep(s.id) }}
                className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-left transition-colors ${
                  isEditMode || done ? 'cursor-pointer' : active ? 'cursor-default' : 'cursor-not-allowed'
                } ${
                  active
                    ? 'bg-[rgba(201,168,76,0.15)] text-[#fcecc8]'
                    : done || isEditMode
                    ? 'text-[#c9a84c] hover:bg-[rgba(201,168,76,0.08)]'
                    : 'text-[rgba(242,207,141,0.72)]'
                }`}
              >
                <div className={`flex size-7 shrink-0 items-center justify-center rounded-md border transition-all ${
                  done
                    ? 'border-[#c9a84c] bg-[#c9a84c] text-[#0a1f12]'
                    : active
                    ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.15)] text-[#fcecc8]'
                    : 'border-[rgba(242,207,141,0.2)] text-[rgba(242,207,141,0.72)]'
                }`}>
                  {done ? <Check size={13} /> : <Icon size={13} />}
                </div>
                <span className="text-[16px] font-normal leading-tight">{t(`projectWizard.steps.${s.labelKey}`, s.label)}</span>
                {active && <div className="ml-auto h-4 w-1 rounded-sm bg-[#c9a84c]" />}
              </button>
            )
          })}

          {/* Кнопки навигации внизу левой колонки */}
          <div className="mt-auto pt-3 flex flex-col gap-1.5">
            {!isEditMode && (
              <button
                type="button"
                onClick={saveDraft}
                className="flex items-center gap-2 rounded-md border border-[rgba(242,207,141,0.25)] px-3 py-2 text-[16px] font-normal text-[rgba(242,207,141,0.72)] hover:border-[rgba(242,207,141,0.45)] hover:text-[#fcecc8] transition-colors"
              >
                <Save size={14} />
                {t('projectWizard.draft.saveButton', 'Сохранить черновик')}
              </button>
            )}

            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-2 rounded-md border border-[rgba(242,207,141,0.25)] px-3 py-2 text-[16px] font-normal text-[rgba(242,207,141,0.72)] hover:border-[rgba(242,207,141,0.45)] hover:text-[#fcecc8] transition-colors"
            >
              <ArrowLeft size={14} />
              {t('projectWizard.common.back', 'Назад')}
            </button>

            {step < STEPS.length ? (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center justify-center gap-2 rounded-md border border-[#c9a84c] bg-[rgba(201,168,76,0.15)] px-3 py-2 text-[16px] font-normal text-[#fcecc8] hover:bg-[rgba(201,168,76,0.25)] transition-colors"
              >
                {t('projectWizard.common.next', 'Далее')}
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                disabled={isSubmitting}
                className="flex items-center justify-center gap-2 rounded-md bg-[#e6c364] px-3 py-2 text-[16px] font-normal text-[#072821] hover:bg-[#e2c97e] transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#e6c364]"
              >
                <Check size={14} />
                {isSubmitting
                  ? (isEditMode ? t('projectWizard.common.saving', 'Сохранение…') : t('projectWizard.common.creating', 'Создание…'))
                  : (isEditMode ? t('projectWizard.common.save', 'Сохранить') : t('projectWizard.common.create', 'Создать ЖК'))}
              </button>
            )}

            <span className="text-center text-[16px] text-[rgba(242,207,141,0.72)]">
              {step} / {STEPS.length}
            </span>
          </div>
        </div>

        {/* Правая колонка — содержимое шага, скроллится */}
        <div className="flex-1 min-w-0 overflow-y-auto pr-1">
      <div className="p-0">
        {step === 1 && (
          <Step1
            data={data}
            set={set}
            toggleArr={toggleArr}
            errors={stepErrors}
            onOpenMap={() => setIsMapOpen(true)}
          />
        )}
        {step === 2 && (
          <Step3
            data={data}
            set={set}
            toggleArr={toggleArr}
          />
        )}
        {step === 3 && (
          <Step2
            buildings={data.buildings}
            buildingPermit={data.buildingPermit}
            onSetPermit={(v) => set('buildingPermit', v)}
            onAdd={addBuildingRow}
            onRemove={removeBuildingRow}
            onUpdate={updateBuilding}
            onOpenMap={(key) => setBuildingMapOpenKey(key)}
          />
        )}
        {step === 4 && (
          <Step4
            data={data}
            set={set}
            toggleArr={toggleArr}
          />
        )}
        {step === 5 && (
          <Step5
            data={data}
            set={set}
            toggleArr={toggleArr}
          />
        )}
        {step === 6 && (
          <Step6
            projectId={wizardProjectId}
          />
        )}
        {step === 7 && (
          <Step7
            data={data}
            set={set}
            imageFileRef={imageFileRef}
            onFiles={handleImageFiles}
            constructionFileRef={constructionFileRef}
            onConstructionFiles={handleConstructionProgressFiles}
            districtFileRef={districtFileRef}
            onDistrictFiles={handleDistrictGalleryFiles}
            documentFileRef={documentFileRef}
            onDocumentFiles={handleDocumentFiles}
          />
        )}
        {step === 8 && (
          <div>
            <StepHeading
              title={t('projectWizard.chessboardStep.title', 'Шахматка')}
              subtitle={t('projectWizard.chessboardStep.subtitle', 'Лоты по этажам и корпусам, импорт из Excel')}
            />
            <button
              type="button"
              onClick={() => setChessboardOpen(true)}
              className="inline-flex items-center gap-2 rounded-[4px] bg-[#e6c364] px-5 py-2.5 text-[16px] font-normal text-[#072821] transition-colors hover:bg-[#e2c97e]"
            >
              <Grid3X3 size={16} />
              {t('projectWizard.chessboardStep.openEditor', 'Открыть редактор шахматки')}
            </button>
          </div>
        )}
        {step === 9 && (
          <Step8
            data={data}
            onAddScript={addScript}
            onUpdateScript={updateScript}
            set={set}
          />
        )}
      </div>
        </div>
      </div>

      {chessboardOpen && wizardProjectId && (
        <BuildingChessboardWizard
          projectId={wizardProjectId}
          buildings={buildingsForProject}
          initialBuildingId={buildingsForProject[0]?._id ?? null}
          mode={buildingsForProject.length > 0 ? 'edit' : 'create'}
          currency={data.currency || 'USD'}
          onClose={() => setChessboardOpen(false)}
          onApplied={() => {
            setChessboardOpen(false)
            const latestBuildings = useCoreStore.getState().buildings.filter((b) => b.project === wizardProjectId)
            if (latestBuildings.length > 0) {
              setData((prev) => ({
                ...prev,
                buildings: latestBuildings.map((b) => ({
                  key: b._id,
                  name: b.name || '',
                  floors: b.floors ? String(b.floors) : '',
                  startDate: b.startDate || '',
                  completionDate: b.completionDate || '',
                  polygon: b.polygon,
                })),
              }))
              originalBuildingIdsRef.current = new Set(latestBuildings.map((b) => b._id))
            }
          }}
        />
      )}

      {isMapOpen && (
        <MapPickerModal
          initialAddress={data.location}
          initialPolygon={data.areaPolygon}
          onConfirm={(addr: string, poly?: [number, number][]) => {
            set('location', addr)
            set('areaPolygon', poly)
          }}
          onClose={() => setIsMapOpen(false)}
        />
      )}

      {buildingMapOpenKey && (
        <MapPickerModal
          initialAddress={data.location}
          initialPolygon={data.buildings.find(b => b.key === buildingMapOpenKey)?.polygon}
          // Контур ЖК — оранжевым, только для контекста (нередактируемый);
          // редактируется лишь полигон корпуса.
          referencePolygon={data.areaPolygon}
          onConfirm={(_addr: string, poly?: [number, number][]) => {
            updateBuilding(buildingMapOpenKey, 'polygon', poly)
          }}
          onClose={() => setBuildingMapOpenKey(null)}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Step 1 — Основная информация
══════════════════════════════════════════════════════════════ */

interface Step1Props {
  data: WizardData
  set: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void
  toggleArr: (key: keyof WizardData, item: string) => void
  errors: Partial<Record<keyof WizardData, string>>
  onOpenMap: () => void
}

function Step1({ data, set, toggleArr, errors, onOpenMap }: Step1Props) {
  const { t } = useI18n()
  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.code === data.country) ?? COUNTRY_OPTIONS[0]
  const cities = selectedCountry.cities
  const [countryOpen, setCountryOpen] = useState(false)
  const [cityOpen, setCityOpen] = useState(false)
  const countryRef = useRef<HTMLDivElement>(null)
  const cityRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOut(e: MouseEvent) {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setCountryOpen(false)
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) setCityOpen(false)
    }
    document.addEventListener('mousedown', handleOut)
    return () => document.removeEventListener('mousedown', handleOut)
  }, [])

  function handleCountryChange(code: string) {
    const newCities = COUNTRY_OPTIONS.find((c) => c.code === code)?.cities ?? []
    set('country', code)
    set('city', newCities[0] ?? '')
    setCountryOpen(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <StepHeading
        title={t('projectWizard.basicStep.title', 'Основная информация')}
        subtitle={t('projectWizard.basicStep.subtitle', 'Страна, город, тип объекта и ключевые параметры')}
      />

      {/* Страна + Город — кастомные дропдауны с флагами */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={labelCls}>
          <span className={labelTextCls}>{t('projectWizard.basicStep.countryLabel', 'Страна *')}</span>
          <div className="relative" ref={countryRef}>
            <button
              type="button"
              onClick={() => setCountryOpen((v) => !v)}
              className={`${inputCls} flex items-center gap-2 text-left`}
            >
              <FlagImg code={selectedCountry.code} size={28} />
              <span className="flex-1">{t(`projectWizard.options.countries.${selectedCountry.code}`, selectedCountry.code)}</span>
              <ChevronDown size={14} className={`shrink-0 text-[rgba(242,207,141,0.5)] transition-transform ${countryOpen ? 'rotate-180' : ''}`} />
            </button>
            {countryOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-md border border-[rgba(242,207,141,0.18)] bg-[#112d1c] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
                {COUNTRY_OPTIONS.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleCountryChange(c.code)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[19px] font-normal transition-colors ${
                      data.country === c.code
                        ? 'bg-[rgba(201,168,76,0.12)] text-[#fcecc8]'
                        : 'text-[rgba(242,207,141,0.72)] hover:bg-[rgba(242,207,141,0.06)] hover:text-[#fcecc8]'
                    }`}
                  >
                    <FlagImg code={c.code} size={28} />
                    <span>{t(`projectWizard.options.countries.${c.code}`, c.code)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={labelCls}>
          <span className={labelTextCls}>{t('projectWizard.basicStep.cityLabel', 'Город *')}</span>
          <div className="relative" ref={cityRef}>
            <button
              type="button"
              onClick={() => setCityOpen((v) => !v)}
              className={`${inputCls} flex items-center gap-2 text-left`}
            >
              <span className="flex-1">{data.city ? t(`projectWizard.options.cities.${data.city}`, data.city) : t('projectWizard.basicStep.cityFallback', '—')}</span>
              <ChevronDown size={14} className={`shrink-0 text-[rgba(242,207,141,0.5)] transition-transform ${cityOpen ? 'rotate-180' : ''}`} />
            </button>
            {cityOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-md border border-[rgba(242,207,141,0.18)] bg-[#112d1c] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
                {cities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => { set('city', city); setCityOpen(false) }}
                    className={`flex w-full items-center px-4 py-2.5 text-left text-[16px] transition-colors ${
                      data.city === city
                        ? 'bg-[rgba(201,168,76,0.12)] text-[#d0e8df]'
                        : 'text-[rgba(242,207,141,0.72)] hover:bg-[rgba(242,207,141,0.06)] hover:text-[#fcecc8]'
                    }`}
                  >
                    {t(`projectWizard.options.cities.${city}`, city)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Название + застройщик */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelCls}>
          <span className={labelTextCls}>{t('projectWizard.basicStep.nameLabel', 'Название ЖК *')}</span>
          <input
            className={`${inputCls} ${errors.name ? 'border-rose-400/60' : ''}`}
            value={data.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('projectWizard.basicStep.namePlaceholder', 'Например: ЖК Морской')}
          />
          {errors.name && <span className="text-[16px] text-[#ffb4ab]">{errors.name}</span>}
        </label>

        <label className={labelCls}>
          <span className={labelTextCls}>{t('projectWizard.basicStep.developerLabel', 'Застройщик')}</span>
          <input
            className={inputCls}
            value={data.developer}
            onChange={(e) => set('developer', e.target.value)}
            placeholder={t('projectWizard.basicStep.developerPlaceholder', 'Development Group')}
          />
        </label>
      </div>

      {/* Валюта цен */}
      <div className="flex flex-col gap-2">
        <span className={labelTextCls}>{t('projectWizard.basicStep.currencyLabel', 'Валюта цен *')}</span>
        <div className="flex flex-wrap gap-2">
          {CURRENCY_CONFIG.map((c) => {
            const active = (data.currency || 'USD') === c.value
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => set('currency', c.value)}
                className={`flex h-10 items-center justify-center rounded-[4px] border px-4 text-[16px] font-normal transition-colors ${
                  active
                    ? 'border-[#e6c364] bg-[rgba(230,195,100,0.16)] text-[#fcecc8]'
                    : 'border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.35)] text-[rgba(242,207,141,0.72)] hover:border-[rgba(242,207,141,0.5)] hover:text-[#fcecc8]'
                }`}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Тип недвижимости */}
      <div className="flex flex-col gap-2">
        <span className={labelTextCls}>{t('projectWizard.basicStep.propertyTypeLabel', 'Тип недвижимости *')} <span className="font-normal opacity-60">({t('projectWizard.aboutStep.multipleHint', 'можно несколько')})</span></span>
        <ChipMulti
          options={PROPERTY_TYPES}
          selected={data.propertyType}
          onToggle={(v) => toggleArr('propertyType', v)}
          optionsNs="propertyTypes"
        />
      </div>

      {/* Береговая линия */}
      <div className="flex flex-col gap-2">
        <span className={labelTextCls}>{t('projectWizard.basicStep.coastlineLabel', 'Береговая линия *')}</span>
        <ChipRow
          options={[...COASTLINE_OPTIONS]}
          selected={data.coastline}
          onSelect={(v) => set('coastline', v)}
          optionsNs="coastline"
        />
      </div>

      {/* Класс + статус */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelCls}>
          <span className={labelTextCls}>{t('projectWizard.basicStep.classLabel', 'Класс жилья')}</span>
          <select
            className={inputCls}
            value={data.classType}
            onChange={(e) => set('classType', e.target.value as ProjectClassType)}
          >
            {CLASS_OPTIONS.map((c) => (
              <option key={c} value={c}>{t(`projectWizard.options.classTypes.${c}`, c)}</option>
            ))}
          </select>
        </label>

        <div className={labelCls}>
          <span className={labelTextCls}>{t('projectWizard.basicStep.statusLabel', 'Статус')}</span>
          <select
            className={inputCls}
            value={data.status}
            onChange={(e) => set('status', e.target.value as ProjectStatus)}
          >
            <option value="draft">{t('projectWizard.options.statuses.draft', 'Черновик')}</option>
            <option value="active">{t('projectWizard.options.statuses.active', 'В продаже')}</option>
            <option value="completed">{t('projectWizard.options.statuses.completed', 'Завершён')}</option>
          </select>
          <p className="text-[16px] leading-relaxed text-[rgba(242,207,141,0.72)]">
            <span className="text-[rgba(242,207,141,0.7)]">{t('projectWizard.options.statuses.draft', 'Черновик')}</span> — {t('projectWizard.basicStep.statusHintDraftSuffix', 'объект скрыт от агентов, виден только девелоперу.')}{' '}
            <span className="text-[rgba(242,207,141,0.7)]">{t('projectWizard.options.statuses.active', 'В продаже')}</span> — {t('projectWizard.basicStep.statusHintActiveSuffix', 'открыт для подборок и бронирований.')}{' '}
            <span className="text-[rgba(242,207,141,0.7)]">{t('projectWizard.options.statuses.completed', 'Завершён')}</span> — {t('projectWizard.basicStep.statusHintCompletedSuffix', 'продажи закрыты, архив.')}
          </p>
        </div>
      </div>

      {/* Адрес */}
      <div className={labelCls}>
        <span className={labelTextCls}>{t('projectWizard.basicStep.addressLabel', 'Адрес / Локация')}</span>
        <div className="flex gap-2">
          <AddressSearchInput
            className="flex-1"
            value={data.location}
            onChange={(val) => set('location', val)}
            placeholder={t('projectWizard.basicStep.addressPlaceholder', 'Батуми, Новый бульвар')}
          />
          <button
            type="button"
            onClick={onOpenMap}
            title={t('projectWizard.basicStep.mapButtonTitle', 'Выбрать на карте')}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-[rgba(242,207,141,0.3)] bg-[rgba(0,0,0,0.3)] px-3 text-[16px] font-normal text-[rgba(242,207,141,0.8)] hover:border-[rgba(242,207,141,0.5)] hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8] transition-colors"
          >
            <MapPin size={14} />
            {t('projectWizard.basicStep.mapButton', 'На карте')}
          </button>
        </div>
        {data.areaPolygon && data.areaPolygon.length > 0 && (
          <p className="mt-1.5 text-xs text-[#c9a84c] flex items-center gap-1">
            <Pencil size={10} />
            {t('projectWizard.basicStep.areaSet', 'Площадь ЖК указана ({n} точек)').replace('{n}', String(data.areaPolygon.length))}
          </p>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Step 2 — Корпуса
══════════════════════════════════════════════════════════════ */

interface Step2Props {
  buildings: BuildingDraft[]
  buildingPermit: boolean | null
  onSetPermit: (v: boolean) => void
  onAdd: () => void
  onRemove: (key: string) => void
  onUpdate: (key: string, field: keyof Omit<BuildingDraft, 'key'>, value: any) => void
  onOpenMap: (key: string) => void
}

function Step2({ buildings, buildingPermit, onSetPermit, onAdd, onRemove, onUpdate, onOpenMap }: Step2Props) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-3">
      <StepHeading
        title={t('projectWizard.buildingsStep.title', 'Корпуса')}
        subtitle={t('projectWizard.buildingsStep.subtitle', 'Разрешение на строительство, корпуса и этажность')}
      />

      {/* Разрешение на строительство */}
      <div className="flex flex-col gap-2">
        <span className={labelTextCls}>{t('projectWizard.buildingsStep.permitLabel', 'Разрешение на строительство *')}</span>
        <YesNo value={buildingPermit} onChange={onSetPermit} />
      </div>

      <div className="flex items-center justify-between">
        <span className={labelTextCls}>{t('projectWizard.buildingsStep.listLabel', 'Список корпусов')}</span>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[rgba(242,207,141,0.3)] px-3 py-2 text-[16px] font-normal text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8] transition-colors"
        >
          <Plus size={13} />
          {t('projectWizard.buildingsStep.addButton', 'Добавить корпус')}
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.25)]">
        <div className="grid grid-cols-[1fr_80px_160px_160px_100px_36px] gap-3 border-b border-[rgba(242,207,141,0.1)] px-4 py-2.5 text-[16px] font-normal text-[rgba(242,207,141,0.72)]">
          <span>{t('projectWizard.buildingsStep.colName', 'Название корпуса')}</span>
          <span className="text-center">{t('projectWizard.buildingsStep.colFloors', 'Этажей')}</span>
          <span>{t('projectWizard.buildingsStep.colStartDate', 'Дата начала')}</span>
          <span>{t('projectWizard.buildingsStep.colDeliveryDate', 'Дата сдачи')}</span>
          <span>{t('projectWizard.buildingsStep.colMap', 'Карта')}</span>
          <span />
        </div>
        {buildings.map((b, idx) => {
          return (
            <div
              key={b.key}
              className="grid grid-cols-[1fr_80px_160px_160px_100px_36px] items-center gap-3 border-b border-[rgba(242,207,141,0.08)] px-4 py-3 last:border-0"
            >
              <input
                value={b.name}
                onChange={(e) => onUpdate(b.key, 'name', e.target.value)}
                placeholder={t('projectWizard.buildingsStep.defaultName', 'Корпус {n}').replace('{n}', String(idx + 1))}
                className="h-9 w-full rounded-lg border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.3)] px-3 text-sm text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.3)] outline-none focus:border-[rgba(242,207,141,0.4)]"
              />
              <input
                type="number"
                value={b.floors}
                onChange={(e) => onUpdate(b.key, 'floors', e.target.value)}
                placeholder={t('projectWizard.buildingsStep.floorsPlaceholder', '12')}
                min={1}
                className="h-9 rounded-lg border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.3)] px-2 text-center text-sm text-[#fcecc8] outline-none focus:border-[rgba(242,207,141,0.4)]"
              />
              <BuildingDatePicker
                value={b.startDate}
                onChange={(v) => onUpdate(b.key, 'startDate', v)}
              />
              <BuildingDatePicker
                value={b.completionDate}
                onChange={(v) => onUpdate(b.key, 'completionDate', v)}
              />
              <button
                type="button"
                onClick={() => onOpenMap(b.key)}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
                  b.polygon && b.polygon.length > 0
                    ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.1)] text-[#fcecc8]'
                    : 'border-[rgba(242,207,141,0.2)] text-[rgba(242,207,141,0.6)] hover:border-[rgba(242,207,141,0.4)] hover:text-[#fcecc8]'
                }`}
              >
                <MapPin size={12} />
                {b.polygon && b.polygon.length > 0
                  ? t('projectWizard.buildingsStep.mapSet', '{n} т.').replace('{n}', String(b.polygon.length))
                  : t('projectWizard.buildingsStep.mapPick', 'Указать')}
              </button>
              <button
                type="button"
                onClick={() => onRemove(b.key)}
                disabled={buildings.length <= 1}
                className="flex items-center justify-center rounded-lg p-1.5 text-red-300/60 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-[rgba(242,207,141,0.4)]">
        {t('projectWizard.buildingsStep.noteBefore', 'Количество квартир на каждом этаже настраивается отдельно через ')}
        <span className="text-[rgba(242,207,141,0.6)]">{t('projectWizard.buildingsStep.noteChessboardWord', 'Шахматку')}</span>
        {t('projectWizard.buildingsStep.noteAfter', ' после создания ЖК.')}
      </p>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Step 3 — О проекте
══════════════════════════════════════════════════════════════ */

interface Step3Props {
  data: WizardData
  set: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void
  toggleArr: (key: keyof WizardData, item: string) => void
}

function Step3({ data, set, toggleArr }: Step3Props) {
  const { t } = useI18n()
  const descLen = data.description.length
  const successLen = data.descriptionSuccess.length
  const audienceLen = data.descriptionAudience.length

  return (
    <div className="flex flex-col gap-3">
      <StepHeading
        title={t('projectWizard.aboutStep.title', 'О проекте')}
        subtitle={t('projectWizard.aboutStep.subtitle', 'Описание, материалы, отделка, лифты, парковка и вид')}
      />

      {/* Описание */}
      <div className={labelCls}>
        <div className="flex items-center justify-between">
          <span className={labelTextCls}>
            {t('projectWizard.aboutStep.descriptionLabel', 'Описание *')} <span className="font-normal opacity-60">({t('projectWizard.aboutStep.descriptionHint', 'Максимально красивым языком опишите свой проект')})</span>
          </span>
          <span className={`shrink-0 text-[16px] font-normal ${descLen > 1500 ? 'text-rose-400' : 'text-[rgba(242,207,141,0.65)]'}`}>
            {descLen} / 1500
          </span>
        </div>
        <textarea
          className={textareaCls}
          rows={10}
          maxLength={1500}
          value={data.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder={t('projectWizard.aboutStep.descriptionPlaceholder', 'Расскажите о концепции, архитектуре, локации и преимуществах объекта…')}
        />
      </div>

      {/* Почему стоит купить проект */}
      <div className={labelCls}>
        <div className="flex items-center justify-between">
          <span className={labelTextCls}>{t('projectWizard.aboutStep.successLabel', 'Почему стоит купить проект?')}</span>
          <span className={`shrink-0 text-[16px] font-normal ${successLen > 1000 ? 'text-rose-400' : 'text-[rgba(242,207,141,0.65)]'}`}>
            {successLen} / 1000
          </span>
        </div>
        <textarea
          className={textareaCls}
          rows={6}
          maxLength={1000}
          value={data.descriptionSuccess}
          onChange={(e) => set('descriptionSuccess', e.target.value)}
          placeholder={t('projectWizard.aboutStep.successPlaceholder', 'Уникальное расположение, надёжный застройщик, растущий рынок…')}
        />
      </div>

      {/* Целевая аудитория */}
      <div className={labelCls}>
        <div className="flex items-center justify-between">
          <span className={labelTextCls}>{t('projectWizard.aboutStep.audienceLabel', 'Опишите вашу целевую аудиторию')}</span>
          <span className={`shrink-0 text-[16px] font-normal ${audienceLen > 1000 ? 'text-rose-400' : 'text-[rgba(242,207,141,0.65)]'}`}>
            {audienceLen} / 1000
          </span>
        </div>
        <textarea
          className={textareaCls}
          rows={6}
          maxLength={1000}
          value={data.descriptionAudience}
          onChange={(e) => set('descriptionAudience', e.target.value)}
          placeholder={t('projectWizard.aboutStep.audiencePlaceholder', 'Инвесторы из СНГ, семьи с детьми, цифровые кочевники…')}
        />
      </div>

      {/* Даты */}
      <div className="grid gap-4 sm:grid-cols-2">
        <QuarterYearPicker
          label={t('projectWizard.aboutStep.startDateLabel', 'Начало строительства')}
          value={data.startDate}
          onChange={(v) => set('startDate', v)}
        />
        <QuarterYearPicker
          label={t('projectWizard.aboutStep.deliveryDateLabel', 'Плановая сдача')}
          value={data.completionDate}
          onChange={(v) => set('completionDate', v)}
        />
      </div>

      {/* Материалы стен */}
      <div className="flex flex-col gap-2">
        <span className={labelTextCls}>{t('projectWizard.aboutStep.wallMaterialLabel', 'Материалы стен *')}</span>
        <ChipRow
          options={[...WALL_MATERIAL_OPTIONS]}
          selected={data.wallMaterial}
          onSelect={(v) => set('wallMaterial', v)}
          optionsNs="wallMaterials"
        />
      </div>

      {/* Варианты отделки */}
      <div className="flex flex-col gap-2">
        <span className={labelTextCls}>{t('projectWizard.aboutStep.finishTypesLabel', 'Варианты отделки *')} <span className="font-normal opacity-60">({t('projectWizard.aboutStep.multipleHint', 'можно несколько')})</span></span>
        <ChipMulti
          options={FINISH_TYPES}
          selected={data.finishTypes}
          onToggle={(v) => toggleArr('finishTypes', v)}
          optionsNs="finishTypes"
        />
      </div>

      {/* Высота потолков */}
      <label className={`${labelCls} sm:max-w-xs`}>
        <span className={labelTextCls}>{t('projectWizard.aboutStep.ceilingHeightLabel', 'Высота потолков')}</span>
        <select
          className={inputCls}
          value={data.ceilingHeight}
          onChange={(e) => set('ceilingHeight', e.target.value)}
        >
          <option value="">{t('projectWizard.common.notSelected', 'Не выбрано')}</option>
          {CEILING_HEIGHT_OPTIONS.map((h) => <option key={h} value={h}>{t(`projectWizard.options.ceilingHeights.${h}`, h)}</option>)}
        </select>
      </label>

      {/* Лифты */}
      <div className="flex flex-col gap-2">
        <span className={labelTextCls}>{t('projectWizard.aboutStep.elevatorsLabel', 'Лифты *')} <span className="font-normal opacity-60">({t('projectWizard.aboutStep.multipleHint', 'можно несколько')})</span></span>
        <ChipMulti
          options={[...ELEVATOR_TYPE_OPTIONS]}
          selected={data.elevatorTypes}
          onToggle={(v) => toggleArr('elevatorTypes', v)}
          optionsNs="elevatorTypes"
        />
      </div>

      {/* Парковка */}
      <div className="flex flex-col gap-3">
        <span className={labelTextCls}>{t('projectWizard.aboutStep.parkingLabel', 'Парковка *')} <span className="font-normal opacity-60">({t('projectWizard.aboutStep.multipleHint', 'можно несколько')})</span></span>
        <ChipMulti
          options={[...PARKING_TYPE_OPTIONS]}
          selected={data.parkingTypes}
          onToggle={(v) => toggleArr('parkingTypes', v)}
          optionsNs="parkingTypes"
        />
        {data.parkingTypes.length > 0 && (
          <label className={labelCls}>
            <span className={labelTextCls}>{t('projectWizard.aboutStep.parkingSpotsLabel', 'Количество парковочных мест')}</span>
            <input
              type="number"
              className={inputCls}
              value={data.parkingSpots}
              onChange={(e) => set('parkingSpots', e.target.value)}
              placeholder={t('projectWizard.aboutStep.parkingSpotsPlaceholder', '120')}
              min={1}
            />
          </label>
        )}
      </div>

    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Step 4 — Инфраструктура и коммуникации
══════════════════════════════════════════════════════════════ */

interface Step4Props {
  data: WizardData
  set: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void
  toggleArr: (key: keyof WizardData, item: string) => void
}

function Step4({ data, set, toggleArr }: Step4Props) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-2">
      <StepHeading
        title={t('projectWizard.infrastructureStep.title', 'Инфраструктура')}
        subtitle={t('projectWizard.infrastructureStep.subtitle', 'Коммуникации, внешняя и внутренняя инфраструктура')}
      />

      {/* Пояснение про алгоритмы */}
      <div className="rounded-md border border-[rgba(201,168,76,0.25)] bg-[rgba(201,168,76,0.06)] px-4 py-3">
        <p className="text-[16px] font-normal text-[#d0e8df]">
          {t('projectWizard.infrastructureStep.hintMain', 'Чем больше тегов вы выберете — тем точнее алгоритм подберёт ваш объект нужному клиенту.')}
        </p>
        <p className="mt-0.5 text-[16px] font-normal text-[rgba(242,207,141,0.65)]">
          {t('projectWizard.infrastructureStep.hintSecondary', 'Теги используются в поисковых фильтрах и в автоматической рекомендательной системе. Объекты с заполненной инфраструктурой показываются выше в выдаче.')}
        </p>
      </div>

      {/* Газ */}
      <div className="flex flex-col gap-1.5">
        <span className={labelTextCls}>{t('projectWizard.infrastructureStep.gasLabel', 'Газ *')}</span>
        <YesNo value={data.hasGas} onChange={(v) => set('hasGas', v)} />
      </div>

      {/* Водоснабжение */}
      <div className="flex flex-col gap-1.5">
        <span className={labelTextCls}>{t('projectWizard.infrastructureStep.waterLabel', 'Водоснабжение *')}</span>
        <ChipRow
          options={[...WATER_SUPPLY_OPTIONS]}
          selected={data.waterSupply}
          onSelect={(v) => set('waterSupply', v)}
          optionsNs="waterSupply"
        />
      </div>

      {/* Канализация */}
      <div className="flex flex-col gap-1.5">
        <span className={labelTextCls}>{t('projectWizard.infrastructureStep.sewerageLabel', 'Канализация *')}</span>
        <ChipRow
          options={[...SEWERAGE_OPTIONS]}
          selected={data.sewerage}
          onSelect={(v) => set('sewerage', v)}
          optionsNs="sewerage"
        />
      </div>

      <div className="h-px bg-[rgba(242,207,141,0.1)]" />

      {/* Внешняя инфраструктура */}
      <TagPickerField
        label={t('projectWizard.infrastructureStep.nearbyLabel', 'Что есть рядом с ЖК?')}
        hint={t('projectWizard.infrastructureStep.nearbyHint', 'Школы, магазины, транспорт, медицина, досуг')}
        options={[...INFRA_EXTERNAL_OPTIONS]}
        selected={data.infrastructureExternal}
        onToggle={(v) => toggleArr('infrastructureExternal', v)}
        optionsNs="infraExternal"
      />

      {/* Внутренняя инфраструктура */}
      <TagPickerField
        label={t('projectWizard.infrastructureStep.insideLabel', 'Что есть внутри ЖК?')}
        hint={t('projectWizard.infrastructureStep.insideHint', 'Бассейн, охрана, коворкинг, умный дом и другие удобства')}
        options={[...INFRA_INTERNAL_OPTIONS]}
        selected={data.infrastructureInternal}
        onToggle={(v) => toggleArr('infrastructureInternal', v)}
        optionsNs="infraInternal"
      />

      {/* Расположение */}
      <TagPickerField
        label={t('projectWizard.infrastructureStep.locationLabel', 'Характер расположения')}
        hint={t('projectWizard.infrastructureStep.locationHint', 'Тип района и окружающей среды')}
        options={[...INFRA_LOCATION_OPTIONS]}
        selected={data.infrastructureLocation}
        onToggle={(v) => toggleArr('infrastructureLocation', v)}
        optionsNs="infraLocation"
      />

      {/* Описание района */}
      <div className={labelCls}>
        <div className="flex items-center justify-between">
          <span className={labelTextCls}>{t('projectWizard.infrastructureStep.districtLabel', 'Описание района')}</span>
          <span className={`shrink-0 text-[16px] font-normal ${data.districtText.length > 1000 ? 'text-rose-400' : 'text-[rgba(242,207,141,0.65)]'}`}>
            {data.districtText.length} / 1000
          </span>
        </div>
        <textarea
          className={textareaCls}
          rows={5}
          maxLength={1000}
          value={data.districtText}
          onChange={(e) => set('districtText', e.target.value)}
          placeholder={t('projectWizard.infrastructureStep.districtPlaceholder', 'Чем интересен район: атмосфера, окружение, до моря и центра, перспективы развития…')}
        />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Step 5 — Условия продаж
══════════════════════════════════════════════════════════════ */

interface Step5Props {
  data: WizardData
  set: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void
  toggleArr: (key: keyof WizardData, item: string) => void
}

function Step5({ data, set, toggleArr }: Step5Props) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-3">
      <StepHeading
        title={t('projectWizard.termsStep.title', 'Условия продаж')}
        subtitle={t('projectWizard.termsStep.subtitle', 'Способы оплаты, рассрочка, скрипты для риелторов')}
      />

      {/* Условия покупки */}
      <div className="flex flex-col gap-2">
        <span className={labelTextCls}>{t('projectWizard.termsStep.purchaseLabel', 'Условия покупки *')}</span>
        <ChipMulti
          options={[...PAYMENT_TYPE_OPTIONS]}
          selected={data.paymentTypes}
          onToggle={(v) => toggleArr('paymentTypes', v)}
          optionsNs="paymentTypes"
        />
      </div>

      {/* Арендный и инвестиционный потенциал */}
      <div className="mt-2 flex flex-col gap-3">
        <span className={labelTextCls}>{t('projectWizard.termsStep.potentialLabel', 'Арендный и инвестиционный потенциал')}</span>
        <div className="grid grid-cols-3 gap-2">
          <label className={labelCls}>
            <span className={labelTextCls}>{t('projectWizard.termsStep.rentShortLabel', 'Аренда кратко, %')}</span>
            <input
              className={inputCls}
              inputMode="decimal"
              value={data.rentalYieldShort}
              onChange={(e) => set('rentalYieldShort', e.target.value)}
            />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>{t('projectWizard.termsStep.rentLongLabel', 'Аренда долго, %')}</span>
            <input
              className={inputCls}
              inputMode="decimal"
              value={data.rentalYieldLong}
              onChange={(e) => set('rentalYieldLong', e.target.value)}
            />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>{t('projectWizard.termsStep.investmentLabel', 'Инвестиции, %')}</span>
            <input
              className={inputCls}
              inputMode="decimal"
              value={data.investmentYield}
              onChange={(e) => set('investmentYield', e.target.value)}
            />
          </label>
        </div>
        <label className={labelCls}>
          <span className={labelTextCls}>{t('projectWizard.termsStep.rentTextLabel', 'Текст про аренду')}</span>
          <textarea
            className={textareaCls}
            rows={3}
            value={data.rentalText}
            onChange={(e) => set('rentalText', e.target.value)}
          />
        </label>
        <label className={labelCls}>
          <span className={labelTextCls}>{t('projectWizard.termsStep.investmentTextLabel', 'Текст про инвестиции')}</span>
          <textarea
            className={textareaCls}
            rows={3}
            value={data.investmentText}
            onChange={(e) => set('investmentText', e.target.value)}
          />
        </label>
      </div>

    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Step 6 — Рассрочки
══════════════════════════════════════════════════════════════ */

interface Step6Props {
  projectId: string | null
}

function Step6({ projectId }: Step6Props) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-3">
      <StepHeading
        title={t('projectWizard.installmentsStep.title', 'Рассрочки')}
        subtitle={t('projectWizard.installmentsStep.subtitle', 'Конструктор констант рассрочек для данного ЖК')}
      />
      <ProjectInstallmentEditor projectId={projectId} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Step 8 — Скрипты для риелторов (необязательный)
══════════════════════════════════════════════════════════════ */

interface Step8Props {
  data: WizardData
  set: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void
  onAddScript: () => void
  onUpdateScript: (index: number, field: 'question' | 'answer', value: string) => void
}

function Step8({ data, set, onAddScript, onUpdateScript }: Step8Props) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-3">
      <StepHeading
        title={t('projectWizard.scriptsStep.title', 'Скрипты для риелторов')}
        subtitle={t('projectWizard.scriptsStep.subtitle', 'Необязательно — типичные вопросы клиентов и готовые ответы. Риелторы увидят их в карточке объекта.')}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={labelTextCls}>{t('projectWizard.scriptsStep.qaLabel', 'Вопросы и ответы')}</span>
          <button
            type="button"
            onClick={onAddScript}
            className="inline-flex items-center gap-1 text-[16px] text-[rgba(242,207,141,0.72)] hover:text-[#fcecc8]"
          >
            <Plus size={12} />
            {t('projectWizard.scriptsStep.addQuestion', 'Добавить вопрос')}
          </button>
        </div>

        {data.realtorScripts.length === 0 && (
          <div className="rounded-md border border-dashed border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.15)] px-4 py-6 text-center text-[16px] text-[rgba(242,207,141,0.72)]">
            {t('projectWizard.scriptsStep.emptyHint', 'Пока нет скриптов — можно добавить позже в карточке ЖК')}
          </div>
        )}

        {data.realtorScripts.map((script, idx) => (
          <div
            key={idx}
            className="flex gap-2 rounded-md border border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.2)] p-3"
          >
            <div className="flex flex-1 flex-col gap-2">
              <input
                className="h-9 w-full rounded-md border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.3)] px-3 text-[16px] text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.72)] outline-none focus:border-[rgba(242,207,141,0.4)]"
                value={script.question}
                onChange={(e) => onUpdateScript(idx, 'question', e.target.value)}
                placeholder={t('projectWizard.scriptsStep.questionPlaceholder', 'Вопрос клиента…')}
              />
              <textarea
                className="w-full rounded-md border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.3)] px-3 py-2 text-[16px] text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.72)] outline-none focus:border-[rgba(242,207,141,0.4)] resize-none"
                rows={2}
                value={script.answer}
                onChange={(e) => onUpdateScript(idx, 'answer', e.target.value)}
                placeholder={t('projectWizard.scriptsStep.answerPlaceholder', 'Ответ риелтора…')}
              />
            </div>
            <button
              type="button"
              onClick={() => set('realtorScripts', data.realtorScripts.filter((_, i) => i !== idx))}
              className="self-start p-1.5 text-red-300/60 hover:text-red-300"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   Step 7 — Медиа
══════════════════════════════════════════════════════════════ */

interface Step7Props {
  data: WizardData
  set: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void
  imageFileRef: React.RefObject<HTMLInputElement | null>
  onFiles: (files: FileList | null) => void
  constructionFileRef: React.RefObject<HTMLInputElement | null>
  onConstructionFiles: (files: FileList | null) => void
  districtFileRef: React.RefObject<HTMLInputElement | null>
  onDistrictFiles: (files: FileList | null) => void
  documentFileRef: React.RefObject<HTMLInputElement | null>
  onDocumentFiles: (files: FileList | null) => void
}

function Step7({
  data,
  set,
  imageFileRef,
  onFiles,
  constructionFileRef,
  onConstructionFiles,
  districtFileRef,
  onDistrictFiles,
  documentFileRef,
  onDocumentFiles,
}: Step7Props) {
  const { t } = useI18n()
  const [isDraggingRenders, setIsDraggingRenders] = useState(false)
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [isDraggingDistrict, setIsDraggingDistrict] = useState(false)
  const totalDistrict = data.existingDistrictGallery.length + data.districtGalleryFiles.length
  const remainingDistrict = 25 - totalDistrict
  const totalDocs = data.existingDocuments.length + data.documentFiles.length
  const remainingDocs = 20 - totalDocs

  function removeDistrictPhoto(idx: number) {
    const existingCount = data.existingDistrictGallery.length
    if (idx < existingCount) {
      set('existingDistrictGallery', data.existingDistrictGallery.filter((_, i) => i !== idx))
    } else {
      const fileIdx = idx - existingCount
      set('districtGalleryFiles', data.districtGalleryFiles.filter((_, i) => i !== fileIdx) as any)
      set('districtGallery', data.districtGallery.filter((_, i) => i !== fileIdx))
    }
  }

  function removeDocument(idx: number) {
    const existingCount = data.existingDocuments.length
    if (idx < existingCount) {
      set('existingDocuments', data.existingDocuments.filter((_, i) => i !== idx))
    } else {
      const fileIdx = idx - existingCount
      set('documentFiles', data.documentFiles.filter((_, i) => i !== fileIdx) as any)
      set('documents', data.documents.filter((_, i) => i !== fileIdx))
    }
  }

  const allDistrictPreviews = [...data.existingDistrictGallery, ...data.districtGallery]
  const docLabel = (s: string) => {
    try {
      return decodeURIComponent(s.split('/').pop() || s)
    } catch {
      return s.split('/').pop() || s
    }
  }
  const allDocLabels = [
    ...data.existingDocuments.map(docLabel),
    ...data.documentFiles.map((f) => f.name),
  ]
  const totalRenders = data.existingRenders.length + data.renderFiles.length
  const totalProgress = data.existingConstructionProgress.length + data.constructionProgressFiles.length
  const remainingRenders = 25 - totalRenders
  const remainingProgress = 25 - totalProgress

  function removeRender(idx: number) {
    const existingCount = data.existingRenders.length
    if (idx < existingCount) {
      set('existingRenders', data.existingRenders.filter((_, i) => i !== idx))
    } else {
      const fileIdx = idx - existingCount
      set('renderFiles', data.renderFiles.filter((_, i) => i !== fileIdx) as any)
      set('renders', data.renders.filter((_, i) => i !== fileIdx))
    }
  }

  function removeConstructionPhoto(idx: number) {
    const existingCount = data.existingConstructionProgress.length
    if (idx < existingCount) {
      set('existingConstructionProgress', data.existingConstructionProgress.filter((_, i) => i !== idx))
    } else {
      const fileIdx = idx - existingCount
      set('constructionProgressFiles', data.constructionProgressFiles.filter((_, i) => i !== fileIdx) as any)
      set('constructionProgress', data.constructionProgress.filter((_, i) => i !== fileIdx))
    }
  }

  const allRenderPreviews = [...data.existingRenders, ...data.renders]
  const allProgressPreviews = [...data.existingConstructionProgress, ...data.constructionProgress]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <StepHeading
          title={t('projectWizard.mediaStep.title', 'Медиа')}
          subtitle={t('projectWizard.mediaStep.subtitle', 'Фотографии, рендеры и видео-презентация объекта')}
        />

        <label className={labelCls}>
          <span className={labelTextCls}>{t('projectWizard.mediaStep.youtubeLabel', 'Ссылка на YouTube-видео')}</span>
          <input
            className={inputCls}
            value={data.youtubeLink}
            onChange={(e) => set('youtubeLink', e.target.value)}
            placeholder={t('projectWizard.mediaStep.youtubePlaceholder', 'https://youtube.com/watch?v=…')}
          />
        </label>
      </div>

      {/* Рендеры */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={labelTextCls}>{t('projectWizard.mediaStep.rendersLabel', 'Рендеры и фотографии')}</span>
          <span className={`text-[16px] ${remainingRenders === 0 ? 'text-amber-400' : 'text-[rgba(242,207,141,0.72)]'}`}>
            {totalRenders} / 25
          </span>
        </div>

        {remainingRenders > 0 && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDraggingRenders(true) }}
            onDragLeave={() => setIsDraggingRenders(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDraggingRenders(false)
              onFiles(e.dataTransfer.files)
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-8 transition-colors ${
              isDraggingRenders
                ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.08)]'
                : 'border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.2)]'
            }`}
          >
            <Upload size={28} className="text-[rgba(242,207,141,0.72)]" />
            <div className="text-center">
              <p className="text-[16px] text-[rgba(242,207,141,0.72)]">{t('projectWizard.mediaStep.rendersDropHint', 'Перетащите рендеры сюда')}</p>
              <p className="mt-0.5 text-[16px] text-[rgba(242,207,141,0.72)]">{t('projectWizard.mediaStep.imageFormatsHint50', 'JPG, PNG, WebP · до 50 МБ')}</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(242,207,141,0.3)] px-4 py-2 text-[16px] font-normal text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8] transition-colors">
              <Upload size={13} />
              {t('projectWizard.mediaStep.chooseFiles', 'Выбрать файлы')}
              <input
                ref={imageFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onFiles(e.target.files)}
              />
            </label>
          </div>
        )}

        {allRenderPreviews.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {allRenderPreviews.map((src, idx) => (
              <div key={`${idx}-${src.slice(-12)}`} className="group relative aspect-video overflow-hidden rounded-xl border border-[rgba(242,207,141,0.15)]">
                <img src={src} alt={t('projectWizard.mediaStep.renderAlt', 'Рендер {n}').replace('{n}', String(idx + 1))} className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-all group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => removeRender(idx)}
                    className="rounded-full bg-red-500/80 p-1.5 text-white hover:bg-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ход стройки */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={labelTextCls}>{t('projectWizard.mediaStep.progressLabel', 'Ход стройки (фото)')}</span>
          <span className={`text-[16px] ${remainingProgress === 0 ? 'text-amber-400' : 'text-[rgba(242,207,141,0.72)]'}`}>
            {totalProgress} / 25
          </span>
        </div>

        {remainingProgress > 0 && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDraggingProgress(true) }}
            onDragLeave={() => setIsDraggingProgress(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDraggingProgress(false)
              onConstructionFiles(e.dataTransfer.files)
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-8 transition-colors ${
              isDraggingProgress
                ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.08)]'
                : 'border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.2)]'
            }`}
          >
            <Upload size={28} className="text-[rgba(242,207,141,0.72)]" />
            <div className="text-center">
              <p className="text-[16px] text-[rgba(242,207,141,0.72)]">{t('projectWizard.mediaStep.progressDropHint', 'Перетащите фото стройки сюда')}</p>
              <p className="mt-0.5 text-[16px] text-[rgba(242,207,141,0.72)]">{t('projectWizard.mediaStep.imageFormatsHint50', 'JPG, PNG, WebP · до 50 МБ')}</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(242,207,141,0.3)] px-4 py-2 text-[16px] font-normal text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8] transition-colors">
              <Upload size={13} />
              {t('projectWizard.mediaStep.chooseFiles', 'Выбрать файлы')}
              <input
                ref={constructionFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onConstructionFiles(e.target.files)}
              />
            </label>
          </div>
        )}

        {allProgressPreviews.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {allProgressPreviews.map((src, idx) => (
              <div key={`${idx}-${src.slice(-12)}`} className="group relative aspect-video overflow-hidden rounded-xl border border-[rgba(242,207,141,0.15)]">
                <img src={src} alt={t('projectWizard.mediaStep.progressAlt', 'Ход стройки {n}').replace('{n}', String(idx + 1))} className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-all group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => removeConstructionPhoto(idx)}
                    className="rounded-full bg-red-500/80 p-1.5 text-white hover:bg-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Галерея района */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={labelTextCls}>{t('projectWizard.mediaStep.districtGalleryLabel', 'Галерея района (фото)')}</span>
          <span className={`text-[16px] ${remainingDistrict === 0 ? 'text-amber-400' : 'text-[rgba(242,207,141,0.72)]'}`}>
            {totalDistrict} / 25
          </span>
        </div>

        {remainingDistrict > 0 && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDraggingDistrict(true) }}
            onDragLeave={() => setIsDraggingDistrict(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDraggingDistrict(false)
              onDistrictFiles(e.dataTransfer.files)
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-8 transition-colors ${
              isDraggingDistrict
                ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.08)]'
                : 'border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.2)]'
            }`}
          >
            <Upload size={28} className="text-[rgba(242,207,141,0.72)]" />
            <div className="text-center">
              <p className="text-[16px] text-[rgba(242,207,141,0.72)]">{t('projectWizard.mediaStep.districtDropHint', 'Перетащите фото района сюда')}</p>
              <p className="mt-0.5 text-[16px] text-[rgba(242,207,141,0.72)]">{t('projectWizard.mediaStep.imageFormatsHint10', 'JPG, PNG, WebP · до 10 МБ')}</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(242,207,141,0.3)] px-4 py-2 text-[16px] font-normal text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8] transition-colors">
              <Upload size={13} />
              {t('projectWizard.mediaStep.chooseFiles', 'Выбрать файлы')}
              <input
                ref={districtFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onDistrictFiles(e.target.files)}
              />
            </label>
          </div>
        )}

        {allDistrictPreviews.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {allDistrictPreviews.map((src, idx) => (
              <div key={`${idx}-${src.slice(-12)}`} className="group relative aspect-video overflow-hidden rounded-md border border-[rgba(242,207,141,0.15)]">
                <img src={src} alt={t('projectWizard.mediaStep.districtAlt', 'Район {n}').replace('{n}', String(idx + 1))} className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-all group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => removeDistrictPhoto(idx)}
                    className="rounded-md bg-red-500/80 p-1.5 text-white hover:bg-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Документы (PDF) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={labelTextCls}>{t('projectWizard.mediaStep.documentsLabel', 'Документы (PDF)')}</span>
          <span className={`text-[16px] ${remainingDocs === 0 ? 'text-amber-400' : 'text-[rgba(242,207,141,0.72)]'}`}>
            {totalDocs} / 20
          </span>
        </div>

        {remainingDocs > 0 && (
          <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(242,207,141,0.3)] px-4 py-2 text-[16px] font-normal text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8] transition-colors">
            <Upload size={13} />
            {t('projectWizard.mediaStep.uploadPdf', 'Загрузить PDF')}
            <input
              ref={documentFileRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => onDocumentFiles(e.target.files)}
            />
          </label>
        )}

        {allDocLabels.length > 0 && (
          <div className="flex flex-col gap-2">
            {allDocLabels.map((label, idx) => (
              <div
                key={`${idx}-${label}`}
                className="flex items-center justify-between gap-3 rounded-md border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.2)] px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText size={15} className="shrink-0 text-[rgba(242,207,141,0.72)]" />
                  <span className="min-w-0 truncate text-[16px] text-[#fcecc8]">{label}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeDocument(idx)}
                  className="shrink-0 p-1 text-red-300/60 hover:text-red-300"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Shared sub-components ──────────────────────────────────── */

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <h2 style={{fontSize:'1.5rem', fontWeight:400, letterSpacing:'-0.02em'}} className="text-[#fcecc8]">{title}</h2>
      <p style={{fontSize:'1rem', fontWeight:400}} className="mt-0.5 text-[rgba(242,207,141,0.72)]">{subtitle}</p>
    </div>
  )
}

/** Inline Q+Y picker for building rows (no label, compact) */
function BuildingDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const [localQ, setLocalQ] = useState(() => parseQY(value).q)
  const [localY, setLocalY] = useState(() => parseQY(value).y)

  useEffect(() => {
    const { q, y } = parseQY(value)
    if ((!q && !y) || (q && y)) { setLocalQ(q); setLocalY(y) }
  }, [value])

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={localQ}
        onChange={(e) => { const q = e.target.value; setLocalQ(q); onChange(formatQY(q, localY)) }}
        className="h-9 w-16 shrink-0 rounded-md border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.3)] px-1.5 text-center text-[16px] text-[#fcecc8] outline-none focus:border-[rgba(242,207,141,0.4)]"
      >
        <option value="">{t('projectWizard.shared.quarterAbbr', 'Кв.')}</option>
        {QUARTERS.map((qopt) => <option key={qopt} value={qopt}>{qopt}</option>)}
      </select>
      <select
        value={localY}
        onChange={(e) => { const y = e.target.value; setLocalY(y); onChange(formatQY(localQ, y)) }}
        className="h-9 flex-1 rounded-md border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.3)] px-1.5 text-center text-[16px] text-[#fcecc8] outline-none focus:border-[rgba(242,207,141,0.4)]"
      >
        <option value="">{t('projectWizard.shared.yearLabel', 'Год')}</option>
        {YEARS.map((yopt) => <option key={yopt} value={yopt}>{yopt}</option>)}
      </select>
    </div>
  )
}

/** Quarter + year picker */
function QuarterYearPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const [localQ, setLocalQ] = useState(() => parseQY(value).q)
  const [localY, setLocalY] = useState(() => parseQY(value).y)

  useEffect(() => {
    const { q, y } = parseQY(value)
    // Sync only when parent has a complete value or empty — not partial
    if ((!q && !y) || (q && y)) {
      setLocalQ(q)
      setLocalY(y)
    }
  }, [value])

  return (
    <div className={labelCls}>
      <span className={labelTextCls}>{label}</span>
      <div className="flex gap-2">
        <select
          value={localQ}
          onChange={(e) => { const q = e.target.value; setLocalQ(q); onChange(formatQY(q, localY)) }}
          className={`${inputCls} flex-1`}
        >
          <option value="">{t('projectWizard.shared.quarterLabel', 'Квартал')}</option>
          {QUARTERS.map((qopt) => <option key={qopt} value={qopt}>{qopt} {t('projectWizard.shared.quarterSuffix', 'квартал')}</option>)}
        </select>
        <select
          value={localY}
          onChange={(e) => { const y = e.target.value; setLocalY(y); onChange(formatQY(localQ, y)) }}
          className={`${inputCls} flex-1`}
        >
          <option value="">{t('projectWizard.shared.yearLabel', 'Год')}</option>
          {YEARS.map((yopt) => <option key={yopt} value={yopt}>{yopt}</option>)}
        </select>
      </div>
    </div>
  )
}

/** Single-select chip row */
function ChipRow({
  options,
  selected,
  onSelect,
  allowDeselect = false,
  optionsNs,
}: {
  options: string[]
  selected: string
  onSelect: (v: string) => void
  allowDeselect?: boolean
  optionsNs?: string
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected === opt
        const label = optionsNs ? t(`projectWizard.options.${optionsNs}.${opt}`, opt) : opt
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(allowDeselect && active ? '' : opt)}
            className={`rounded-md border px-3 py-1.5 text-[16px] font-normal transition-colors ${
              active
                ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.2)] text-[#fcecc8]'
                : 'border-[rgba(242,207,141,0.2)] bg-transparent text-[rgba(242,207,141,0.72)] hover:border-[rgba(242,207,141,0.45)] hover:text-[#fcecc8]'
            }`}
          >
            {active && <Check size={14} className="mr-2 inline" />}
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Multi-select chip group */
function ChipMulti({
  options,
  selected,
  onToggle,
  optionsNs,
}: {
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
  optionsNs?: string
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt)
        const label = optionsNs ? t(`projectWizard.options.${optionsNs}.${opt}`, opt) : opt
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`rounded-md border px-3 py-1.5 text-[16px] font-normal transition-colors ${
              active
                ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.2)] text-[#fcecc8]'
                : 'border-[rgba(242,207,141,0.2)] bg-transparent text-[rgba(242,207,141,0.72)] hover:border-[rgba(242,207,141,0.45)] hover:text-[#fcecc8]'
            }`}
          >
            {active && <Check size={14} className="mr-2 inline" />}
            {label}
          </button>
        )
      })}
    </div>
  )
}

function TagPickerField({
  label,
  hint,
  options,
  selected,
  onToggle,
  optionsNs,
}: {
  label: string
  hint?: string
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
  optionsNs?: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const preview = selected.slice(0, 4)
  const extra = selected.length - preview.length
  const tagLabel = (opt: string) => (optionsNs ? t(`projectWizard.options.${optionsNs}.${opt}`, opt) : opt)

  return (
    <>
      <div className="flex flex-col gap-1">
        <div>
          <span className={labelTextCls}>{label}</span>
          {hint && <p className="text-[16px] font-normal text-[rgba(242,207,141,0.6)]">{hint}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {preview.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-[#c9a84c] bg-[rgba(201,168,76,0.15)] px-3 py-1.5 text-[16px] font-normal text-[#fcecc8]"
            >
              {tagLabel(tag)}
            </span>
          ))}
          {extra > 0 && (
            <span className="text-[16px] font-normal text-[rgba(242,207,141,0.6)]">+{extra}</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-[rgba(242,207,141,0.3)] bg-transparent px-4 py-1.5 text-[16px] font-normal text-[rgba(242,207,141,0.85)] transition-colors hover:border-[rgba(242,207,141,0.55)] hover:text-[#fcecc8]"
          >
            <Plus size={14} />
            {selected.length === 0 ? t('projectWizard.shared.chooseLabel', 'Выбрать') : t('projectWizard.shared.changeLabel', 'Изменить')}
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto border-[rgba(242,207,141,0.2)] bg-[#0d2318] text-[color:var(--app-text)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#fcecc8]">{label}</DialogTitle>
          </DialogHeader>
          <p className="text-[16px] text-[rgba(242,207,141,0.65)]">
            {t('projectWizard.shared.selectedLabel', 'Выбрано:')} <span className="text-[#fcecc8]">{selected.length}</span>
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {options.map((opt) => {
              const active = selected.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onToggle(opt)}
                  className={`rounded-md border px-3 py-1.5 text-[16px] font-normal transition-colors ${
                    active
                      ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.2)] text-[#fcecc8]'
                      : 'border-[rgba(242,207,141,0.2)] bg-transparent text-[rgba(242,207,141,0.72)] hover:border-[rgba(242,207,141,0.45)] hover:text-[#fcecc8]'
                  }`}
                >
                  {active && <Check size={14} className="mr-2 inline" />}
                  {tagLabel(opt)}
                </button>
              )
            })}
          </div>
          <div className="pt-2 text-right">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-[#c9a84c] bg-[rgba(201,168,76,0.12)] px-6 py-2 text-[16px] font-normal text-[#fcecc8] transition-colors hover:bg-[rgba(201,168,76,0.22)]"
            >
              {t('projectWizard.shared.done', 'Готово')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Yes / No toggle */
function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  const { t } = useI18n()
  return (
    <div className="flex gap-3">
      {([true, false] as const).map((v) => {
        const active = value === v
        const label = v ? t('common.yes', 'Да') : t('common.no', 'Нет')
        return (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className={`rounded-md border px-6 py-1.5 text-[16px] font-normal transition-colors ${
              active
                ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.2)] text-[#fcecc8]'
                : 'border-[rgba(242,207,141,0.2)] bg-transparent text-[rgba(242,207,141,0.72)] hover:border-[rgba(242,207,141,0.45)] hover:text-[#fcecc8]'
            }`}
          >
            {active && <Check size={14} className="mr-2 inline" />}
            {label}
          </button>
        )
      })}
    </div>
  )
}

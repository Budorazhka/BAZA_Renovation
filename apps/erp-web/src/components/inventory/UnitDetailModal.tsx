/* eslint-disable react-hooks/preserve-manual-memoization */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react'
import { CalendarCheck, Check, ChevronDown, ImagePlus, Layers, LayoutTemplate, Plus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { downloadUnitVisitPdf, resolveVisitPdfHeroImages } from '@/lib/unit-visit-pdf'
import { useAuth } from '@/context/AuthContext'
import { getBranding } from '@/store/agencyStore'

import { Button } from '@/components/ui/button'
import { BookingRequestModal } from '@/components/inventory/BookingRequestModal'
import { CreateSelectionModal } from '@/components/development/CreateSelectionModal'
import { InstallmentPlansPanel } from '@/components/inventory/InstallmentPlansPanel'
import { PlanImagePicker } from '@/components/inventory/PlanImagePicker'
import { UnitFloorNavigator } from '@/components/inventory/UnitFloorNavigator'
import { UnitSharePanel, type ShareGeneratingAction } from '@/components/inventory/UnitSharePanel'
import {
  buildUnitShareGroups,
  getDefaultUnitShareCustomization,
  resolveUnitShareCustomization,
  type DevSelectionCustomization,
} from '@/config/dev-selection-customization'
import { UnitSalesInstallmentsSection } from '@/components/inventory/UnitSalesInstallmentsSection'
import {
  customizationEquals,
  loadUnitShareCustomization,
  saveUnitShareCustomization,
} from '@/lib/unit-share-customization'
import {
  buildBazaSaleUnitUrl,
  buildBazaSaleUnitUrlSmart,
  buildUnitSharePlainTextFromUrl,
  buildUnitShareUrl,
  buildUnitShareUrlSmart,
  openTelegramShareWithUrl,
} from '@/lib/unit-share'
import { developmentApi } from '@/services/developmentApi'
import { ROOM_TYPE_OPTIONS, normalizeRooms, optionLabel } from '@/lib/project-options'
import { useCoreStore } from '@/store/useCoreStore'
import { getInstallmentStore } from '@/store/useInstallmentStore'
import { useDevSelectionsStore } from '@/store/useDevSelectionsStore'
import { compactRoomsLabel, formatPrice, formatPricePerSqm, getCurrencySymbol } from '@/lib/chessboard'
import {
  getPrimaryFinishPrice,
  normalizeFinishPrices,
  resolveFinishDisplayOptions,
  resolveFinishTypesForEditing,
  UNIT_FINISH_TYPES,
} from '@/lib/unit-finish-pricing'
import { resolvePublicInstallment, resolveUnitModalListPrice } from '@/lib/installment-display'
import { ROLE_LABEL } from '@/lib/permissions'
import type { FinishType, IProject, IUnit } from '@/types/core'
import { useI18n } from "@/i18n";

type UnitStatus = IUnit['status']
type UnitRooms = string
type Tab = 'view' | 'edit'
type LayoutTab = 'plan' | 'floor' | 'installment' | 'share'

const ROOM_OPTIONS: readonly UnitRooms[] = [...ROOM_TYPE_OPTIONS]

const STATUS_CONFIG: Record<UnitStatus, { label: string; badge: string; dot: string }> = {
  free:      { label: 'В продаже', badge: 'border-emerald-700/35 bg-emerald-100/90 text-emerald-950', dot: 'bg-emerald-600' },
  booked:    { label: 'Бронь',     badge: 'border-amber-600/40 bg-amber-100 text-amber-950',          dot: 'bg-amber-500' },
  sold:      { label: 'Продано',   badge: 'border-rose-500/35 bg-rose-100 text-rose-950',             dot: 'bg-rose-500' },
  withdrawn: { label: 'Снято',     badge: 'border-slate-500/35 bg-slate-100 text-slate-800',         dot: 'bg-slate-500' },
}

/** Бейдж в шапке модалки (тёмная тема), формы редактирования используют STATUS_CONFIG.badge */
const STATUS_HEADER_BADGE: Record<UnitStatus, string> = {
  free:      'border-emerald-500/35 bg-emerald-950/60 text-emerald-50',
  booked:    'border-amber-400/35 bg-amber-950/45 text-amber-50',
  sold:      'border-rose-400/45 bg-rose-950/55 text-rose-50',
  withdrawn: 'border-slate-500/35 bg-slate-950/50 text-slate-100',
}

const FLOORPLAN_PANEL_GRID: CSSProperties = {
  backgroundColor: '#0e2a1f',
  backgroundImage: `
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
  `,
  backgroundSize: '28px 28px',
}

interface FormState {
  buildingId: string
  number: string
  floor: string
  rooms: UnitRooms
  area: string
  currency: string
  price: string
  pricePerSqm: string
  finishPrices: Record<FinishType, string>
  status: UnitStatus
}

function makeForm(unit: IUnit | null, fallbackBuildingId: string, fallbackCurrency: string = 'USD'): FormState {
  const finishPrices = Object.fromEntries(
    UNIT_FINISH_TYPES.map((finishType) => [
      finishType,
      unit?.finishPrices?.[finishType] != null ? String(unit.finishPrices[finishType]) : '',
    ]),
  ) as Record<FinishType, string>
  if (!unit) {
    return {
      buildingId: fallbackBuildingId,
      number: '',
      floor: '',
      rooms: '1+1',
      area: '',
      currency: fallbackCurrency || 'USD',
      price: '',
      pricePerSqm: '',
      finishPrices,
      status: 'free',
    }
  }
  return {
    buildingId: unit.building,
    number: unit.number,
    floor: String(unit.floor),
    rooms: normalizeRooms(unit.rooms) || '1+1',
    area: unit.area != null ? String(unit.area) : '',
    currency: unit.currency || fallbackCurrency || 'USD',
    price: unit.price != null ? String(unit.price) : '',
    pricePerSqm: unit.pricePerSqm != null ? String(unit.pricePerSqm) : '',
    finishPrices,
    status: unit.status,
  }
}

function parseNum(s: string): number | undefined {
  const v = Number(s.trim().replace(',', '.'))
  return Number.isFinite(v) && s.trim() !== '' ? v : undefined
}

interface Props {
  isOpen: boolean
  onClose: () => void
  initialData: IUnit | null
  preferredBuildingId?: string
}

export function UnitDetailModal({ isOpen, onClose, initialData, preferredBuildingId }: Props) {
  if (!isOpen) return null

  return (
    <UnitDetailModalContent
      key={`${initialData?._id ?? 'new'}:${preferredBuildingId ?? ''}`}
      onClose={onClose}
      initialData={initialData}
      preferredBuildingId={preferredBuildingId}
    />
  )
}

function UnitDetailModalContent({ onClose, initialData, preferredBuildingId }: Omit<Props, 'isOpen'>) {
    const { t } = useI18n();
  const buildings = useCoreStore((s) => s.buildings)
  const projects  = useCoreStore((s) => s.projects)
  const allUnits  = useCoreStore((s) => s.allUnits)
  const addUnit = useCoreStore((s) => s.addUnit)
  const updateUnit = useCoreStore((s) => s.updateUnit)
  const updateUnitsBulk = useCoreStore((s) => s.updateUnitsBulk)
  const setUnitPlanImage = useCoreStore((s) => s.setUnitPlanImage)
  const shareUnit = useCoreStore((s) => s.shareUnit)
  const { currentUser } = useAuth()

  const fallbackBuildingId = useMemo(() => {
    if (preferredBuildingId && buildings.some((b) => b._id === preferredBuildingId)) return preferredBuildingId
    return buildings[0]?._id ?? ''
  }, [preferredBuildingId, buildings])

  const navigate = useNavigate()
  const isNew = !initialData
  const [activeUnitId, setActiveUnitId] = useState(initialData?._id ?? null)
  const [tab, setTab] = useState<Tab>(isNew ? 'edit' : 'view')
  const [layoutTab, setLayoutTab] = useState<LayoutTab>('plan')
  const [form, setForm] = useState<FormState>(() => makeForm(initialData, fallbackBuildingId))
  const [error, setError] = useState<string | null>(null)
  const [selectedFinishType, setSelectedFinishType] = useState<FinishType | null>(null)

  const selections = useDevSelectionsStore((s) => s.selections)
  const addUnitsToSelection = useDevSelectionsStore((s) => s.addUnits)
  const fetchSelections = useDevSelectionsStore((s) => s.fetchAll)
  useEffect(() => {
    void fetchSelections()
  }, [fetchSelections])
  const [selDropOpen, setSelDropOpen] = useState(false)
  const [selAdded, setSelAdded] = useState<string | null>(null)
  const [showCreateSelModal, setShowCreateSelModal] = useState(false)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [showPlanPicker, setShowPlanPicker] = useState(false)
  const [shareDraft, setShareDraft] = useState<DevSelectionCustomization>(() => getDefaultUnitShareCustomization())
  const [shareSavedDraft, setShareSavedDraft] = useState<DevSelectionCustomization>(() => getDefaultUnitShareCustomization())
  const [shareGeneratingAction, setShareGeneratingAction] = useState<ShareGeneratingAction>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const sharePublishLockRef = useRef(false)
  const pdfManager = currentUser
    ? {
        name: currentUser.name?.trim() || currentUser.login?.split('@')[0] || 'Риэлтор',
        phone: currentUser.phone,
        avatarUrl: currentUser.avatarUrl,
        company: currentUser.companyName,
        role: currentUser.position || ROLE_LABEL[currentUser.role],
        telegram: currentUser.telegram,
        whatsapp: currentUser.whatsapp,
        email: currentUser.login,
        aboutMe: currentUser.aboutMe,
        aboutCompany: currentUser.aboutCompany,
        website: currentUser.website,
        instagram: currentUser.instagram,
      }
    : undefined
  const selDropRef = useRef<HTMLDivElement>(null)

  function buildShareLotInfo() {
    if (!unit) return null
    return {
      unitId: unit._id,
      lotNumber: unit.number,
      roomsLabel: unit.rooms ? optionLabel(t, 'rooms', compactRoomsLabel(unit.rooms)) : undefined,
      area: unit.area,
      floor: unit.floor,
      price: selectedTotalPrice,
      complexName: project?.name,
      location: project?.location,
      buildingName: building?.name,
    }
  }

  const shareAgent = pdfManager
    ? {
        name: pdfManager.name,
        phone: pdfManager.phone,
        telegram: pdfManager.telegram,
        whatsapp: pdfManager.whatsapp,
        company: pdfManager.company,
        role: pdfManager.role,
        avatarUrl: pdfManager.avatarUrl,
        email: pdfManager.email,
        aboutMe: pdfManager.aboutMe,
        aboutCompany: pdfManager.aboutCompany,
        website: pdfManager.website,
        instagram: pdfManager.instagram,
        companyLogo: getBranding().logoDataUrl ?? undefined,
      }
    : undefined

  const openSelections = useMemo(
    () => selections.filter((s) => s.status === 'draft' || s.status === 'sent'),
    [selections],
  )

  useEffect(() => {
    if (!selDropOpen) return
    function out(e: MouseEvent) {
      if (selDropRef.current && !selDropRef.current.contains(e.target as Node)) setSelDropOpen(false)
    }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [selDropOpen])

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handler)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', handler) }
  }, [onClose])

  // Live unit from store (keeps view tab fresh after inline edits)
  const liveUnit = useMemo(() => {
    if (!activeUnitId) return null
    return (
      allUnits.find((candidate) => candidate._id === activeUnitId) ??
      (initialData?._id === activeUnitId ? initialData : null)
    )
  }, [activeUnitId, initialData, allUnits])

  const building = useMemo(
    () => buildings.find((b) => b._id === (liveUnit?.building ?? form.buildingId)) ?? null,
    [buildings, liveUnit, form.buildingId],
  )

  const storeProject = useMemo(
    () => (building ? projects.find((p) => p._id === building.project) ?? null : null),
    [building, projects],
  )

  // ЖК может отсутствовать в списке getComplexes текущего аккаунта (чужой застройщик,
  // лимит выдачи) — тогда подтягиваем его по id, иначе рассрочка и отделка ЖК
  // падают на localStorage-фолбэк с неверными данными.
  const fetchProjectDetail = useCoreStore((s) => s.fetchProjectDetail)
  const [fetchedProject, setFetchedProject] = useState<IProject | null>(null)
  useEffect(() => {
    const externalId = building?.project
    if (storeProject || !externalId || fetchedProject?._id === externalId) return
    let cancelled = false
    void fetchProjectDetail(externalId).then((p) => {
      if (!cancelled && p) setFetchedProject(p)
    })
    return () => { cancelled = true }
  }, [storeProject, building?.project, fetchedProject, fetchProjectDetail])

  const project = storeProject ?? (fetchedProject?._id === building?.project ? fetchedProject : null)

  // Серверные планы рассрочки — источник истины: гидрируем локальный стор,
  // чтобы InstallmentPlansPanel показывал их на любом аккаунте/устройстве.
  const apiInstallmentPlans = project?.installmentPlans
  const projectIdForPlans = project?._id
  useEffect(() => {
    if (!projectIdForPlans || !apiInstallmentPlans) return
    getInstallmentStore().hydrateForProject(
      projectIdForPlans,
      apiInstallmentPlans.map((p) => ({ ...p, projectId: projectIdForPlans })),
    )
  }, [projectIdForPlans, apiInstallmentPlans])

  const unit = liveUnit
  const editableFinishTypes = useMemo(
    () => resolveFinishTypesForEditing(project?.finishTypes, unit?.finishPrices),
    [project?.finishTypes, unit?.finishPrices],
  )
  // Кондиции «Ремонт» = отделка ЖК + цены с лота (единый источник для карточки и оффера).
  // По умолчанию выбран базовый каркас ЖК; кондиции без цены показываются «по запросу».
  const finishDisplayOptions = useMemo(
    () => (unit ? resolveFinishDisplayOptions(project?.finishTypes, unit) : []),
    [project?.finishTypes, unit],
  )
  const defaultFinishType =
    finishDisplayOptions.find((option) => option.isBase)?.finishType ??
    finishDisplayOptions[0]?.finishType ??
    null
  const effectiveFinishType =
    selectedFinishType && finishDisplayOptions.some((option) => option.finishType === selectedFinishType)
      ? selectedFinishType
      : defaultFinishType
  const selectedFinishOption =
    finishDisplayOptions.find((option) => option.finishType === effectiveFinishType) ?? null

  const selectedPricePerSqm = selectedFinishOption?.pricePerSqm
  const selectedTotalPrice =
    selectedPricePerSqm != null && typeof unit?.area === 'number' && unit.area > 0
      ? Math.round(selectedPricePerSqm * unit.area)
      : undefined
  const pricedUnit = unit && selectedPricePerSqm != null
    ? {
        ...unit,
        pricePerSqm: selectedPricePerSqm,
        price: selectedTotalPrice,
      }
    : unit

  // projectId для рассрочки: полный объект проекта может не входить в загруженный
  // список projects (например, getComplexes отдаёт лимит 100), поэтому используем
  // building.project как надёжный fallback — он совпадает с ключом localStorage.
  const installmentProjectId = project?._id ?? building?.project ?? undefined

  const projectUnits = useMemo(() => {
    if (!project) return []
    const bIds = new Set(buildings.filter((b) => b.project === project._id).map((b) => b._id))
    return allUnits.filter((u) => bIds.has(u.building))
  }, [project, buildings, allUnits])

  // Корпуса ЖК — общий пул планировок собирается из них
  const complexBuildingIds = useMemo(() => {
    if (building) {
      const ids = buildings.filter((b) => b.project === building.project).map((b) => b._id)
      if (ids.length > 0) return ids
    }
    return building ? [building._id] : []
  }, [buildings, building])

  function field<K extends keyof FormState>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value as FormState[K] }))
  }

  function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!form.buildingId) { setError('Выберите корпус.'); return }
    const num = form.number.trim()
    if (!num) { setError('Укажите номер лота.'); return }
    const floor = Number(form.floor)
    if (!Number.isInteger(floor) || floor < 1) { setError('Этаж — целое число > 0.'); return }

    const area = parseNum(form.area)
    const finishPrices = normalizeFinishPrices(
      Object.fromEntries(
        UNIT_FINISH_TYPES.map((finishType) => [finishType, form.finishPrices[finishType]]),
      ),
    )
    const pricePerSqm = parseNum(form.pricePerSqm) ?? getPrimaryFinishPrice(finishPrices)
    const price =
      parseNum(form.price) ??
      (typeof area === 'number' && typeof pricePerSqm === 'number'
        ? Math.round(area * pricePerSqm)
        : undefined)
    const data = {
      number: num,
      floor,
      rooms: form.rooms,
      area,
      currency: form.currency || 'USD',
      price,
      pricePerSqm,
      finishPrices,
      status: form.status,
    }

    if (liveUnit) {
      updateUnit(liveUnit._id, data)
      setTab('view')
    } else {
      addUnit(form.buildingId, data)
      onClose()
    }
    setError(null)
  }

  const status = unit ? STATUS_CONFIG[unit.status] : null

  const shareGroups = useMemo(
    () => buildUnitShareGroups(unit ?? undefined, project ?? undefined),
    [unit, project],
  )

  function handleOpenUnit(nextUnit: IUnit) {
    setActiveUnitId(nextUnit._id)
    setForm(makeForm(nextUnit, nextUnit.building, project?.currency || 'USD'))
    setTab('view')
    setError(null)
    setSelDropOpen(false)
    setLayoutTab('plan')
    setShowPlanPicker(false)
    const loaded = resolveUnitShareCustomization(loadUnitShareCustomization(nextUnit._id) ?? undefined)
    setShareDraft(loaded)
    setShareSavedDraft(loaded)
  }

  useEffect(() => {
    if (!unit) return
    const loaded = resolveUnitShareCustomization(loadUnitShareCustomization(unit._id) ?? undefined)
    setShareDraft(loaded)
    setShareSavedDraft(loaded)
  }, [unit?._id])

  function handleShareDraftChange(next: DevSelectionCustomization) {
    setShareDraft(next)
  }

  const runWithSharePublish = useCallback(
    async (action: ShareGeneratingAction, run: (saved: DevSelectionCustomization) => void | Promise<void>) => {
      if (!unit || shareGeneratingAction || sharePublishLockRef.current) return

      const customization = shareDraft
      const isDirty = !customizationEquals(customization, shareSavedDraft)
      const publishCustomization = resolveUnitShareCustomization(customization)

      if (!isDirty) {
        await run(publishCustomization)
        return
      }

      sharePublishLockRef.current = true
      setShareGeneratingAction(action)
      try {
        await new Promise((resolve) => setTimeout(resolve, 200))
        saveUnitShareCustomization(unit._id, publishCustomization)
        setShareSavedDraft(publishCustomization)
        setShareDraft(publishCustomization)
        await run(publishCustomization)
      } finally {
        sharePublishLockRef.current = false
        setShareGeneratingAction(null)
      }
    },
    [unit, shareDraft, shareSavedDraft, shareGeneratingAction],
  )

  async function handlePreviewShareCard() {
    await runWithSharePublish('preview', (saved) => {
      if (!unit) return
      const url = buildUnitShareUrl(unit._id, shareAgent, saved)
      window.open(url, '_blank', 'noopener,noreferrer')
    })
  }

  async function handleCopyShareLink() {
    await runWithSharePublish('link', async (saved) => {
      if (!unit) return
      const url = await buildUnitShareUrlSmart(unit._id, shareAgent, saved)
      await navigator.clipboard.writeText(url)
    })
  }

  // Публичная витрина лота на baza.sale; null для мок-лотов, которых нет на
  // маркетплейсе. С токеном страница применяет кастомизацию и отправителя.
  const publicMarketUrl = unit ? buildBazaSaleUnitUrl(unit._id) : null

  async function handleCopyPublicMarketLink() {
    await runWithSharePublish('public-link', async (saved) => {
      if (!unit) return
      const url = (await buildBazaSaleUnitUrlSmart(unit._id, shareAgent, saved)) ?? publicMarketUrl
      if (url) await navigator.clipboard.writeText(url)
    })
  }

  async function handleShareToChats() {
    await runWithSharePublish('chats', async (saved) => {
      if (!unit) return
      const bName = building?.name ?? 'Корпус'
      const pName = project?.name ?? 'Проект'
      const lot = buildShareLotInfo()
      const messageText = lot
        ? buildUnitSharePlainTextFromUrl(lot, pdfManager, await buildUnitShareUrlSmart(lot.unitId, pdfManager, saved))
        : `${pName}\nКорпус: ${bName}\nЛот ${unit.number}`
      shareUnit(pricedUnit ?? unit, bName, pName, messageText)
      onClose()
      navigate('/dashboard/chats')
    })
  }

  async function shareToWhatsApp() {
    await runWithSharePublish('wa', async (saved) => {
      const lot = buildShareLotInfo()
      if (!lot) return
      const url = await buildUnitShareUrlSmart(lot.unitId, pdfManager, saved)
      const text = buildUnitSharePlainTextFromUrl(lot, pdfManager, url)
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
    })
  }

  async function shareToTelegram() {
    await runWithSharePublish('tg', async (saved) => {
      const lot = buildShareLotInfo()
      if (!lot) return
      const url = await buildUnitShareUrlSmart(lot.unitId, pdfManager, saved)
      openTelegramShareWithUrl(lot, pdfManager, url)
    })
  }

  async function handleDownloadVisitPdf() {
    if (!unit || pdfLoading) return
    await runWithSharePublish('pdf', async (saved) => {
      setPdfLoading(true)
      try {
        const pdfInstallment = resolvePublicInstallment(null, {
          projectId: installmentProjectId,
          projectPlans: project?.installmentPlans,
          projectTerms: project?.installmentTerms,
          unitId: unit._id,
          listPrice: resolveUnitModalListPrice(pricedUnit ?? unit),
        })

        const ok = await downloadUnitVisitPdf({
          unit: pricedUnit ?? unit,
          building: building ?? undefined,
          project: project ?? undefined,
          agent: pdfManager,
          customization: saved,
          installment: pdfInstallment,
          heroImages: resolveVisitPdfHeroImages(project),
          galleryImages: project?.renders?.filter(Boolean),
        })
        if (!ok) setError('Не удалось скачать PDF. Попробуйте ещё раз.')
      } catch {
        setError('Не удалось скачать PDF. Попробуйте ещё раз.')
      } finally {
        setPdfLoading(false)
      }
    })
  }


  return (
    <>
    {showCreateSelModal && unit && (
      <CreateSelectionModal unitIds={[unit._id]} onClose={() => setShowCreateSelModal(false)} />
    )}
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />

      {/* Карточка — жёсткий фикс-размер, чтобы вкладки не «прыгали» между табами */}
      <div
        className="relative z-10 flex flex-col overflow-hidden rounded-xl border border-[rgba(201,168,76,0.25)] bg-[#10261c] shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        style={{
          width: 'min(1280px, calc(100vw - 2rem))',
          maxWidth: 'min(1280px, calc(100vw - 2rem))',
          minWidth: 'min(1280px, calc(100vw - 2rem))',
          height: 'min(920px, calc(100vh - 2rem))',
          maxHeight: 'min(920px, calc(100vh - 2rem))',
          minHeight: 0,
        }}
      >

        {/* Header — grid: крестик всегда в правой колонке, длинный заголовок не выталкивает его за overflow.
             Фикс-высота, чтобы шапка не дышала между вкладками. */}
        <div className="grid h-[68px] shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[rgba(201,168,76,0.15)] bg-[#0f2318] px-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <h2 className="min-w-0 flex-1 truncate text-[20px] font-normal tracking-tight text-[#fcecc8]">
              {unit
                ? `Лот ${unit.number}`
                : 'Новый лот'}
            </h2>
            {unit && status && (
              <span className={`inline-flex max-w-[min(11rem,42vw)] shrink-0 items-center gap-1.5 truncate rounded-full border px-3 py-1 text-[15px] font-normal ${STATUS_HEADER_BADGE[unit.status]}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                <span className="truncate">{status.label}</span>
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-self-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-10 items-center justify-center rounded-md text-[rgba(242,207,141,0.5)] transition-colors hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]"
              aria-label={t('inventory.unitDetailModal.закрыть')}
            >
              <X size={20} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Body */}
        {tab === 'view' && unit ? (
          <div className="flex min-h-0 flex-1 flex-col">

            {/* Top — планировка / на этаже / рассрочка. Фикс-высота, чтобы вкладки не «прыгали» */}
            <div
              className="flex min-h-0 w-full min-w-0 flex-1 flex-col"
              style={FLOORPLAN_PANEL_GRID}
            >
              {/* Фикс-контейнер контента таба: занимает оставшееся место, скролл внутри.
                  scrollbar-gutter: stable резервирует место под полосу прокрутки на любом табе,
                  чтобы ширина не менялась при появлении скролла. */}
              <div
                className={`min-h-0 flex-1 overscroll-contain ${layoutTab === 'share' ? 'overflow-hidden' : 'overflow-y-auto'}`}
                style={{ scrollbarGutter: 'stable' }}
              >
                {layoutTab === 'installment' ? (
                  <div className="min-w-0 bg-[#0c2018] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.08)]">
                    <UnitSalesInstallmentsSection
                      unit={pricedUnit ?? unit}
                      projectId={installmentProjectId}
                      projectPlans={project?.installmentPlans}
                      projectTerms={project?.installmentTerms}
                      projectUnits={projectUnits}
                    />
                  </div>
                ) : layoutTab === 'share' ? (
                  <div className="flex h-full min-h-0 max-h-full flex-col overflow-hidden">
                  <UnitSharePanel
                    customization={shareDraft}
                    groups={shareGroups}
                    pdfLoading={pdfLoading}
                    shareGeneratingAction={shareGeneratingAction}
                    onCustomizationChange={handleShareDraftChange}
                    onPreview={() => void handlePreviewShareCard()}
                    onCopyLink={() => handleCopyShareLink()}
                    onCopyPublicLink={publicMarketUrl ? () => handleCopyPublicMarketLink() : undefined}
                    onDownloadPdf={() => handleDownloadVisitPdf()}
                    onShareToChats={() => handleShareToChats()}
                    onShareWhatsApp={() => shareToWhatsApp()}
                    onShareTelegram={() => shareToTelegram()}
                  />
                  </div>
                ) : (
                  <div className="flex h-full min-h-0 items-center justify-center p-6">
                    {layoutTab === 'plan' ? (
                      unit.layoutImageUrl ? (
                        <div className="relative flex h-full w-full items-center justify-center">
                          <img
                            src={unit.layoutImageUrl}
                            alt={`Планировка ${unit.number}`}
                            className="mx-auto block max-h-[min(50vh,420px)] w-auto max-w-full rounded-md object-contain lg:max-h-[min(62vh,560px)]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPlanPicker(true)}
                            className="absolute right-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-[#c9a84c]/55 bg-[rgba(16,38,28,0.85)] px-3 text-[14px] font-normal text-[#fcecc8] backdrop-blur-sm transition-colors hover:bg-[rgba(230,195,100,0.22)]"
                          >
                            <ImagePlus size={15} />
                            {t('inventory.unitDetailModal.заменить')}</button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-4 text-center">
                          <LayoutTemplate size={48} className="text-[rgba(201,168,76,0.25)]" strokeWidth={1.25} />
                          <p className="text-[16px] text-[rgba(242,207,141,0.45)]">{t('inventory.unitDetailModal.планировка_не_загруж')}</p>
                          <Button
                            type="button"
                            onClick={() => setShowPlanPicker(true)}
                            className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]"
                          >
                            <ImagePlus size={15} />
                            {t('inventory.unitDetailModal.выбрать_из_библиотек')}</Button>
                        </div>
                      )
                    ) : building ? (
                      <UnitFloorNavigator
                        key={unit._id}
                        building={building}
                        currentUnit={unit}
                        units={allUnits}
                        onOpenUnit={handleOpenUnit}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-center">
                        <LayoutTemplate size={48} className="text-[rgba(201,168,76,0.25)]" strokeWidth={1.25} />
                        <p className="text-[16px] text-[rgba(242,207,141,0.45)]">{t('inventory.unitDetailModal.поэтажный_план_не_за')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Табы план / этаж / рассрочка / поделиться */}
              <div
                className="relative z-10 flex shrink-0 items-center justify-center gap-8 border-t border-[rgba(255,255,255,0.08)] bg-[#0e2a1f]"
                style={{ height: 44, minHeight: 44, maxHeight: 44 }}
              >
                {(['plan', 'floor', 'installment', 'share'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setLayoutTab(t)}
                    className={`relative inline-flex items-center text-[16px] font-normal transition-colors ${
                      layoutTab === t ? 'text-[#fcecc8]' : 'text-[rgba(242,207,141,0.45)] hover:text-[rgba(242,207,141,0.8)]'
                    }`}
                    style={{ height: 44, lineHeight: '44px', padding: 0 }}
                  >
                    {t === 'plan' ? 'Планировка' : t === 'floor' ? 'На этаже' : t === 'installment' ? 'Рассрочка' : 'Поделиться'}
                    <span className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${layoutTab === t ? 'bg-[#c9a84c]' : 'bg-transparent'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom — характеристики и действия, всегда видимы */}
            <div className="shrink-0 border-t border-[rgba(201,168,76,0.15)] bg-[#0f2318] px-5 py-3">

              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
                <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-8 gap-y-4">
                  {[
                    { label: 'Корпус', value: building?.name ?? '—' },
                    { label: 'Этаж', value: String(unit.floor) },
                    { label: 'Площадь', value: unit.area != null ? `${unit.area} м²` : '—' },
                    { label: 'Комнатность', value: optionLabel(t, 'rooms', compactRoomsLabel(unit.rooms)) || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex min-w-0 shrink-0 flex-col gap-1.5">
                      <span className="text-[12px] uppercase tracking-[0.08em] text-[rgba(242,207,141,0.5)]">{label}</span>
                      <span className="block text-[17px] font-normal leading-none text-[#fcecc8]">{value}</span>
                    </div>
                  ))}

                  <div className="flex min-w-0 shrink-0 flex-col gap-1.5">
                    <span className="text-[12px] uppercase tracking-[0.08em] text-[rgba(242,207,141,0.5)]">{t('inventory.unitDetailModal.ремонт')}</span>
                    {finishDisplayOptions.length > 1 ? (
                      <div className="relative group">
                        <select
                          aria-label={t('inventory.unitDetailModal.выбрать_ремонт')}
                          value={effectiveFinishType ?? ''}
                          onChange={(event) => setSelectedFinishType((event.target.value || null) as FinishType | null)}
                          className="block appearance-none !bg-[rgba(230,195,100,0.08)] pr-7 pl-2.5 py-0.5 -ml-2.5 -my-0.5 text-[17px] leading-none font-normal !text-[#fcecc8] !outline-none cursor-pointer transition-colors hover:!bg-[rgba(230,195,100,0.15)] focus:!bg-[rgba(230,195,100,0.15)] !border !border-[rgba(201,168,76,0.25)] hover:!border-[rgba(201,168,76,0.45)] !ring-0 !rounded-[4px]"
                        >
                          {finishDisplayOptions.map((option) => (
                            <option key={option.finishType} value={option.finishType} className="bg-[#10261c] text-[#fcecc8]">
                              {optionLabel(t, 'finishTypes', option.finishType)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[rgba(242,207,141,0.6)] pointer-events-none transition-colors group-hover:text-[#fcecc8]" />
                      </div>
                    ) : (
                      <span className="block text-[17px] font-normal leading-none text-[#fcecc8]">
                        {effectiveFinishType ? optionLabel(t, 'finishTypes', effectiveFinishType) : '—'}
                      </span>
                    )}
                  </div>

                  <div className="flex min-w-0 shrink-0 flex-col gap-1.5">
                    <span className="text-[12px] uppercase tracking-[0.08em] text-[rgba(242,207,141,0.5)]">{t('inventory.unitDetailModal.стоимость')}</span>
                    <span className="block text-[17px] font-medium leading-none text-[#fcecc8]">
                      {effectiveFinishType ? formatPrice(selectedTotalPrice, unit.currency || project?.currency || 'USD') || 'по запросу' : '—'}
                    </span>
                  </div>

                  <div className="flex min-w-0 shrink-0 flex-col gap-1.5">
                    <span className="text-[12px] uppercase tracking-[0.08em] text-[rgba(242,207,141,0.5)]">{t('inventory.unitDetailModal.за_м')}</span>
                    <span className="block text-[17px] font-normal leading-none text-[#fcecc8]">
                      {effectiveFinishType ? formatPricePerSqm(selectedPricePerSqm, unit.currency || project?.currency || 'USD') || 'по запросу' : '—'}
                    </span>
                  </div>
                </div>

                {/* Кнопки действий — внизу справа */}
                <div className="flex shrink-0 items-center gap-2">
                  {unit.status === 'free' && (
                    <button
                      type="button"
                      onClick={() => setShowBookingModal(true)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-[#c9a84c]/55 bg-[rgba(230,195,100,0.12)] px-3 text-[14px] font-normal uppercase tracking-[0.04em] text-[#fcecc8] transition-colors hover:bg-[rgba(230,195,100,0.22)]"
                    >
                      <CalendarCheck size={14} />
                      {t('inventory.unitDetailModal.забронировать')}</button>
                  )}

                  <div className="relative" ref={selDropRef}>
                    <button
                      type="button"
                      onClick={() => setSelDropOpen((v) => !v)}
                      className="flex h-9 items-center gap-1.5 rounded-md border border-[#f0e6c8]/22 bg-linear-to-b from-[#e5cf88] via-[#c9a84c] to-[#8f7340] px-3 text-[14px] font-normal text-[#1c140a] transition-[filter] hover:brightness-[1.06]"
                    >
                      <Layers size={12} />
                      {t('inventory.unitDetailModal.в_подборку')}<ChevronDown size={10} className={`transition-transform ${selDropOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {selDropOpen && (
                      <div className="absolute bottom-full right-0 z-50 mb-1.5 w-64 overflow-hidden rounded-xl border border-[#c9a84c]/22 bg-[#224535] py-1 shadow-xl shadow-black/60 ring-1 ring-black/35">
                        <button
                          type="button"
                          onClick={() => { setSelDropOpen(false); setShowCreateSelModal(true) }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#e8dcc8] hover:bg-[#2a5040]"
                        >
                          <Plus size={12} className="text-[#c9a84c]/85" />
                          {t('inventory.unitDetailModal.создать_новую_подбор')}</button>

                        {openSelections.length > 0 && (
                          <>
                            <div className="my-1 border-t border-[#2f4d42]" />
                            <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-[#a8c9bc]/55">
                              {t('inventory.unitDetailModal.добавить_в_существую')}</p>
                            {openSelections.map((sel) => {
                              const alreadyIn = sel.items.some((i) => i.unitId === unit._id)
                              return (
                                <button
                                  key={sel.id}
                                  type="button"
                                  disabled={alreadyIn}
                                  onClick={() => {
                                    addUnitsToSelection(sel.id, [unit._id])
                                    setSelAdded(sel.id)
                                    setTimeout(() => setSelAdded(null), 2000)
                                    setSelDropOpen(false)
                                  }}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-[#e8dcc8] hover:bg-[#2a5040] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <span className="truncate">{sel.title}</span>
                                  {alreadyIn
                                    ? <Check size={11} className="shrink-0 text-[#7ecfae]" />
                                    : <span className="shrink-0 tabular-nums text-[#a8c9bc]/65">{sel.items.length} {t('inventory.unitDetailModal.кв')}</span>
                                  }
                                </button>
                              )
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        ) : null}

        {/* Tab 2: Edit Form */}
        {tab === 'edit' && (
          <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
              {isNew && (
                <label className="flex flex-col gap-1.5">
                  <span className={LABEL}>{t('inventory.unitDetailModal.корпус')}</span>
                  <select value={form.buildingId} onChange={field('buildingId')} className={SELECT}>
                    {buildings.map((b) => (
                      <option key={b._id} value={b._id}>{b.name ?? b._id}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>{t('inventory.unitDetailModal.номер_лота')}</span>
                <input type="text" value={form.number} onChange={field('number')} placeholder="A-0101" className={INPUT} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>{t('inventory.unitDetailModal.этаж')}</span>
                <input type="number" value={form.floor} onChange={field('floor')} placeholder="1" className={INPUT} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>{t('inventory.unitDetailModal.комнатность')}</span>
                <select value={form.rooms} onChange={field('rooms')} className={SELECT}>
                  {ROOM_OPTIONS.map((r) => <option key={r} value={r}>{optionLabel(t, 'rooms', r)}</option>)}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>{t('inventory.unitDetailModal.площадь_м')}</span>
                <input type="number" value={form.area} onChange={field('area')} placeholder="60" step="0.1" className={INPUT} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>{t('inventory.unitDetailModal.валюта', 'Валюта')}</span>
                <select value={form.currency} onChange={field('currency')} className={SELECT}>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>{t('inventory.unitDetailModal.базовая_цена_за_м')} ({getCurrencySymbol(form.currency)}/м²)</span>
                <input type="number" value={form.pricePerSqm} onChange={field('pricePerSqm')} placeholder="2400" className={INPUT} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>{t('inventory.unitDetailModal.базовая_стоимость_ло')} ({getCurrencySymbol(form.currency)})</span>
                <input type="number" value={form.price} onChange={field('price')} placeholder="144000" className={INPUT} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>{t('inventory.unitDetailModal.статус')}</span>
                <select value={form.status} onChange={field('status')} className={SELECT}>
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                    <option key={v} value={v}>{c.label}</option>
                  ))}
                </select>
              </label>

              <div className="col-span-full rounded-[6px] bg-[#112d1c] p-4 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
                <div className="mb-3">
                  <h3 className="text-[18px] font-medium text-[#e6c364]">{t('inventory.unitDetailModal.цены_по_кондициям')}</h3>
                  <p className="mt-1 text-[16px] text-[rgba(255,255,255,0.72)]">
                    {t('inventory.unitDetailModal.клиент_увидит_только')}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {editableFinishTypes.map((finishType) => (
                    <label key={finishType} className="flex flex-col gap-1.5">
                      <span className={LABEL}>{optionLabel(t, 'finishTypes', finishType)}, {getCurrencySymbol(form.currency)}/м²</span>
                      <input
                        type="number"
                        min={0}
                        value={form.finishPrices[finishType]}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            finishPrices: {
                              ...previous.finishPrices,
                              [finishType]: event.target.value,
                            },
                          }))
                        }
                        placeholder={t('inventory.unitDetailModal.не_предлагается')}
                        className={INPUT}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {error && <p className="col-span-full text-sm font-medium text-rose-900">{error}</p>}
            </div>

            {/* Рассрочка в режиме редактирования */}
            {unit && (
              <div className="min-w-0 shrink-0 border-t border-[#2a453c] px-6 py-4">
                <p className="mb-3 text-[13px] uppercase tracking-[0.08em] text-[rgba(242,207,141,0.5)]">{t('inventory.unitDetailModal.рассрочка')}</p>
                <InstallmentPlansPanel
                  unit={unit}
                  projectId={project?._id}
                  isEditMode
                />
              </div>
            )}

            <footer className="mt-auto flex shrink-0 items-center justify-end gap-3 border-t border-[#2a453c] bg-[#1e3a2e] px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => (isNew ? onClose() : setTab('view'))}
                className="border-[#c9a84c]/28 bg-transparent text-[#e8dcc8] hover:bg-[#2a4f3c] hover:text-[#fcecc8]"
              >
                {t('inventory.unitDetailModal.отмена')}</Button>
              <Button
                type="submit"
                className="border border-[rgba(7,53,39,0.25)] bg-[#6f8572] text-[#f0f4ef] hover:bg-[#627868]"
              >
                {t('inventory.unitDetailModal.сохранить')}</Button>
            </footer>
          </form>
        )}

        {/* Floating notifications */}
        {selAdded && (
          <div className="absolute bottom-[104px] left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-[6px] border border-[#c9a84c]/22 bg-[#1c3d2e] px-4 py-2 text-[16px] text-[#dcefe8] shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
            <Check size={14} className="text-[#7ecfae]" />
            {t('inventory.unitDetailModal.добавлено_в_подборку')}</div>
        )}
      </div>
    </div>

    {showPlanPicker && unit && building && (
      <PlanImagePicker
        buildingId={building._id}
        buildingIds={complexBuildingIds}
        currentImageFileId={unit.imageFileId}
        onSelect={(file) => setUnitPlanImage(unit._id, file.id)}
        onDetach={unit.imageFileId ? () => setUnitPlanImage(unit._id, null) : undefined}
        onClose={() => setShowPlanPicker(false)}
      />
    )}

    {showBookingModal && unit && (
      <BookingRequestModal
        contextTitle={[project?.name, building?.name].filter(Boolean).join(' · ') || undefined}
        unit={{
          title: `Лот ${unit.number}`,
          subtitle: [optionLabel(t, 'rooms', compactRoomsLabel(unit.rooms)), unit.area != null ? `${unit.area} м²` : null, `эт. ${unit.floor}`].filter(Boolean).join(' · '),
        }}
        onClose={() => setShowBookingModal(false)}
        onSubmit={async ({ clientName, clientPhone, notes, startsAt, expiresAt }) => {
          const complexId = project?._id ?? building?.project
          if (!complexId) throw new Error('Не удалось определить ЖК для брони.')
          try {
            await developmentApi.createBooking({
              complexId,
              buildingId: unit.building,
              unitId: unit._id,
              unitNumber: unit.number,
              realtorName: clientName || undefined,
              agency: clientPhone || undefined,
              comment: notes || undefined,
              startsAt: new Date(startsAt).toISOString(),
              expiresAt: new Date(expiresAt).toISOString(),
            })
            // Оптимистично помечаем лот забронированным, чтобы шахматка сразу обновилась.
            updateUnitsBulk([unit._id], { status: 'booked' })
          } catch (err) {
            const message =
              (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              (err instanceof Error ? err.message : null) ??
              'Не удалось отправить заявку на бронирование.'
            throw new Error(message)
          }
        }}
      />
    )}
    </>
  )
}

// ── Shared input styles ─────────────────────────────────────────────────────
const LABEL = 'text-xs font-medium text-[#a8c9bc]/75'
const INPUT =
  'h-10 rounded-lg border border-[rgba(25,49,39,0.5)] bg-[#1c3d2e] px-3 text-sm text-[#eef6f2] placeholder:text-[#5c8576]/65 outline-none transition-colors focus:border-[#c9a84c]/45 focus:ring-2 focus:ring-[#c9a84c]/12'
const SELECT =
  'h-10 rounded-lg border border-[rgba(25,49,39,0.5)] bg-[#1c3d2e] px-3 text-sm text-[#eef6f2] outline-none transition-colors focus:border-[#c9a84c]/45 focus:ring-2 focus:ring-[#c9a84c]/12'


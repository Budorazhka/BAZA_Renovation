import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, ChevronDown, ChevronUp, Gift, Pencil, Percent, Search, Settings2, TrendingUp, Wallet, X } from 'lucide-react'

import { PasswordConfirmModal } from '@/components/common/PasswordConfirmModal'
import { useAuth } from '@/context/AuthContext'
import { computeUnitTotalPrice, formatPrice, getCurrencySymbol, resolvePromotionInstallmentTerm, compactRoomsLabel, formatArea } from '@/lib/chessboard'
import { optionLabel } from '@/lib/project-options'
import { useCoreStore } from '@/store/useCoreStore'
import type { BulkPromotionInput } from '@/store/useCoreStore'
import type { IBuilding, IProject, IUnit } from '@/types/core'
import { useI18n } from "@/i18n";

const STATUS_LABELS: Record<IUnit['status'], string> = {
  free: 'В продаже',
  booked: 'Бронь',
  sold: 'Продано',
  withdrawn: 'Снято',
}

const STATUS_DOT: Record<IUnit['status'], string> = {
  free: 'bg-emerald-400',
  booked: 'bg-[#f2c040]',
  sold: 'bg-[rgba(205,145,150,0.6)]',
  withdrawn: 'bg-slate-400',
}

export type UnitTableColKey =
  | 'type'
  | 'status'
  | 'number'
  | 'positionInFloor'
  | 'price'
  | 'pricePerSqm'
  | 'rooms'
  | 'area'
  | 'floor'
  | 'building'
  | 'project'
  | 'promotion'

type SortableColKey = 'number' | 'positionInFloor' | 'price' | 'pricePerSqm' | 'rooms' | 'area' | 'floor' | 'status' | 'building'
const SORTABLE = new Set<UnitTableColKey>(['number', 'positionInFloor', 'price', 'pricePerSqm', 'rooms', 'area', 'floor', 'status', 'building'])

export const ALL_UNIT_TABLE_COLS: { key: UnitTableColKey; label: string; alwaysOn?: boolean }[] = [
  { key: 'type', label: 'Тип' },
  { key: 'status', label: 'Статус', alwaysOn: true },
  { key: 'number', label: 'Номер помещения', alwaysOn: true },
  { key: 'positionInFloor', label: 'Номер на этаже' },
  { key: 'price', label: 'Цена' },
  { key: 'pricePerSqm', label: '$/м²' },
  { key: 'rooms', label: 'Кол-во комнат' },
  { key: 'area', label: 'Площадь, м²' },
  { key: 'floor', label: 'Этаж' },
  { key: 'building', label: 'Корпус' },
  { key: 'project', label: 'Название ЖК' },
  { key: 'promotion', label: 'Акция' },
]

export const DEFAULT_UNIT_TABLE_VISIBLE_COLS = new Set<UnitTableColKey>([
  'type', 'status', 'number', 'positionInFloor', 'price', 'rooms', 'area', 'floor', 'building', 'project', 'promotion',
])

const COLUMN_WIDTHS: Record<UnitTableColKey, string> = {
  type: '150px',
  status: '120px',
  number: '170px',
  positionInFloor: '120px',
  price: '140px',
  pricePerSqm: '130px',
  rooms: '130px',
  area: '120px',
  floor: '90px',
  building: '130px',
  project: '170px',
  promotion: '180px',
}

const NUMERIC_COLS = new Set<UnitTableColKey>(['positionInFloor', 'price', 'pricePerSqm', 'rooms', 'area', 'floor'])

/** В столбце «Площадь, м²» единица уже в заголовке — значения без «м²». */
const AREA_NUMBER_FORMAT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
const CENTERED_COLS = new Set<UnitTableColKey>([
  'type',
  'status',
  'number',
  'positionInFloor',
  'price',
  'pricePerSqm',
  'rooms',
  'area',
  'floor',
  'building',
  'project',
  'promotion',
])

const PAGE_SIZES = [10, 25, 50, 'all'] as const

interface Props {
  units: IUnit[]
  buildings: IBuilding[]
  projects: IProject[]
  onOpenDetail: (unit: IUnit) => void
  onShiftSelectUnit?: (unitId: string) => void
  selectedUnitIds?: Set<string>
  onToggleUnit?: (unitId: string) => void
  onTogglePage?: (unitIds: string[]) => void
  onClearSelection?: () => void
  hideToolbar?: boolean
  visibleCols?: Set<UnitTableColKey>
  onToggleVisibleCol?: (key: UnitTableColKey) => void
}

export function UnitTableView({
  units,
  buildings,
  projects,
  onOpenDetail,
  onShiftSelectUnit,
  selectedUnitIds,
  onToggleUnit,
  onTogglePage,
  onClearSelection,
  hideToolbar = false,
  visibleCols,
  onToggleVisibleCol,
}: Props) {
  const { t } = useI18n()
  const updateUnit             = useCoreStore((s) => s.updateUnit)
  const updateUnitsBulk        = useCoreStore((s) => s.updateUnitsBulk)
  const applyBulkPriceChange   = useCoreStore((s) => s.applyBulkPriceChange)
  const applyBulkPromotion     = useCoreStore((s) => s.applyBulkPromotion)
  const clearBulkPromotion     = useCoreStore((s) => s.clearBulkPromotion)
  const { currentUser } = useAuth()

  // ── sub-view toggle ──
  const [subView] = useState<'list' | 'matrix'>('list')

  // ── mass edit panel ──
  const [massEditOpen, setMassEditOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const massEditRef = useRef<HTMLDivElement>(null)
  // price
  const [priceMode, setPriceMode] = useState<'pct' | 'fixed'>('pct')
  const [priceDir,  setPriceDir]  = useState<'+' | '-'>('+')
  const [priceVal,  setPriceVal]  = useState('')
  const [priceError, setPriceError] = useState('')
  const [priceConfirmOpen, setPriceConfirmOpen] = useState(false)
  const [pendingPriceChange, setPendingPriceChange] = useState<{ value: number; mode: 'pct' | 'fixed'; dir: '+' | '-' } | null>(null)
  // promo
  const [promoKind,     setPromoKind]     = useState<'price_discount' | 'gift'>('price_discount')
  const [promoLabel,    setPromoLabel]    = useState('')
  const [promoDiscPct,  setPromoDiscPct]  = useState('')
  const [promoGiftText, setPromoGiftText] = useState('')
  const [promoExpires,  setPromoExpires]  = useState('')

  function gate(fn: () => void) {
    if (currentUser?.role === 'manager') setPendingAction(() => fn)
    else fn()
  }

  function applyPrice() {
    const v = parseFloat(priceVal.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) {
      setPriceError('Укажите корректное значение цены.')
      return
    }
    setPriceError('')
    setPendingPriceChange({ value: v, mode: priceMode, dir: priceDir })
    setPriceConfirmOpen(true)
  }

  function confirmApplyPrice() {
    if (!pendingPriceChange) return
    const signed = pendingPriceChange.dir === '-' ? -pendingPriceChange.value : pendingPriceChange.value
    gate(() => applyBulkPriceChange(selectedIds, signed, pendingPriceChange.mode === 'pct' ? 'percentage' : 'fixed'))
    setPriceConfirmOpen(false)
    setPendingPriceChange(null)
    setPriceVal('')
    setPriceError('')
  }

  function applyPromo() {
    let promo: BulkPromotionInput
    if (promoKind === 'price_discount') {
      const pct = parseFloat(promoDiscPct)
      if (!promoLabel.trim() || !Number.isFinite(pct) || pct <= 0) return
      promo = {
        kind: 'price_discount',
        label: promoLabel.trim(),
        discountPercent: Math.min(100, pct),
        expiresAt: promoExpires || undefined,
      }
    } else {
      if (!promoLabel.trim()) return
      promo = {
        kind: 'gift',
        label: promoLabel.trim(),
        giftText: promoGiftText.trim() || undefined,
        expiresAt: promoExpires || undefined,
      }
    }
    gate(() => applyBulkPromotion(selectedIds, promo))
    setPromoLabel('')
    setPromoDiscPct('')
    setPromoGiftText('')
    setPromoExpires('')
  }

  // ── column visibility ──
  const [internalVisibleCols, setInternalVisibleCols] = useState<Set<UnitTableColKey>>(DEFAULT_UNIT_TABLE_VISIBLE_COLS)
  const [colPickerOpen, setColPickerOpen] = useState(false)

  // ── inline status edit ──
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null)

  // ── sorting ──
  const [sortKey, setSortKey] = useState<SortableColKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(key: UnitTableColKey) {
    if (!SORTABLE.has(key)) return
    const k = key as SortableColKey
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
    setPage(1)
  }

  // ── pagination ──
  const [pageSize, setPageSize] = useState<10 | 25 | 50 | 'all'>(25)
  const [page, setPage] = useState(1)

  // ── internal filters ──
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<IUnit['status'] | 'all'>('all')
  const [roomsFilter, setRoomsFilter] = useState('')
  const [areaMin, setAreaMin] = useState('')
  const [areaMax, setAreaMax] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')

  const colPickerRef = useRef<HTMLDivElement>(null)
  const statusDropdownRef = useRef<HTMLDivElement>(null)

  const hasSelection = selectedUnitIds !== undefined && onToggleUnit !== undefined
  const selectedIds  = hasSelection ? Array.from(selectedUnitIds!) : []

  // ── maps ──
  const buildingMap = useMemo(() => {
    const m = new Map<string, IBuilding>()
    buildings.forEach((b) => m.set(b._id, b))
    return m
  }, [buildings])

  const projectMap = useMemo(() => {
    const m = new Map<string, IProject>()
    projects.forEach((p) => m.set(p._id, p))
    return m
  }, [projects])

  // ── unique rooms for filter chips ──
  const uniqueRooms = useMemo(() => {
    const seen = new Set<string>()
    for (const u of units) { if (u.rooms) seen.add(u.rooms) }
    return Array.from(seen).sort()
  }, [units])

  // ── filtered list (для таблицы — все фильтры, включая комнаты) ──
  const filteredUnits = useMemo(() => {
    if (hideToolbar) return units
    const minNum = parseFloat(areaMin)
    const maxNum = parseFloat(areaMax)
    const priceMinNum = parseFloat(priceMin)
    const priceMaxNum = parseFloat(priceMax)
    const hasMin = Number.isFinite(minNum) && minNum > 0
    const hasMax = Number.isFinite(maxNum) && maxNum > 0
    const hasPriceMin = Number.isFinite(priceMinNum) && priceMinNum > 0
    const hasPriceMax = Number.isFinite(priceMaxNum) && priceMaxNum > 0
    const q = search.trim().toLowerCase()

    return units.filter((u) => {
      const totalPrice = computeUnitTotalPrice(u)
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (roomsFilter && u.rooms !== roomsFilter) return false
      if (hasMin && (u.area ?? 0) < minNum) return false
      if (hasMax && (u.area ?? 0) > maxNum) return false
      if (hasPriceMin && (typeof totalPrice !== 'number' || totalPrice < priceMinNum)) return false
      if (hasPriceMax && (typeof totalPrice !== 'number' || totalPrice > priceMaxNum)) return false
      if (q && !u.number.toLowerCase().includes(q)) return false
      return true
    })
  }, [units, hideToolbar, statusFilter, roomsFilter, areaMin, areaMax, priceMin, priceMax, search])

  // ── для матрицы: фильтруем по всему кроме комнат, их используем как подсветку ──
  const matrixUnits = useMemo(() => {
    if (hideToolbar) return units
    if (!roomsFilter) return filteredUnits
    const minNum = parseFloat(areaMin)
    const maxNum = parseFloat(areaMax)
    const priceMinNum = parseFloat(priceMin)
    const priceMaxNum = parseFloat(priceMax)
    const hasMin = Number.isFinite(minNum) && minNum > 0
    const hasMax = Number.isFinite(maxNum) && maxNum > 0
    const hasPriceMin = Number.isFinite(priceMinNum) && priceMinNum > 0
    const hasPriceMax = Number.isFinite(priceMaxNum) && priceMaxNum > 0
    const q = search.trim().toLowerCase()

    return units.filter((u) => {
      const totalPrice = computeUnitTotalPrice(u)
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (hasMin && (u.area ?? 0) < minNum) return false
      if (hasMax && (u.area ?? 0) > maxNum) return false
      if (hasPriceMin && (typeof totalPrice !== 'number' || totalPrice < priceMinNum)) return false
      if (hasPriceMax && (typeof totalPrice !== 'number' || totalPrice > priceMaxNum)) return false
      if (q && !u.number.toLowerCase().includes(q)) return false
      return true
    })
  }, [units, hideToolbar, statusFilter, areaMin, areaMax, priceMin, priceMax, search, roomsFilter, filteredUnits])

  const matrixHighlightIds = useMemo(() => {
    if (!roomsFilter) return undefined
    const ids = new Set<string>()
    for (const u of matrixUnits) {
      if (u.rooms === roomsFilter) ids.add(u._id)
    }
    return ids
  }, [matrixUnits, roomsFilter])

  const sortedUnits = useMemo(() => {
    if (!sortKey) return filteredUnits
    return [...filteredUnits].sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0
      if (sortKey === 'price') { av = computeUnitTotalPrice(a) ?? 0; bv = computeUnitTotalPrice(b) ?? 0 }
      else if (sortKey === 'pricePerSqm') { av = a.pricePerSqm ?? 0; bv = b.pricePerSqm ?? 0 }
      else if (sortKey === 'area') { av = a.area ?? 0; bv = b.area ?? 0 }
      else if (sortKey === 'floor') { av = a.floor; bv = b.floor }
      else if (sortKey === 'rooms') { av = a.rooms ?? ''; bv = b.rooms ?? '' }
      else if (sortKey === 'status') { av = a.status; bv = b.status }
      else if (sortKey === 'positionInFloor') { av = a.positionInFloor ?? 0; bv = b.positionInFloor ?? 0 }
      else if (sortKey === 'building') {
        av = buildingMap.get(a.building)?.name ?? ''
        bv = buildingMap.get(b.building)?.name ?? ''
      }
      else if (sortKey === 'number') {
        const cmp = a.number.localeCompare(b.number, 'ru', { numeric: true, sensitivity: 'base' })
        return sortDir === 'asc' ? cmp : -cmp
      }
      if (typeof av === 'string') {
        const cmp = av.localeCompare(bv as string, 'ru', { sensitivity: 'base' })
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [filteredUnits, sortKey, sortDir, buildingMap])

  const filtersActive = statusFilter !== 'all' || roomsFilter || areaMin || areaMax || priceMin || priceMax || search

  function resetFilters() {
    setStatusFilter('all')
    setRoomsFilter('')
    setAreaMin('')
    setAreaMax('')
    setPriceMin('')
    setPriceMax('')
    setSearch('')
    setPage(1)
  }

  // reset to page 1 on filter change
  useEffect(() => { setPage(1) }, [statusFilter, roomsFilter, areaMin, areaMax, priceMin, priceMax, search])

  // ── click outside ──
  useEffect(() => {
    if (!colPickerOpen && editingStatusId === null) return
    function handleClickOutside(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setColPickerOpen(false)
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) setEditingStatusId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [colPickerOpen, editingStatusId])

  // ── pagination ──
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(sortedUnits.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageUnits = pageSize === 'all' ? sortedUnits : sortedUnits.slice((safePage - 1) * pageSize, safePage * pageSize)
  const pageUnitIds = useMemo(() => pageUnits.map((u) => u._id), [pageUnits])

  const pageAllSelected = hasSelection && pageUnitIds.length > 0 && pageUnitIds.every((id) => selectedUnitIds!.has(id))
  const pagePartialSelected = hasSelection && !pageAllSelected && pageUnitIds.some((id) => selectedUnitIds!.has(id))

  const activeVisibleCols = visibleCols ?? internalVisibleCols
  const cols = ALL_UNIT_TABLE_COLS.filter((c) => c.alwaysOn || activeVisibleCols.has(c.key))

  function toggleCol(key: UnitTableColKey) {
    if (onToggleVisibleCol) {
      onToggleVisibleCol(key)
      setPage(1)
      return
    }
    setInternalVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
    setPage(1)
  }

  function getCell(unit: IUnit, key: UnitTableColKey): React.ReactNode {

    const building = buildingMap.get(unit.building)
    const project = building ? projectMap.get(building.project) : undefined

    switch (key) {
      case 'type':
        return <span className="text-[color:var(--ut-muted)]">{t('inventory.unitTableView.квартира')}</span>

      case 'status':
        return (
          <div className="relative flex justify-center" ref={editingStatusId === unit._id ? statusDropdownRef : undefined}>
            <button
              type="button"
              title={STATUS_LABELS[unit.status]}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-[var(--ut-row-hover)]"
              onClick={(e) => {
                e.stopPropagation()
                setEditingStatusId(editingStatusId === unit._id ? null : unit._id)
              }}
            >
              <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${STATUS_DOT[unit.status]}`} />
              <ChevronDown size={9} className="text-[color:var(--ut-faint)]" />
            </button>
            {editingStatusId === unit._id && (
              <div
                className="absolute left-0 top-full z-30 mt-0.5 min-w-[130px] rounded-lg border border-[color:var(--ut-dropdown-border)] bg-[var(--ut-dropdown-bg)] py-1 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                {(['free', 'booked', 'sold', 'withdrawn'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-[16px] text-[color:var(--ut-dropdown-text)] transition-colors hover:bg-[var(--ut-dropdown-hover)]"
                    onClick={() => { updateUnit(unit._id, { status: s }); setEditingStatusId(null) }}
                  >
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[s]}`} />
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )

      case 'number':
        return <span className="font-medium tabular-nums text-[color:var(--ut-strong-text)]">{unit.number}</span>

      case 'positionInFloor':
        return unit.positionInFloor != null
          ? <span className="tabular-nums text-[color:var(--ut-cell-text)]">{unit.positionInFloor}</span>
          : <span className="text-[color:var(--ut-faint)]">—</span>

      case 'price':
        return <span className="tabular-nums">{formatPrice(computeUnitTotalPrice(unit), unit.currency)}</span>

      case 'pricePerSqm':
        return unit.pricePerSqm != null ? <span className="tabular-nums">{unit.pricePerSqm}</span> : '—'

      case 'rooms':
        return <span className="tabular-nums">{unit.rooms ? optionLabel(t, 'rooms', unit.rooms) : '—'}</span>

      case 'area':
        return unit.area != null ? <span className="tabular-nums">{AREA_NUMBER_FORMAT.format(unit.area)}</span> : '—'

      case 'floor':
        return <span className="tabular-nums">{unit.floor}</span>

      case 'building':
        return building?.name ?? '—'

      case 'project':
        return project?.name ?? '—'

      case 'promotion':
        return <PromoCell promo={unit.promotion} />

      default:
        return '—'
    }
  }

  const activeTableCurrencySymbol = getCurrencySymbol(units[0]?.currency)
  const selectionCount = hasSelection ? selectedUnitIds!.size : 0
  const pendingPriceSummary = pendingPriceChange
    ? `${pendingPriceChange.dir}${pendingPriceChange.value}${pendingPriceChange.mode === 'pct' ? '%' : activeTableCurrencySymbol}`
    : ''
  const selectionLabel = selectionCount === 1 ? 'лот' : selectionCount < 5 ? 'лота' : 'лотов'

  return (
    <div className={`flex flex-col ${hideToolbar ? 'gap-0' : 'gap-3'}`}>

      {/* ── Filter bar ── */}
      {!hideToolbar && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[rgba(242,207,141,0.1)] bg-[rgba(0,0,0,0.2)] px-4 py-3">
        {/* Search */}
        <div className="relative flex items-center">
          <Search size={13} className="absolute left-2.5 text-[rgba(242,207,141,0.35)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('inventory.unitTableView.номер_помещения')}
            className="h-9 w-44 rounded-lg border border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.3)] pl-8 pr-3 text-[16px] text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.35)] outline-none focus:border-[rgba(242,207,141,0.4)]"
          />
        </div>

        {/* Status */}
        <div className="flex items-center gap-1">
          {(['all', 'free', 'booked', 'sold', 'withdrawn'] as const).map((s) => {
            const labels = { all: 'Все', free: 'В продаже', booked: 'Бронь', sold: 'Продано', withdrawn: 'Снято' }
            const dots: Record<string, string> = { free: 'bg-emerald-400', booked: 'bg-[#f2c040]', sold: 'bg-[rgba(205,145,150,0.6)]', withdrawn: 'bg-slate-400' }
            const active = statusFilter === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[16px] font-normal transition-colors ${
                  active
                    ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.15)] text-[#fcecc8]'
                    : 'border-[rgba(242,207,141,0.18)] bg-transparent text-[rgba(242,207,141,0.55)] hover:border-[rgba(242,207,141,0.35)] hover:text-[rgba(242,207,141,0.9)]'
                }`}
              >
                {s !== 'all' && <span className={`h-2 w-2 rounded-full ${dots[s]}`} />}
                {labels[s]}
              </button>
            )
          })}
        </div>

        {/* Rooms */}
        {uniqueRooms.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[16px] text-[rgba(242,207,141,0.4)]">{t('inventory.unitTableView.комн')}</span>
            {uniqueRooms.map((r) => {
              const active = roomsFilter === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoomsFilter(active ? '' : r)}
                  className={`rounded-lg border px-3 py-1.5 text-[16px] font-normal transition-colors ${
                    active
                      ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.15)] text-[#fcecc8]'
                      : 'border-[rgba(242,207,141,0.18)] bg-transparent text-[rgba(242,207,141,0.55)] hover:border-[rgba(242,207,141,0.35)] hover:text-[rgba(242,207,141,0.9)]'
                  }`}
                >
                  {optionLabel(t, 'rooms', r)}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex shrink-0 flex-nowrap items-center gap-4">
          <div className="flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap">
            <span className="text-[16px] text-[rgba(242,207,141,0.4)]">{t('inventory.unitTableView.м')}</span>
            <input
              type="number"
              placeholder={t('inventory.unitTableView.от')}
              value={areaMin}
              onChange={(e) => setAreaMin(e.target.value)}
              className="h-9 w-16 shrink-0 rounded-lg border border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.3)] px-2 text-[16px] text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.35)] outline-none focus:border-[rgba(242,207,141,0.4)]"
            />
            <span className="shrink-0 text-[16px] text-[rgba(242,207,141,0.4)]">—</span>
            <input
              type="number"
              placeholder={t('inventory.unitTableView.до')}
              value={areaMax}
              onChange={(e) => setAreaMax(e.target.value)}
              className="h-9 w-16 shrink-0 rounded-lg border border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.3)] px-2 text-[16px] text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.35)] outline-none focus:border-[rgba(242,207,141,0.4)]"
            />
          </div>

          <div className="flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap">
            <span className="text-[16px] text-[rgba(242,207,141,0.4)]">{t('inventory.unitTableView.цена')}</span>
            <input
              type="number"
              placeholder={t('inventory.unitTableView.от')}
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className="h-9 w-20 shrink-0 rounded-lg border border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.3)] px-2 text-[16px] text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.35)] outline-none focus:border-[rgba(242,207,141,0.4)]"
            />
            <span className="shrink-0 text-[16px] text-[rgba(242,207,141,0.4)]">—</span>
            <input
              type="number"
              placeholder={t('inventory.unitTableView.до')}
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              className="h-9 w-20 shrink-0 rounded-lg border border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.3)] px-2 text-[16px] text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.35)] outline-none focus:border-[rgba(242,207,141,0.4)]"
            />
          </div>
        </div>

        {/* Reset */}
        {filtersActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 text-[16px] text-[rgba(242,207,141,0.45)] transition-colors hover:text-[rgba(242,207,141,0.9)]"
          >
            <X size={12} />
            {t('inventory.unitTableView.сбросить')}</button>
        )}
      </div>
      )}

      {/* ── Toolbar ── */}
      <div className={`flex items-center justify-between gap-3 ${hideToolbar ? 'hidden' : ''}`}>
        <div className="flex items-center gap-3">
          {selectionCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(201,168,76,0.2)] pl-2.5 pr-1.5 py-0.5 text-xs font-medium text-[#fcecc8]">
              {t('inventory.unitTableView.выбрано')}{selectionCount} {selectionLabel}
              {onClearSelection && (
                <button
                  type="button"
                  onClick={onClearSelection}
                  title={t('inventory.unitTableView.сбросить_выделение')}
                  className="inline-flex items-center justify-center rounded-full p-0.5 text-[rgba(242,207,141,0.5)] transition-colors hover:bg-[rgba(242,207,141,0.15)] hover:text-[#fcecc8]"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Mass edit button — always visible */}
          {hasSelection && (
            <div>
              <button
                type="button"
                onClick={() => {
                  if (selectionCount === 0) return
                  setMassEditOpen((v) => !v)
                }}
                disabled={selectionCount === 0}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[16px] font-normal transition-all ${
                  massEditOpen || selectionCount > 0
                    ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.15)] text-[#fcecc8]'
                    : 'cursor-not-allowed border-[rgba(242,207,141,0.12)] bg-[rgba(0,0,0,0.18)] text-[rgba(242,207,141,0.35)]'
                }`}
              >
                <Pencil size={12} />
                {selectionCount > 0 ? `Выбрано: ${selectionCount}` : 'Выберите лоты'}
              </button>
            </div>
          )}  {/* end mass edit */}

          {/* Sub-view toggle скрыт — таблица всегда в режиме list */}

          <div className="relative" ref={colPickerRef}>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.3)] px-3.5 py-1.5 text-[16px] text-[rgba(242,207,141,0.8)] transition-colors hover:border-[rgba(242,207,141,0.5)] hover:text-[#fcecc8]"
            onClick={() => setColPickerOpen((v) => !v)}
          >
            <Settings2 size={16} strokeWidth={2.2} />
            {t('inventory.unitTableView.поля')}</button>
          {colPickerOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-[rgba(242,207,141,0.2)] bg-[#0e1a12] py-2 shadow-xl">
              {ALL_UNIT_TABLE_COLS.filter((c) => !c.alwaysOn).map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[16px] text-[rgba(242,207,141,0.85)] transition-colors hover:bg-[rgba(242,207,141,0.06)]"
                >
                  <input type="checkbox" checked={activeVisibleCols.has(c.key)} onChange={() => toggleCol(c.key)} className="accent-[#c9a84c]" />
                  {c.key === 'positionInFloor' ? (
                    <>
                      <span className="inline-flex min-w-[26px] items-center justify-center rounded-md border border-[rgba(242,207,141,0.18)] bg-[rgba(242,207,141,0.08)] px-1.5 py-0.5 text-[11px] font-normal text-[#fcecc8]">
                        №
                      </span>
                      <span>{t('inventory.unitTableView.номер_на_этаже')}</span>
                    </>
                  ) : (
                    <span>{c.label}</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
        </div>{/* end right toolbar group */}
      </div>

      {pendingAction && (
        <PasswordConfirmModal
          onConfirm={() => { pendingAction(); setPendingAction(null) }}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {massEditOpen && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-[rgba(2,8,6,0.72)] p-4 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setMassEditOpen(false) }}
        >
          <div
            ref={massEditRef}
            className="w-full max-w-[760px] max-h-[86vh] overflow-y-auto rounded-[28px] border border-[rgba(250,220,120,0.35)] bg-[linear-gradient(180deg,rgba(18,56,40,0.98)_0%,rgba(11,34,24,0.98)_100%)] shadow-[0_32px_120px_rgba(0,0,0,0.58)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[rgba(250,220,120,0.12)] bg-[rgba(201,168,76,0.08)] px-7 py-5">
              <div className="max-w-[520px]">
                <div className="text-xl font-normal text-[#fff4d6]">{t('inventory.unitTableView.массовое_редактирова')}</div>
                <div className="mt-1 text-sm text-[rgba(242,232,190,0.66)]">{t('inventory.unitTableView.окно_не_закрывается')}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3 self-start">
                <span className="inline-flex min-h-12 min-w-[88px] items-center justify-center rounded-full border border-[rgba(250,220,120,0.25)] bg-[rgba(250,220,120,0.12)] px-4 text-center text-sm font-normal leading-tight text-[#ffe08a] whitespace-nowrap">
                  {selectionCount} {selectionLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setMassEditOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(250,220,120,0.22)] bg-[rgba(255,255,255,0.04)] text-[rgba(255,240,200,0.78)] transition-colors hover:bg-[rgba(250,220,120,0.14)] hover:text-[#fff4d6]"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6 p-7">
              <div className="rounded-2xl border border-[rgba(250,220,120,0.14)] bg-[rgba(8,31,21,0.55)] p-5">
                <p className="mb-3 text-[11px] font-normal uppercase tracking-widest text-[rgba(250,220,120,0.5)]">{t('inventory.unitTableView.статус')}</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {([
                    { v: 'free',      l: 'В продаже', d: 'bg-emerald-400'             },
                    { v: 'booked',    l: 'Бронь',    d: 'bg-[#f2c040]'               },
                    { v: 'sold',      l: 'Продано',  d: 'bg-[rgba(205,145,150,0.8)]' },
                    { v: 'withdrawn', l: 'Снято',    d: 'bg-slate-400'               },
                  ] as const).map((s) => (
                    <button
                      key={s.v}
                      type="button"
                      onClick={() => gate(() => updateUnitsBulk(selectedIds, { status: s.v }))}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-[rgba(250,220,120,0.14)] bg-[rgba(255,255,255,0.05)] py-3 text-sm font-medium text-[rgba(255,235,190,0.82)] transition-all hover:border-[rgba(250,220,120,0.4)] hover:bg-[rgba(250,220,120,0.12)] hover:text-[#fff4d6]"
                    >
                      <span className={`size-2.5 rounded-full ${s.d}`} />
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[rgba(96,224,180,0.22)] bg-[rgba(8,52,39,0.58)] p-5">
                <p className="mb-3 flex items-center gap-1.5 text-[11px] font-normal uppercase tracking-widest text-[rgba(120,236,196,0.62)]">
                  <TrendingUp size={12} />{t('inventory.unitTableView.изменение_цены')}</p>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="flex rounded-2xl border border-[rgba(120,236,196,0.18)] bg-[rgba(0,0,0,0.22)] p-1">
                    {([['pct', '%'], ['fixed', '$']] as const).map(([m, lbl]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPriceMode(m)}
                        className={`rounded-xl px-4 py-2.5 text-sm font-normal transition-colors ${priceMode === m ? 'bg-[rgba(120,236,196,0.2)] text-[#edfff7]' : 'text-[rgba(180,245,224,0.62)] hover:text-[#edfff7]'}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  <div className="flex rounded-2xl border border-[rgba(120,236,196,0.18)] bg-[rgba(0,0,0,0.22)] p-1">
                    {(['+', '-'] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setPriceDir(d)}
                        className={`w-12 rounded-xl py-2.5 text-sm font-normal transition-colors ${priceDir === d ? 'bg-[rgba(120,236,196,0.2)] text-[#edfff7]' : 'text-[rgba(180,245,224,0.62)] hover:text-[#edfff7]'}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      value={priceVal}
                      onChange={(e) => { setPriceVal(e.target.value); setPriceError('') }}
                      placeholder={priceMode === 'pct' ? '10' : '5 000'}
                      className={`h-12 w-full rounded-2xl border bg-[rgba(4,30,23,0.88)] px-4 text-base text-[#edfff7] placeholder:text-[rgba(180,245,224,0.32)] outline-none transition-colors focus:border-[rgba(120,236,196,0.52)] ${priceError ? 'border-rose-400/65' : 'border-[rgba(120,236,196,0.22)]'}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={applyPrice}
                    className="h-12 rounded-2xl bg-[#5cd6ab] px-5 text-sm font-normal text-[#062319] transition-colors hover:bg-[#7ce7c1]"
                  >
                    {t('inventory.unitTableView.применить')}</button>
                </div>
                {priceError && (
                  <p className="mt-2 text-sm text-rose-300">{priceError}</p>
                )}
              </div>

              <div className="rounded-2xl border border-[rgba(250,220,120,0.14)] bg-[rgba(8,31,21,0.55)] p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-normal uppercase tracking-widest text-[rgba(250,220,120,0.5)]">
                    {promoKind === 'price_discount' ? <Percent size={12} /> : <Gift size={12} />}
                    {t('inventory.unitTableView.акция')}</p>
                  <button
                    type="button"
                    onClick={() => gate(() => clearBulkPromotion(selectedIds))}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-[rgba(205,145,150,0.32)] px-4 py-2.5 text-sm font-medium text-[rgba(245,185,192,0.82)] transition-colors hover:border-rose-300/55 hover:bg-rose-500/10 hover:text-rose-200"
                  >
                    <X size={13} />{t('inventory.unitTableView.убрать_акцию')}</button>
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPromoKind('price_discount')}
                      className={`flex items-center justify-center gap-1.5 rounded-2xl border py-3 text-sm font-medium transition-colors ${
                        promoKind === 'price_discount'
                          ? 'border-[#f2c040] bg-[rgba(201,168,76,0.18)] text-[#fff4d6]'
                          : 'border-[rgba(250,220,120,0.16)] text-[rgba(255,235,190,0.62)] hover:border-[rgba(250,220,120,0.38)] hover:text-[#fff4d6]'
                      }`}
                    >
                      <Percent size={12} />
                      {t('inventory.unitTableView.скидка')}</button>
                    <button
                      type="button"
                      onClick={() => setPromoKind('gift')}
                      className={`flex items-center justify-center gap-1.5 rounded-2xl border py-3 text-sm font-medium transition-colors ${
                        promoKind === 'gift'
                          ? 'border-[#f2c040] bg-[rgba(201,168,76,0.18)] text-[#fff4d6]'
                          : 'border-[rgba(250,220,120,0.16)] text-[rgba(255,235,190,0.62)] hover:border-[rgba(250,220,120,0.38)] hover:text-[#fff4d6]'
                      }`}
                    >
                      <Gift size={12} />
                      {t('inventory.unitTableView.подарок')}</button>
                  </div>
                  <input type="text" value={promoLabel} onChange={(e) => setPromoLabel(e.target.value)} placeholder={t('inventory.unitTableView.название_акции')} className={MEI} />
                  {promoKind === 'price_discount' ? (
                    <div className="max-w-[220px]">
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={promoDiscPct}
                          onChange={(e) => {
                            const raw = e.target.value
                            if (raw === '') {
                              setPromoDiscPct('')
                              return
                            }
                            const next = Math.min(100, Math.max(0, Number(raw)))
                            setPromoDiscPct(String(next))
                          }}
                          placeholder={t('inventory.unitTableView.скидка')}
                          className={`${MEI} h-11 pr-10`}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-normal text-[rgba(242,207,141,0.72)]">%</span>
                      </div>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={promoGiftText}
                      onChange={(e) => setPromoGiftText(e.target.value)}
                      placeholder={t('inventory.unitTableView.что_дарим')}
                      className={MEI}
                    />
                  )}
                  <div>
                    <p className="mb-1 text-[10px] text-[rgba(242,207,141,0.42)]">{t('inventory.unitTableView.действует_до')}</p>
                    <input type="date" value={promoExpires} onChange={(e) => setPromoExpires(e.target.value)} className={MEI} style={{ colorScheme: 'dark' }} />
                  </div>
                  <button
                    type="button"
                    onClick={applyPromo}
                    className="w-full rounded-2xl bg-[#f2c040] py-3 text-sm font-normal text-[#0a1f12] transition-colors hover:bg-[#f7d468]"
                  >
                    {promoKind === 'price_discount' ? 'Применить скидку' : 'Применить подарок'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-[rgba(250,220,120,0.1)] pt-5">
                <p className="text-sm text-[rgba(242,232,190,0.58)]">{t('inventory.unitTableView.окно_можно_держать_о')}</p>
                <button
                  type="button"
                  onClick={() => setMassEditOpen(false)}
                  className="rounded-2xl border border-[rgba(250,220,120,0.24)] bg-[rgba(255,255,255,0.04)] px-5 py-2.5 text-sm font-medium text-[#fff4d6] transition-colors hover:bg-[rgba(250,220,120,0.12)]"
                >
                  {t('inventory.unitTableView.закрыть')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {priceConfirmOpen && pendingPriceChange && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPriceConfirmOpen(false) }}
        >
          <div className="w-full max-w-[460px] rounded-[24px] border border-[rgba(92,214,171,0.38)] bg-[linear-gradient(180deg,rgba(14,57,43,0.98)_0%,rgba(10,31,24,0.98)_100%)] p-6 shadow-2xl shadow-black/55">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-normal text-[#edfff7]">{t('inventory.unitTableView.применить_изменения')}</div>
                <div className="mt-1 text-sm text-[rgba(180,245,224,0.66)]">
                  {t('inventory.unitTableView.изменение_цены')}{pendingPriceSummary} {t('inventory.unitTableView.будет_применено_к')}{selectionCount} {selectionCount === 1 ? 'лоту' : selectionCount < 5 ? 'лотам' : 'лотам'}.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPriceConfirmOpen(false)}
                className="rounded-full p-1 text-[rgba(180,245,224,0.62)] transition-colors hover:bg-[rgba(92,214,171,0.12)] hover:text-[#edfff7]"
              >
                <X size={15} />
              </button>
            </div>
            <div className="rounded-2xl border border-[rgba(92,214,171,0.18)] bg-[rgba(4,30,23,0.72)] px-4 py-3 text-sm text-[rgba(210,255,241,0.82)]">
              {t('inventory.unitTableView.после_подтверждения')}</div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPriceConfirmOpen(false)}
                className="rounded-2xl border border-[rgba(92,214,171,0.22)] px-4 py-2.5 text-sm font-medium text-[rgba(210,255,241,0.82)] transition-colors hover:bg-[rgba(92,214,171,0.1)]"
              >
                {t('inventory.unitTableView.отмена')}</button>
              <button
                type="button"
                onClick={confirmApplyPrice}
                className="rounded-2xl bg-[#5cd6ab] px-4 py-2.5 text-sm font-normal text-[#062319] transition-colors hover:bg-[#7ce7c1]"
              >
                {t('inventory.unitTableView.применить_изменения')}</button>
            </div>
          </div>
        </div>
      )}

      {subView === 'matrix' ? (
        <MatrixView
          units={matrixUnits}
          highlightedIds={matrixHighlightIds}
          selectedUnitIds={selectedUnitIds}
          onToggleUnit={onToggleUnit}
          onToggleGroup={onTogglePage}
          onShiftSelectUnit={onShiftSelectUnit}
          onOpenDetail={onOpenDetail}
        />
      ) : (<>

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-lg border border-[color:var(--ut-border)] bg-[var(--ut-surface)]">
        <table className="w-full min-w-[680px] table-fixed text-xs">
          <colgroup>
            {hasSelection && <col style={{ width: '44px' }} />}
            {cols.map((c) => (
              <col key={c.key} style={{ width: COLUMN_WIDTHS[c.key] }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-[color:var(--ut-border)] bg-[var(--ut-head-bg)]">
              {hasSelection && (
                <th className="w-10 border-r border-[color:var(--ut-col-border)] px-3 py-3 text-center align-middle">
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    ref={(el) => { if (el) el.indeterminate = pagePartialSelected }}
                    onChange={() => onTogglePage!(pageUnitIds)}
                    className="accent-[#c9a84c] cursor-pointer"
                  />
                </th>
              )}
              {cols.map((c) => {
                const sortable = SORTABLE.has(c.key)
                const active = sortKey === c.key
                return (
                  <th
                    key={c.key}
                    onClick={() => handleSort(c.key)}
                    className={`border-r border-[color:var(--ut-col-border)] px-4 py-3 text-[16px] font-normal uppercase tracking-[0.08em] transition-colors last:border-r-0 ${
                      sortable ? 'cursor-pointer select-none hover:text-[color:var(--ut-head-active)]' : ''
                    } ${CENTERED_COLS.has(c.key) ? 'text-center' : 'text-left'} ${active ? 'text-[color:var(--ut-head-active)]' : 'text-[color:var(--ut-head-text)]'}`}
                  >
                    <span className={`inline-flex items-center gap-1 ${CENTERED_COLS.has(c.key) ? 'justify-center' : ''}`}>
                      {c.label}
                      {sortable && (
                        active
                          ? sortDir === 'asc'
                            ? <ChevronUp size={11} />
                            : <ChevronDown size={11} />
                          : <ArrowUpDown size={10} className="opacity-30" />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageUnits.length === 0 ? (
              <tr>
                <td colSpan={cols.length + (hasSelection ? 1 : 0)} className="py-12 text-center text-[16px] text-[color:var(--ut-faint)]">
                  {t('inventory.unitTableView.нет_помещений')}</td>
              </tr>
            ) : (
              pageUnits.map((unit, i) => {
                const isSelected = hasSelection && selectedUnitIds!.has(unit._id)
                return (
                  <tr
                    key={unit._id}
                    className={`border-b border-[color:var(--ut-row-border)] transition-colors ${
                      isSelected
                        ? 'bg-[var(--ut-row-selected)]'
                        : i % 2 === 0
                          ? 'bg-[var(--ut-row-odd)]'
                          : 'bg-[var(--ut-row-even)]'
                    } hover:bg-[var(--ut-row-hover)]`}
                  >
                    {hasSelection && (
                      <td className="w-10 border-r border-[color:var(--ut-row-border)] px-3 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => onToggleUnit!(unit._id)} className="accent-[#c9a84c] cursor-pointer" />
                      </td>
                    )}
                    {cols.map((c) => (
                      <td
                        key={c.key}
                        className={`overflow-hidden whitespace-nowrap border-r border-[color:var(--ut-row-border)] px-4 py-3.5 align-middle text-[16px] text-[color:var(--ut-cell-text)] last:border-r-0 ${
                          NUMERIC_COLS.has(c.key) ? 'tabular-nums' : ''
                        } ${CENTERED_COLS.has(c.key) ? 'text-center' : 'text-left'}`}
                        onClick={(event) => {
                          if (c.key === 'status') return
                          if (event.shiftKey && onShiftSelectUnit) onShiftSelectUnit(unit._id)
                          else if ((event.ctrlKey || event.metaKey) && onShiftSelectUnit) onShiftSelectUnit(unit._id)
                          else if (hasSelection && onToggleUnit) onToggleUnit(unit._id)
                          else onOpenDetail(unit)
                        }}
                        style={{ cursor: c.key !== 'status' ? 'pointer' : 'default' }}
                      >
                        {getCell(unit, c.key)}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="flex items-center justify-between text-[16px] text-[color:var(--ut-page-text)]">
        <div className="flex items-center gap-1">
          <span className="mr-1">{t('inventory.unitTableView.строк')}</span>
          {PAGE_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setPageSize(s as 10 | 25 | 50 | 'all'); setPage(1) }}
              className={`rounded px-2.5 py-1 transition-colors ${pageSize === s ? 'bg-[var(--ut-page-active-bg)] text-[color:var(--ut-page-active-text)]' : 'hover:text-[color:var(--ut-strong-text)]'}`}
            >
              {s === 'all' ? 'Все' : s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={pageSize === 'all' || safePage === 1} onClick={() => setPage((p) => p - 1)} className="rounded px-2.5 py-1 text-[18px] disabled:opacity-30 hover:text-[color:var(--ut-strong-text)]">‹</button>
          <span>{safePage} / {totalPages}</span>
          <button type="button" disabled={pageSize === 'all' || safePage === totalPages} onClick={() => setPage((p) => p + 1)} className="rounded px-2.5 py-1 text-[18px] disabled:opacity-30 hover:text-[color:var(--ut-strong-text)]">›</button>
        </div>
      </div>
      </>)}
    </div>
  )
}

const MEI = 'h-10 w-full flex-1 rounded-xl border border-[rgba(242,207,141,0.18)] bg-[rgba(0,0,0,0.4)] px-3 text-sm text-[#fcecc8] placeholder:text-[rgba(242,207,141,0.25)] outline-none focus:border-[rgba(242,207,141,0.5)]'

function PromoCell({ promo }: { promo: IUnit['promotion'] }) {
  if (!promo) return <span className="text-[color:var(--ut-faint)]">—</span>

  if (promo.kind === 'price_discount') {
    const detail = promo.discountPercent != null ? `−${promo.discountPercent}%` : promo.discountPerSqm != null ? `−$${promo.discountPerSqm}/м²` : null
    const label = `${detail ? `${detail} · ` : ''}${promo.label}${promo.expiresAt ? ` до ${promo.expiresAt}` : ''}`
    return (
      <span
        title={label}
        className="inline-flex max-w-full items-center gap-1 overflow-hidden rounded-md border border-rose-400/25 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200"
      >
        <Percent size={10} className="shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </span>
    )
  }

  if (promo.kind === 'installment') {
    const term = resolvePromotionInstallmentTerm(promo)
    const monthsLabel = term.isExpired
      ? 'срок истёк'
      : term.effectiveMonths != null
        ? term.isDynamic && term.baseMonths != null && term.baseMonths !== term.effectiveMonths
          ? `${term.effectiveMonths} из ${term.baseMonths} мес`
          : `${term.effectiveMonths} мес`
        : null
    const label = `${promo.downPaymentPercent != null ? `${promo.downPaymentPercent}% · ` : ''}${monthsLabel ? `${monthsLabel} · ` : ''}${promo.label}${promo.expiresAt ? ` до ${promo.expiresAt}` : ''}`
    return (
      <span
        title={label}
        className="inline-flex max-w-full items-center gap-1 overflow-hidden rounded-md border border-blue-400/25 bg-blue-500/15 px-2 py-0.5 text-[11px] text-blue-200"
      >
        <Wallet size={10} className="shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </span>
    )
  }

  if (promo.kind === 'gift') {
    const label = `${promo.giftText ? `${promo.giftText} · ` : ''}${promo.label}${promo.expiresAt ? ` до ${promo.expiresAt}` : ''}`
    return (
      <span
        title={label}
        className="inline-flex max-w-full items-center gap-1 overflow-hidden rounded-md border border-emerald-400/25 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200"
      >
        <Gift size={10} className="shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </span>
    )
  }

  return <span className="block truncate text-[#e2c97e]" title={promo.label}>{promo.label}</span>
}

const MATRIX_STATUS: Record<IUnit['status'], string> = {
  free:      'border-emerald-600/40 bg-emerald-900/50 text-emerald-200',
  booked:    'border-amber-500/40 bg-amber-900/40 text-[#f7da6a]',
  sold:      'border-rose-500/30 bg-rose-900/35 text-rose-300',
  withdrawn: 'border-slate-500/30 bg-slate-800/40 text-slate-400',
}
function MatrixView({
  units,
  selectedUnitIds,
  onToggleUnit,
  onToggleGroup,
  onShiftSelectUnit,
  onOpenDetail,
  highlightedIds,
}: {
  units: IUnit[]
  selectedUnitIds?: Set<string>
  onToggleUnit?: (id: string) => void
  onToggleGroup?: (ids: string[]) => void
  onShiftSelectUnit?: (id: string) => void
  onOpenDetail: (unit: IUnit) => void
  highlightedIds?: Set<string>
}) {
  const { t } = useI18n()

  const highlightMode = !!highlightedIds && highlightedIds.size > 0
  const floorMap = useMemo(() => {
    const map = new Map<number, IUnit[]>()
    for (const u of units) {
      const arr = map.get(u.floor) ?? []
      arr.push(u)
      map.set(u.floor, arr)
    }
    return map
  }, [units])

  const floors = useMemo(
    () => Array.from(floorMap.keys()).sort((a, b) => b - a),
    [floorMap]
  )

  const positions = useMemo(
    () => Array.from(new Set(
      units
        .map((unit) => unit.positionInFloor)
        .filter((position): position is number => typeof position === 'number' && position >= 1),
    )).sort((a, b) => a - b),
    [units],
  )

  const unitsByFloorAndPosition = useMemo(() => {
    const map = new Map<string, IUnit>()
    for (const unit of units) {
      if (typeof unit.positionInFloor !== 'number' || unit.positionInFloor < 1) continue
      map.set(`${unit.floor}:${unit.positionInFloor}`, unit)
    }
    return map
  }, [units])

  const riserUnitIds = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const position of positions) {
      map.set(
        position,
        units
          .filter((unit) => unit.positionInFloor === position)
          .map((unit) => unit._id),
      )
    }
    return map
  }, [positions, units])

  const floorUnitIds = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const floor of floors) {
      map.set(floor, (floorMap.get(floor) ?? []).map((unit) => unit._id))
    }
    return map
  }, [floorMap, floors])

  const allSelected = (unitIds: string[]) => (
    unitIds.length > 0 &&
    unitIds.every((unitId) => selectedUnitIds?.has(unitId))
  )

  if (floors.length === 0) {
    return (
      <div className="rounded-xl border border-[rgba(242,207,141,0.12)] py-12 text-center text-sm text-[rgba(242,207,141,0.35)]">
        {t('inventory.unitTableView.нет_помещений')}</div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[rgba(242,207,141,0.12)] bg-[rgba(0,0,0,0.2)] p-4">
      <div className="flex min-w-max flex-col gap-1.5">
        {positions.length > 0 && (
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `40px repeat(${positions.length}, 52px)` }}
          >
            <div className="flex h-9 items-center justify-center rounded border border-transparent text-[10px] font-normal uppercase tracking-[0.12em] text-[rgba(242,207,141,0.38)]">
              Y/X
            </div>
            {positions.map((position) => {
              const unitIds = riserUnitIds.get(position) ?? []
              const isSelected = allSelected(unitIds)
              return (
                <button
                  key={`position-${position}`}
                  type="button"
                  disabled={unitIds.length === 0}
                  onClick={() => onToggleGroup?.(unitIds)}
                  className={`flex h-9 items-center justify-center rounded border text-[11px] font-normal transition-colors disabled:cursor-default disabled:opacity-30 ${
                    isSelected
                      ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.18)] text-[#fcecc8]'
                      : 'border-[rgba(242,207,141,0.14)] bg-[rgba(255,255,255,0.03)] text-[rgba(242,207,141,0.62)] hover:border-[rgba(242,207,141,0.35)] hover:text-[#fcecc8]'
                  }`}
                  title={`Выделить стояк ${position}`}
                >
                  {position}
                </button>
              )
            })}
          </div>
        )}
        {floors.map((floor) => {
          const unitIds = floorUnitIds.get(floor) ?? []
          const isFloorSelected = allSelected(unitIds)
          return (
            <div
              key={floor}
              className="grid gap-1"
              style={{ gridTemplateColumns: `40px repeat(${Math.max(positions.length, 1)}, 52px)` }}
            >
              <button
                type="button"
                disabled={unitIds.length === 0}
                onClick={() => onToggleGroup?.(unitIds)}
                className={`flex h-9 items-center justify-center rounded border text-[10px] font-normal transition-colors disabled:cursor-default disabled:opacity-30 ${
                  isFloorSelected
                    ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.18)] text-[#fcecc8]'
                    : 'border-[rgba(242,207,141,0.14)] bg-[rgba(255,255,255,0.03)] text-[rgba(242,207,141,0.52)] hover:border-[rgba(242,207,141,0.35)] hover:text-[#fcecc8]'
                }`}
                title={`Выделить этаж ${floor}`}
              >
                {floor}
              </button>
              {positions.map((position) => {
                const unit = unitsByFloorAndPosition.get(`${floor}:${position}`)
                if (!unit) {
                  return (
                    <div
                      key={`${floor}-${position}-empty`}
                      className="h-9 rounded border border-dashed border-[rgba(242,207,141,0.08)] bg-[rgba(255,255,255,0.01)]"
                    />
                  )
                }

                const isSel = selectedUnitIds?.has(unit._id) ?? false
                const hasPromo = !!unit.promotion
                const isHighlighted = highlightMode && highlightedIds!.has(unit._id)
                const isDimmed = highlightMode && !isHighlighted
                const roomsShortRaw = compactRoomsLabel(unit.rooms)
                const roomsShort = roomsShortRaw === 'studio' ? t('inventory.chessboard.studioShort', 'Студ.') : optionLabel(t, 'rooms', roomsShortRaw)
                const areaStr = formatArea(unit.area)
                const cellLabel =
                  [roomsShort || null, areaStr !== '—' ? areaStr : null].filter(Boolean).join(' · ') || '—'
                return (
                  <div
                    key={unit._id}
                    title={`${STATUS_LABELS[unit.status]} · ${cellLabel}${unit.positionInFloor != null ? ` · поз. ${unit.positionInFloor}` : ''} · Shift+клик — выделить`}
                    onClick={(e) => {
                      if (e.shiftKey && onToggleUnit) onToggleUnit(unit._id)
                      else if (e.shiftKey && onShiftSelectUnit) onShiftSelectUnit(unit._id)
                      else onOpenDetail(unit)
                    }}
                    className={`group relative flex h-9 w-[52px] cursor-pointer select-none items-center justify-center rounded border text-[9px] font-normal transition-all
                      ${MATRIX_STATUS[unit.status]}
                      ${isSel ? 'ring-2 ring-[#f2c040] ring-offset-1 ring-offset-[#0c1c18] brightness-110' : isHighlighted ? 'ring-1 ring-[#c9a84c]/70 brightness-110' : 'hover:brightness-125'}
                      ${isDimmed ? 'opacity-25' : ''}
                    `}
                  >
                    <span className="max-w-[44px] truncate px-0.5 text-center leading-tight">
                      {cellLabel}
                    </span>
                    {hasPromo && (
                      <span className="absolute right-1 top-0.5 h-1.5 w-1.5 rounded-full bg-[#c9a84c]" />
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

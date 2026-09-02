import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownUp,
  Building2,
  ChevronDown,
  Download,
  Grid3X3,
  Loader2,
  LayoutTemplate,
  Layers,
  List,
  Pencil,
  Search,
  Settings2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'

import { useModulePermissions } from '@/hooks/useModulePermissions'
import { useZoomScale } from '@/hooks/useZoomScale'
import { ZoomControls } from '@/components/inventory/ZoomControls'

import { CreateSelectionModal } from '@/components/development/CreateSelectionModal'
import { BuildingChessboardWizard } from '@/components/inventory/BuildingChessboardWizard'
import { CB_ROW_GAP, cbGridTemplateColumns } from '@/components/inventory/chessboard-dimensions'
import { ChessboardEmptyCell } from '@/components/inventory/ChessboardEmptyCell'
import { ChessboardImportDialog } from '@/components/inventory/ChessboardImportDialog'
import { ChessboardUnitCard } from '@/components/inventory/ChessboardUnitCard'
import { MassEditSidebar } from '@/components/inventory/MassEditSidebar'
import { UnitDetailModal } from '@/components/inventory/UnitDetailModal'
import { FloorPlanMapView } from '@/components/inventory/FloorPlanMapView'
import {
  ALL_UNIT_TABLE_COLS,
  DEFAULT_UNIT_TABLE_VISIBLE_COLS,
  UnitTableView,
  type UnitTableColKey,
} from '@/components/inventory/UnitTableView'
import { Button } from '@/components/ui/button'
import { compactRoomsLabel, computeUnitTotalPrice, getCurrencySymbol } from '@/lib/chessboard'
import { optionLabel } from '@/lib/project-options'
import { UNIT_STATUS_META } from '@/lib/unit-status'
import { cn } from '@/lib/utils'
import { exportUnitsToXlsx } from '@/lib/chessboard-xlsx'
import { developmentApi } from '@/services/developmentApi'
import { useCoreStore } from '@/store/useCoreStore'
import type { IBuilding, IUnit } from '@/types/core'
import { bookingsKey } from '@/components/development/sales/salesManagementStorage'
import { fetchProjectBookingRows, type DevBookingRow } from '@/components/development/sales/bookingsApi'
import { useI18n } from "@/i18n";

const ALL_BUILDINGS_VALUE = '__all__'
const DRAG_THRESHOLD_PX = 5

const cbToolbarCtrl = cn(
  'inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-[14px] font-normal transition-colors',
  'border-[color:var(--cb-ctrl-border)] bg-[color:var(--cb-ctrl-bg)] text-[color:var(--cb-ctrl-text)]',
  'hover:border-[color:var(--cb-ctrl-border-hover)] hover:text-[color:var(--cb-ctrl-text-hover)]',
  'disabled:pointer-events-none disabled:opacity-40',
)

const cbToolbarCtrlOn = 'border-[color:var(--cb-ctrl-on-border)] bg-[color:var(--cb-ctrl-on-bg)] text-[color:var(--cb-ctrl-on-text)]'
const cbToolbarCtrlOnStrong = 'border-[color:var(--cb-ctrl-on-border)] bg-[color:var(--cb-ctrl-on-bg-strong)] text-[color:var(--cb-ctrl-on-text)]'

const cbToolbarGroup =
  'flex flex-wrap items-center gap-1 rounded-md border border-[color:var(--cb-ctrl-group-border)] bg-[color:var(--cb-ctrl-group-bg)] p-1'

const cbToolbarIcon = 'size-4 shrink-0 text-[color:var(--cb-ctrl-icon)]'

interface RubberBandRect {
  left: number
  top: number
  width: number
  height: number
}

export interface ChessboardEmbedConfig {
  projectId: string
  title?: string
  initialSelectedUnitIds: string[]
  onExit: () => void
  onConfirmSelection: (unitIds: string[]) => void
}

const compareUnitNumberAsc = (left: IUnit, right: IUnit): number => {
  return left.number.localeCompare(right.number, 'ru', { numeric: true, sensitivity: 'base' })
}

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

export function InteractiveChessboard({
  readOnly: readOnlyProp = false,
  embed,
}: {
  readOnly?: boolean
  embed?: ChessboardEmbedConfig | null
}) {
    const { t } = useI18n();
  const { canEdit: canEditPerm } = useModulePermissions()
  const readOnly = readOnlyProp || !canEditPerm('chessboard')

  const allUnits = useCoreStore((s) => s.allUnits)
  const buildings = useCoreStore((s) => s.buildings)
  const projects = useCoreStore((s) => s.projects)
  const activeProjectId = useCoreStore((s) => s.activeProjectId)
  const buildingsProjectId = useCoreStore((s) => s.buildingsProjectId)
  const fetchProjects = useCoreStore((s) => s.fetchProjects)
  const fetchBuildings = useCoreStore((s) => s.fetchBuildings)
  const setActiveProject = useCoreStore((s) => s.setActiveProject)

  const isEmbed = Boolean(embed)
  const embedProjectId = embed?.projectId

  const [bookingLabels, setBookingLabels] = useState<{ paid: Set<string>; inProgress: Set<string> }>(
    () => ({ paid: new Set<string>(), inProgress: new Set<string>() }),
  )

  useEffect(() => {
    const pid = embedProjectId ?? activeProjectId
    if (!pid) {
      setBookingLabels({ paid: new Set<string>(), inProgress: new Set<string>() })
      return
    }
    let cancelled = false
    void (async () => {
      let rows = await fetchProjectBookingRows(pid)
      if (!rows) {
        // Фолбэк на localStorage-кэш, если API недоступен.
        try {
          const raw = localStorage.getItem(bookingsKey(pid))
          rows = raw ? (JSON.parse(raw) as DevBookingRow[]) : []
        } catch {
          rows = []
        }
      }
      if (cancelled) return
      const paid = new Set(rows.filter((r) => r.status === 'paid').map((r) => r.unitLabel))
      const inProgress = new Set(rows.filter((r) => r.status === 'in_progress').map((r) => r.unitLabel))
      setBookingLabels({ paid, inProgress })
    })()
    return () => { cancelled = true }
  }, [embedProjectId, activeProjectId])

  const paidUnitLabels = bookingLabels.paid
  const inProgressUnitLabels = bookingLabels.inProgress
  const embedInitialKey = embed?.initialSelectedUnitIds.join('|') ?? ''
  const embedSessionKey = embedProjectId != null ? `${embedProjectId}:${embedInitialKey}` : ''

  const [searchParams] = useSearchParams()
  const urlProjectId = searchParams.get('project')

  /** Имя ЖК, переданное из списка через navigation state — мгновенный фолбэк, пока грузится getComplexById. */
  const routerLocation = useLocation()
  const navComplexName = (routerLocation.state as { complexName?: string } | null)?.complexName ?? null

  /**
   * Пока корпуса/лоты текущего ЖК ещё не подгрузились, в сторе лежат данные
   * предыдущего комплекса. Показываем индикатор загрузки вместо «старой» шахматки,
   * чтобы не было кратковременной вспышки чужих данных.
   */
  const targetProjectId = embedProjectId ?? urlProjectId ?? activeProjectId
  const isComplexLoading = targetProjectId != null && buildingsProjectId !== targetProjectId

  /** Чужой ЖК, открытый по ссылке: его нет в своём списке проектов, название грузим отдельно по id. */
  const [externalProject, setExternalProject] = useState<{ id: string; name: string; author?: string } | null>(null)

  /** '' = по умолчанию один корпус (первый в списке); `ALL_BUILDINGS_VALUE` = все корпуса */
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('')
  const [floorOrder, setFloorOrder] = useState<'desc' | 'asc'>('desc')
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set())
  const [slideOverUnit, setSlideOverUnit] = useState<IUnit | null>(null)
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [wizardState, setWizardState] = useState<{ mode: 'create' | 'edit'; initialBuildingId?: string | null } | null>(null)
  const [rubberBand, setRubberBand] = useState<RubberBandRect | null>(null)
  const [highlightDuplicates, setHighlightDuplicates] = useState(false)
  const [isMassEditOpen, setIsMassEditOpen] = useState(false)
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'free' | 'booked' | 'sold' | 'withdrawn'>('all')
  const [roomsFilter, setRoomsFilter] = useState<string>('')
  const [areaMin, setAreaMin] = useState<string>('')
  const [areaMax, setAreaMax] = useState<string>('')
  const [priceMin, setPriceMin] = useState<string>('')
  const [priceMax, setPriceMax] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'planview'>('grid')
  const [tableVisibleCols, setTableVisibleCols] = useState<Set<UnitTableColKey>>(
    () => new Set(DEFAULT_UNIT_TABLE_VISIBLE_COLS),
  )
  const [tableFieldsOpen, setTableFieldsOpen] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  const switchViewMode = (mode: 'grid' | 'table' | 'planview') => {
    const scrollable = document.getElementById('dashboard-main-scroll') ?? document.documentElement
    const savedTop = scrollable.scrollTop
    setViewMode(mode)
    if (mode !== 'table') setTableFieldsOpen(false)
    requestAnimationFrame(() => { scrollable.scrollTop = savedTop })
  }

  const toggleTableColumn = (key: UnitTableColKey) => {
    setTableVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const [isEditMode, setIsEditMode] = useState(false)
  // Заход из «Создать подборку» (?pick=1): сразу режим выбора лотов + одноразовая подсказка.
  const [isPickMode, setIsPickMode] = useState(() => searchParams.get('pick') === '1')
  const [showPickHint, setShowPickHint] = useState(() => searchParams.get('pick') === '1')
  const [buildingDropOpen, setBuildingDropOpen] = useState(false)
  const [projectDropOpen, setProjectDropOpen] = useState(false)
  const {
    zoom: chessboardZoom,
    adjustZoom,
    resetZoom,
    innerRef: zoomInnerRef,
    wrapperStyle: zoomWrapperStyle,
    innerStyle: zoomInnerStyle,
  } = useZoomScale({ storageKey: 'chessboardZoom', axes: 'x', layoutStretch: true })
  const buildingDropRef = useRef<HTMLDivElement>(null)
  const projectDropRef = useRef<HTMLDivElement>(null)
  const tableFieldsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!buildingDropOpen && !projectDropOpen && !tableFieldsOpen) return
    function handleOut(e: MouseEvent) {
      if (buildingDropRef.current && !buildingDropRef.current.contains(e.target as Node)) setBuildingDropOpen(false)
      if (projectDropRef.current && !projectDropRef.current.contains(e.target as Node)) setProjectDropOpen(false)
      if (tableFieldsRef.current && !tableFieldsRef.current.contains(e.target as Node)) setTableFieldsOpen(false)
    }
    document.addEventListener('mousedown', handleOut)
    return () => document.removeEventListener('mousedown', handleOut)
  }, [buildingDropOpen, projectDropOpen, tableFieldsOpen])

  const gridContainerRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<{
    startX: number
    startY: number
    additive: boolean
    moved: boolean
    initialSelection: Set<string>
    active: boolean
  } | null>(null)

  useEffect(() => {
    void fetchProjects()
  }, [fetchProjects])

  useLayoutEffect(() => {
    if (!isEmbed || !embedProjectId) return
    if (activeProjectId !== embedProjectId) {
      setActiveProject(embedProjectId)
      void fetchBuildings(embedProjectId)
    }
  }, [isEmbed, embedProjectId, activeProjectId, setActiveProject, fetchBuildings])

  /* eslint-disable react-hooks/set-state-in-effect -- Embed overlay must reset local mode and selection when the picker session changes. */
  useLayoutEffect(() => {
    if (!isEmbed || !embedSessionKey || !embed) return
    setIsPickMode(true)
    setIsEditMode(false)
    setViewMode('grid')
    setSelectedUnitIds(new Set(embed.initialSelectedUnitIds))
  }, [isEmbed, embedSessionKey, embed])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (isEmbed) return
    if (urlProjectId && urlProjectId !== activeProjectId) {
      setActiveProject(urlProjectId)
      void fetchBuildings(urlProjectId)
    }
  }, [isEmbed, urlProjectId, activeProjectId, setActiveProject, fetchBuildings])

  const ownProjectName = useMemo(
    () => projects.find((p) => p._id === activeProjectId)?.name ?? null,
    [projects, activeProjectId],
  )

  useEffect(() => {
    // author нужен даже когда имя уже известно (nav state) — по нему прячем кнопки редактирования.
    if (!activeProjectId || ownProjectName) return
    if (externalProject?.id === activeProjectId && externalProject.author !== undefined) return
    // Имя уже пришло из списка через navigation state — показываем сразу, без ожидания сети.
    if (navComplexName && externalProject?.id !== activeProjectId) {
      setExternalProject({ id: activeProjectId, name: navComplexName })
    }
    let cancelled = false
    developmentApi.getComplexById(activeProjectId)
      .then((resp) => {
        if (!cancelled && resp.success && resp.data?.name) {
          // '' — «бек не сообщил автора» (старый деплой): не перезапрашиваем по кругу.
          setExternalProject({ id: activeProjectId, name: resp.data.name, author: resp.data.author ?? '' })
        }
      })
      .catch((err) => {
        console.warn('[Chessboard] не удалось получить имя ЖК через getComplexById:', activeProjectId, err)
      })
    return () => { cancelled = true }
  }, [activeProjectId, ownProjectName, externalProject, navComplexName])

  const activeProjectName = ownProjectName
    ?? (externalProject?.id === activeProjectId ? externalProject.name : null)

  // Кнопки «Редактировать лоты» / «Импорт» / «Экспорт» — строго только автору проекта
  // (API и так принимает записи только от author; здесь прячем кнопки на чужих
  // проектах, например открытых из каталога новостроек). Пока author не загружен —
  // кнопки скрыты. Вопрос про доступ команды: docs/tracking/section-development-todo.md.
  const currentProjectId = embedProjectId ?? urlProjectId ?? activeProjectId
  const projectAuthor =
    projects.find((p) => p._id === currentProjectId)?.author ??
    (externalProject?.id === currentProjectId ? externalProject.author : undefined)
  const currentUserId = localStorage.getItem('userId')
  const isProjectAuthor = Boolean(projectAuthor && currentUserId && projectAuthor === currentUserId)
  const canEditLots = canEditPerm('chessboard') && isProjectAuthor
  const canExportData = canEditPerm('export') && isProjectAuthor

  const buildingIdsInProject = useMemo(
    () => new Set(buildings.map((b) => b._id)),
    [buildings],
  )

  const effectiveSelectedBuildingId = useMemo(() => {
    if (selectedBuildingId === ALL_BUILDINGS_VALUE || selectedBuildingId === '') return selectedBuildingId
    return buildings.some((b) => b._id === selectedBuildingId) ? selectedBuildingId : ''
  }, [buildings, selectedBuildingId])

  const resolvedBuildingId = useMemo(() => {
    if (effectiveSelectedBuildingId === ALL_BUILDINGS_VALUE) return ALL_BUILDINGS_VALUE
    // Явный выбор пользователя — всегда уважаем его, даже если лоты корпуса ещё не загружены.
    if (effectiveSelectedBuildingId) return effectiveSelectedBuildingId
    // Автовыбор: первый корпус с лотами, иначе просто первый корпус.
    const withUnits = buildings.find((b) => allUnits.some((u) => u.building === b._id))
    return withUnits?._id ?? buildings[0]?._id ?? ''
  }, [effectiveSelectedBuildingId, buildings, allUnits])

  const scopedUnits = useMemo(() => {
    if (resolvedBuildingId === ALL_BUILDINGS_VALUE) {
      return allUnits.filter((unit) => buildingIdsInProject.has(unit.building))
    }
    if (!resolvedBuildingId) return []
    return allUnits.filter((unit) => unit.building === resolvedBuildingId)
  }, [allUnits, buildingIdsInProject, resolvedBuildingId])

  const uniqueRooms = useMemo(() => {
    const seen = new Set<string>()
    for (const u of scopedUnits) {
      if (u.rooms) seen.add(u.rooms)
    }
    return Array.from(seen).sort()
  }, [scopedUnits])

  const filteredUnitIds = useMemo(() => {
    const minNum = parseFloat(areaMin)
    const maxNum = parseFloat(areaMax)
    const priceMinNum = parseFloat(priceMin)
    const priceMaxNum = parseFloat(priceMax)
    const hasMin = Number.isFinite(minNum) && minNum > 0
    const hasMax = Number.isFinite(maxNum) && maxNum > 0
    const hasPriceMin = Number.isFinite(priceMinNum) && priceMinNum > 0
    const hasPriceMax = Number.isFinite(priceMaxNum) && priceMaxNum > 0
    const searchTrimmed = search.trim().toLowerCase()
    if (statusFilter === 'all' && !roomsFilter && !hasMin && !hasMax && !hasPriceMin && !hasPriceMax && !searchTrimmed) return null
    const ids = new Set<string>()
    for (const u of scopedUnits) {
      const statusOk = statusFilter === 'all' || u.status === statusFilter
      const roomsOk = !roomsFilter || u.rooms === roomsFilter
      const area = u.area ?? 0
      const totalPrice = computeUnitTotalPrice(u)
      const minOk = !hasMin || area >= minNum
      const maxOk = !hasMax || area <= maxNum
      const priceMinOk = !hasPriceMin || (typeof totalPrice === 'number' && totalPrice >= priceMinNum)
      const priceMaxOk = !hasPriceMax || (typeof totalPrice === 'number' && totalPrice <= priceMaxNum)
      const searchOk = !searchTrimmed || u.number.toLowerCase().includes(searchTrimmed)
      if (statusOk && roomsOk && minOk && maxOk && priceMinOk && priceMaxOk && searchOk) ids.add(u._id)
    }
    return ids
  }, [scopedUnits, statusFilter, roomsFilter, areaMin, areaMax, priceMin, priceMax, search])

  const filtersActive = filteredUnitIds !== null

  const filteredUnits = useMemo(
    () => (filteredUnitIds ? scopedUnits.filter((u) => filteredUnitIds.has(u._id)) : scopedUnits),
    [scopedUnits, filteredUnitIds],
  )

  const scopeLabel = useMemo(() => {
    if (resolvedBuildingId === ALL_BUILDINGS_VALUE) {
      return buildings.length > 0 ? `все корпуса · ${buildings.length}` : 'все корпуса'
    }
    const building = buildings.find((b) => b._id === resolvedBuildingId)
    return building?.name ?? 'корпус'
  }, [buildings, resolvedBuildingId])

  const buildingSkeletons = useMemo(() => {
    const scopedBuildings: IBuilding[] =
      resolvedBuildingId === ALL_BUILDINGS_VALUE
        ? buildings
        : buildings.filter((b) => b._id === resolvedBuildingId)

    return scopedBuildings.map((building) => {
      const totalFloors = building.floors ?? 0
      const unitsByPosition = new Map<string, IUnit>()
      const unitsByFloorTail = new Map<number, IUnit[]>()
      let maxPos = 0

      for (const unit of scopedUnits) {
        if (unit.building !== building._id) continue
        if (typeof unit.positionInFloor === 'number' && unit.positionInFloor >= 1) {
          unitsByPosition.set(`${unit.floor}:${unit.positionInFloor}`, unit)
          if (unit.positionInFloor > maxPos) maxPos = unit.positionInFloor
        } else {
          const tail = unitsByFloorTail.get(unit.floor) ?? []
          tail.push(unit)
          unitsByFloorTail.set(unit.floor, tail)
        }
      }

      const perFloor = (building.unitsPerFloor && building.unitsPerFloor > 0) ? building.unitsPerFloor : maxPos

      const floorNumbers: number[] = []
      if (totalFloors > 0) {
        for (let f = 1; f <= totalFloors; f += 1) floorNumbers.push(f)
      } else {
        const present = new Set<number>()
        for (const unit of scopedUnits) {
          if (unit.building === building._id) present.add(unit.floor)
        }
        floorNumbers.push(...Array.from(present))
      }

      const ordered = floorNumbers
        .slice()
        .sort((a, b) => (floorOrder === 'desc' ? b - a : a - b))

      const floors = ordered.map((floor) => {
        const slots: Array<{ position: number; unit: IUnit | null }> = []
        if (perFloor > 0) {
          for (let pos = 1; pos <= perFloor; pos += 1) {
            slots.push({ position: pos, unit: unitsByPosition.get(`${floor}:${pos}`) ?? null })
          }
        }
        const tailUnits = (unitsByFloorTail.get(floor) ?? [])
          .slice()
          .sort(compareUnitNumberAsc)
        tailUnits.forEach((unit, idx) => {
          slots.push({ position: perFloor + idx + 1, unit })
        })
        return { floor, slots }
      })

      const maxPosition = floors.reduce((max, floorRow) => Math.max(max, floorRow.slots.length), 0)
      return { building, floors, maxPosition }
    })
  }, [scopedUnits, buildings, resolvedBuildingId, floorOrder])

  const validation = useMemo(() => {
    const numberCount = new Map<string, number>()
    const duplicates = new Set<string>()
    let emptySlots = 0

    for (const skeleton of buildingSkeletons) {
      for (const floorRow of skeleton.floors) {
        for (const slot of floorRow.slots) {
          if (slot.unit) {
            numberCount.set(slot.unit.number, (numberCount.get(slot.unit.number) ?? 0) + 1)
          } else {
            emptySlots += 1
          }
        }
      }
    }
    numberCount.forEach((count, number) => {
      if (count > 1) duplicates.add(number)
    })
    return { duplicates, emptySlots }
  }, [buildingSkeletons])

  const visibleUnitIds = useMemo(
    () => new Set(scopedUnits.map((u) => u._id)),
    [scopedUnits],
  )

  const effectiveSelectedIds = useMemo(() => {
    if (selectedUnitIds.size === 0) return selectedUnitIds
    let changed = false
    const next = new Set<string>()
    selectedUnitIds.forEach((id) => {
      if (visibleUnitIds.has(id)) next.add(id)
      else changed = true
    })
    return changed ? next : selectedUnitIds
  }, [selectedUnitIds, visibleUnitIds])

  const selectedUnits = useMemo(
    () => scopedUnits.filter((unit) => effectiveSelectedIds.has(unit._id)),
    [scopedUnits, effectiveSelectedIds],
  )

  const handleBuildingChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedBuildingId(event.target.value)
  }

  const handleProjectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const newId = event.target.value
    setActiveProject(newId)
    setSelectedBuildingId('')
    setSelectedUnitIds(new Set())
    void fetchBuildings(newId)
  }

  const openSlideOver = (unit: IUnit) => {
    setSlideOverUnit(unit)
    setIsSlideOverOpen(true)
  }

  const closeSlideOver = () => {
    setIsSlideOverOpen(false)
    setSlideOverUnit(null)
  }

  const clearSelection = useCallback(() => {
    setSelectedUnitIds(new Set())
  }, [])

  const toggleEditMode = () => {
    setIsEditMode((prev) => {
      const next = !prev
      if (!next) {
        setSelectedUnitIds(new Set())
        setIsMassEditOpen(false)
      }
      return next
    })
    setIsPickMode(false)
  }


  const togglePickMode = () => {
    setIsPickMode((prev) => {
      const next = !prev
      if (!next) setSelectedUnitIds(new Set())
      return next
    })
    setIsEditMode(false)
  }

  const selectGroupUnits = useCallback((unitIds: Iterable<string>, append = false) => {
    const next = append ? new Set(effectiveSelectedIds) : new Set<string>()
    for (const unitId of unitIds) {
      if (!visibleUnitIds.has(unitId)) continue
      if (filteredUnitIds && !filteredUnitIds.has(unitId)) continue
      next.add(unitId)
    }
    setSelectedUnitIds(next)
  }, [effectiveSelectedIds, filteredUnitIds, visibleUnitIds])

  const activatePickModeWithUnit = useCallback((unitId: string) => {
    if (readOnly) return
    if (!visibleUnitIds.has(unitId)) return
    if (filteredUnitIds && !filteredUnitIds.has(unitId)) return

    setIsPickMode(true)
    setIsEditMode(false)
    setIsMassEditOpen(false)
    setSelectedUnitIds((prev) => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId)
      else next.add(unitId)
      return next
    })
  }, [filteredUnitIds, readOnly, visibleUnitIds])

  const handleGridMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isEditMode && !isPickMode) return
    if (event.button !== 0) return
    // Игнорируем клики по контролам внутри сетки (кнопки копирования этажа, плейсхолдеры и т.п.)
    const targetEl = event.target as HTMLElement | null
    if (targetEl?.closest('[data-skip-drag="true"]')) return

    const container = gridContainerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
      moved: false,
      initialSelection: new Set(effectiveSelectedIds),
      active: true,
    }

    const handleMove = (moveEvent: MouseEvent) => {
      const state = dragStateRef.current
      if (!state || !state.active) return
      const dx = moveEvent.clientX - state.startX
      const dy = moveEvent.clientY - state.startY
      if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      state.moved = true

      const left = Math.min(state.startX, moveEvent.clientX) - containerRect.left + container.scrollLeft
      const top = Math.min(state.startY, moveEvent.clientY) - containerRect.top + container.scrollTop
      const width = Math.abs(dx)
      const height = Math.abs(dy)
      setRubberBand({ left, top, width, height })

      const rectViewport = {
        left: Math.min(state.startX, moveEvent.clientX),
        top: Math.min(state.startY, moveEvent.clientY),
        right: Math.max(state.startX, moveEvent.clientX),
        bottom: Math.max(state.startY, moveEvent.clientY),
      }
      const cards = container.querySelectorAll<HTMLElement>('[data-unit-id]')
      const hit = new Set<string>(state.additive ? state.initialSelection : [])
      cards.forEach((card) => {
        const cardRect = card.getBoundingClientRect()
        if (rectsIntersect(rectViewport, cardRect)) {
          const id = card.dataset.unitId
          if (!id) return
          if (filteredUnitIds && !filteredUnitIds.has(id)) return
          hit.add(id)
        }
      })
      setSelectedUnitIds(hit)
    }

    const handleUp = (upEvent: MouseEvent) => {
      const state = dragStateRef.current
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      setRubberBand(null)
      if (!state) return
      state.active = false

      if (!state.moved) {
        const upTarget = upEvent.target as HTMLElement | null
        const card = upTarget?.closest('[data-unit-id]') as HTMLElement | null
        const unitId = card?.dataset.unitId

        if (!unitId) {
          if (!state.additive) clearSelection()
          return
        }

        setSelectedUnitIds((prev) => {
          if (state.additive) {
            const next = new Set(prev)
            if (next.has(unitId)) next.delete(unitId)
            else next.add(unitId)
            return next
          }
          return new Set([unitId])
        })
      }
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearSelection()
        setIsMassEditOpen(false)
        setIsPickMode(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearSelection])

  const preferredBuildingId =
    resolvedBuildingId === ALL_BUILDINGS_VALUE
      ? (slideOverUnit?.building ?? buildings[0]?._id ?? '')
      : (resolvedBuildingId ?? buildings[0]?._id ?? '')

  const activeProjectCurrency =
    projects.find((p) => p._id === activeProjectId)?.currency ||
    scopedUnits[0]?.currency ||
    'USD'
  const activeCurrencySymbol = getCurrencySymbol(activeProjectCurrency)

  const handleExport = () => {
    exportUnitsToXlsx(scopedUnits, buildings, scopeLabel, activeProjectCurrency)
  }

  const activeProjectFontSize = useMemo(() => {
    const name = activeProjectName ?? 'ЖК'
    const len = name.length
    if (len <= 6) return 28
    if (len <= 10) return 24
    if (len <= 16) return 20
    if (len <= 24) return 18
    return 16
  }, [activeProjectName])

  const emptyChessboardTarget = useMemo<IBuilding | null>(() => {
    if (buildings.length === 0) return null
    if (scopedUnits.length > 0) return null
    if (resolvedBuildingId !== ALL_BUILDINGS_VALUE) {
      return buildings.find((b) => b._id === resolvedBuildingId) ?? null
    }
    const empty = buildings.find((b) => !allUnits.some((u) => u.building === b._id))
    return empty ?? buildings[0] ?? null
  }, [buildings, scopedUnits.length, resolvedBuildingId, allUnits])

  const showEmptyCta = emptyChessboardTarget !== null && !filtersActive

  return (
    <section
      ref={sectionRef}
      className={cn(
        'w-full min-w-0 max-w-full',
        isEmbed ? 'flex min-h-0 flex-1 flex-col p-3' : 'p-6',
      )}
    >
      <header className="mb-3 flex flex-col gap-3">
        {/* Строка 1: заголовок + ЖК + корпус + переключатель режимов */}
        <div className="flex flex-nowrap items-center gap-3">
          {!isEmbed ? (
            <h1 className="text-[36px] font-normal tracking-[-0.02em] text-[color:var(--cb-title)]">{t('inventory.interactiveChessboard.шахматка')}</h1>
          ) : (
            <h1 className="max-w-[min(100%,28rem)] truncate text-[20px] font-normal tracking-[-0.02em] text-[color:var(--cb-title)]">
              {embed?.title ?? 'Выбор лотов'}
            </h1>
          )}

          {projects.length > 1 && !isEmbed && ownProjectName ? (
            <div className="relative" ref={projectDropRef}>
              <button
                type="button"
                onClick={() => setProjectDropOpen((v) => !v)}
                className={cn(
                  cbToolbarCtrl,
                  'h-11 min-w-56 max-w-160 justify-between gap-2',
                  projectDropOpen ? cbToolbarCtrlOn : null,
                )}
                style={{ fontSize: `${activeProjectFontSize}px` }}
              >
                <span className="truncate text-left">
                  {activeProjectName ?? 'ЖК'}
                </span>
                <ChevronDown className={cn(cbToolbarIcon, 'shrink-0 transition-transform', projectDropOpen ? 'rotate-180' : null)} />
              </button>
              {projectDropOpen && (
                <div
                  className="absolute left-0 top-full z-30 mt-1.5 min-w-[min(100vw-2rem,16rem)] max-w-[min(100vw-2rem,20rem)] rounded-md border py-1"
                  style={{ background: 'var(--cb-drop-bg)', borderColor: 'var(--cb-drop-border)', boxShadow: 'var(--cb-drop-shadow)' }}
                >
                  {projects.map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => {
                        handleProjectChange({ target: { value: p._id } } as ChangeEvent<HTMLSelectElement>)
                        setProjectDropOpen(false)
                      }}
                      className="flex w-full items-center gap-2 whitespace-normal wrap-break-word px-4 py-2.5 text-left text-[16px] font-normal transition-colors"
                      style={activeProjectId === p._id
                        ? { background: 'var(--cb-drop-item-active-bg)', color: 'var(--cb-drop-item-active-text)' }
                        : { color: 'var(--cb-drop-item-text)' }
                      }
                      onMouseEnter={e => { if (activeProjectId !== p._id) (e.currentTarget as HTMLElement).style.background = 'var(--cb-drop-item-hover-bg)' }}
                      onMouseLeave={e => { if (activeProjectId !== p._id) (e.currentTarget as HTMLElement).style.background = '' }}
                    >
                      <span className="mt-1 h-2 w-2 shrink-0 self-start rounded-full" style={{ background: activeProjectId === p._id ? 'var(--cb-dot-active)' : 'transparent' }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : !isEmbed && !ownProjectName && activeProjectName ? (
            // ЖК открыт из каталога новостроек (не из кабинета) — статичное название, без переключателя своих ЖК.
            <div
              className="inline-flex h-11 min-w-56 max-w-160 shrink-0 items-center rounded-md border px-3"
              style={{ fontSize: `${activeProjectFontSize}px`, borderColor: 'var(--cb-ctrl-border)', background: 'var(--cb-ctrl-bg)', color: 'var(--cb-ctrl-text)' }}
            >
              <span className="truncate text-left">{activeProjectName}</span>
            </div>
          ) : projects.length === 1 || (!isEmbed && activeProjectName) ? (
            <span className="truncate text-[16px] font-normal" style={{ color: 'var(--cb-name-text)' }}>
              {activeProjectName ?? projects[0]?.name ?? 'ЖК'}
            </span>
          ) : null}

          {/* Корпус: по умолчанию первый; в списке — «Все корпуса» */}
          {!isComplexLoading && buildings.length > 1 && (
            <div className="relative" ref={buildingDropRef}>
              <button
                type="button"
                onClick={() => setBuildingDropOpen((v) => !v)}
                disabled={!activeProjectId || buildings.length === 0}
                className={cn(cbToolbarCtrl, 'h-11 min-w-34 justify-between gap-2 text-[20px]', buildingDropOpen ? cbToolbarCtrlOn : null)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Building2 className={cn(cbToolbarIcon, 'shrink-0')} />
                  <span className="truncate text-left">
                    {resolvedBuildingId === ALL_BUILDINGS_VALUE
                      ? `Все корпуса · ${buildings.length}`
                      : buildings.find((b) => b._id === resolvedBuildingId)?.name ?? buildings[0]?.name ?? 'Корпус'}
                  </span>
                </span>
                <ChevronDown className={cn(cbToolbarIcon, 'shrink-0 transition-transform', buildingDropOpen ? 'rotate-180' : null)} />
              </button>
              {buildingDropOpen && (
                <div
                  className="absolute left-0 top-full z-30 mt-1.5 min-w-[min(100vw-2rem,16rem)] max-w-[min(100vw-2rem,20rem)] rounded-md border py-1"
                  style={{ background: 'var(--cb-drop-bg)', borderColor: 'var(--cb-drop-border)', boxShadow: 'var(--cb-drop-shadow)' }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBuildingId(ALL_BUILDINGS_VALUE)
                      setBuildingDropOpen(false)
                    }}
                    className="flex w-full items-center gap-2 whitespace-normal wrap-break-word px-4 py-2.5 text-left text-[16px] font-normal transition-colors"
                    style={effectiveSelectedBuildingId === ALL_BUILDINGS_VALUE
                      ? { background: 'var(--cb-drop-item-active-bg)', color: 'var(--cb-drop-item-active-text)' }
                      : { color: 'var(--cb-drop-item-text)' }
                    }
                    onMouseEnter={e => { if (effectiveSelectedBuildingId !== ALL_BUILDINGS_VALUE) (e.currentTarget as HTMLElement).style.background = 'var(--cb-drop-item-hover-bg)' }}
                    onMouseLeave={e => { if (effectiveSelectedBuildingId !== ALL_BUILDINGS_VALUE) (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    <span className="mt-1 h-2 w-2 shrink-0 self-start rounded-full" style={{ background: effectiveSelectedBuildingId === ALL_BUILDINGS_VALUE ? 'var(--cb-dot-active)' : 'transparent' }} />
                    {t('inventory.interactiveChessboard.все_корпуса')}{buildings.length}
                  </button>
                  <div className="my-1 border-t" style={{ borderColor: 'var(--cb-drop-divider)' }} />
                  {buildings.map((b) => {
                    const isActive = effectiveSelectedBuildingId === b._id || (!effectiveSelectedBuildingId && b._id === buildings[0]?._id)
                    return (
                    <button
                      key={b._id}
                      type="button"
                      onClick={() => {
                        handleBuildingChange({ target: { value: b._id } } as ChangeEvent<HTMLSelectElement>)
                        setBuildingDropOpen(false)
                      }}
                      className="flex w-full items-center gap-2 whitespace-normal wrap-break-word px-4 py-2.5 text-left text-[16px] font-normal transition-colors"
                      style={isActive
                        ? { background: 'var(--cb-drop-item-active-bg)', color: 'var(--cb-drop-item-active-text)' }
                        : { color: 'var(--cb-drop-item-text)' }
                      }
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--cb-drop-item-hover-bg)' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '' }}
                    >
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full self-start" style={{ background: isActive ? 'var(--cb-dot-active)' : 'transparent' }} />
                      {b.name ?? 'Без названия'}
                    </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Перенесенный обратно тулбар */}
          <div className={cn(cbToolbarGroup, 'ml-auto flex-nowrap')}>
            {!isEmbed ? (
              <div className="flex rounded-md border p-0.5" style={{ borderColor: 'var(--cb-view-switch-border)' }}>
                {([
                  ['grid', 'Шахматка', Grid3X3],
                  ['table', 'Таблица', List],
                  ['planview', 'С планировками', LayoutTemplate],
                ] as const).map(([v, lbl, Icon]) => (
                  <button
                    key={v}
                    type="button"
                    title={lbl}
                    onClick={() => switchViewMode(v)}
                    className="flex items-center justify-center rounded-md p-1.5 transition-colors"
                    style={viewMode === v
                      ? { background: 'var(--cb-view-active-bg)', color: 'var(--cb-view-active-text)' }
                      : { color: 'var(--cb-view-text)' }
                    }
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => {
                if (viewMode === 'table') return
                setFloorOrder((p) => (p === 'desc' ? 'asc' : 'desc'))
              }}
              disabled={viewMode === 'table'}
              title={viewMode === 'table' ? 'Доступно в режиме шахматки и планировок' : 'Направление этажей'}
              className={cn(cbToolbarCtrl, 'h-[36px] px-2', viewMode === 'table' ? 'opacity-45' : null)}
            >
              <ArrowDownUp size={16} className={cbToolbarIcon} />
              <span className="tabular-nums">{floorOrder === 'desc' ? 'сверху' : 'снизу'}</span>
            </button>

            <ZoomControls
              zoom={chessboardZoom}
              onAdjust={adjustZoom}
              onReset={resetZoom}
              disabled={viewMode !== 'grid'}
              className="h-[36px]"
            />

          </div>
        </div>

        {/* Строка 2: действия (скрыта в readOnly режиме и во встроенном выборе лотов) */}
        {!readOnly && !isEmbed && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className={cbToolbarGroup}>
              {canEditLots ? (
                <button
                  type="button"
                  onClick={() => toggleEditMode()}
                  title={isEditMode ? 'Выйти из режима редактирования лотов' : 'Редактировать статусы и цены лотов'}
                  className={cn(cbToolbarCtrl, isEditMode ? cbToolbarCtrlOnStrong : null)}
                >
                  <Pencil className={cbToolbarIcon} />
                  <span>{t('inventory.interactiveChessboard.редактировать_лоты')}</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => togglePickMode()}
                title={isPickMode ? 'Выйти из режима выбора' : 'Выбрать лоты для подборки'}
                className={cn(cbToolbarCtrl, isPickMode ? cbToolbarCtrlOnStrong : null)}
              >
                <Layers className={cbToolbarIcon} />
                <span>{t('inventory.interactiveChessboard.выбрать_лоты')}</span>
              </button>

              <button
                type="button"
                onClick={() => effectiveSelectedIds.size > 0 && setIsSelectionModalOpen(true)}
                disabled={effectiveSelectedIds.size === 0}
                className={cn(
                  cbToolbarCtrl,
                  effectiveSelectedIds.size > 0
                    ? cbToolbarCtrlOnStrong
                    : 'opacity-40',
                )}
              >
                <Layers className={cbToolbarIcon} />
                <span className="tabular-nums">
                  {effectiveSelectedIds.size > 0 ? `Подборка (${effectiveSelectedIds.size})` : 'Подборка'}
                </span>
              </button>

              {canEditLots ? (
                <button type="button" onClick={() => setIsImportOpen(true)} className={cbToolbarCtrl}>
                  <Upload className={cbToolbarIcon} />
                  {t('inventory.interactiveChessboard.импорт')}</button>
              ) : null}
              {canExportData ? (
                <button type="button" onClick={handleExport} className={cbToolbarCtrl}>
                  <Download className={cbToolbarIcon} />
                  {t('inventory.interactiveChessboard.экспорт')}</button>
              ) : null}
            </div>
          </div>
        )}
      </header>

      {showPickHint && !readOnly && !isEmbed && effectiveSelectedIds.size === 0 && (
        <div
          className="mb-3 flex items-center justify-between gap-3 rounded-md px-4 py-2.5"
          style={{
            border: '1px solid color-mix(in srgb, var(--gold) 35%, transparent)',
            background: 'color-mix(in srgb, var(--gold) 8%, transparent)',
          }}
        >
          <span className="text-[16px] font-normal" style={{ color: 'var(--app-text)' }}>
            {t('inventory.interactiveChessboard.отметьте_квартиры_в')}</span>
          <button
            type="button"
            onClick={() => setShowPickHint(false)}
            className="shrink-0 transition-colors hover:opacity-100"
            style={{ color: 'var(--cb-label)' }}
            aria-label={t('inventory.interactiveChessboard.скрыть_подсказку')}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {!isComplexLoading && scopedUnits.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2">
          {/* Поиск по номеру */}
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-2.5" style={{ color: 'var(--cb-label)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isEmbed ? 'Фильтр: м², цена, комнатность' : 'Номер помещения'}
              className="h-8 w-44 rounded-md border pl-8 pr-2 text-[14px] font-normal outline-none"
              style={{ background: 'var(--cb-input-bg)', borderColor: 'var(--cb-input-border)', color: 'var(--cb-input-text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--cb-input-border-focus)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--cb-input-border)')}
            />
          </div>
          {/* Статус */}
          <div className="flex items-center gap-1">
            {(['all', 'free', 'booked', 'sold', 'withdrawn'] as const).map((s) => {
              const labels = { all: 'Все', free: 'В продаже', booked: 'Бронь', sold: 'Продано', withdrawn: 'Снято' }
              const active = statusFilter === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[14px] font-normal transition-colors"
                  style={active
                    ? { borderColor: 'var(--cb-status-active-border)', background: 'var(--cb-status-active-bg)', color: 'var(--cb-status-active-text)' }
                    : { borderColor: 'var(--cb-status-border)', background: 'transparent', color: 'var(--cb-status-text)' }
                  }
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--cb-status-border-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--cb-status-text-hover)' } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--cb-status-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--cb-status-text)' } }}
                >
                  {s !== 'all' && <span className="h-1.5 w-1.5 rounded-full" style={{ background: UNIT_STATUS_META[s].dot }} />}
                  {labels[s]}
                </button>
              )
            })}
          </div>

          {/* Комнатность */}
          {uniqueRooms.length > 0 && (
            <div className="flex items-center gap-1">
              {uniqueRooms.map((r) => {
                const active = roomsFilter === r
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoomsFilter(active ? '' : r)}
                    className="h-8 rounded-md border px-2.5 text-[14px] font-normal transition-colors"
                    style={active
                      ? { borderColor: 'var(--cb-rooms-active-border)', background: 'var(--cb-rooms-active-bg)', color: 'var(--cb-rooms-active-text)' }
                      : { borderColor: 'var(--cb-rooms-border)', background: 'transparent', color: 'var(--cb-rooms-text)' }
                    }
                    onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--cb-rooms-border-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--cb-rooms-text-hover)' } }}
                    onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--cb-rooms-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--cb-rooms-text)' } }}
                  >
                    {optionLabel(t, 'rooms', compactRoomsLabel(r))}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex shrink-0 flex-nowrap items-center gap-2">
            <div className="flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap">
              <span className="text-[14px] font-normal" style={{ color: 'var(--cb-label)' }}>{t('inventory.interactiveChessboard.м')}</span>
              <input
                type="number"
                placeholder={t('inventory.interactiveChessboard.от')}
                value={areaMin}
                onChange={(e) => setAreaMin(e.target.value)}
                className="h-8 w-14 shrink-0 rounded-md border px-1.5 text-[14px] font-normal outline-none"
                style={{ background: 'var(--cb-input-bg)', borderColor: 'var(--cb-input-border)', color: 'var(--cb-input-text)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--cb-input-border-focus)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--cb-input-border)')}
              />
              <span className="shrink-0 text-[14px]" style={{ color: 'var(--cb-dash)' }}>—</span>
              <input
                type="number"
                placeholder={t('inventory.interactiveChessboard.до')}
                value={areaMax}
                onChange={(e) => setAreaMax(e.target.value)}
                className="h-8 w-14 shrink-0 rounded-md border px-1.5 text-[14px] font-normal outline-none"
                style={{ background: 'var(--cb-input-bg)', borderColor: 'var(--cb-input-border)', color: 'var(--cb-input-text)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--cb-input-border-focus)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--cb-input-border)')}
              />
            </div>
            <div className="flex shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap">
              <span className="text-[16px] font-normal" style={{ color: 'var(--cb-label)' }}>{activeCurrencySymbol}</span>
              <input
                type="number"
                placeholder={t('inventory.interactiveChessboard.от')}
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                className="h-8 w-14 shrink-0 rounded-md border px-1.5 text-[14px] font-normal outline-none"
                style={{ background: 'var(--cb-input-bg)', borderColor: 'var(--cb-input-border)', color: 'var(--cb-input-text)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--cb-input-border-focus)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--cb-input-border)')}
              />
              <span className="shrink-0 text-[14px]" style={{ color: 'var(--cb-dash)' }}>—</span>
              <input
                type="number"
                placeholder={t('inventory.interactiveChessboard.до')}
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                className="h-9 w-20 shrink-0 rounded-md border px-2 text-[16px] font-normal outline-none"
                style={{ background: 'var(--cb-input-bg)', borderColor: 'var(--cb-input-border)', color: 'var(--cb-input-text)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--cb-input-border-focus)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--cb-input-border)')}
              />
            </div>
          </div>

          {/* Сброс */}
          {filtersActive && (
            <button
              type="button"
              onClick={() => { setStatusFilter('all'); setRoomsFilter(''); setAreaMin(''); setAreaMax(''); setPriceMin(''); setPriceMax(''); setSearch('') }}
              className="inline-flex items-center gap-1.5 text-[16px] font-normal transition-colors"
              style={{ color: 'var(--cb-clear)' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--cb-clear-hover)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--cb-clear)')}
            >
              <X size={16} />
              {t('inventory.interactiveChessboard.сбросить')}</button>
          )}

          {viewMode === 'table' && !showEmptyCta ? (
            <div className="ml-auto flex min-h-9 justify-end">
              <div className="relative" ref={tableFieldsRef}>
                <button
                  type="button"
                  onClick={() => setTableFieldsOpen((v) => !v)}
                  title={t('inventory.interactiveChessboard.поля_таблицы')}
                  className={cn(cbToolbarCtrl, tableFieldsOpen ? cbToolbarCtrlOn : null)}
                >
                  <Settings2 className={cbToolbarIcon} />
                  <span>{t('inventory.interactiveChessboard.поля')}</span>
                </button>
                {tableFieldsOpen && (
                  <div
                    className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-md border py-2"
                    style={{ background: 'var(--cb-drop-bg)', borderColor: 'var(--cb-drop-border)', boxShadow: 'var(--cb-drop-shadow)' }}
                  >
                    {ALL_UNIT_TABLE_COLS.filter((column) => !column.alwaysOn).map((column) => (
                      <label
                        key={column.key}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[16px] font-normal transition-colors"
                        style={{ color: 'var(--cb-drop-item-text)' }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--cb-drop-item-hover-bg)')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '')}
                      >
                        <input
                          type="checkbox"
                          checked={tableVisibleCols.has(column.key)}
                          onChange={() => toggleTableColumn(column.key)}
                          className="accent-[color:var(--cb-ctrl-on-border)]"
                        />
                        <span>{column.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Панель массового редактирования — появляется при выборе лотов */}
      {isEditMode && effectiveSelectedIds.size > 0 && (
        <div className="mb-2 flex items-center gap-3 rounded-md border px-4 py-2.5" style={{ borderColor: 'var(--cb-ctrl-on-border)', background: 'var(--cb-ctrl-on-bg)' }}>
          <span className="text-[16px] font-normal" style={{ color: 'var(--cb-ctrl-on-text)' }}>
            {t('inventory.interactiveChessboard.выбрано')} {effectiveSelectedIds.size}
          </span>
          <button
            type="button"
            onClick={() => setIsMassEditOpen(true)}
            className="ml-auto rounded-md bg-[color:var(--gold)] px-4 py-1.5 text-[16px] font-normal text-[color:var(--gold-btn-text)] hover:opacity-90 transition-colors"
          >
            {t('inventory.interactiveChessboard.редактировать_выбран')}</button>
          <button
            type="button"
            onClick={() => setSelectedUnitIds(new Set())}
            className="text-[16px] transition-colors"
            style={{ color: 'var(--cb-clear)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--cb-clear-hover)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--cb-clear)')}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {isComplexLoading ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-24 text-center"
          style={{ borderColor: 'var(--cb-ctrl-border)', background: 'var(--cb-drop-bg)' }}
        >
          <Loader2 className="size-8 animate-spin" style={{ color: 'var(--gold)' }} />
          <div className="text-[17px] font-normal" style={{ color: 'var(--workspace-text-muted)' }}>
            {t('inventory.interactiveChessboard.загрузка_шахматки')}</div>
        </div>
      ) : showEmptyCta && emptyChessboardTarget ? (
        <EmptyChessboardCta
          building={emptyChessboardTarget}
          buildingsCount={buildings.length}
          onBuild={() =>
            setWizardState({
              mode: 'create',
              initialBuildingId: emptyChessboardTarget._id,
            })
          }
          onImport={() => setIsImportOpen(true)}
        />
      ) : viewMode === 'table' ? (
        <div>
          <UnitTableView
            hideToolbar
            units={filteredUnits}
            buildings={buildings}
            projects={projects}
            visibleCols={tableVisibleCols}
            onToggleVisibleCol={toggleTableColumn}
            onOpenDetail={openSlideOver}
            onShiftSelectUnit={!readOnly ? activatePickModeWithUnit : undefined}
            selectedUnitIds={isEditMode || isPickMode ? selectedUnitIds : undefined}
            onClearSelection={isEditMode || isPickMode ? clearSelection : undefined}
            onToggleUnit={
              isEditMode || isPickMode
                ? (id) =>
                    setSelectedUnitIds((prev) => {
                      const next = new Set(prev)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
                      return next
                    })
                : undefined
            }
            onTogglePage={
              isEditMode || isPickMode
                ? (ids) =>
                    setSelectedUnitIds((prev) => {
                      const allSel = ids.every((id) => prev.has(id))
                      const next = new Set(prev)
                      if (allSel) ids.forEach((id) => next.delete(id))
                      else ids.forEach((id) => next.add(id))
                      return next
                    })
                : undefined
            }
          />
        </div>
      ) : viewMode === 'planview' ? (
        <FloorPlanMapView
          embedded
          buildingId={resolvedBuildingId === ALL_BUILDINGS_VALUE ? undefined : resolvedBuildingId}
        />
      ) : (
      <>

      {validation.duplicates.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHighlightDuplicates((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-[16px] transition-colors ${
              highlightDuplicates
                ? 'border-[#ffb4ab] bg-[rgba(255,180,171,0.22)] text-[#ffdad6]'
                : 'border-[rgba(255,180,171,0.4)] bg-[rgba(255,180,171,0.12)] text-[#ffb4ab] hover:bg-[rgba(255,180,171,0.22)]'
            }`}
            title={t('inventory.interactiveChessboard.подсветить_дубли')}
          >
            <AlertTriangle size={12} />
            {t('inventory.interactiveChessboard.дубли_номеров')}{validation.duplicates.size}
          </button>
        </div>
      )}

      {buildings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-10 text-center" style={{ borderColor: 'var(--cb-ctrl-border)', background: 'var(--cb-drop-bg)' }}>
          <Building2 className="size-10" style={{ color: 'var(--app-text-muted)' }} />
          <div className="text-[19px] font-normal" style={{ color: 'var(--workspace-text)' }}>
            {t('inventory.interactiveChessboard.шахматка_ещ_не_запол')}</div>
          {!readOnly && !isEmbed && activeProjectId && (
            <button
              type="button"
              onClick={() => setWizardState({ mode: 'create', initialBuildingId: null })}
              className={cn(cbToolbarCtrl, 'mt-1')}
            >
              <Pencil className={cbToolbarIcon} />
              <span>{t('inventory.interactiveChessboard.заполнить_шахматку')}</span>
            </button>
          )}
        </div>
      ) : buildingSkeletons.every((b) => b.floors.length === 0) ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-center" style={{ borderColor: 'var(--cb-ctrl-border)', background: 'var(--cb-drop-bg)' }}>
          <div className="text-[17px] font-normal" style={{ color: 'var(--workspace-text-muted)' }}>
            {t('inventory.interactiveChessboard.у_корпуса_не_задана')}</div>
        </div>
      ) : (
        <div className="min-w-0 max-w-full rounded-md" style={{ background: 'var(--green-deep)', boxShadow: 'inset 0 0 0 1px var(--cb-ctrl-group-border)' }}>
        <div
          ref={gridContainerRef}
          onMouseDown={handleGridMouseDown}
          className="relative max-w-full select-none overflow-auto p-3"
        >
          <div style={zoomWrapperStyle}>
          <div
            ref={zoomInnerRef}
            className="w-full min-w-0 space-y-6"
            style={zoomInnerStyle}
          >
          {buildingSkeletons.map((skeleton) => (
            <div key={skeleton.building._id}>
              {null}
              <div className="flex flex-col">
                {skeleton.maxPosition > 0 ? (
                  <div className="mb-2 w-full min-w-0">
                    <div
                      className={cn('grid w-full min-w-0', CB_ROW_GAP)}
                      style={{ gridTemplateColumns: cbGridTemplateColumns(skeleton.maxPosition) }}
                    >
                      <div className="min-w-0" aria-hidden />
                      {Array.from({ length: skeleton.maxPosition }, (_, idx) => {
                        const position = idx + 1
                        const positionUnitIds = skeleton.floors.flatMap((floorRow) => {
                          const slot = floorRow.slots.find((candidate) => candidate.position === position)
                          return slot?.unit ? [slot.unit._id] : []
                        })
                        const selectableCount = positionUnitIds.filter((unitId) => (
                          !filteredUnitIds || filteredUnitIds.has(unitId)
                        )).length
                        const isPositionSelected =
                          (isEditMode || isPickMode) &&
                          selectableCount > 0 &&
                          positionUnitIds
                            .filter((unitId) => !filteredUnitIds || filteredUnitIds.has(unitId))
                            .every((unitId) => effectiveSelectedIds.has(unitId))
                        const canSelectPosition = (isEditMode || isPickMode) && selectableCount > 0
                        return (
                          <button
                            key={`${skeleton.building._id}-position-${position}`}
                            type="button"
                            data-skip-drag="true"
                            disabled={!canSelectPosition}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!canSelectPosition) return
                              selectGroupUnits(positionUnitIds, e.shiftKey || e.ctrlKey || e.metaKey)
                            }}
                            className="flex h-9 w-full min-w-0 shrink-0 items-center justify-center rounded-md border text-[16px] font-normal transition-colors disabled:cursor-default"
                            style={isPositionSelected
                              ? { borderColor: 'var(--cb-rooms-active-border)', background: 'var(--cb-rooms-active-bg)', color: 'var(--cb-rooms-active-text)' }
                              : canSelectPosition
                                ? { borderColor: 'var(--cb-rooms-border)', background: 'var(--cb-ctrl-group-bg)', color: 'var(--workspace-text-muted)' }
                                : { borderColor: 'var(--cb-ctrl-group-border)', background: 'transparent', color: 'var(--workspace-text-muted)', opacity: 0.5 }
                            }
                            title={`Выделить весь стояк ${position}`}
                          >
                            {position}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
                {skeleton.floors.map((floorRow, floorIdx) => {
                  const floorUnitIds = floorRow.slots.flatMap((slot) => (slot.unit ? [slot.unit._id] : []))
                  const floorSelectableIds = floorUnitIds.filter((unitId) => !filteredUnitIds || filteredUnitIds.has(unitId))
                  const isFloorSelected =
                    (isEditMode || isPickMode) &&
                    floorSelectableIds.length > 0 &&
                    floorSelectableIds.every((unitId) => effectiveSelectedIds.has(unitId))
                  const canSelectFloor = (isEditMode || isPickMode) && floorSelectableIds.length > 0
                  return (
                    <div key={`${skeleton.building._id}-${floorRow.floor}`} className={`flex flex-col gap-1.5 ${floorIdx > 0 ? 'mt-1' : ''}`}>
                      <div
                        className={cn('grid w-full min-w-0 items-center', CB_ROW_GAP)}
                        style={{ gridTemplateColumns: cbGridTemplateColumns(floorRow.slots.length) }}
                      >
                        <div className="flex min-w-0 items-center gap-1 pt-1.5 text-[16px] font-normal" style={{ color: 'var(--modal-floor-num)' }}>
                          <button
                            type="button"
                            data-skip-drag="true"
                            disabled={!canSelectFloor}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!canSelectFloor) return
                              selectGroupUnits(floorUnitIds, e.shiftKey || e.ctrlKey || e.metaKey)
                            }}
                            className="inline-flex min-w-8 items-center justify-start rounded-md px-1.5 py-1 transition-colors disabled:cursor-default"
                            style={isFloorSelected
                              ? { background: 'var(--cb-rooms-active-bg)', color: 'var(--cb-rooms-active-text)' }
                              : { color: 'inherit' }
                            }
                            title={`Выделить весь этаж ${floorRow.floor}`}
                          >
                            {floorRow.floor}
                          </button>
                        </div>
                        {floorRow.slots.map((slot) => {
                          if (slot.unit) {
                            const isDuplicate =
                              highlightDuplicates && validation.duplicates.has(slot.unit.number)
                            const isDimmed = filtersActive && !filteredUnitIds!.has(slot.unit._id)
                            const isRoomsHighlighted = !!roomsFilter && slot.unit.rooms === roomsFilter
                            return (
                              <div
                                key={slot.unit._id}
                                className="min-w-0"
                                onClickCapture={
                                  !isEditMode && !isPickMode && !isDimmed
                                    ? (event) => {
                                        if (event.shiftKey || event.ctrlKey || event.metaKey) {
                                          event.preventDefault()
                                          event.stopPropagation()
                                          activatePickModeWithUnit(slot.unit!._id)
                                          return
                                        }
                                        openSlideOver(slot.unit!)
                                      }
                                    : undefined
                                }
                              >
                                <div
                                  className={[
                                    isDuplicate ? 'rounded-lg ring-2 ring-rose-400 ring-offset-2 ring-offset-[#0a1f12]' : '',
                                    isDimmed ? 'opacity-20 pointer-events-none' : '',
                                  ].join(' ') || undefined}
                                >
                                  <ChessboardUnitCard
                                    unit={slot.unit}
                                    isSelected={(isEditMode || isPickMode) && effectiveSelectedIds.has(slot.unit._id)}
                                    isHighlighted={isRoomsHighlighted && !isDimmed}
                                    isPaid={paidUnitLabels.has(slot.unit.number)}
                                    isInProgress={inProgressUnitLabels.has(slot.unit.number)}
                                  />
                                </div>
                              </div>
                            )
                          }
                          return (
                            <div key={`empty-${skeleton.building._id}-${floorRow.floor}-${slot.position}`} className="min-w-0">
                              <ChessboardEmptyCell floor={floorRow.floor} position={slot.position} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          </div>
          </div>

          {rubberBand ? (
            <div
              className="pointer-events-none absolute rounded-sm border"
              style={{
                borderColor: 'var(--cb-ctrl-on-border)',
                background: 'var(--cb-ctrl-on-bg-strong)',
                left: rubberBand.left,
                top: rubberBand.top,
                width: rubberBand.width,
                height: rubberBand.height,
              }}
            />
          ) : null}
        </div>
        </div>
      )}

      </>
      )}

      {isEmbed && embed ? (
        <div className="mt-3 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t pt-3" style={{ borderColor: 'var(--cb-view-switch-border)' }}>
          <button type="button" onClick={() => embed.onExit()} className={cbToolbarCtrl}>
            {t('inventory.interactiveChessboard.отмена')}</button>
          <button
            type="button"
            onClick={() => embed.onConfirmSelection(Array.from(selectedUnitIds))}
            className={cn(cbToolbarCtrl, cbToolbarCtrlOnStrong)}
          >
            {t('inventory.interactiveChessboard.применить')}{selectedUnitIds.size})
          </button>
        </div>
      ) : null}

      <UnitDetailModal
        isOpen={isSlideOverOpen}
        onClose={closeSlideOver}
        initialData={slideOverUnit}
        preferredBuildingId={preferredBuildingId}
      />

      {isMassEditOpen && selectedUnits.length > 0 ? (
        <MassEditSidebar
          selectedUnits={selectedUnits}
          onClose={() => setIsMassEditOpen(false)}
          onOpenDetail={(unit) => openSlideOver(unit)}
        />
      ) : null}


      {isImportOpen ? <ChessboardImportDialog onClose={() => setIsImportOpen(false)} /> : null}

      {isSelectionModalOpen && (
        <CreateSelectionModal
          unitIds={Array.from(effectiveSelectedIds)}
          onClose={() => setIsSelectionModalOpen(false)}
        />
      )}

      {wizardState && activeProjectId ? (
        <BuildingChessboardWizard
          projectId={activeProjectId}
          buildings={buildings}
          initialBuildingId={wizardState.initialBuildingId}
          mode={wizardState.mode}
          onClose={() => setWizardState(null)}
          onApplied={(buildingId) => {
            setSelectedBuildingId(buildingId || selectedBuildingId)
            setWizardState(null)
          }}
        />
      ) : null}
    </section>
  )
}

interface EmptyChessboardCtaProps {
  building: IBuilding
  buildingsCount: number
  onBuild: () => void
  onImport: () => void
}

function EmptyChessboardCta({ building, buildingsCount, onBuild, onImport }: EmptyChessboardCtaProps) {
    const { t } = useI18n();
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-md border border-dashed px-6 py-12 text-center"
      style={{ borderColor: 'var(--cb-ctrl-border)', background: 'var(--cb-drop-bg)' }}
    >
      <div className="flex size-14 items-center justify-center rounded-md" style={{ background: 'var(--cb-ctrl-on-bg)' }}>
        <Wand2 className="size-7" style={{ color: 'var(--gold)' }} />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-[20px] font-normal tracking-[-0.02em]" style={{ color: 'var(--workspace-text)' }}>
          {t('inventory.interactiveChessboard.у_корпуса')}{building.name ?? 'без названия'}{t('inventory.interactiveChessboard.ещ_нет_шахматки')}</h2>
        <p className="max-w-md text-[17px] font-normal" style={{ color: 'var(--workspace-text-muted)' }}>
          {t('inventory.interactiveChessboard.опишите_типовой_этаж')}</p>
        {buildingsCount > 1 ? (
          <p className="text-[16px] font-normal" style={{ color: 'var(--cb-label)' }}>
            {t('inventory.interactiveChessboard.в_проекте_есть_и_дру')}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          onClick={onBuild}
          className="rounded-md text-[16px] font-normal"
          style={{ background: 'var(--gold)', color: 'var(--gold-btn-text)' }}
        >
          <Wand2 size={16} />
          {t('inventory.interactiveChessboard.построить_шахматку')}</Button>
        <Button
          type="button"
          variant="outline"
          onClick={onImport}
          className={cn(cbToolbarCtrl)}
        >
          <Upload size={16} />
          {t('inventory.interactiveChessboard.импорт_из_excel')}</Button>
      </div>
      <div className="text-[16px] font-normal" style={{ color: 'var(--cb-label)' }}>
        {t('inventory.interactiveChessboard.каркас')}{building.floors ?? '?'} {t('inventory.interactiveChessboard.этажей')}{building.unitsPerFloor ?? '?'} {t('inventory.interactiveChessboard.квартир_на_этаже')}</div>
    </div>
  )
}

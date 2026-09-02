import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react'

import {
  buildChessboardSummary,
  compactRoomsLabel,
  computeUnitTotalPrice,
  formatArea,
  formatUsd,
  type ChessboardSummary,
} from '@/lib/chessboard'
import { UNIT_STATUS_META } from '@/lib/unit-status'
import { UnitDetailModal } from '@/components/inventory/UnitDetailModal'
import { useCoreStore } from '@/store/useCoreStore'
import type { IBuilding, IUnit } from '@/types/core'
import { useI18n } from "@/i18n";
import { optionLabel } from '@/lib/project-options'

/** Статусы в построчной сводке этажа (без общего числа — оно лишнее). */
const RAIL_STATUSES = ['free', 'booked', 'sold'] as const

/** Сколько этажей показываем в рейке одновременно — остальные доступны скроллом (11.2). */
const VISIBLE_FLOORS = 5
/** Фиксированный шаг строки этажа (высота h-11 = 44px + отступ mb-0.5 = 2px). */
const FLOOR_ROW_PITCH = 46

interface Size {
  width: number
  height: number
}

interface LoadedImage extends Size {
  url: string
}

export function FloorPlanMapView({
  embedded = false,
  buildingId: buildingIdProp,
}: { embedded?: boolean; buildingId?: string } = {}) {
    const { t } = useI18n();
  const buildings = useCoreStore((s) => s.buildings)
  const allUnits = useCoreStore((s) => s.allUnits)
  const floorPlans = useCoreStore((s) => s.floorPlans)
  const fetchBuildingPlans = useCoreStore((s) => s.fetchBuildingPlans)

  const building = useMemo(
    () => buildings.find((b) => b._id === buildingIdProp) ?? buildings[0] ?? null,
    [buildings, buildingIdProp],
  )
  const buildingId = building?._id ?? ''

  const buildingUnits = useMemo(
    () => allUnits.filter((u) => u.building === buildingId),
    [allUnits, buildingId],
  )

  const floors = useMemo(() => {
    const set = new Set<number>()
    buildingUnits.forEach((u) => set.add(u.floor))
    floorPlans.filter((p) => p.buildingId === buildingId).forEach((p) => set.add(p.floor))
    if (building?.floors && building.floors > 0) {
      for (let f = 1; f <= building.floors; f += 1) set.add(f)
    }
    return Array.from(set).sort((a, b) => a - b)
  }, [building?.floors, buildingId, buildingUnits, floorPlans])

  const [selectedFloor, setSelectedFloor] = useState<number>(floors[0] ?? 1)
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null)
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null)
  const [modalUnit, setModalUnit] = useState<IUnit | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  const unitsByFloor = useMemo(() => {
    const map = new Map<number, IUnit[]>()
    buildingUnits.forEach((u) => {
      const list = map.get(u.floor) ?? []
      list.push(u)
      map.set(u.floor, list)
    })
    map.forEach((list) => list.sort((a, b) => (a.positionInFloor ?? 0) - (b.positionInFloor ?? 0)))
    return map
  }, [buildingUnits])

  const floorUnits = useMemo(() => unitsByFloor.get(selectedFloor) ?? [], [unitsByFloor, selectedFloor])

  const floorSummaries = useMemo(() => {
    const map = new Map<number, ChessboardSummary>()
    floors.forEach((floor) => map.set(floor, buildChessboardSummary(unitsByFloor.get(floor) ?? [])))
    return map
  }, [floors, unitsByFloor])

  const activeUnit = useMemo(
    () => floorUnits.find((u) => u._id === activeUnitId) ?? null,
    [floorUnits, activeUnitId],
  )

  useEffect(() => {
    if (!floors.includes(selectedFloor)) setSelectedFloor(floors[0] ?? 1)
  }, [floors, selectedFloor])

  // Плавающая карточка не открывается сама — только по клику; при смене этажа сбрасываем.
  useEffect(() => {
    setActiveUnitId(null)
    setHoveredUnitId(null)
  }, [selectedFloor, buildingId])

  useEffect(() => {
    if (buildingId) void fetchBuildingPlans(buildingId)
  }, [buildingId, fetchBuildingPlans])

  useEffect(() => {
    if (!fullscreen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !modalUnit && !activeUnitId) setFullscreen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fullscreen, modalUnit, activeUnitId])

  if (!building) {
    return (
      <div className="flex items-center justify-center py-20 text-[16px] text-[color:var(--fp-muted)]">
        {t('inventory.floorPlanMapView.нет_корпусов_для_ото')}</div>
    )
  }

  // Сверху вниз: верхние этажи первыми (как в шахматке по умолчанию).
  const orderedFloors = [...floors].sort((a, b) => b - a)
  const activeIndex = orderedFloors.indexOf(selectedFloor)
  const hasPrevFloor = activeIndex > 0
  const hasNextFloor = activeIndex >= 0 && activeIndex < orderedFloors.length - 1
  const goPrevFloor = () => hasPrevFloor && setSelectedFloor(orderedFloors[activeIndex - 1])
  const goNextFloor = () => hasNextFloor && setSelectedFloor(orderedFloors[activeIndex + 1])

  return (
    <div
      className={`flex flex-col gap-4 ${
        fullscreen
          ? 'fixed inset-0 z-40 bg-[var(--fp-canvas)] p-4'
          : embedded
            ? 'h-[calc(100vh-216px)] min-h-[460px]'
            : 'min-h-0 flex-1'
      }`}
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
        {/* ── Left column: floors (top) + selected apartment (bottom) ── */}
        <div className="hidden min-h-0 flex-col gap-4 lg:flex">
          <FloorRail
            orderedFloors={orderedFloors}
            selectedFloor={selectedFloor}
            summaries={floorSummaries}
            onSelectFloor={setSelectedFloor}
          />
          {activeUnit && (
            <UnitDetailPanel
              unit={activeUnit}
              onOpen={() => setModalUnit(activeUnit)}
              onClose={() => setActiveUnitId(null)}
            />
          )}
        </div>

        {/* ── Center: floor plan ── */}
        <FloorPlanCanvas
          building={building}
          floor={selectedFloor}
          floorUnits={floorUnits}
          activeUnit={activeUnit}
          hoveredUnitId={hoveredUnitId}
          fullscreen={fullscreen}
          hasPrevFloor={hasPrevFloor}
          hasNextFloor={hasNextFloor}
          onPrevFloor={goPrevFloor}
          onNextFloor={goNextFloor}
          onToggleFullscreen={() => setFullscreen((v) => !v)}
          onHoverUnit={setHoveredUnitId}
          onActivateUnit={setActiveUnitId}
          onOpenUnit={setModalUnit}
        />
      </div>

      <UnitDetailModal
        isOpen={!!modalUnit}
        onClose={() => setModalUnit(null)}
        initialData={modalUnit}
        preferredBuildingId={buildingId}
      />
    </div>
  )
}

/* ──────────────────────────── Floor rail (11.2 / 11.6) ──────────────────────────── */

interface FloorRailProps {
  orderedFloors: number[]
  selectedFloor: number
  summaries: Map<number, ChessboardSummary>
  onSelectFloor: (floor: number) => void
}

function FloorRail({ orderedFloors, selectedFloor, summaries, onSelectFloor }: FloorRailProps) {
    const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const [scrollState, setScrollState] = useState({ up: false, down: false })

  const overflowing = orderedFloors.length > VISIBLE_FLOORS

  const measure = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      setScrollState({
        up: el.scrollTop > 1,
        down: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
      })
    }
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [measure, orderedFloors.length])

  // Активный этаж всегда виден.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
    measure()
  }, [selectedFloor, measure])

  const scrollBy = (dir: 1 | -1) => {
    scrollRef.current?.scrollBy({ top: dir * FLOOR_ROW_PITCH * (VISIBLE_FLOORS - 1), behavior: 'smooth' })
  }

  return (
    <section className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[6px] bg-[var(--fp-panel)] shadow-[inset_0_0_0_1px_var(--fp-ring)]">
      <header className="flex items-center justify-between px-4 py-2.5 shadow-[inset_0_-1px_0_var(--fp-line)]">
        <span className="text-[16px] font-medium uppercase tracking-[0.08em] text-[color:var(--fp-accent)]">{t('inventory.floorPlanMapView.этажи')}</span>
        <span className="text-[16px] tabular-nums text-[color:var(--fp-muted)]">{orderedFloors.length}</span>
      </header>

      {overflowing && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          disabled={!scrollState.up}
          className="flex h-7 items-center justify-center text-[color:var(--fp-icon)] transition-colors hover:bg-[var(--fp-hover-bg)] disabled:opacity-30"
          aria-label={t('inventory.floorPlanMapView.этажи_выше')}
        >
          <ChevronUp size={16} />
        </button>
      )}

      <div
        ref={scrollRef}
        onScroll={measure}
        className="min-h-0 overflow-y-auto px-2 py-1.5"
        style={overflowing ? { maxHeight: FLOOR_ROW_PITCH * VISIBLE_FLOORS + 12 } : undefined}
      >
        <div ref={listRef}>
          {orderedFloors.map((floor) => {
            const active = floor === selectedFloor
            const summary = summaries.get(floor)
            return (
              <button
                key={floor}
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => onSelectFloor(floor)}
                className={`mb-0.5 flex h-11 w-full items-center gap-2 rounded-[4px] px-2.5 text-left text-[16px] transition-colors ${
                  active
                    ? 'bg-[var(--fp-active-bg)] text-[color:var(--fp-strong)] shadow-[inset_0_0_0_1px_var(--fp-active-ring)]'
                    : 'text-[color:var(--fp-muted)] hover:bg-[var(--fp-hover-bg)]'
                }`}
              >
                <FloorGlyph active={active} />
                {floor} {t('inventory.floorPlanMapView.этаж')}<span className="ml-auto flex items-center gap-2.5">
                  {RAIL_STATUSES.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 text-[16px] tabular-nums text-[color:var(--fp-muted)]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: UNIT_STATUS_META[s].dot }} />
                      {summary?.[s] ?? 0}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {overflowing && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          disabled={!scrollState.down}
          className="flex h-7 items-center justify-center text-[color:var(--fp-icon)] transition-colors hover:bg-[var(--fp-hover-bg)] disabled:opacity-30"
          aria-label={t('inventory.floorPlanMapView.этажи_ниже')}
        >
          <ChevronDown size={16} />
        </button>
      )}
    </section>
  )
}

function FloorGlyph({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="16"
      viewBox="0 0 22 18"
      className={`shrink-0 ${active ? 'text-[color:var(--fp-accent)]' : 'text-[color:var(--fp-glyph)]'}`}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="20" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <line x1="8" y1="1" x2="8" y2="17" stroke="currentColor" strokeWidth="1" />
      <line x1="14" y1="1" x2="14" y2="17" stroke="currentColor" strokeWidth="1" />
      <line x1="8" y1="9" x2="22" y2="9" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/* ──────────────────────────── Floor plan canvas ──────────────────────────── */

interface CanvasProps {
  building: IBuilding
  floor: number
  floorUnits: IUnit[]
  activeUnit: IUnit | null
  hoveredUnitId: string | null
  fullscreen: boolean
  hasPrevFloor: boolean
  hasNextFloor: boolean
  onPrevFloor: () => void
  onNextFloor: () => void
  onToggleFullscreen: () => void
  onHoverUnit: (id: string | null) => void
  onActivateUnit: (id: string) => void
  onOpenUnit: (unit: IUnit) => void
}

function FloorPlanCanvas({
  building,
  floor,
  floorUnits,
  activeUnit,
  hoveredUnitId,
  fullscreen,
  hasPrevFloor,
  hasNextFloor,
  onPrevFloor,
  onNextFloor,
  onToggleFullscreen,
  onHoverUnit,
  onActivateUnit,
  onOpenUnit,
}: CanvasProps) {
    const { t } = useI18n();
  const floorPlans = useCoreStore((s) => s.floorPlans)
  const viewportRef = useRef<HTMLDivElement>(null)
  // true пока тянем план — чтобы клик после перетаскивания не выделял квартиру
  const draggedRef = useRef(false)

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [imageSize, setImageSize] = useState<LoadedImage | null>(null)
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 })

  const floorPlan = useMemo(
    () => floorPlans.find((p) => p.buildingId === building._id && p.floor === floor) ?? null,
    [floorPlans, building._id, floor],
  )

  const floorUnitIds = useMemo(() => new Set(floorUnits.map((u) => u._id)), [floorUnits])
  const polygons = useMemo(
    () => floorPlan?.polygons.filter((p) => floorUnitIds.has(p.unitId)) ?? [],
    [floorPlan, floorUnitIds],
  )
  const isInteractive = polygons.length > 0

  const fallbackUrl = useMemo(
    () => floorUnits.find((u) => u.floorPlanUrl)?.floorPlanUrl ?? building.floorPlanUrl ?? null,
    [floorUnits, building.floorPlanUrl],
  )
  const imageUrl = isInteractive ? floorPlan?.imageDataUrl ?? fallbackUrl : fallbackUrl ?? floorPlan?.imageDataUrl ?? null

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    resetView()
  }, [floor, building._id, resetView])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const update = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!imageUrl) return
    let active = true
    const image = new Image()
    image.onload = () => {
      if (!active) return
      setImageSize({ url: imageUrl, width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
    }
    image.src = imageUrl
    return () => {
      active = false
      image.onload = null
    }
  }, [imageUrl])

  const fitted = useMemo(() => {
    if (!imageSize || imageSize.url !== imageUrl || viewportSize.width === 0 || viewportSize.height === 0) return null
    const padding = 12
    const aw = Math.max(1, viewportSize.width - padding * 2)
    const ah = Math.max(1, viewportSize.height - padding * 2)
    const imageRatio = imageSize.width / imageSize.height
    if (aw / ah > imageRatio) return { width: ah * imageRatio, height: ah }
    return { width: aw, height: aw / imageRatio }
  }, [imageSize, imageUrl, viewportSize])

  // Ограничиваем сдвиг, чтобы план нельзя было «укатить» за пределы видимой области.
  const clampPan = useCallback(
    (px: number, py: number, z: number) => {
      if (!fitted) return { x: 0, y: 0 }
      const maxX = Math.max(0, (fitted.width * z - viewportSize.width) / 2)
      const maxY = Math.max(0, (fitted.height * z - viewportSize.height) / 2)
      return {
        x: Math.min(maxX, Math.max(-maxX, px)),
        y: Math.min(maxY, Math.max(-maxY, py)),
      }
    },
    [fitted, viewportSize],
  )

  const zoomBy = useCallback((factor: number) => {
    setZoom((c) => Math.min(6, Math.max(1, +(c * factor).toFixed(2))))
  }, [])

  // При изменении зума/размеров/плана держим сдвиг в допустимых границах.
  useEffect(() => {
    setPan((p) => clampPan(p.x, p.y, zoom))
  }, [zoom, clampPan])

  // Перетаскивание плана. Рука активна всегда и тянет из любой точки, включая квартиры.
  // Слушатели вешаем на window, чтобы драг не прерывался при выходе курсора за пределы плана.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const startX = e.clientX
      const startY = e.clientY
      const originX = pan.x
      const originY = pan.y
      draggedRef.current = false
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        if (!draggedRef.current && Math.hypot(dx, dy) < 4) return
        draggedRef.current = true
        setPan(clampPan(originX + dx, originY + dy, zoom))
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        // сбрасываем после клика, чтобы подавить выделение квартиры на отпускании драга
        window.setTimeout(() => { draggedRef.current = false }, 0)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [pan, zoom, clampPan],
  )

  return (
    <section className="relative flex min-h-0 flex-col overflow-hidden rounded-[6px] bg-[var(--fp-canvas)] shadow-[inset_0_0_0_1px_var(--fp-ring)]">
      <header className="flex items-center gap-3 px-4 py-3 shadow-[inset_0_-1px_0_var(--fp-line)]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevFloor}
            disabled={!hasPrevFloor}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[color:var(--fp-icon)] transition-colors hover:bg-[var(--fp-active-bg)] disabled:opacity-40"
            aria-label={t('inventory.floorPlanMapView.этаж_выше')}
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            onClick={onNextFloor}
            disabled={!hasNextFloor}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[color:var(--fp-icon)] transition-colors hover:bg-[var(--fp-active-bg)] disabled:opacity-40"
            aria-label={t('inventory.floorPlanMapView.этаж_ниже')}
          >
            <ChevronDown size={16} />
          </button>
        </div>
        <span className="text-[18px] font-medium text-[color:var(--fp-strong)]">{t('inventory.floorPlanMapView.этаж')}{floor}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.2)}
            disabled={zoom <= 1}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[color:var(--fp-icon)] transition-colors hover:bg-[var(--fp-active-bg)] disabled:opacity-40"
            aria-label={t('inventory.floorPlanMapView.уменьшить')}
          >
            <Minus size={16} />
          </button>
          <span className="min-w-14 text-center text-[16px] tabular-nums text-[color:var(--fp-strong)]">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => zoomBy(1.2)}
            disabled={zoom >= 6}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[color:var(--fp-icon)] transition-colors hover:bg-[var(--fp-active-bg)] disabled:opacity-40"
            aria-label={t('inventory.floorPlanMapView.увеличить')}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[color:var(--fp-icon)] transition-colors hover:bg-[var(--fp-active-bg)]"
            aria-label={t('inventory.floorPlanMapView.показать_план_целико')}
            title={t('inventory.floorPlanMapView.показать_план_целико')}
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[color:var(--fp-icon)] transition-colors hover:bg-[var(--fp-active-bg)]"
            aria-label={fullscreen ? 'Свернуть' : 'Во весь экран'}
            title={fullscreen ? 'Свернуть' : 'Во весь экран'}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        onPointerDown={handlePointerDown}
      >
        {imageUrl && fitted ? (
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: fitted.width,
              height: fitted.height,
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
              transformOrigin: 'center',
            }}
          >
            <img
              src={imageUrl}
              alt={`Поэтажный план, этаж ${floor}`}
              draggable={false}
              className="block h-full w-full select-none object-fill"
            />
            {isInteractive && (
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${fitted.width} ${fitted.height}`}
                preserveAspectRatio="none"
                aria-label={`Интерактивный план этажа ${floor}`}
              >
                {polygons.map((polygon) => {
                  const unit = floorUnits.find((u) => u._id === polygon.unitId)
                  if (!unit || polygon.points.length < 3) return null
                  const style = UNIT_STATUS_META[unit.status]
                  const isSelected = unit._id === activeUnit?._id
                  const isHovered = unit._id === hoveredUnitId
                  const cx = (polygon.points.reduce((s, [x]) => s + x, 0) / polygon.points.length) * fitted.width
                  const cy = (polygon.points.reduce((s, [, y]) => s + y, 0) / polygon.points.length) * fitted.height
                  return (
                    <g key={polygon.unitId}>
                      <polygon
                        points={polygon.points.map(([x, y]) => `${x * fitted.width},${y * fitted.height}`).join(' ')}
                        fill={style.fill}
                        stroke={isSelected ? '#fff0b8' : style.stroke}
                        strokeWidth={isSelected ? 4 : isHovered ? 3 : 2}
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                        onMouseEnter={() => onHoverUnit(unit._id)}
                        onMouseLeave={() => onHoverUnit(null)}
                        onClick={() => {
                          if (draggedRef.current) return
                          onActivateUnit(unit._id)
                        }}
                        onDoubleClick={() => onOpenUnit(unit)}
                        className="transition-opacity"
                        opacity={isHovered || isSelected ? 1 : 0.9}
                        style={{ filter: isSelected ? 'drop-shadow(0 0 5px rgba(230,195,100,0.9))' : undefined }}
                      />
                      {isHovered && (
                        <FloorPlanUnitHoverLabel
                          x={cx}
                          y={cy}
                          unit={unit}
                        />
                      )}
                    </g>
                  )
                })}
              </svg>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <LayoutTemplate size={48} className="text-[rgba(201,168,76,0.35)]" strokeWidth={1.25} />
            <p className="text-[16px] text-[color:var(--fp-muted)]">{t('inventory.floorPlanMapView.план_этажа')}{floor} {t('inventory.floorPlanMapView.не_загружен')}</p>
          </div>
        )}
      </div>
    </section>
  )
}

/* ──────────────────────────── Selected apartment (compact, под этажами) ──────────────────────────── */

function UnitDetailPanel({ unit, onOpen, onClose }: { unit: IUnit; onOpen: () => void; onClose: () => void }) {
    const { t } = useI18n();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const status = UNIT_STATUS_META[unit.status]
  const total = computeUnitTotalPrice(unit)
  const ceiling = unit.customFields?.['Потолки']
  return (
    <section className="flex shrink-0 flex-col overflow-hidden rounded-[6px] bg-[var(--fp-panel)] shadow-[inset_0_0_0_1px_var(--fp-ring)]">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--fp-line)]">
        <span className="flex items-center gap-2.5">
          <span className="text-[18px] font-medium text-[color:var(--fp-strong)]">{unit.number}</span>
          <span className="inline-flex items-center gap-1.5 text-[16px] text-[color:var(--fp-muted)]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.dot }} />
            {status.label}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-8 items-center justify-center rounded-[4px] text-[color:var(--fp-muted)] transition-colors hover:bg-[var(--fp-active-bg)] hover:text-[color:var(--fp-strong)]"
          aria-label={t('inventory.floorPlanMapView.закрыть')}
        >
          <X size={16} />
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-px px-4 pt-3">
        <Fact label={t('inventory.floorPlanMapView.тип')} value={optionLabel(t, 'rooms', compactRoomsLabel(unit.rooms)) || '—'} />
        <Fact label={t('inventory.floorPlanMapView.площадь')} value={formatArea(unit.area)} />
        <Fact label={t('inventory.floorPlanMapView.потолки')} value={ceiling != null ? String(ceiling) : '—'} />
        <Fact label={t('inventory.floorPlanMapView.вид')} value={unit.viewType ? optionLabel(t, 'views', unit.viewType) : '—'} />
      </dl>

      <div className="mt-3 flex items-end justify-between gap-3 bg-[var(--fp-price-bg)] px-4 py-2.5">
        <div>
          <div className="text-[16px] text-[color:var(--fp-muted)]">{t('inventory.floorPlanMapView.стоимость')}</div>
          <div className="text-[20px] text-[color:var(--fp-gold)]">{formatUsd(total, unit.currency)}</div>
        </div>
        <div className="text-right">
          <div className="text-[16px] text-[color:var(--fp-muted)]">{t('inventory.floorPlanMapView.цена_за_м')}</div>
          <div className="text-[18px] text-[color:var(--fp-mint)]">{formatUsd(unit.pricePerSqm, unit.currency)}</div>
        </div>
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-[#e6c364] text-[16px] font-medium text-[#072821] transition-colors hover:bg-[#e2c97e]"
        >
          <Maximize2 size={16} />
          {t('inventory.floorPlanMapView.открыть_планировку')}</button>
      </div>
    </section>
  )
}

function FloorPlanUnitHoverLabel({ x, y, unit }: { x: number; y: number; unit: IUnit }) {
  const { t } = useI18n()
  const details = [optionLabel(t, 'rooms', compactRoomsLabel(unit.rooms)), unit.area != null ? `${unit.area} м²` : null]
    .filter(Boolean)
    .join(' · ')
  const price = computeUnitTotalPrice(unit)
  const priceLabel = typeof price === 'number' ? formatUsd(price, unit.currency) : null
  const lineCount = 1 + (details ? 1 : 0) + (priceLabel ? 1 : 0)
  const boxWidth = 168
  const boxHeight = 12 + lineCount * 18 + 12

  return (
    <foreignObject
      x={x - boxWidth / 2}
      y={y - boxHeight / 2}
      width={boxWidth}
      height={boxHeight}
      style={{ pointerEvents: 'none', overflow: 'visible' }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          minHeight: boxHeight,
          padding: '6px 10px',
          borderRadius: 6,
          background: 'rgba(48,48,48,0.88)',
          color: '#ffffff',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{unit.number}</div>
        {details ? (
          <div style={{ fontSize: 14, lineHeight: 1.25, color: 'rgba(255,255,255,0.88)' }}>{details}</div>
        ) : null}
        {priceLabel ? (
          <div style={{ fontSize: 14, lineHeight: 1.25, color: 'rgba(255,255,255,0.88)' }}>{priceLabel}</div>
        ) : null}
      </div>
    </foreignObject>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--fp-fact-bg)] px-3 py-2">
      <div className="text-[16px] text-[color:var(--fp-muted)]">{label}</div>
      <div className="text-[16px] text-[color:var(--fp-strong)]">{value}</div>
    </div>
  )
}


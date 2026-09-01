import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LayoutTemplate, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react'

import { compactRoomsLabel } from '@/lib/chessboard'
import { optionLabel } from '@/lib/project-options'
import { useCoreStore } from '@/store/useCoreStore'
import type { IBuilding, IUnit } from '@/types/core'
import { useI18n } from "@/i18n";

const ALL_SECTIONS = '__all__'

const STATUS_STYLE: Record<IUnit['status'], { fill: string; stroke: string; label: string }> = {
  free: {
    fill: 'rgba(52,211,153,0.2)',
    stroke: '#34d399',
    label: 'В продаже',
  },
  booked: {
    fill: 'rgba(230,195,100,0.24)',
    stroke: '#e6c364',
    label: 'Бронь',
  },
  sold: {
    fill: 'rgba(255,99,99,0.2)',
    stroke: '#ff6b6b',
    label: 'Продано',
  },
  withdrawn: {
    fill: 'rgba(208,232,223,0.13)',
    stroke: '#b4ccc3',
    label: 'Снято',
  },
}

interface Props {
  building: IBuilding
  currentUnit: IUnit
  units: IUnit[]
  onOpenUnit: (unit: IUnit) => void
}

interface Size {
  width: number
  height: number
}

interface LoadedImageSize extends Size {
  url: string
}

export function UnitFloorNavigator({ building, currentUnit, units, onOpenUnit }: Props) {
    const { t } = useI18n();
  const floorPlans = useCoreStore((state) => state.floorPlans)
  const fetchBuildingPlans = useCoreStore((state) => state.fetchBuildingPlans)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const [selectedFloor, setSelectedFloor] = useState(currentUnit.floor)
  const [selectedSectionId, setSelectedSectionId] = useState(currentUnit.sectionId ?? ALL_SECTIONS)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [imageSize, setImageSize] = useState<LoadedImageSize | null>(null)
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 })
  const [loadedBuildingId, setLoadedBuildingId] = useState<string | null>(null)
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const movedRef = useRef(false)

  const buildingUnits = useMemo(
    () => units.filter((unit) => unit.building === building._id),
    [building._id, units],
  )

  const availableFloors = useMemo(() => {
    const floors = new Set<number>()
    buildingUnits.forEach((unit) => floors.add(unit.floor))
    floorPlans
      .filter((plan) => plan.buildingId === building._id)
      .forEach((plan) => floors.add(plan.floor))
    if (building.floors && building.floors > 0) {
      for (let floor = 1; floor <= building.floors; floor += 1) floors.add(floor)
    }
    return Array.from(floors).sort((a, b) => a - b)
  }, [building._id, building.floors, buildingUnits, floorPlans])

  const floorUnits = useMemo(
    () => buildingUnits.filter((unit) => unit.floor === selectedFloor),
    [buildingUnits, selectedFloor],
  )

  const sections = useMemo(() => {
    const byId = new Map<string, string>()
    floorUnits.forEach((unit) => {
      if (!unit.sectionId) return
      byId.set(unit.sectionId, unit.sectionName?.trim() || '')
    })
    return Array.from(byId, ([id, name], index) => ({
      id,
      label: name || `Секция ${index + 1}`,
    }))
  }, [floorUnits])

  const effectiveSectionId =
    selectedSectionId === ALL_SECTIONS ||
    sections.some((section) => section.id === selectedSectionId)
      ? selectedSectionId
      : ALL_SECTIONS

  const visibleUnits = useMemo(
    () =>
      effectiveSectionId === ALL_SECTIONS
        ? floorUnits
        : floorUnits.filter((unit) => unit.sectionId === effectiveSectionId),
    [effectiveSectionId, floorUnits],
  )

  const floorPlan = useMemo(
    () =>
      floorPlans.find(
        (plan) => plan.buildingId === building._id && plan.floor === selectedFloor,
      ) ?? null,
    [building._id, floorPlans, selectedFloor],
  )

  const fallbackPlanUrl = useMemo(() => {
    const sectionUnit =
      effectiveSectionId === ALL_SECTIONS
        ? null
        : floorUnits.find(
            (unit) => unit.sectionId === effectiveSectionId && unit.floorPlanUrl,
          )
    const currentFloorUnit =
      currentUnit.floor === selectedFloor && currentUnit.floorPlanUrl ? currentUnit : null
    return (
      sectionUnit?.floorPlanUrl ??
      currentFloorUnit?.floorPlanUrl ??
      visibleUnits.find((unit) => unit.floorPlanUrl)?.floorPlanUrl ??
      floorUnits.find((unit) => unit.floorPlanUrl)?.floorPlanUrl ??
      building.floorPlanUrl
    )
  }, [
    building.floorPlanUrl,
    currentUnit,
    floorUnits,
    selectedFloor,
    effectiveSectionId,
    visibleUnits,
  ])

  const floorUnitIds = useMemo(
    () => new Set(floorUnits.map((unit) => unit._id)),
    [floorUnits],
  )
  const polygons = useMemo(
    () => floorPlan?.polygons.filter((polygon) => floorUnitIds.has(polygon.unitId)) ?? [],
    [floorPlan, floorUnitIds],
  )
  const isInteractive = polygons.length > 0
  const imageUrl = isInteractive
    ? floorPlan?.imageDataUrl ?? fallbackPlanUrl ?? null
    : fallbackPlanUrl ?? floorPlan?.imageDataUrl ?? null
  const loading = loadedBuildingId !== building._id

  const floorIndex = availableFloors.indexOf(selectedFloor)
  const previousFloor = floorIndex > 0 ? availableFloors[floorIndex - 1] : null
  const nextFloor =
    floorIndex >= 0 && floorIndex < availableFloors.length - 1
      ? availableFloors[floorIndex + 1]
      : null

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const selectFloor = useCallback(
    (floor: number) => {
      setSelectedFloor(floor)
      resetView()
    },
    [resetView],
  )

  useEffect(() => {
    let active = true
    void fetchBuildingPlans(building._id).finally(() => {
      if (active) setLoadedBuildingId(building._id)
    })
    return () => {
      active = false
    }
  }, [building._id, fetchBuildingPlans])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const updateSize = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!imageUrl) return
    let active = true
    const image = new Image()
    image.onload = () => {
      if (!active) return
      setImageSize({
        url: imageUrl,
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      })
    }
    image.src = imageUrl
    return () => {
      active = false
      image.onload = null
    }
  }, [imageUrl])

  const fittedSize = useMemo(() => {
    if (
      !imageSize ||
      imageSize.url !== imageUrl ||
      viewportSize.width === 0 ||
      viewportSize.height === 0
    ) {
      return null
    }
    const padding = 28
    const availableWidth = Math.max(1, viewportSize.width - padding * 2)
    const availableHeight = Math.max(1, viewportSize.height - padding * 2)
    const imageRatio = imageSize.width / imageSize.height
    const viewportRatio = availableWidth / availableHeight
    if (viewportRatio > imageRatio) {
      return { width: availableHeight * imageRatio, height: availableHeight }
    }
    return { width: availableWidth, height: availableWidth / imageRatio }
  }, [imageSize, imageUrl, viewportSize])

  const zoomBy = useCallback((factor: number) => {
    setZoom((current) => Math.min(4, Math.max(1, +(current * factor).toFixed(2))))
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      movedRef.current = false
      if (zoom <= 1) return
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: pan.x,
        originY: pan.y,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [pan, zoom],
  )

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) {
      movedRef.current = true
    }
    setPan({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    })
  }, [])

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12)
  }, [zoomBy])

  const counts = useMemo(
    () => ({
      free: visibleUnits.filter((unit) => unit.status === 'free').length,
      booked: visibleUnits.filter((unit) => unit.status === 'booked').length,
      sold: visibleUnits.filter((unit) => unit.status === 'sold').length,
    }),
    [visibleUnits],
  )

  return (
    <div className="flex h-full min-h-[min(40vh,280px)] w-full flex-col lg:min-h-[min(62vh,560px)]">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 bg-[rgba(3,29,22,0.62)] px-4 py-2 shadow-[inset_0_-1px_0_rgba(201,168,76,0.12)]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={previousFloor === null}
            onClick={() => previousFloor !== null && selectFloor(previousFloor)}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[#d0e8df] transition-colors hover:bg-[#163824] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t('inventory.unitFloorNavigator.предыдущий_этаж')}
          >
            <ChevronLeft size={18} />
          </button>
          <select
            value={selectedFloor}
            onChange={(event) => selectFloor(Number(event.target.value))}
            className="h-8 min-w-28 cursor-pointer appearance-none rounded-[4px] bg-[#112d1c] px-3 text-center text-[16px] text-[#fcecc8] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.25)] outline-none focus:shadow-[inset_0_0_0_1px_#e6c364] [&::-ms-expand]:hidden"
            aria-label={t('inventory.unitFloorNavigator.выбрать_этаж')}
          >
            {availableFloors.map((floor) => (
              <option key={floor} value={floor}>
                {t('inventory.unitFloorNavigator.этаж')}{floor}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={nextFloor === null}
            onClick={() => nextFloor !== null && selectFloor(nextFloor)}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[#d0e8df] transition-colors hover:bg-[#163824] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t('inventory.unitFloorNavigator.следующий_этаж')}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {sections.length > 1 && (
          <select
            value={effectiveSectionId}
            onChange={(event) => {
              setSelectedSectionId(event.target.value)
              resetView()
            }}
            className="h-8 min-w-36 rounded-[4px] bg-[#112d1c] px-3 text-[16px] text-[#d0e8df] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)] outline-none focus:shadow-[inset_0_0_0_1px_#e6c364]"
            aria-label={t('inventory.unitFloorNavigator.выбрать_секцию')}
          >
            <option value={ALL_SECTIONS}>{t('inventory.unitFloorNavigator.все_секции')}</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        )}

        <div className="flex flex-wrap items-center gap-3 text-[16px] text-[rgba(255,255,255,0.72)]">
          <Legend color={STATUS_STYLE.free.stroke} label={`Свободно ${counts.free}`} />
          <Legend color={STATUS_STYLE.booked.stroke} label={`Бронь ${counts.booked}`} />
          <Legend color={STATUS_STYLE.sold.stroke} label={`Продано ${counts.sold}`} />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.2)}
            disabled={zoom <= 1}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[#d0e8df] transition-colors hover:bg-[#163824] disabled:opacity-40"
            aria-label={t('inventory.unitFloorNavigator.уменьшить')}
          >
            <Minus size={16} />
          </button>
          <span className="min-w-14 text-center text-[16px] tabular-nums text-[#fcecc8]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomBy(1.2)}
            disabled={zoom >= 4}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[#d0e8df] transition-colors hover:bg-[#163824] disabled:opacity-40"
            aria-label={t('inventory.unitFloorNavigator.увеличить')}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[#d0e8df] transition-colors hover:bg-[#163824]"
            aria-label={t('inventory.unitFloorNavigator.показать_план_целико')}
            title={t('inventory.unitFloorNavigator.показать_план_целико')}
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            disabled={!imageUrl}
            className="inline-flex size-8 items-center justify-center rounded-[4px] text-[#d0e8df] transition-colors hover:bg-[#163824] disabled:opacity-40"
            aria-label={t('inventory.unitFloorNavigator.открыть_план_на_весь')}
            title={t('inventory.unitFloorNavigator.открыть_план_на_весь')}
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`relative min-h-0 flex-1 overflow-hidden ${
          zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        {loading && !imageUrl ? (
          <div className="flex h-full items-center justify-center text-[16px] text-[rgba(255,255,255,0.72)]">
            {t('inventory.unitFloorNavigator.загрузка_поэтажных_п')}</div>
        ) : imageUrl ? (
          fittedSize ? (
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: fittedSize.width,
                height: fittedSize.height,
                transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
                transformOrigin: 'center',
              }}
            >
              <img
                src={imageUrl}
                alt={`Поэтажный план, этаж ${selectedFloor}`}
                draggable={false}
                onClick={() => {
                  if (!movedRef.current) setLightboxOpen(true)
                }}
                className="block h-full w-full cursor-zoom-in select-none object-fill"
              />

              {isInteractive && (
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${fittedSize.width} ${fittedSize.height}`}
                  preserveAspectRatio="none"
                  aria-label={`Интерактивный план этажа ${selectedFloor}`}
                >
                  <defs>
                    <pattern
                      id="floor-hatch-sold"
                      patternUnits="userSpaceOnUse"
                      width="9"
                      height="9"
                      patternTransform="rotate(45)"
                    >
                      <rect width="9" height="9" fill="rgba(255,99,99,0.18)" />
                      <line x1="0" y1="0" x2="0" y2="9" stroke="rgba(255,99,99,0.92)" strokeWidth="1.7" />
                    </pattern>
                    <pattern
                      id="floor-hatch-booked"
                      patternUnits="userSpaceOnUse"
                      width="9"
                      height="9"
                      patternTransform="rotate(45)"
                    >
                      <rect width="9" height="9" fill="rgba(230,195,100,0.2)" />
                      <line x1="0" y1="0" x2="0" y2="9" stroke="rgba(230,195,100,0.95)" strokeWidth="1.7" />
                    </pattern>
                  </defs>
                  {polygons.map((polygon) => {
                    const unit = floorUnits.find((item) => item._id === polygon.unitId)
                    if (!unit || polygon.points.length < 3) return null
                    const status = STATUS_STYLE[unit.status]
                    const isCurrent = unit._id === currentUnit._id
                    const isHovered = unit._id === hoveredUnitId
                    const inSection =
                      effectiveSectionId === ALL_SECTIONS || unit.sectionId === effectiveSectionId
                    const fill =
                      unit.status === 'sold'
                        ? 'url(#floor-hatch-sold)'
                        : unit.status === 'booked'
                          ? 'url(#floor-hatch-booked)'
                          : status.fill
                    const centerX =
                      (polygon.points.reduce((sum, [x]) => sum + x, 0) / polygon.points.length) *
                      fittedSize.width
                    const centerY =
                      (polygon.points.reduce((sum, [, y]) => sum + y, 0) / polygon.points.length) *
                      fittedSize.height

                    return (
                      <g key={polygon.unitId}>
                        <polygon
                          points={polygon.points
                            .map(([x, y]) => `${x * fittedSize.width},${y * fittedSize.height}`)
                            .join(' ')}
                          fill={fill}
                          stroke={isCurrent ? '#fff0b8' : status.stroke}
                          strokeWidth={isCurrent ? 4 : isHovered ? 3 : 2}
                          vectorEffect="non-scaling-stroke"
                          strokeLinejoin="round"
                          onPointerDown={(event) => event.stopPropagation()}
                          onMouseEnter={() => setHoveredUnitId(unit._id)}
                          onMouseLeave={() => setHoveredUnitId(null)}
                          onFocus={() => setHoveredUnitId(unit._id)}
                          onBlur={() => setHoveredUnitId(null)}
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenUnit(unit)
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return
                            event.preventDefault()
                            onOpenUnit(unit)
                          }}
                          className="cursor-pointer transition-opacity"
                          opacity={isHovered || isCurrent ? 1 : inSection ? 0.92 : 0.5}
                          role="button"
                          tabIndex={0}
                          aria-label={`Открыть лот ${unit.number}, ${status.label}`}
                          style={{
                            filter: isCurrent
                              ? 'drop-shadow(0 0 5px rgba(230,195,100,0.9))'
                              : undefined,
                          }}
                        />
                        {(isHovered || isCurrent) && (
                          <text
                            x={centerX}
                            y={centerY}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="14"
                            fontWeight="500"
                            fill="#ffffff"
                            stroke="rgba(3,29,22,0.9)"
                            strokeWidth="2.6"
                            paintOrder="stroke"
                            style={{ pointerEvents: 'none' }}
                          >
                            {unit.number}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </svg>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-[16px] text-[rgba(255,255,255,0.72)]">
              {t('inventory.unitFloorNavigator.загрузка_плана')}</div>
          )
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <LayoutTemplate
              size={48}
              className="text-[rgba(201,168,76,0.35)]"
              strokeWidth={1.25}
            />
            <p className="text-[16px] text-[rgba(255,255,255,0.72)]">
              {t('inventory.unitFloorNavigator.поэтажный_план_для_э')}{selectedFloor} {t('inventory.unitFloorNavigator.не_загружен')}</p>
          </div>
        )}

        {imageUrl && isInteractive && hoveredUnitId && (
          <UnitHoverLabel
            unit={floorUnits.find((unit) => unit._id === hoveredUnitId) ?? null}
          />
        )}
      </div>

      {lightboxOpen && imageUrl && (
        <FloorPlanLightbox
          imageUrl={imageUrl}
          floor={selectedFloor}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  )
}

function FloorPlanLightbox({
  imageUrl,
  floor,
  onClose,
}: {
  imageUrl: string
  floor: number
  onClose: () => void
}) {
    const { t } = useI18n();
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  )

  const reset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const zoomBy = useCallback((factor: number) => {
    setZoom((current) => Math.min(6, Math.max(1, +(current * factor).toFixed(2))))
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPan({ x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY })
  }
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col bg-[rgba(3,12,9,0.92)]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <div className="flex shrink-0 items-center gap-2 px-5 py-3">
        <span className="text-[16px] text-[#fcecc8]">{t('inventory.unitFloorNavigator.поэтажный_план_этаж')}{floor}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.2)}
            disabled={zoom <= 1}
            className="inline-flex size-9 items-center justify-center rounded-[4px] text-[#d0e8df] transition-colors hover:bg-[#163824] disabled:opacity-40"
            aria-label={t('inventory.unitFloorNavigator.уменьшить')}
          >
            <Minus size={18} />
          </button>
          <span className="min-w-14 text-center text-[16px] tabular-nums text-[#fcecc8]">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => zoomBy(1.2)}
            disabled={zoom >= 6}
            className="inline-flex size-9 items-center justify-center rounded-[4px] text-[#d0e8df] transition-colors hover:bg-[#163824] disabled:opacity-40"
            aria-label={t('inventory.unitFloorNavigator.увеличить')}
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex size-9 items-center justify-center rounded-[4px] text-[#d0e8df] transition-colors hover:bg-[#163824]"
            aria-label={t('inventory.unitFloorNavigator.сбросить_масштаб')}
            title={t('inventory.unitFloorNavigator.сбросить_масштаб')}
          >
            <RotateCcw size={17} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-[4px] text-[rgba(242,207,141,0.8)] transition-colors hover:bg-[#163824] hover:text-[#fcecc8]"
            aria-label={t('inventory.unitFloorNavigator.закрыть')}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(event) => zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12)}
      >
        <img
          src={imageUrl}
          alt={`Поэтажный план, этаж ${floor}`}
          draggable={false}
          className="absolute left-1/2 top-1/2 max-h-[88vh] max-w-[94vw] select-none object-contain"
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            transformOrigin: 'center',
          }}
        />
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

function UnitHoverLabel({ unit }: { unit: IUnit | null }) {
    const { t } = useI18n();
  if (!unit) return null
  const status = STATUS_STYLE[unit.status]
  return (
    <div className="pointer-events-none absolute left-4 top-4 max-w-[min(360px,calc(100%-2rem))] rounded-[6px] bg-[rgba(3,29,22,0.94)] px-4 py-3 text-[16px] text-[#ffffff] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.22)]">
      <div className="flex items-center gap-3">
        <span className="text-[18px] font-medium text-[#fcecc8]">{t('inventory.unitFloorNavigator.лот')}{unit.number}</span>
        <span className="inline-flex items-center gap-1.5 text-[rgba(255,255,255,0.72)]">
          <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: status.stroke }} />
          {status.label}
        </span>
      </div>
      <div className="mt-1 text-[rgba(255,255,255,0.72)]">
        {[optionLabel(t, 'rooms', compactRoomsLabel(unit.rooms)), unit.area != null ? `${unit.area} м²` : null]
          .filter(Boolean)
          .join(' · ')}
      </div>
    </div>
  )
}

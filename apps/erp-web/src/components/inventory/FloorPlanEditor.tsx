import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Eye, LayoutTemplate, Layers, Loader2, Minus, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCoreStore } from '@/store/useCoreStore'
import { compactRoomsLabel, findBuildingFloorType, floorTypeSize, listFloorsInType } from '@/lib/chessboard'
import { optionLabel } from '@/lib/project-options'
import { dataUrlToFile, isPdfFile, renderPdfToPngDataUrls } from '@/lib/pdf'
import type { IUnit } from '@/types/core'
import { useI18n } from "@/i18n";

const STATUS_FILL: Record<IUnit['status'], string> = {
  free: 'rgba(16,185,129,0.18)',
  booked: 'rgba(242,192,64,0.22)',
  sold: 'rgba(205,145,150,0.22)',
  withdrawn: 'rgba(100,116,139,0.18)',
}
const STATUS_STROKE: Record<IUnit['status'], string> = {
  free: 'rgba(52,211,153,0.9)',
  booked: 'rgba(247,218,106,0.95)',
  sold: 'rgba(215,165,170,0.85)',
  withdrawn: 'rgba(148,163,184,0.75)',
}
const STATUS_LABEL: Record<IUnit['status'], string> = {
  free: 'В продаже',
  booked: 'Бронь',
  sold: 'Продано',
  withdrawn: 'Снято',
}
const STATUS_CHIP: Record<IUnit['status'], string> = {
  free: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50',
  booked: 'bg-[#f2c040]/20 text-[#f7da6a] border-[#f7da6a]/50',
  sold: 'bg-rose-400/20 text-rose-200 border-rose-300/50',
  withdrawn: 'bg-slate-400/15 text-slate-300 border-slate-400/40',
}

const CANVAS_BASE = 880
const CLOSE_FRAC = 0.018
const TOOLTIP_W = 260

type Mode = 'view' | 'edit'
type DrawingTarget = { kind: 'unit' | 'place'; id: string } | null
type TooltipTarget = { kind: 'unit' | 'place'; id: string; x: number; y: number } | null

interface Props {
  initialBuildingId?: string
  initialFloor?: number
  fullscreen?: boolean
  highlightUnitId?: string
  defaultDrawingUnitId?: string
}

export function FloorPlanEditor({
  initialBuildingId,
  initialFloor,
  fullscreen = false,
  highlightUnitId,
  defaultDrawingUnitId,
}: Props) {
    const { t } = useI18n();
  const buildings = useCoreStore((s) => s.buildings)
  const allUnits = useCoreStore((s) => s.allUnits)
  const floorPlans = useCoreStore((s) => s.floorPlans)
  const setFloorPlanImage = useCoreStore((s) => s.setFloorPlanImage)
  const uploadFloorPlanImage = useCoreStore((s) => s.uploadFloorPlanImage)
  const fetchBuildingPlans = useCoreStore((s) => s.fetchBuildingPlans)
  const upsertFloorPlanPolygon = useCoreStore((s) => s.upsertFloorPlanPolygon)
  const removeFloorPlanPolygon = useCoreStore((s) => s.removeFloorPlanPolygon)
  const addFloorPlanPlace = useCoreStore((s) => s.addFloorPlanPlace)
  const upsertFloorPlanPlacePolygon = useCoreStore((s) => s.upsertFloorPlanPlacePolygon)
  const removeFloorPlanPlace = useCoreStore((s) => s.removeFloorPlanPlace)
  const upsertFloorPlanPolygonForType = useCoreStore((s) => s.upsertFloorPlanPolygonForType)
  const removeFloorPlanPolygonForType = useCoreStore((s) => s.removeFloorPlanPolygonForType)
  const saveUnitPlot = useCoreStore((s) => s.saveUnitPlot)
  const copyFloorPolygons = useCoreStore((s) => s.copyFloorPolygons)

  const [mode, setMode] = useState<Mode>(defaultDrawingUnitId ? 'edit' : 'view')
  const [desiredBuildingId, setDesiredBuildingId] = useState<string>(
    initialBuildingId ?? buildings[0]?._id ?? '',
  )
  const [selectedFloor, setSelectedFloor] = useState<number | null>(() => {
    if (initialFloor !== undefined && initialFloor !== null) return initialFloor
    const buildingId = initialBuildingId ?? buildings[0]?._id
    const building = buildings.find((b) => b._id === buildingId)
    if (building?.floors && building.floors > 0) return 1
    return null
  })
  const [zoom, setZoom] = useState(1)
  const [drawingTarget, setDrawingTarget] = useState<DrawingTarget>(
    defaultDrawingUnitId ? { kind: 'unit', id: defaultDrawingUnitId } : null,
  )
  const [currentPoints, setCurrentPoints] = useState<[number, number][]>([])
  const [alsoAssignIds, setAlsoAssignIds] = useState<Set<string>>(new Set())
  const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [tooltip, setTooltip] = useState<TooltipTarget>(null)
  const [applyToType, setApplyToType] = useState<boolean>(true)
  const [propagationToast, setPropagationToast] = useState<string | null>(null)
  const [layoutPreviewUnitId, setLayoutPreviewUnitId] = useState<string | null>(null)
  const [extraFloors, setExtraFloors] = useState<number[]>([])
  const [newFloorInput, setNewFloorInput] = useState<string>('')
  const [uploadStatus, setUploadStatus] = useState<{ state: 'uploading' | 'done' | 'error'; message: string } | null>(null)
  const [duplicateMenuOpen, setDuplicateMenuOpen] = useState(false)
  const [duplicateTargets, setDuplicateTargets] = useState<Set<number>>(new Set())
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const duplicateMenuRef = useRef<HTMLDivElement>(null)

  const selectedBuildingId = useMemo(() => {
    if (buildings.some((building) => building._id === desiredBuildingId)) return desiredBuildingId
    return buildings[0]?._id ?? ''
  }, [buildings, desiredBuildingId])

  const buildingUnits = useMemo(
    () => allUnits.filter((u) => u.building === selectedBuildingId),
    [allUnits, selectedBuildingId],
  )

  const getAvailableFloors = useCallback((buildingId: string) => {
    const existingPlanFloors = floorPlans
      .filter((fp) => fp.buildingId === buildingId)
      .map((fp) => fp.floor)
    const building = buildings.find((b) => b._id === buildingId)
    if (building?.floors && building.floors > 0) {
      return Array.from({ length: building.floors }, (_, i) => i + 1)
    }
    const seen = new Set<number>()
    allUnits.forEach((u) => {
      if (u.building === buildingId) seen.add(u.floor)
    })
    existingPlanFloors.forEach((floor) => seen.add(floor))
    return Array.from(seen).sort((a, b) => a - b)
  }, [allUnits, buildings, floorPlans])

  const availableFloors = useMemo(
    () => Array.from(new Set([...getAvailableFloors(selectedBuildingId), ...extraFloors])).sort((a, b) => a - b),
    [getAvailableFloors, selectedBuildingId, extraFloors],
  )

  const resetCanvasState = useCallback((options?: { clearImageSize?: boolean; clearTooltip?: boolean }) => {
    setDrawingTarget(null)
    setCurrentPoints([])
    setAlsoAssignIds(new Set())
    if (options?.clearImageSize ?? true) setImgSize(null)
    if (options?.clearTooltip ?? true) setTooltip(null)
  }, [])

  const lastBuildingIdRef = useRef(selectedBuildingId)
  if (lastBuildingIdRef.current !== selectedBuildingId) {
    lastBuildingIdRef.current = selectedBuildingId
    const fallbackFloor = getAvailableFloors(selectedBuildingId)[0] ?? null
    if (selectedFloor !== fallbackFloor) setSelectedFloor(fallbackFloor)
    setExtraFloors([])
    resetCanvasState()
  }

  // Load persisted floor plans (images + apartment polygons) for the selected building.
  useEffect(() => {
    if (selectedBuildingId) void fetchBuildingPlans(selectedBuildingId)
  }, [selectedBuildingId, fetchBuildingPlans])

  const floorPlan = useMemo(
    () =>
      selectedFloor !== null
        ? (floorPlans.find(
            (fp) => fp.buildingId === selectedBuildingId && fp.floor === selectedFloor,
          ) ?? null)
        : null,
    [floorPlans, selectedBuildingId, selectedFloor],
  )

  const floorUnits = useMemo(
    () =>
      selectedFloor !== null ? buildingUnits.filter((u) => u.floor === selectedFloor) : [],
    [buildingUnits, selectedFloor],
  )

  const layoutPreviewUnit = useMemo(
    () =>
      layoutPreviewUnitId ? floorUnits.find((u) => u._id === layoutPreviewUnitId) ?? null : null,
    [layoutPreviewUnitId, floorUnits],
  )

  const mappedUnitIds = useMemo(
    () => new Set(floorPlan?.polygons.map((p) => p.unitId) ?? []),
    [floorPlan],
  )

  const currentBuilding = useMemo(
    () => buildings.find((building) => building._id === selectedBuildingId) ?? null,
    [buildings, selectedBuildingId],
  )

  const currentFloorType = useMemo(
    () => (selectedFloor !== null ? findBuildingFloorType(currentBuilding, selectedFloor) : null),
    [currentBuilding, selectedFloor],
  )

  const currentFloorTypeSize = currentFloorType ? floorTypeSize(currentFloorType) : 0
  const isMultiFloorType = currentFloorTypeSize > 1
  const effectiveApplyToType = applyToType && isMultiFloorType

  // Авто-исчезновение тоста про propagation.
  useEffect(() => {
    if (!propagationToast) return
    const id = window.setTimeout(() => setPropagationToast(null), 2400)
    return () => window.clearTimeout(id)
  }, [propagationToast])

  // Успешный статус загрузки гаснет сам; ошибку оставляем до закрытия пользователем.
  useEffect(() => {
    if (uploadStatus?.state !== 'done') return
    const id = window.setTimeout(() => setUploadStatus(null), 3500)
    return () => window.clearTimeout(id)
  }, [uploadStatus])

  useEffect(() => {
    if (!currentBuilding?.floorPlanUrl || selectedFloor === null || floorPlan) return
    setFloorPlanImage(selectedBuildingId, selectedFloor, currentBuilding.floorPlanUrl)
  }, [currentBuilding?.floorPlanUrl, floorPlan, selectedBuildingId, selectedFloor, setFloorPlanImage])

  const fallbackFloorPlanUrl = currentBuilding?.floorPlanUrl ?? null

  const effectiveFloorPlan = useMemo(() => {
    if (floorPlan) return floorPlan
    if (selectedFloor !== null && fallbackFloorPlanUrl) {
      return {
        buildingId: selectedBuildingId,
        floor: selectedFloor,
        imageDataUrl: fallbackFloorPlanUrl,
        polygons: [],
        places: [],
      }
    }
    return null
  }, [fallbackFloorPlanUrl, floorPlan, selectedBuildingId, selectedFloor])

  const floorPlaces = useMemo(
    () => effectiveFloorPlan?.places ?? [],
    [effectiveFloorPlan],
  )

  const tooltipUnit = useMemo(
    () => (tooltip?.kind === 'unit' ? floorUnits.find((u) => u._id === tooltip.id) ?? null : null),
    [tooltip, floorUnits],
  )

  const tooltipPlace = useMemo(
    () => (tooltip?.kind === 'place' ? floorPlaces.find((place) => place.id === tooltip.id) ?? null : null),
    [tooltip, floorPlaces],
  )

  const handleFileUpload = useCallback(
    (file: File) => {
      if (!selectedBuildingId) return
      // Make sure we have a floor to attach the plan to — auto-add the typed one if needed.
      let targetFloor = selectedFloor
      if (targetFloor === null) {
        const parsed = Number.parseInt(newFloorInput, 10)
        if (Number.isFinite(parsed) && parsed > 0) {
          targetFloor = parsed
          setExtraFloors((prev) => (prev.includes(parsed) ? prev : [...prev, parsed]))
          setNewFloorInput('')
          setSelectedFloor(parsed)
        }
      }
      if (targetFloor === null) {
        setUploadStatus({ state: 'error', message: 'Сначала добавьте номер этажа' })
        return
      }
      const floor = targetFloor

      // PDF: рендерим страницы в картинки. Одна страница → текущий этаж;
      // многостраничный PDF раскладываем по этажам корпуса снизу вверх.
      if (isPdfFile(file)) {
        setUploadStatus({ state: 'uploading', message: 'Чтение PDF…' })
        void renderPdfToPngDataUrls(file, { maxPages: Math.max(1, availableFloors.length) })
          .then(async (pages) => {
            if (pages.length === 0) {
              setUploadStatus({ state: 'error', message: 'В PDF нет страниц' })
              return
            }
            if (pages.length === 1) {
              const imgFile = dataUrlToFile(pages[0], file.name.replace(/\.pdf$/i, '.png'))
              const result = await uploadFloorPlanImage(selectedBuildingId, floor, imgFile, effectiveApplyToType)
              setUploadStatus(
                result.persisted
                  ? { state: 'done', message: `План этажа ${floor} загружен и сохранён` }
                  : { state: 'error', message: result.error ? `Показан локально, не сохранён: ${result.error}` : 'Показан локально, не сохранён на сервере' },
              )
              return
            }
            const floorsAsc = availableFloors.length > 0 ? availableFloors : [floor]
            const count = Math.min(pages.length, floorsAsc.length)
            for (let i = 0; i < count; i += 1) {
              setFloorPlanImage(selectedBuildingId, floorsAsc[i], pages[i])
            }
            setSelectedFloor(floorsAsc[0])
            const tail = pages.length > count ? `, лишние страницы (${pages.length - count}) пропущены` : ''
            setUploadStatus({ state: 'done', message: `Загружено страниц: ${count} → этажи ${floorsAsc[0]}–${floorsAsc[count - 1]}${tail}` })
          })
          .catch((error) => {
            console.error('Failed to read PDF floor plan:', error)
            setUploadStatus({ state: 'error', message: 'Не удалось прочитать PDF' })
          })
        return
      }

      setUploadStatus({ state: 'uploading', message: `Загрузка плана этажа ${floor}…` })
      void uploadFloorPlanImage(selectedBuildingId, floor, file, effectiveApplyToType).then((result) => {
        if (result.persisted) {
          if (effectiveApplyToType && result.floors.length > 1) {
            setPropagationToast(`План применён к ${result.floors.length} этажам типа «${currentFloorType?.name ?? ''}»`)
          }
          setUploadStatus({ state: 'done', message: `План этажа ${floor} загружен и сохранён` })
        } else {
          setUploadStatus({
            state: 'error',
            message: result.error
              ? `Показан локально, но не сохранён: ${result.error}`
              : 'Показан локально, но не сохранён на сервере',
          })
        }
      })
    },
    [selectedBuildingId, selectedFloor, newFloorInput, uploadFloorPlanImage, effectiveApplyToType, currentFloorType, availableFloors, setFloorPlanImage],
  )

  const handleAddFloor = useCallback(() => {
    const parsed = Number.parseInt(newFloorInput, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    setExtraFloors((prev) => (prev.includes(parsed) ? prev : [...prev, parsed]))
    setNewFloorInput('')
    setSelectedFloor(parsed)
    resetCanvasState()
  }, [newFloorInput, resetCanvasState])

  const handleImgLoad = () => {
    if (imgRef.current) {
      const w = imgRef.current.naturalWidth || 1200
      const h = imgRef.current.naturalHeight || 800
      setImgSize({ w, h })
    }
  }

  const displayW = CANVAS_BASE * zoom
  const displayH = imgSize ? (imgSize.h / imgSize.w) * displayW : displayW * 0.6

  const persistUnitPolygon = useCallback(
    (unitId: string, points: [number, number][]) => {
      if (selectedFloor === null) return
      if (effectiveApplyToType) {
        const affected = upsertFloorPlanPolygonForType(selectedBuildingId, selectedFloor, unitId, points)
        if (affected.length > 1) {
          setPropagationToast(
            `Контур применён к ${affected.length} этажам типа «${currentFloorType?.name ?? ''}»`,
          )
        }
      } else {
        upsertFloorPlanPolygon(selectedBuildingId, selectedFloor, unitId, points)
      }
      // Persist the contour to this apartment's own record as soon as drawing completes.
      void saveUnitPlot(unitId, points)
    },
    [
      selectedFloor,
      selectedBuildingId,
      effectiveApplyToType,
      upsertFloorPlanPolygonForType,
      upsertFloorPlanPolygon,
      currentFloorType,
      saveUnitPlot,
    ],
  )

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (mode !== 'edit' || !drawingTarget || !imgSize || selectedFloor === null) return
      e.stopPropagation()
      const svgEl = e.currentTarget
      const rect = svgEl.getBoundingClientRect()
      const fx = (e.clientX - rect.left) / rect.width
      const fy = (e.clientY - rect.top) / rect.height

      setCurrentPoints((prev) => {
        if (prev.length >= 3) {
          const [fx0, fy0] = prev[0]
          if (Math.hypot(fx - fx0, fy - fy0) < CLOSE_FRAC) {
            if (drawingTarget.kind === 'unit') {
              persistUnitPolygon(drawingTarget.id, prev)
              alsoAssignIds.forEach((uid) => {
                if (uid !== drawingTarget.id) {
                  persistUnitPolygon(uid, prev)
                }
              })
            } else {
              upsertFloorPlanPlacePolygon(selectedBuildingId, selectedFloor, drawingTarget.id, prev)
            }
            setDrawingTarget(null)
            setAlsoAssignIds(new Set())
            return []
          }
        }
        return [...prev, [fx, fy]]
      })
    },
    [mode, drawingTarget, imgSize, selectedFloor, selectedBuildingId, alsoAssignIds, persistUnitPolygon, upsertFloorPlanPlacePolygon],
  )

  const handlePolygonClick = useCallback(
    (e: React.MouseEvent<SVGPolygonElement>, kind: 'unit' | 'place', id: string) => {
      if (mode !== 'view') return
      e.stopPropagation()
      const wrap = canvasWrapRef.current
      if (!wrap) return
      const rect = wrap.getBoundingClientRect()
      const x = e.clientX - rect.left + wrap.scrollLeft
      const y = e.clientY - rect.top + wrap.scrollTop
      setTooltip({ kind, id, x, y })
    },
    [mode],
  )

  const finishDrawing = useCallback(() => {
    if (!drawingTarget || selectedFloor === null) return
    setCurrentPoints((prev) => {
      if (prev.length >= 3) {
        if (drawingTarget.kind === 'unit') {
          persistUnitPolygon(drawingTarget.id, prev)
          alsoAssignIds.forEach((uid) => {
            if (uid !== drawingTarget.id) {
              persistUnitPolygon(uid, prev)
            }
          })
        } else {
          upsertFloorPlanPlacePolygon(selectedBuildingId, selectedFloor, drawingTarget.id, prev)
        }
        setDrawingTarget(null)
        setAlsoAssignIds(new Set())
        return []
      }
      return prev
    })
  }, [drawingTarget, selectedFloor, selectedBuildingId, alsoAssignIds, persistUnitPolygon, upsertFloorPlanPlacePolygon])

  const cancelDrawing = useCallback(() => {
    setDrawingTarget(null)
    setCurrentPoints([])
    setAlsoAssignIds(new Set())
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrawing()
        setTooltip(null)
      }
      if (e.key === 'Enter') finishDrawing()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cancelDrawing, finishDrawing])

  const canvasMaxHeight = fullscreen ? 'calc(100vh - 190px)' : '70vh'

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 0.1 : -0.1
    setZoom((z) => Math.min(8, Math.max(0.1, +( z + delta).toFixed(2))))
  }, [])

  const handleBuildingSelect = useCallback((buildingId: string) => {
    setDesiredBuildingId(buildingId)
    setSelectedFloor(getAvailableFloors(buildingId)[0] ?? null)
    setExtraFloors([])
    resetCanvasState()
  }, [getAvailableFloors, resetCanvasState])

  const handleFloorSelect = useCallback((floor: number) => {
    setSelectedFloor(floor)
    resetCanvasState()
  }, [resetCanvasState])

  const handleModeSelect = useCallback((nextMode: Mode) => {
    setMode(nextMode)
    if (nextMode === 'view') {
      resetCanvasState({ clearImageSize: false, clearTooltip: false })
      return
    }
    setTooltip(null)
  }, [resetCanvasState])

  const duplicateCandidateFloors = useMemo(
    () => availableFloors.filter((f) => f !== selectedFloor),
    [availableFloors, selectedFloor],
  )

  const openDuplicateMenu = useCallback(() => {
    setDuplicateTargets(new Set())
    setDuplicateMenuOpen(true)
  }, [])

  const toggleDuplicateTarget = useCallback((floor: number) => {
    setDuplicateTargets((prev) => {
      const next = new Set(prev)
      if (next.has(floor)) next.delete(floor)
      else next.add(floor)
      return next
    })
  }, [])

  const selectAllDuplicateTargets = useCallback(() => {
    setDuplicateTargets(new Set(duplicateCandidateFloors))
  }, [duplicateCandidateFloors])

  const selectSameTypeDuplicateTargets = useCallback(() => {
    if (!currentFloorType) return
    const sameType = new Set(listFloorsInType(currentFloorType).filter((f) => f !== selectedFloor))
    setDuplicateTargets(sameType)
  }, [currentFloorType, selectedFloor])

  const clearDuplicateTargets = useCallback(() => {
    setDuplicateTargets(new Set())
  }, [])

  useEffect(() => {
    if (!duplicateMenuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (duplicateMenuRef.current && !duplicateMenuRef.current.contains(event.target as Node)) {
        setDuplicateMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [duplicateMenuOpen])

  const handleDuplicate = useCallback(async () => {
    if (selectedFloor === null || !effectiveFloorPlan) return
    const toFloors = Array.from(duplicateTargets).sort((a, b) => a - b)
    if (toFloors.length === 0) return
    await fetchBuildingPlans(selectedBuildingId)
    await copyFloorPolygons(selectedBuildingId, selectedFloor, toFloors)
    const n = toFloors.length
    const label = n === 1 ? 'этаж' : n < 5 ? 'этажа' : 'этажей'
    setPropagationToast(`Контуры скопированы на ${n} ${label}`)
    setDuplicateMenuOpen(false)
    setDuplicateTargets(new Set())
  }, [
    copyFloorPolygons,
    duplicateTargets,
    effectiveFloorPlan,
    fetchBuildingPlans,
    selectedBuildingId,
    selectedFloor,
  ])

  if (buildings.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[rgba(242,207,141,0.5)]">
        {t('inventory.floorPlanEditor.нет_корпусов_для_ото')}</div>
    )
  }

  const isEdit = mode === 'edit'

  return (
    <div className={`flex gap-4 ${fullscreen ? 'h-full' : 'min-h-[480px]'}`}>
      {/* Left panel */}
      <div className="w-56 shrink-0 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <select
            className="h-8 rounded-lg border border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.3)] px-2 text-xs text-[rgba(242,207,141,0.9)] outline-none focus:border-[rgba(242,207,141,0.45)]"
            value={selectedBuildingId}
            onChange={(e) => handleBuildingSelect(e.target.value)}
          >
            {buildings.map((b) => (
              <option key={b._id} value={b._id} className="bg-[#1a1510]">
                {b.name}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-1">
            {availableFloors.map((f) => {
              const hasPlan = floorPlans.some(
                (fp) => fp.buildingId === selectedBuildingId && fp.floor === f,
              )
              const active = selectedFloor === f
              const inSameType =
                !active &&
                currentFloorType !== null &&
                f >= currentFloorType.rangeFrom &&
                f <= currentFloorType.rangeTo
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => handleFloorSelect(f)}
                  title={
                    inSameType
                      ? `Тот же тип этажа («${currentFloorType?.name ?? ''}»)`
                      : undefined
                  }
                  className={`h-7 min-w-[2rem] rounded px-2 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[#c9a84c] text-[#0a1f12]'
                      : inSameType
                        ? 'border border-[#c9a84c]/30 bg-[rgba(201,168,76,0.05)] text-[rgba(242,207,141,0.7)] hover:bg-[rgba(201,168,76,0.12)]'
                        : hasPlan
                          ? 'border border-[#c9a84c]/40 bg-[rgba(201,168,76,0.08)] text-[rgba(242,207,141,0.8)] hover:bg-[rgba(201,168,76,0.15)]'
                          : 'border border-[rgba(242,207,141,0.15)] bg-transparent text-[rgba(242,207,141,0.4)] hover:border-[rgba(242,207,141,0.3)] hover:text-[rgba(242,207,141,0.8)]'
                  }`}
                >
                  {f}
                </button>
              )
            })}
          </div>

          {availableFloors.length === 0 && (
            <p className="text-[11px] leading-snug text-[rgba(242,207,141,0.4)]">
              {t('inventory.floorPlanEditor.этажи_не_заданы_доба')}</p>
          )}

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={newFloorInput}
              onChange={(e) => setNewFloorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddFloor()
                }
              }}
              placeholder={t('inventory.floorPlanEditor.этажа')}
              className="h-7 w-full rounded border border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.3)] px-2 text-xs text-[rgba(242,207,141,0.9)] outline-none placeholder:text-[rgba(242,207,141,0.35)] focus:border-[rgba(242,207,141,0.45)]"
            />
            <button
              type="button"
              onClick={handleAddFloor}
              disabled={!newFloorInput.trim()}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-[#c9a84c]/40 bg-[rgba(201,168,76,0.12)] px-2 text-[11px] font-medium text-[#e2c97e] transition-colors hover:bg-[rgba(201,168,76,0.22)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={12} />
              {t('inventory.floorPlanEditor.этаж')}</button>
          </div>

          {currentFloorType && (
            <div className="rounded-md border border-[#c9a84c]/30 bg-[rgba(201,168,76,0.06)] px-2.5 py-2 text-[11px] text-[rgba(242,207,141,0.78)]">
              <div className="mb-1 flex items-center gap-1.5 text-[#fcecc8]">
                <Layers size={11} className="text-[#c9a84c]" />
                <span className="font-normal">{t('inventory.floorPlanEditor.тип_этажа')}{currentFloorType.name}</span>
              </div>
              <p className="leading-snug text-[rgba(242,207,141,0.55)]">
                {t('inventory.floorPlanEditor.этажи')}{currentFloorType.rangeFrom}–{currentFloorType.rangeTo}
                {' · '}
                {currentFloorTypeSize} {currentFloorTypeSize === 1 ? 'этаж' : 'этажей'}
              </p>
              {isMultiFloorType && isEdit && (
                <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-[rgba(242,207,141,0.85)]">
                  <input
                    type="checkbox"
                    checked={applyToType}
                    onChange={(e) => setApplyToType(e.target.checked)}
                    className="accent-[#c9a84c]"
                  />
                  <Copy size={10} className="text-[#c9a84c]" />
                  {t('inventory.floorPlanEditor.применять_ко_всем_эт')}</label>
              )}
            </div>
          )}
        </div>

        {/* Unit list */}
        <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: fullscreen ? 'calc(100vh - 260px)' : '52vh' }}>
          <p className="mb-0.5 text-[10px] font-normal uppercase tracking-wide text-[rgba(242,207,141,0.4)]">
            {t('inventory.floorPlanEditor.лоты_этажа')}{selectedFloor ?? '—'}
          </p>
          {floorUnits.length === 0 && (
            <p className="text-xs text-[rgba(242,207,141,0.3)]">{t('inventory.floorPlanEditor.нет_лотов')}</p>
          )}
          {floorUnits.map((unit) => {
            const isMapped = mappedUnitIds.has(unit._id)
            const isDrawing = drawingTarget?.kind === 'unit' && drawingTarget.id === unit._id
            const isHighlighted = highlightUnitId === unit._id
            const isAlso = alsoAssignIds.has(unit._id)
            const inDrawingMode = isEdit && drawingTarget?.kind === 'unit' && !isDrawing
            return (
              <div
                key={unit._id}
                className={`flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
                  isDrawing
                    ? 'bg-[rgba(201,168,76,0.18)] ring-1 ring-[#c9a84c]'
                    : isAlso
                      ? 'bg-[rgba(201,168,76,0.08)] ring-1 ring-[#c9a84c]/40'
                      : isHighlighted
                        ? 'bg-[rgba(201,168,76,0.1)] ring-1 ring-[#c9a84c]/50'
                        : 'hover:bg-[rgba(242,207,141,0.05)]'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  {inDrawingMode ? (
                    <label className="flex min-w-0 cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={isAlso}
                        onChange={(e) => {
                          setAlsoAssignIds((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(unit._id)
                            else next.delete(unit._id)
                            return next
                          })
                        }}
                        className="accent-[#c9a84c]"
                      />
                      <span
                        className={
                          isMapped ? 'truncate text-[rgba(242,207,141,0.45)] line-through' : 'truncate text-[#fcecc8]'
                        }
                      >
                        {unit.number}
                      </span>
                    </label>
                  ) : (
                    <span
                      className={
                        isMapped
                          ? isEdit
                            ? 'min-w-0 truncate text-[rgba(242,207,141,0.45)] line-through'
                            : 'min-w-0 truncate text-[#fcecc8]'
                          : isHighlighted
                            ? 'min-w-0 truncate font-normal text-[#fcecc8]'
                            : 'min-w-0 truncate text-[#fcecc8]'
                      }
                    >
                      {unit.number}
                    </span>
                  )}
                  <button
                    type="button"
                    title={t('inventory.floorPlanEditor.планировка_и_парамет')}
                    aria-label={`Показать планировку: ${unit.number}`}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setLayoutPreviewUnitId(unit._id)
                    }}
                    className="shrink-0 rounded-md border border-[rgba(242,207,141,0.22)] bg-[rgba(0,0,0,0.28)] p-1 text-[rgba(242,207,141,0.55)] transition-colors hover:border-[rgba(242,207,141,0.45)] hover:text-[#fcecc8]"
                  >
                    <Eye size={12} strokeWidth={2.25} />
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isEdit && isMapped && !inDrawingMode && (
                    <button
                      type="button"
                      title={effectiveApplyToType
                        ? `Удалить контур во всех этажах типа «${currentFloorType?.name ?? ''}»`
                        : 'Удалить контур'}
                      onClick={() => {
                        if (selectedFloor === null) return
                        if (effectiveApplyToType) {
                          const affected = removeFloorPlanPolygonForType(selectedBuildingId, selectedFloor, unit._id)
                          if (affected.length > 1) {
                            setPropagationToast(
                              `Контур удалён на ${affected.length} этажах типа «${currentFloorType?.name ?? ''}»`,
                            )
                          }
                        } else {
                          removeFloorPlanPolygon(selectedBuildingId, selectedFloor, unit._id)
                        }
                        void saveUnitPlot(unit._id, [])
                      }}
                      className="rounded p-0.5 text-[rgba(242,207,141,0.35)] hover:text-rose-300 transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                  {isEdit && !inDrawingMode && (
                    <button
                      type="button"
                      disabled={!floorPlan}
                      onClick={() => {
                        if (isDrawing) {
                          cancelDrawing()
                        } else {
                          setDrawingTarget({ kind: 'unit', id: unit._id })
                          setCurrentPoints([])
                          setAlsoAssignIds(new Set())
                        }
                      }}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                        isDrawing
                          ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                          : 'bg-[rgba(201,168,76,0.15)] text-[#c9a84c] hover:bg-[rgba(201,168,76,0.25)]'
                      }`}
                    >
                      {isDrawing ? 'Отмена' : isMapped ? 'Перерис.' : 'Обрисовать'}
                    </button>
                  )}
                  {!isEdit && isMapped && (
                    <span className="text-[9px] font-medium text-[#c9a84c]/80">{t('inventory.floorPlanEditor.обрисована')}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <Dialog
          open={layoutPreviewUnitId !== null}
          onOpenChange={(open) => {
            if (!open) setLayoutPreviewUnitId(null)
          }}
        >
          <DialogContent
            showCloseButton
            className="max-h-[min(90vh,640px)] max-w-[min(calc(100vw-2rem),28rem)] gap-4 overflow-y-auto border-[rgba(242,207,141,0.22)] bg-[#0f1f14] p-5 text-[#fcecc8] shadow-2xl sm:max-w-[min(calc(100vw-2rem),28rem)]"
          >
            {layoutPreviewUnit ? (
              <>
                <DialogHeader className="gap-1.5 text-left">
                  <DialogTitle className="text-base font-normal text-[#fcecc8]">
                    {t('inventory.floorPlanEditor.лот')}{layoutPreviewUnit.number}
                  </DialogTitle>
                  <DialogDescription className="text-left text-xs leading-relaxed text-[rgba(242,207,141,0.55)]">
                    {t('inventory.floorPlanEditor.планировка_и_ключевы')}</DialogDescription>
                </DialogHeader>
                <div className="overflow-hidden rounded-xl border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.35)]">
                  {layoutPreviewUnit.layoutImageUrl ? (
                    <img
                      src={layoutPreviewUnit.layoutImageUrl}
                      alt={`Планировка ${layoutPreviewUnit.number}`}
                      className="mx-auto max-h-[min(52vh,400px)] w-full object-contain p-3"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                      <LayoutTemplate className="size-11 text-[rgba(242,207,141,0.22)]" strokeWidth={1.25} />
                      <p className="max-w-[16rem] text-xs leading-relaxed text-[rgba(242,207,141,0.45)]">
                        {t('inventory.floorPlanEditor.файла_планировки_нет')}</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-[rgba(242,207,141,0.1)] pt-3">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[layoutPreviewUnit.status]}`}
                  >
                    {STATUS_LABEL[layoutPreviewUnit.status]}
                  </span>
                  {layoutPreviewUnit.rooms ? (
                    <span className="rounded-md border border-[rgba(242,207,141,0.2)] px-2 py-0.5 text-[11px] text-[rgba(242,207,141,0.85)]">
                      {optionLabel(t, 'rooms', compactRoomsLabel(layoutPreviewUnit.rooms))}
                    </span>
                  ) : null}
                  {layoutPreviewUnit.area != null ? (
                    <span className="rounded-md border border-[rgba(242,207,141,0.2)] px-2 py-0.5 text-[11px] tabular-nums text-[rgba(242,207,141,0.85)]">
                      {layoutPreviewUnit.area} {t('inventory.floorPlanEditor.м')}</span>
                  ) : null}
                  {layoutPreviewUnit.viewType ? (
                    <span className="rounded-md border border-[rgba(242,207,141,0.2)] px-2 py-0.5 text-[11px] text-[rgba(242,207,141,0.75)]">
                      {t('inventory.floorPlanEditor.вид')}{optionLabel(t, 'views', layoutPreviewUnit.viewType)}
                    </span>
                  ) : null}
                  {layoutPreviewUnit.positionInFloor != null ? (
                    <span className="rounded-md border border-[rgba(242,207,141,0.2)] px-2 py-0.5 text-[11px] tabular-nums text-[rgba(242,207,141,0.65)]">
                      {t('inventory.floorPlanEditor.поз_на_этаже')}{layoutPreviewUnit.positionInFloor}
                    </span>
                  ) : null}
                  <span className="rounded-md border border-[rgba(242,207,141,0.2)] px-2 py-0.5 text-[11px] tabular-nums text-[rgba(242,207,141,0.65)]">
                    {t('inventory.floorPlanEditor.этаж')}{layoutPreviewUnit.floor}
                  </span>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        <div className="flex flex-col gap-1 overflow-y-auto">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <p className="text-[10px] font-normal uppercase tracking-wide text-[rgba(242,207,141,0.4)]">
              {t('inventory.floorPlanEditor.места')}</p>
            {isEdit && selectedFloor !== null && (
              <button
                type="button"
                onClick={() => {
                  const placeId = addFloorPlanPlace(selectedBuildingId, selectedFloor)
                  setDrawingTarget({ kind: 'place', id: placeId })
                  setCurrentPoints([])
                  setAlsoAssignIds(new Set())
                }}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[#c9a84c] transition-colors hover:bg-[rgba(201,168,76,0.15)]"
              >
                {t('inventory.floorPlanEditor.место')}</button>
            )}
          </div>
          {floorPlaces.length === 0 && (
            <p className="text-xs text-[rgba(242,207,141,0.3)]">{t('inventory.floorPlanEditor.нет_мест')}</p>
          )}
          {floorPlaces.map((place) => {
            const isDrawing = drawingTarget?.kind === 'place' && drawingTarget.id === place.id
            const isMapped = place.points.length >= 3
            return (
              <div
                key={place.id}
                className={`flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-xs transition-colors ${
                  isDrawing
                    ? 'bg-[rgba(92,214,171,0.16)] ring-1 ring-[#5cd6ab]'
                    : 'hover:bg-[rgba(242,207,141,0.05)]'
                }`}
              >
                <span className={isMapped ? 'text-[#dffcf3]' : 'text-[rgba(223,252,243,0.65)]'}>
                  {place.label}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {isEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isDrawing) cancelDrawing()
                        else {
                          setDrawingTarget({ kind: 'place', id: place.id })
                          setCurrentPoints([])
                          setAlsoAssignIds(new Set())
                        }
                      }}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                        isDrawing
                          ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                          : 'bg-[rgba(92,214,171,0.16)] text-[#88f0cc] hover:bg-[rgba(92,214,171,0.24)]'
                      }`}
                    >
                      {isDrawing ? 'Отмена' : isMapped ? 'Перерис.' : 'Обрисовать'}
                    </button>
                  )}
                  {isEdit && (
                    <button
                      type="button"
                      title={t('inventory.floorPlanEditor.удалить_место')}
                      onClick={() => removeFloorPlanPlace(selectedBuildingId, selectedFloor!, place.id)}
                      className="rounded p-0.5 text-[rgba(242,207,141,0.35)] transition-colors hover:text-rose-300"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {isEdit && drawingTarget && (
          <div className="rounded-md border border-[#c9a84c]/40 bg-[rgba(201,168,76,0.08)] px-3 py-2.5 text-[11px]">
            <p className="font-normal text-[#e2c97e] mb-1">{t('inventory.floorPlanEditor.режим_обрисовки')}</p>
            <p className="text-[rgba(242,207,141,0.55)] leading-relaxed">
              {t('inventory.floorPlanEditor.кликайте_по_плану_до')}</p>
            <p className="mt-1.5 text-[rgba(242,207,141,0.4)]">
              {drawingTarget.kind === 'unit' ? 'Объект: квартира' : 'Объект: место'}
              <span className="mx-1">·</span>
              {t('inventory.floorPlanEditor.точек')}{currentPoints.length}
              {drawingTarget.kind === 'unit' && alsoAssignIds.size > 0 && (
                <span className="ml-2 text-[#c9a84c]">{t('inventory.floorPlanEditor.ещ')}{alsoAssignIds.size} {t('inventory.floorPlanEditor.кв')}</span>
              )}
            </p>
            {currentPoints.length >= 3 && (
              <button
                type="button"
                onClick={finishDrawing}
                className="mt-2 w-full rounded bg-[rgba(201,168,76,0.2)] py-1 text-[11px] font-medium text-[#e2c97e] hover:bg-[rgba(201,168,76,0.3)] transition-colors"
              >
                {t('inventory.floorPlanEditor.замкнуть_контур_ente')}</button>
            )}
          </div>
        )}
      </div>

      {/* Main canvas */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center rounded-lg border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.25)] p-0.5">
            <button
              type="button"
              onClick={() => handleModeSelect('view')}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                mode === 'view'
                  ? 'bg-[rgba(201,168,76,0.2)] text-[#fcecc8]'
                  : 'text-[rgba(242,207,141,0.55)] hover:text-[#fcecc8]'
              }`}
            >
              <Eye size={12} />
              {t('inventory.floorPlanEditor.просмотр')}</button>
            <button
              type="button"
              onClick={() => handleModeSelect('edit')}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                mode === 'edit'
                  ? 'bg-[rgba(201,168,76,0.2)] text-[#fcecc8]'
                  : 'text-[rgba(242,207,141,0.55)] hover:text-[#fcecc8]'
              }`}
            >
              <Pencil size={12} />
              {t('inventory.floorPlanEditor.редактирование')}</button>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.25)] px-2 py-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.1, +(z - 0.25).toFixed(2)))}
              className="rounded p-0.5 text-[rgba(242,207,141,0.55)] hover:text-[#fcecc8] transition-colors"
            >
              <Minus size={13} />
            </button>
            <span className="min-w-[3rem] text-center text-xs text-[rgba(242,207,141,0.75)]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(8, +(z + 0.25).toFixed(2)))}
              className="rounded p-0.5 text-[rgba(242,207,141,0.55)] hover:text-[#fcecc8] transition-colors"
            >
              <Plus size={13} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="text-xs text-[rgba(242,207,141,0.4)] hover:text-[rgba(242,207,141,0.8)] transition-colors"
          >
            100%
          </button>
          {effectiveFloorPlan && effectiveFloorPlan.polygons.length > 0 && availableFloors.length > 1 && (
            <div className="relative" ref={duplicateMenuRef}>
              <button
                type="button"
                onClick={() => (duplicateMenuOpen ? setDuplicateMenuOpen(false) : openDuplicateMenu())}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-base font-normal transition-colors ${
                  duplicateMenuOpen
                    ? 'border-[#c9a84c]/50 bg-[rgba(201,168,76,0.15)] text-[#fcecc8]'
                    : 'border-[rgba(242,207,141,0.25)] bg-transparent text-[rgba(242,207,141,0.85)] hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8]'
                }`}
              >
                <Copy size={12} />
                {t('inventory.floorPlanEditor.дублировать')}</button>

              {duplicateMenuOpen && (
                <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-72 rounded-lg border border-[rgba(242,207,141,0.25)] bg-[#14100a] p-3 shadow-2xl">
                  <p className="mb-2 text-base font-normal uppercase tracking-wide text-[rgba(242,207,141,0.4)]">
                    {t('inventory.floorPlanEditor.дублировать_на_этажи')}
                  </p>

                  <div className="mb-2 flex flex-wrap gap-1.5 text-base">
                    <button
                      type="button"
                      onClick={selectAllDuplicateTargets}
                      className="rounded border border-[#c9a84c]/30 bg-[rgba(201,168,76,0.08)] px-2 py-1 text-[rgba(242,207,141,0.75)] transition-colors hover:bg-[rgba(201,168,76,0.16)]"
                    >
                      {t('inventory.floorPlanEditor.все_этажи')}
                    </button>
                    {currentFloorType && isMultiFloorType && (
                      <button
                        type="button"
                        onClick={selectSameTypeDuplicateTargets}
                        className="rounded border border-[#c9a84c]/30 bg-[rgba(201,168,76,0.08)] px-2 py-1 text-[rgba(242,207,141,0.75)] transition-colors hover:bg-[rgba(201,168,76,0.16)]"
                      >
                        {t('inventory.floorPlanEditor.этот_тип', { name: currentFloorType.name })}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearDuplicateTargets}
                      className="rounded border border-[rgba(242,207,141,0.2)] px-2 py-1 text-[rgba(242,207,141,0.5)] transition-colors hover:text-[rgba(242,207,141,0.8)]"
                    >
                      {t('inventory.floorPlanEditor.очистить')}
                    </button>
                  </div>

                  <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto pr-1">
                    {duplicateCandidateFloors.map((f) => {
                      const inSameType =
                        currentFloorType !== null && f >= currentFloorType.rangeFrom && f <= currentFloorType.rangeTo
                      return (
                        <label
                          key={f}
                          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-base text-[rgba(242,207,141,0.85)] hover:bg-[rgba(242,207,141,0.06)]"
                        >
                          <input
                            type="checkbox"
                            checked={duplicateTargets.has(f)}
                            onChange={() => toggleDuplicateTarget(f)}
                            className="accent-[#c9a84c]"
                          />
                          <span>{t('inventory.floorPlanEditor.этаж_номер', { floor: f })}</span>
                          {inSameType && (
                            <span className="ml-auto text-base text-[rgba(242,207,141,0.4)]">
                              {currentFloorType?.name}
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleDuplicate}
                    disabled={duplicateTargets.size === 0}
                    className="mt-2.5 w-full rounded-lg bg-[#c9a84c] py-1.5 text-base font-normal text-[#0a1f12] transition-colors hover:bg-[#e2c97e] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {duplicateTargets.size === 0
                      ? t('inventory.floorPlanEditor.выберите_этажи')
                      : t('inventory.floorPlanEditor.дублировать_на_n_этаж', {
                          n: duplicateTargets.size,
                          label: duplicateTargets.size === 1 ? 'этаж' : duplicateTargets.size < 5 ? 'этажа' : 'этажей',
                        })}
                  </button>
                </div>
              )}
            </div>
          )}
          <span className="ml-auto text-[10px] text-[rgba(242,207,141,0.3)]">
            {t('inventory.floorPlanEditor.колесо_мыши_зум')}</span>

          {selectedFloor !== null && (
            <label
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                effectiveFloorPlan
                  ? 'border border-[rgba(242,207,141,0.25)] bg-transparent text-[rgba(242,207,141,0.85)] hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8]'
                  : 'bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]'
              }`}
            >
              <Upload size={12} />
              {effectiveFloorPlan ? 'Заменить план' : 'Загрузить план'}
              <input
                type="file"
                accept="image/*,.svg,application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleFileUpload(file)
                    if (!isEdit) handleModeSelect('edit')
                  }
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>

        {/* Upload status */}
        {uploadStatus && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
              uploadStatus.state === 'uploading'
                ? 'border-[#c9a84c]/40 bg-[rgba(201,168,76,0.1)] text-[#e2c97e]'
                : uploadStatus.state === 'done'
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-400/45 bg-rose-500/10 text-rose-200'
            }`}
          >
            {uploadStatus.state === 'uploading' && <Loader2 size={14} className="animate-spin" />}
            {uploadStatus.state === 'done' && <CheckCircle2 size={14} />}
            {uploadStatus.state === 'error' && <AlertTriangle size={14} />}
            <span className="min-w-0 flex-1 break-words">{uploadStatus.message}</span>
            {uploadStatus.state !== 'uploading' && (
              <button
                type="button"
                onClick={() => setUploadStatus(null)}
                className="shrink-0 rounded p-0.5 transition-opacity hover:opacity-70"
                aria-label={t('inventory.floorPlanEditor.закрыть')}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* Canvas area */}
        {!effectiveFloorPlan ? (
          isEdit ? (
            <label
              className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.2)] p-12 text-center transition-colors hover:border-[rgba(242,207,141,0.4)] hover:bg-[rgba(0,0,0,0.3)]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files[0]
                if (file) handleFileUpload(file)
              }}
            >
              <Upload className="size-9 text-[rgba(242,207,141,0.3)]" />
              <div>
                <p className="text-sm font-medium text-[#fcecc8]">{t('inventory.floorPlanEditor.загрузить_план_этажа')}</p>
                <p className="mt-1 text-xs text-[rgba(242,207,141,0.45)]">
                  {t('inventory.floorPlanEditor.этаж')}{selectedFloor} {t('inventory.floorPlanEditor.перетащите_или_клик')}</p>
                <p className="text-xs text-[rgba(242,207,141,0.28)]">PNG, JPG, SVG</p>
              </div>
              <input
                type="file"
                accept="image/*,.svg,application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                  e.target.value = ''
                }}
              />
            </label>
          ) : (
            <label
              className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.2)] p-12 text-center transition-colors hover:border-[rgba(242,207,141,0.4)] hover:bg-[rgba(0,0,0,0.3)]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files[0]
                if (file) {
                  handleFileUpload(file)
                  handleModeSelect('edit')
                }
              }}
            >
              <Upload className="size-9 text-[rgba(242,207,141,0.3)]" />
              <div>
                <p className="text-sm font-medium text-[#fcecc8]">{t('inventory.floorPlanEditor.загрузить_план_этажа')}</p>
                <p className="mt-1 text-xs text-[rgba(242,207,141,0.45)]">
                  {t('inventory.floorPlanEditor.этаж')}{selectedFloor ?? '—'} {t('inventory.floorPlanEditor.перетащите_или_клик')}</p>
                <p className="text-xs text-[rgba(242,207,141,0.28)]">PNG, JPG, SVG</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#c9a84c] px-4 py-2 text-xs font-normal text-[#0a1f12]">
                <Upload size={12} />
                {t('inventory.floorPlanEditor.выбрать_файл')}</span>
              <input
                type="file"
                accept="image/*,.svg,application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleFileUpload(file)
                    handleModeSelect('edit')
                  }
                  e.target.value = ''
                }}
              />
            </label>
          )
        ) : (
            <div
             ref={canvasWrapRef}
            className="relative overflow-auto rounded-xl border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.3)]"
            style={{ maxHeight: canvasMaxHeight }}
            onWheel={handleWheel}
            onClick={() => setTooltip(null)}
          >
            {propagationToast && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-[#c9a84c]/50 bg-[rgba(20,12,4,0.92)] px-3 py-1.5 text-[11px] font-medium text-[#fcecc8] shadow-lg">
                {propagationToast}
              </div>
            )}
            <div style={{ width: displayW, height: displayH, position: 'relative' }}>
              <img
                ref={imgRef}
                src={effectiveFloorPlan.imageDataUrl}
                alt={`Этаж ${selectedFloor}`}
                onLoad={handleImgLoad}
                draggable={false}
                style={{
                  width: displayW,
                  height: displayH,
                  display: 'block',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />

              {imgSize && (
                <svg
                  width={displayW}
                  height={displayH}
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    cursor: isEdit && drawingTarget ? 'crosshair' : 'default',
                  }}
                  onClick={handleSvgClick}
                >
                  {effectiveFloorPlan.polygons.map((poly) => {
                    const unit = floorUnits.find((u) => u._id === poly.unitId)
                    if (!unit || poly.points.length < 3) return null
                    const isHovered = hoveredShapeId === poly.unitId
                    const isHL = highlightUnitId === poly.unitId
                    const isTooltipActive = tooltip?.kind === 'unit' && tooltip.id === poly.unitId
                    const dimmed = highlightUnitId !== undefined && !isHL
                    const pts = poly.points.map(([fx, fy]) => `${fx},${fy}`).join(' ')
                    const cx = poly.points.reduce((s, [x]) => s + x, 0) / poly.points.length
                    const cy = poly.points.reduce((s, [, y]) => s + y, 0) / poly.points.length
                    return (
                      <g key={poly.unitId} opacity={dimmed ? 0.2 : isHovered || isHL || isTooltipActive ? 1 : 0.82}>
                        <polygon
                          points={pts}
                          fill={isHL || isTooltipActive ? STATUS_FILL[unit.status].replace(/[\d.]+\)$/, '0.4)') : STATUS_FILL[unit.status]}
                          stroke={STATUS_STROKE[unit.status]}
                          strokeWidth={isHL || isTooltipActive ? 0.006 : isHovered ? 0.004 : 0.003}
                          strokeLinejoin="round"
                          onMouseEnter={() => setHoveredShapeId(poly.unitId)}
                          onMouseLeave={() => setHoveredShapeId(null)}
                          onClick={(e) => handlePolygonClick(e, 'unit', poly.unitId)}
                          style={{ cursor: 'pointer' }}
                        />
                        <text
                          x={cx}
                          y={cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={isHL ? '0.016' : '0.012'}
                          fill={STATUS_STROKE[unit.status]}
                          fontWeight="600"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {unit.number}
                        </text>
                      </g>
                    )
                  })}

                  {effectiveFloorPlan.places.map((place) => {
                    if (place.points.length < 3) return null
                    const isHovered = hoveredShapeId === place.id
                    const isTooltipActive = tooltip?.kind === 'place' && tooltip.id === place.id
                    const pts = place.points.map(([fx, fy]) => `${fx},${fy}`).join(' ')
                    const cx = place.points.reduce((s, [x]) => s + x, 0) / place.points.length
                    const cy = place.points.reduce((s, [, y]) => s + y, 0) / place.points.length
                    return (
                      <g key={place.id} opacity={isHovered || isTooltipActive ? 1 : 0.86}>
                        <polygon
                          points={pts}
                          fill={isTooltipActive ? 'rgba(92,214,171,0.28)' : 'rgba(92,214,171,0.16)'}
                          stroke="rgba(112,244,205,0.92)"
                          strokeWidth={isTooltipActive ? 0.006 : isHovered ? 0.004 : 0.003}
                          strokeLinejoin="round"
                          onMouseEnter={() => setHoveredShapeId(place.id)}
                          onMouseLeave={() => setHoveredShapeId(null)}
                          onClick={(e) => handlePolygonClick(e, 'place', place.id)}
                          style={{ cursor: 'pointer' }}
                        />
                        <text
                          x={cx}
                          y={cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="0.012"
                          fill="rgba(205,255,239,0.95)"
                          fontWeight="600"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {place.label}
                        </text>
                      </g>
                    )
                  })}

                  {/* In-progress polygon — coords are already fractions */}
                  {isEdit && currentPoints.length > 0 && (
                    <>
                      {currentPoints.length > 1 && (
                        <polyline
                          points={currentPoints.map(([fx, fy]) => `${fx},${fy}`).join(' ')}
                          fill="none"
                          stroke="rgba(201,168,76,0.9)"
                          strokeWidth="0.003"
                          strokeDasharray="0.008 0.004"
                          strokeLinecap="round"
                        />
                      )}
                      {currentPoints.map(([fx, fy], i) => (
                        <circle
                          key={i}
                          cx={fx}
                          cy={fy}
                          r={i === 0 ? 0.008 : 0.005}
                          fill={i === 0 ? 'rgba(201,168,76,0.85)' : 'rgba(201,168,76,0.6)'}
                          stroke="rgba(201,168,76,1)"
                          strokeWidth="0.002"
                          style={{ pointerEvents: 'none' }}
                        />
                      ))}
                    </>
                  )}
                </svg>
              )}

              {/* Tooltip in view mode */}
              {mode === 'view' && tooltip && tooltipUnit && (
                <UnitTooltip
                  unit={tooltipUnit}
                  x={tooltip.x}
                  y={tooltip.y}
                  canvasWidth={displayW}
                  onClose={() => setTooltip(null)}
                />
              )}
              {mode === 'view' && tooltip && tooltipPlace && (
                <PlaceTooltip
                  place={tooltipPlace}
                  x={tooltip.x}
                  y={tooltip.y}
                  canvasWidth={displayW}
                  onClose={() => setTooltip(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface TooltipProps {
  x: number
  y: number
  canvasWidth: number
  onClose: () => void
}

function UnitTooltip({ unit, x, y, canvasWidth, onClose }: TooltipProps & { unit: IUnit }) {
    const { t } = useI18n();
  // Flip tooltip to the left side if it would clip past canvas right edge
  const leftOffset = 16
  const flipLeft = x + leftOffset + TOOLTIP_W > canvasWidth
  const left = flipLeft ? x - leftOffset - TOOLTIP_W : x + leftOffset

  const priceStr = unit.price
    ? `$${unit.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : '—'
  const areaStr = unit.area ? `${unit.area} м²` : '—'
  const roomsStr = unit.rooms ? optionLabel(t, 'rooms', unit.rooms) : '—'

  return (
    <div
      className="absolute z-50 rounded-xl border border-[rgba(242,207,141,0.3)] bg-[rgba(10,20,14,0.97)] p-3 shadow-[0_18px_45px_-15px_rgba(0,0,0,0.75)] backdrop-blur-md"
      style={{
        left: `${Math.max(0, left)}px`,
        top: `${y + 12}px`,
        width: TOOLTIP_W,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-normal uppercase tracking-wider text-[rgba(242,207,141,0.55)]">
            {t('inventory.floorPlanEditor.лот')}</p>
          <p className="text-sm font-normal text-[#fcecc8]">{unit.number}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-[rgba(242,207,141,0.45)] hover:bg-[rgba(242,207,141,0.08)] hover:text-[#fcecc8] transition-colors"
          aria-label={t('inventory.floorPlanEditor.закрыть')}
        >
          <X size={14} />
        </button>
      </div>

      {unit.layoutImageUrl ? (
        <div className="mb-2.5 overflow-hidden rounded-lg border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.4)]">
          <img
            src={unit.layoutImageUrl}
            alt={`Планировка ${unit.number}`}
            className="h-36 w-full object-contain"
            draggable={false}
          />
        </div>
      ) : (
        <div className="mb-2.5 flex h-36 items-center justify-center rounded-lg border border-dashed border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.25)] text-[11px] text-[rgba(242,207,141,0.4)]">
          {t('inventory.floorPlanEditor.планировка_не_загруж')}</div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="text-[rgba(242,207,141,0.5)]">{t('inventory.floorPlanEditor.комнатность')}</div>
        <div className="text-right text-[#fcecc8]">{roomsStr}</div>
        <div className="text-[rgba(242,207,141,0.5)]">{t('inventory.floorPlanEditor.площадь')}</div>
        <div className="text-right text-[#fcecc8]">{areaStr}</div>
        <div className="text-[rgba(242,207,141,0.5)]">{t('inventory.floorPlanEditor.цена')}</div>
        <div className="text-right text-[#fcecc8]">{priceStr}</div>
        <div className="text-[rgba(242,207,141,0.5)]">{t('inventory.floorPlanEditor.статус')}</div>
        <div className="text-right">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_CHIP[unit.status]}`}
          >
            {STATUS_LABEL[unit.status]}
          </span>
        </div>
      </div>
    </div>
  )
}

function PlaceTooltip({
  place,
  x,
  y,
  canvasWidth,
  onClose,
}: TooltipProps & { place: { label: string; points: [number, number][] } }) {
    const { t } = useI18n();
  const leftOffset = 16
  const flipLeft = x + leftOffset + TOOLTIP_W > canvasWidth
  const left = flipLeft ? x - leftOffset - TOOLTIP_W : x + leftOffset

  return (
    <div
      className="absolute z-50 rounded-xl border border-[rgba(92,214,171,0.35)] bg-[rgba(9,28,22,0.97)] p-3 shadow-[0_18px_45px_-15px_rgba(0,0,0,0.75)] backdrop-blur-md"
      style={{
        left: `${Math.max(0, left)}px`,
        top: `${y + 12}px`,
        width: TOOLTIP_W,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-normal uppercase tracking-wider text-[rgba(144,244,212,0.55)]">
            {t('inventory.floorPlanEditor.место')}</p>
          <p className="text-sm font-normal text-[#dffcf3]">{place.label}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-[rgba(144,244,212,0.45)] hover:bg-[rgba(144,244,212,0.08)] hover:text-[#dffcf3] transition-colors"
          aria-label={t('inventory.floorPlanEditor.закрыть')}
        >
          <X size={14} />
        </button>
      </div>

      <div className="rounded-lg border border-[rgba(92,214,171,0.18)] bg-[rgba(0,0,0,0.22)] px-3 py-2 text-[11px] text-[rgba(210,255,241,0.78)]">
        {t('inventory.floorPlanEditor.контур_места_сохран')}{place.points.length}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Settings2, Upload, X } from 'lucide-react'

import { useCoreStore } from '@/store/useCoreStore'
import { ChessboardEmptyCell } from '@/components/inventory/ChessboardEmptyCell'
import { ChessboardUnitCard } from '@/components/inventory/ChessboardUnitCard'
import { CB_ROW_GAP, cbGridTemplateColumns } from '@/components/inventory/chessboard-dimensions'
import { compactRoomsLabel, formatArea } from '@/lib/chessboard'
import type { IUnit } from '@/types/core'
import { useI18n } from "@/i18n";
import { ROOM_TYPE_OPTIONS, normalizeRooms, optionLabel } from '@/lib/project-options'

const ROOMS_ORDER = [...ROOM_TYPE_OPTIONS]
function roomSort(r: string) {
  const i = ROOMS_ORDER.indexOf(normalizeRooms(r) as (typeof ROOMS_ORDER)[number])
  return i >= 0 ? i : 99
}

type HasLayout = 'all' | 'yes' | 'no'

const DRAG_THRESHOLD_PX = 5
function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

export function LayoutChessboardView({
  forcedBuildingId,
  roomsFilter,
  hasFilter,
  selected,
  setSelected,
  zoomState,
  density = 'large',
}: {
  forcedBuildingId: string
  roomsFilter: string
  hasFilter: HasLayout
  selected: Set<string>
  setSelected: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  zoomState: any
  density?: 'large' | 'compact'
}) {
    const { t } = useI18n();
  const allUnits  = useCoreStore((s) => s.allUnits)
  const floorPlans = useCoreStore((s) => s.floorPlans)
  const setUnitsLayoutImage = useCoreStore((s) => s.setUnitsLayoutImage)

  const [buildingId, setBuildingId] = useState(forcedBuildingId)
  useEffect(() => { setBuildingId(forcedBuildingId) }, [forcedBuildingId])

  const [preview, setPreview]           = useState<{ unitId: string; url: string } | null>(null)
  const [uploadForUnit, setUploadForUnit] = useState<IUnit | null>(null)
  const [customizeUnit, setCustomizeUnit] = useState<IUnit | null>(null)
  const [unitDesc, setUnitDesc] = useState('')

  const [rubberBand, setRubberBand] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  const gridContainerRef = useRef<HTMLDivElement>(null)
  const bulkRef = useRef<HTMLInputElement>(null)
  const singleRef = useRef<HTMLInputElement>(null)

  const {
    innerRef: zoomInnerRef,
    wrapperStyle: zoomWrapperStyle,
    innerStyle: zoomInnerStyle,
  } = zoomState

  const dragStateRef = useRef<{
    startX: number
    startY: number
    shiftKey: boolean
    moved: boolean
    initialSelection: Set<string>
    active: boolean
  } | null>(null)

  // ── scope units to current building, sort by floor asc → rooms → number ──
  const scopedUnits = useMemo(
    () =>
      allUnits
        .filter((u) => u.building === buildingId)
        .sort((a, b) => {
          if (a.floor !== b.floor) return a.floor - b.floor
          const rd = roomSort(a.rooms ?? '') - roomSort(b.rooms ?? '')
          if (rd !== 0) return rd
          return a.number.localeCompare(b.number, 'ru', { numeric: true })
        }),
    [allUnits, buildingId],
  )

  // ── polygons & floor-plan availability ────────────────────────────────────
  const polygonUnitIds = useMemo(() => {
    const set = new Set<string>()
    for (const fp of floorPlans) {
      if (fp.buildingId !== buildingId) continue
      for (const p of fp.polygons) set.add(p.unitId)
    }
    return set
  }, [floorPlans, buildingId])

  const floorsWithPlan = useMemo(() => {
    const set = new Set<number>()
    for (const fp of floorPlans) {
      if (fp.buildingId !== buildingId) continue
      if (fp.imageDataUrl) set.add(fp.floor)
    }
    return set
  }, [floorPlans, buildingId])

  // ── filter by has/no layout (hard filter). rooms is a highlight below ────
  const visibleUnits = useMemo(() => {
    if (hasFilter === 'all') return scopedUnits
    return scopedUnits.filter((u) => hasFilter === 'yes' ? !!u.layoutImageUrl : !u.layoutImageUrl)
  }, [scopedUnits, hasFilter])

  const roomsMatchIds = useMemo(() => {
    if (!roomsFilter) return null
    const ids = new Set<string>()
    for (const u of visibleUnits) if (u.rooms === roomsFilter) ids.add(u._id)
    return ids
  }, [visibleUnits, roomsFilter])

  // ── floor grouping ───────────────────────────────────────────────────────
  const chessboardRows = useMemo(() => {
    const byFloor = new Map<number, Array<{ position: number; unit: IUnit }>>()
    for (const u of visibleUnits) {
      const arr = byFloor.get(u.floor) ?? []
      arr.push({ position: u.positionInFloor ?? arr.length + 1, unit: u })
      byFloor.set(u.floor, arr)
    }

    const rows = Array.from(byFloor.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([floor, entries]) => {
        const sorted = [...entries].sort((a, b) => a.position - b.position)
        const maxPosition = Math.max(0, ...sorted.map((entry) => entry.position))
        const unitsByPosition = new Map(sorted.map((entry) => [entry.position, entry.unit]))
        const slots = Array.from({ length: maxPosition }, (_, index) => ({
          position: index + 1,
          unit: unitsByPosition.get(index + 1) ?? null,
        }))
        return { floor, slots }
      })

    const maxPosition = rows.reduce((max, row) => Math.max(max, row.slots.length), 0)
    const normalizedRows = rows.map((row) => ({
      ...row,
      slots: [
        ...row.slots,
        ...Array.from({ length: Math.max(0, maxPosition - row.slots.length) }, (_, index) => ({
          position: row.slots.length + index + 1,
          unit: null as IUnit | null,
        })),
      ],
    }))

    return { rows: normalizedRows, maxPosition }
  }, [visibleUnits])

  // ── selection helpers ────────────────────────────────────────────────────
  const clearSelection = useCallback(() => setSelected(new Set()), [setSelected])

  function toggleUnit(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectGroupUnits(ids: string[], append = false) {
    const scopedIds = Array.from(new Set(ids.filter(Boolean)))
    if (scopedIds.length === 0) return

    setSelected((prev) => {
      const next = append ? new Set(prev) : new Set<string>()
      const allSelected = scopedIds.every((id) => prev.has(id))
      if (allSelected) {
        scopedIds.forEach((id) => next.delete(id))
      } else {
        scopedIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  // ── rubber-band drag selection ───────────────────────────────────────────
  const handleGridMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const targetEl = event.target as HTMLElement | null
    if (targetEl?.closest('[data-skip-drag="true"]')) return

    const container = gridContainerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()

    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      shiftKey: event.shiftKey,
      moved: false,
      initialSelection: new Set(selected),
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
      setRubberBand({ left, top, width: Math.abs(dx), height: Math.abs(dy) })

      const rectViewport = {
        left: Math.min(state.startX, moveEvent.clientX),
        top: Math.min(state.startY, moveEvent.clientY),
        right: Math.max(state.startX, moveEvent.clientX),
        bottom: Math.max(state.startY, moveEvent.clientY),
      }
      const cards = container.querySelectorAll<HTMLElement>('[data-unit-id]')
      const hit = new Set<string>(state.shiftKey ? state.initialSelection : [])
      cards.forEach((card) => {
        const cardRect = card.getBoundingClientRect()
        if (rectsIntersect(rectViewport, cardRect)) {
          const id = card.dataset.unitId
          if (id) hit.add(id)
        }
      })
      setSelected(hit)
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
          if (!state.shiftKey) clearSelection()
          return
        }
        if (state.shiftKey) {
          toggleUnit(unitId)
        } else {
          // regular click → preview (if has layout) or open upload
          const unit = scopedUnits.find((u) => u._id === unitId)
          if (!unit) return
          if (unit.layoutImageUrl) setPreview({ unitId: unit._id, url: unit.layoutImageUrl })
          else {
            setUploadForUnit(unit)
            setTimeout(() => singleRef.current?.click(), 0)
          }
        }
      }
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }

  // ── escape clears selection ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { clearSelection(); setPreview(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection])

  // ── upload handlers ──────────────────────────────────────────────────────
  function handleSingleUpload(unit: IUnit, file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      setUnitsLayoutImage([unit._id], url)
      setPreview({ unitId: unit._id, url })
    }
    reader.readAsDataURL(file)
  }

  function handleBulkUpload(file: File) {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      setUnitsLayoutImage(ids, url)
      setSelected(new Set())
    }
    reader.readAsDataURL(file)
  }

  const selCount = selected.size
  const highlightMode = !!roomsMatchIds && roomsMatchIds.size > 0

  return (
    <div className="relative flex flex-col gap-4">

      {/* Sticky bulk-upload bar (только если есть выделение) */}
      {selCount > 0 && (
        <div className="sticky top-0 z-20 flex items-center gap-3 rounded-lg border border-[rgba(201,168,76,0.3)] bg-[rgba(201,168,76,0.06)] px-4 py-2 backdrop-blur-md">
          <span className="text-[14px] font-normal text-[#fcecc8]">
            {selCount} {selCount === 1 ? 'лот' : selCount < 5 ? 'лота' : 'лотов'} {t('inventory.layoutChessboardView.выбрано')}</span>
          {selCount === 1 && (
            <button
              type="button"
              onClick={() => {
                const unitId = Array.from(selected)[0]
                const unit = scopedUnits.find((u) => u._id === unitId)
                if (unit) { setCustomizeUnit(unit); setUnitDesc('') }
              }}
              className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[14px] font-normal transition-colors"
              style={{
                border: '1px solid rgba(230,195,100,0.45)',
                background: 'rgba(230,195,100,0.09)',
                color: '#e6c364',
                fontFamily: "'Montserrat', sans-serif",
              }}
            >
              <Settings2 size={13} strokeWidth={1.5} />
              {t('inventory.layoutChessboardView.кастомизировать')}</button>
          )}
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(201,168,76,0.6)] bg-[rgba(201,168,76,0.06)] px-4 py-1.5 text-[14px] font-normal text-[#fcecc8] transition-colors hover:bg-[#c9a84c] hover:text-[#0a1f12]">
            <Upload size={14} />
            {t('inventory.layoutChessboardView.загрузить_планировку')}<input ref={bulkRef} type="file" accept="image/*" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBulkUpload(f); e.target.value = '' }} />
          </label>
          <button type="button" onClick={clearSelection}
            className="ml-auto text-[rgba(242,207,141,0.6)] transition-colors hover:text-[#fcecc8]">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Chessboard grid ── */}
      {chessboardRows.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[rgba(242,207,141,0.15)] py-16 text-center text-sm text-[rgba(242,207,141,0.35)]">
          {t('inventory.layoutChessboardView.ничего_не_найдено')}</div>
      ) : (
        <div
          ref={gridContainerRef}
          onMouseDown={handleGridMouseDown}
          className="relative max-w-full select-none overflow-auto rounded-md border border-[rgba(242,207,141,0.12)] bg-[rgba(0,0,0,0.2)] p-4"
        >
          <div style={zoomWrapperStyle}>
          <div ref={zoomInnerRef} className="min-w-0" style={zoomInnerStyle}>
            <div className="flex flex-col gap-1.5">
              {chessboardRows.maxPosition > 0 ? (
                <div className="mb-2 w-full min-w-0">
                  <div
                    className={`grid w-full min-w-0 ${CB_ROW_GAP}`}
                    style={{ gridTemplateColumns: density === 'large'
                      ? `3rem repeat(${Math.max(0, chessboardRows.maxPosition)}, minmax(80px, 1fr))`
                      : cbGridTemplateColumns(chessboardRows.maxPosition) }}
                  >
                    <div className="min-w-0" aria-hidden />
                    {Array.from({ length: chessboardRows.maxPosition }, (_, idx) => {
                      const position = idx + 1
                      const positionUnitIds = chessboardRows.rows.flatMap((row) => {
                        const slot = row.slots.find((candidate) => candidate.position === position)
                        return slot?.unit ? [slot.unit._id] : []
                      })
                      const isPositionSelected =
                        positionUnitIds.length > 0 && positionUnitIds.every((unitId) => selected.has(unitId))

                      return (
                        <button
                          key={`layout-position-${position}`}
                          type="button"
                          data-skip-drag="true"
                          disabled={positionUnitIds.length === 0}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (positionUnitIds.length === 0) return
                            selectGroupUnits(positionUnitIds, event.shiftKey)
                          }}
                          className={`flex h-9 w-full min-w-0 shrink-0 items-center justify-center rounded-md border text-[16px] font-normal transition-colors disabled:cursor-default ${
                            isPositionSelected
                              ? 'border-[#e6c364] bg-[rgba(201,168,76,0.16)] text-[#d0e8df]'
                              : positionUnitIds.length > 0
                                ? 'border-[rgba(201,168,76,0.16)] bg-[rgba(0,0,0,0.18)] text-[rgba(255,255,255,0.72)] hover:border-[rgba(201,168,76,0.35)] hover:text-[#d0e8df]'
                                : 'border-[rgba(201,168,76,0.1)] bg-[rgba(0,0,0,0.12)] text-[rgba(255,255,255,0.72)]'
                          }`}
                          title={`Выделить все помещения позиции ${position}`}
                        >
                          {position}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              {chessboardRows.rows.map((row, floorIdx) => {
                const hasPlan = floorsWithPlan.has(row.floor)
                const floorUnitIds = row.slots.flatMap((slot) => (slot.unit ? [slot.unit._id] : []))
                const isFloorSelected =
                  floorUnitIds.length > 0 && floorUnitIds.every((unitId) => selected.has(unitId))
                return (
                  <div key={row.floor} className={`flex flex-col gap-1.5 ${floorIdx > 0 ? 'mt-1' : ''}`}>
                    <div
                      className={`grid w-full min-w-0 items-center ${CB_ROW_GAP}`}
                      style={{ gridTemplateColumns: density === 'large'
                        ? `3rem repeat(${Math.max(0, chessboardRows.maxPosition)}, minmax(80px, 1fr))`
                        : cbGridTemplateColumns(chessboardRows.maxPosition) }}
                    >
                      <div className="flex min-w-0 items-center gap-1 pt-1.5 text-[16px] font-normal text-[rgba(255,255,255,0.72)]">
                        <button
                          type="button"
                          data-skip-drag="true"
                          disabled={floorUnitIds.length === 0}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (floorUnitIds.length === 0) return
                            selectGroupUnits(floorUnitIds, event.shiftKey)
                          }}
                          className={`inline-flex min-w-8 items-center justify-start rounded-md px-1.5 py-1 transition-colors disabled:cursor-default ${
                            isFloorSelected
                              ? 'bg-[rgba(201,168,76,0.18)] text-[#d0e8df]'
                              : floorUnitIds.length > 0
                                ? 'hover:bg-[rgba(255,255,255,0.06)] hover:text-[#d0e8df]'
                                : ''
                          }`}
                          title={hasPlan ? `Выделить весь этаж ${row.floor} · поэтажка загружена` : `Выделить весь этаж ${row.floor}`}
                        >
                          {row.floor}
                        </button>
                        {hasPlan ? (
                          <span title={t('inventory.layoutChessboardView.поэтажка_загружена')} className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_4px_rgba(56,189,248,0.6)]" />
                        ) : null}
                      </div>

                      {row.slots.map((slot) => {
                        if (!slot.unit) {
                          return (
                            <div key={`empty-${row.floor}-${slot.position}`} className="min-w-0">
                              <ChessboardEmptyCell floor={row.floor} position={slot.position} />
                            </div>
                          )
                        }

                        const unit = slot.unit
                        const isSel = selected.has(unit._id)
                        const hasLayout = !!unit.layoutImageUrl
                        const hasPoly = polygonUnitIds.has(unit._id)
                        const isRoomsMatch = !!roomsMatchIds?.has(unit._id)
                        const isDimmed = highlightMode && !isRoomsMatch
                        const roomsTitle = optionLabel(t, 'rooms', compactRoomsLabel(unit.rooms)) || '—'
                        const areaTitle = formatArea(unit.area)
                      return (
                        <div
                          key={unit._id}
                          title={`${roomsTitle} · ${areaTitle}${hasLayout ? ' · есть планировка' : ' · без планировки'}${hasPoly ? ' · обрисован' : ''}${hasPlan ? ' · поэтажка есть' : ''}`}
                          className={`relative min-w-0 ${isDimmed ? 'opacity-25' : ''}`}
                        >
                          <LayoutUnitCard
                            unit={unit}
                            hasLayout={hasLayout}
                            isSelected={isSel}
                            isHighlighted={isRoomsMatch}
                            density={density}
                          />

                          {/* indicators */}
                          {hasPoly && (
                            <span title={t('inventory.layoutChessboardView.обрисован')} className="absolute left-1 top-1 z-10 h-1.5 w-1.5 rounded-full bg-[#c9a84c] shadow-[0_0_4px_rgba(201,168,76,0.6)]" />
                          )}
                          {hasPlan && (
                            <span title={t('inventory.layoutChessboardView.поэтажка_загружена')} className="absolute left-3 top-1 z-10 h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_4px_rgba(56,189,248,0.6)]" />
                          )}
                          {!hasLayout && (
                            <span title={t('inventory.layoutChessboardView.нет_планировки')} className="absolute bottom-1 right-1 z-10 h-1.5 w-1.5 rounded-full border border-[#0c1c18] bg-rose-300/80" />
                          )}
                        </div>
                      )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          </div>

          {rubberBand && (
            <div
              className="pointer-events-none absolute rounded-sm border border-[#c9a84c] bg-[rgba(201,168,76,0.12)]"
              style={{ left: rubberBand.left, top: rubberBand.top, width: rubberBand.width, height: rubberBand.height }}
            />
          )}
        </div>
      )}

      {/* hidden input for click-on-empty-card upload */}
      <input ref={singleRef} type="file" accept="image/*" className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f && uploadForUnit) handleSingleUpload(uploadForUnit, f)
          setUploadForUnit(null)
          e.target.value = ''
        }} />

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreview(null)}>
          <div className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl border border-[rgba(242,207,141,0.2)] bg-[#0a1a0e] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setPreview(null)}
              className="absolute right-3 top-3 z-10 rounded-lg bg-black/50 p-2 text-[rgba(242,207,141,0.6)] hover:text-[#fcecc8]">
              <X size={16} />
            </button>
            <img src={preview.url} alt={t('inventory.layoutChessboardView.планировка')} className="max-h-[85vh] w-full object-contain" />
            <div className="border-t border-[rgba(242,207,141,0.1)] bg-[rgba(0,0,0,0.3)] px-5 py-2.5 text-center">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.3)] px-3 py-1.5 text-xs text-[rgba(242,207,141,0.8)] transition-colors hover:border-[rgba(242,207,141,0.45)] hover:text-[#fcecc8]">
                <Upload size={12} />
                {t('inventory.layoutChessboardView.заменить')}<input type="file" accept="image/*" className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    const unit = scopedUnits.find((u) => u._id === preview.unitId)
                    if (f && unit) handleSingleUpload(unit, f)
                    e.target.value = ''
                  }} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Customization modal — per-unit */}
      {customizeUnit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setCustomizeUnit(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440,
              background: '#0c1c18',
              border: '1px solid rgba(230,195,100,0.2)',
              borderRadius: 6,
              fontFamily: "'Montserrat', sans-serif",
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#e6c364' }}>
                  {t('inventory.layoutChessboardView.кв')}{customizeUnit.number}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                  {[
                    `${customizeUnit.floor} эт.`,
                    customizeUnit.rooms ? optionLabel(t, 'rooms', customizeUnit.rooms) : null,
                    customizeUnit.area != null ? `${customizeUnit.area} м²` : null,
                    customizeUnit.price != null
                      ? `$${(customizeUnit.price / 1000).toFixed(0)} тыс.`
                      : null,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCustomizeUnit(null)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 4,
                  background: 'rgba(255,255,255,0.05)',
                  border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.4)',
                }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', marginBottom: 6 }}>
                  {t('inventory.layoutChessboardView.описание_для_клиента')}</div>
                <textarea
                  value={unitDesc}
                  onChange={(e) => setUnitDesc(e.target.value)}
                  placeholder={t('inventory.layoutChessboardView.особенности_вид_из_о')}
                  rows={4}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(230,195,100,0.2)',
                    borderRadius: 4,
                    color: 'rgba(255,255,255,0.85)',
                    fontSize: 13, fontWeight: 400,
                    fontFamily: "'Montserrat', sans-serif",
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{
              display: 'flex', gap: 8, justifyContent: 'flex-end',
              padding: '12px 20px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <button
                type="button"
                onClick={() => setCustomizeUnit(null)}
                style={{
                  padding: '7px 14px', borderRadius: 4,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 12, fontWeight: 400, cursor: 'pointer',
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                {t('inventory.layoutChessboardView.отмена')}</button>
              <button
                type="button"
                onClick={() => setCustomizeUnit(null)}
                style={{
                  padding: '7px 16px', borderRadius: 4,
                  background: 'rgba(230,195,100,0.12)',
                  border: '1px solid rgba(230,195,100,0.4)',
                  color: '#e6c364',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                {t('inventory.layoutChessboardView.добавить_в_подборку')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LayoutUnitCard({
  unit,
  hasLayout,
  isSelected,
  isHighlighted,
  density = 'large',
}: {
  unit: IUnit
  hasLayout: boolean
  isSelected: boolean
  isHighlighted: boolean
  density?: 'large' | 'compact'
}) {
  return (
    <div style={{ minHeight: density === 'large' ? '5.5rem' : undefined }}>
      <ChessboardUnitCard
        unit={{ ...unit, status: hasLayout ? 'free' : 'withdrawn' }}
        isSelected={isSelected}
        isHighlighted={isHighlighted}
      />
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Grid3X3, ImageOff, LayoutTemplate, List, Maximize2, Minimize2, Upload, X } from 'lucide-react'

import { LayoutChessboardView } from '@/components/inventory/LayoutChessboardView'
import { LayoutLibraryView } from '@/components/inventory/LayoutLibraryView'
import { PlanImagePicker } from '@/components/inventory/PlanImagePicker'
import { useCoreStore } from '@/store/useCoreStore'
import type { IUnit } from '@/types/core'

import { ZoomControls } from '@/components/inventory/ZoomControls'
import { useZoomScale } from '@/hooks/useZoomScale'
import { useI18n } from "@/i18n";
import { ROOM_TYPE_OPTIONS, normalizeRooms, optionLabel } from '@/lib/project-options'

type ViewMode = 'list' | 'chessboard'
type LayoutTab = 'units' | 'library'

const ROOMS_ORDER = [...ROOM_TYPE_OPTIONS]

function roomSort(r: string) {
  const i = ROOMS_ORDER.indexOf(normalizeRooms(r) as (typeof ROOMS_ORDER)[number])
  return i >= 0 ? i : 99
}

type HasLayout = 'all' | 'yes' | 'no'

export function LayoutManagerView() {
    const { t } = useI18n();
  const buildings         = useCoreStore((s) => s.buildings)
  const allUnits          = useCoreStore((s) => s.allUnits)
  const floorPlans        = useCoreStore((s) => s.floorPlans)
  const setUnitPlanImage  = useCoreStore((s) => s.setUnitPlanImage)
  const fetchLayouts      = useCoreStore((s) => s.fetchLayouts)

  const [layoutTab, setLayoutTab]     = useState<LayoutTab>('units')
  const [viewMode, setViewMode]       = useState<ViewMode>('chessboard')
  const [density, setDensity]         = useState<'large' | 'compact'>('large')
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(buildings[0]?._id ?? '')
  const [buildingDrop, setBuildingDrop] = useState(false)
  const [roomsFilter] = useState('')
  const [hasFilter, setHasFilter]     = useState<HasLayout>('all')
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [preview, setPreview]         = useState<{ unitId: string; url: string } | null>(null)
  const [pickerUnit, setPickerUnit]   = useState<IUnit | null>(null)
  const [showBulkPicker, setShowBulkPicker] = useState(false)

  const buildingId = useMemo(() => {
    if (buildings.some((building) => building._id === selectedBuildingId)) return selectedBuildingId
    return buildings[0]?._id ?? ''
  }, [buildings, selectedBuildingId])

  useEffect(() => {
    if (buildingId) {
      fetchLayouts(buildingId)
    }
  }, [buildingId, fetchLayouts])

  // Zoom state moved up to share between views if needed (mostly for header)
  const zoomState = useZoomScale({ storageKey: 'layoutChessboardZoom', axes: 'x', layoutStretch: true })

  const lastBuildingIdRef = useRef(buildingId)
  if (lastBuildingIdRef.current !== buildingId) {
    lastBuildingIdRef.current = buildingId
    if (selected.size > 0) setSelected(new Set())
  }

  const allBuildingIds  = useMemo(() => buildings.map((b) => b._id), [buildings])

  const buildingDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!buildingDrop) return
    function out(e: MouseEvent) {
      if (buildingDropRef.current && !buildingDropRef.current.contains(e.target as Node)) setBuildingDrop(false)
    }
    document.addEventListener('mousedown', out)
    return () => document.removeEventListener('mousedown', out)
  }, [buildingDrop])

  // units for this building, sorted by floor asc → rooms → number
  const units = useMemo(() => {
    return allUnits
      .filter((u) => u.building === buildingId)
      .sort((a, b) => {
        if (a.floor !== b.floor) return a.floor - b.floor
        const rd = roomSort(a.rooms ?? '') - roomSort(b.rooms ?? '')
        if (rd !== 0) return rd
        return a.number.localeCompare(b.number, 'ru', { numeric: true })
      })
  }, [allUnits, buildingId])

  const uniqueRooms = useMemo(() => {
    const counts = new Map<string, number>()
    units.forEach((u) => {
      if (u.rooms) counts.set(u.rooms, (counts.get(u.rooms) || 0) + 1)
    })
    return Array.from(counts.entries()).sort((a, b) => roomSort(a[0]) - roomSort(b[0]))
  }, [units])

  const polygonUnitIds = useMemo(() => {
    const set = new Set<string>()
    for (const fp of floorPlans) {
      if (fp.buildingId !== buildingId) continue
      for (const p of fp.polygons) set.add(p.unitId)
    }
    return set
  }, [floorPlans, buildingId])

  const filtered = useMemo(() => {
    return units.filter((u) => {
      if (hasFilter === 'yes' && !u.layoutImageUrl) return false
      if (hasFilter === 'no'  &&  u.layoutImageUrl) return false
      return true
    })
  }, [units, hasFilter])

  const listFiltered = useMemo(() => {
    return filtered.filter((u) => {
      if (roomsFilter && u.rooms !== roomsFilter) return false
      return true
    })
  }, [filtered, roomsFilter])

  const stats = useMemo(() => {
    const total = units.length
    const has   = units.filter((u) => u.layoutImageUrl).length
    const drawn = units.filter((u) => polygonUnitIds.has(u._id)).length
    return { total, has, missing: total - has, drawn }
  }, [units, polygonUnitIds])

  // ── selection helpers ──────────────────────────────────────────────────────
  const allPageSelected  = listFiltered.length > 0 && listFiltered.every((u) => selected.has(u._id))
  const somePageSelected = !allPageSelected && listFiltered.some((u) => selected.has(u._id))

  function toggleUnit(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        listFiltered.forEach((u) => next.delete(u._id))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        listFiltered.forEach((u) => next.add(u._id))
        return next
      })
    }
  }

  function selectByRooms(rooms: string) {
    const ids = listFiltered.filter((u) => u.rooms === rooms).map((u) => u._id)
    const allSel = ids.length > 0 && ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSel) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  if (buildings.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-[16px] text-[color:var(--fp-muted)]">
        {t('inventory.layoutManagerView.нет_корпусов')}</div>
    )
  }

  const selCount = selected.size

  return (
    <div className="flex flex-col gap-4">

      {/* ── Единый хедер ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Вкладки: По лотам / Библиотека */}
        <div className="flex rounded-md border border-[var(--fp-line)] bg-[var(--fp-fact-bg)] p-0.5">
          {([['units', 'По лотам', Grid3X3], ['library', 'Библиотека', LayoutTemplate]] as const).map(([v, lbl, Icon]) => (
            <button key={v} type="button" onClick={() => setLayoutTab(v)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors ${
                layoutTab === v ? 'bg-[var(--fp-active-bg)] text-[var(--fp-strong)]' : 'text-[var(--fp-muted)] hover:text-[var(--fp-strong)]'
              }`}>
              <Icon size={14} />
              <span className="text-[14px] font-medium">{lbl}</span>
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-[var(--fp-line)]" />

        {/* Корпус */}
        <div className="relative" ref={buildingDropRef}>
          <button type="button" onClick={() => setBuildingDrop((v) => !v)}
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[16px] font-normal transition-colors ${
              buildingDrop
                ? 'border-[var(--fp-gold)] bg-[var(--fp-active-bg)] text-[var(--fp-strong)]'
                : 'border-[var(--fp-line)] bg-[var(--fp-fact-bg)] text-[var(--fp-muted)] hover:border-[var(--fp-muted)] hover:text-[var(--fp-strong)]'
            }`}>
            {buildings.find((b) => b._id === buildingId)?.name ?? 'Корпус'}
            <ChevronDown size={11} className={`transition-transform ${buildingDrop ? 'rotate-180' : ''}`} />
          </button>
          {buildingDrop && (
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[140px] rounded-md border border-[var(--fp-line)] bg-[var(--fp-panel)] py-1 shadow-2xl shadow-black/50">
              {buildings.map((b) => (
                <button key={b._id} type="button"
                  onClick={() => { setSelectedBuildingId(b._id); setSelected(new Set()); setBuildingDrop(false) }}
                  className={`flex w-full items-center gap-2 whitespace-nowrap px-4 py-2 text-[16px] transition-colors ${
                    buildingId === b._id
                      ? 'bg-[var(--fp-active-bg)] text-[var(--fp-strong)]'
                      : 'text-[color:var(--fp-muted)] hover:bg-[var(--fp-hover-bg)] hover:text-[var(--fp-strong)]'
                  }`}>
                  {buildingId === b._id && <span className="h-1.5 w-1.5 rounded-full bg-[var(--fp-gold)]" />}
                  {buildingId !== b._id && <span className="h-1.5 w-1.5" />}
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Стата (только для По лотам) */}
        {layoutTab === 'units' && (
          <span className="text-[16px] text-[color:var(--fp-muted)]">
            {stats.total} {t('inventory.layoutManagerView.лотов')}{stats.missing > 0 && <span className="text-[color:var(--badge-danger-text)]"> · {stats.missing} {t('inventory.layoutManagerView.без_планировки')}</span>}
            {viewMode === 'chessboard' && stats.drawn > 0 && <span className="text-[var(--fp-gold)]"> · {stats.drawn} {t('inventory.layoutManagerView.обрисовано')}</span>}
          </span>
        )}

        {/* Переключатель вида (только для По лотам) */}
        {layoutTab === 'units' && (
          <div className="ml-auto flex rounded-md border border-[var(--fp-line)] bg-[var(--fp-fact-bg)] p-0.5">
            <button type="button" title={t('inventory.layoutManagerView.список')} onClick={() => setViewMode('list')}
              className={`inline-flex items-center rounded-md px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-[var(--fp-active-bg)] text-[var(--fp-strong)]' : 'text-[var(--fp-muted)] hover:text-[var(--fp-strong)]'}`}>
              <List size={13} />
            </button>
            <button type="button" title={t('inventory.layoutManagerView.шахматка')} onClick={() => setViewMode('chessboard')}
              className={`inline-flex items-center rounded-md px-2.5 py-1.5 transition-colors ${viewMode === 'chessboard' ? 'bg-[var(--fp-active-bg)] text-[var(--fp-strong)]' : 'text-[var(--fp-muted)] hover:text-[var(--fp-strong)]'}`}>
              <Grid3X3 size={13} />
            </button>
          </div>
        )}
      </div>

      {layoutTab === 'units' ? (
        <>
          {/* ── Единая строка фильтров ── */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] text-[color:var(--fp-muted)]">{t('inventory.layoutManagerView.выделить')}</span>
            {uniqueRooms.map(([r]) => {
              const allSel = listFiltered.filter((u) => u.rooms === r).length > 0 && listFiltered.filter((u) => u.rooms === r).every((u) => selected.has(u._id))
              return (
                <button key={r} type="button" onClick={() => selectByRooms(r)}
                  className={`rounded-md border px-3 py-1 text-[16px] font-normal transition-colors ${
                    allSel
                      ? 'border-[var(--fp-active-ring)] bg-[var(--fp-active-bg)] text-[var(--fp-strong)]'
                      : 'border-[var(--fp-line)] text-[var(--fp-muted)] hover:border-[var(--fp-muted)] hover:text-[var(--fp-muted)]'
                  }`}>
                  {optionLabel(t, 'rooms', r)}
                </button>
              )
            })}

            {/* Legend - always visible for consistency */}
            <div className="ml-4 flex flex-wrap items-center gap-2.5 text-[14px] text-[color:var(--fp-muted)]">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-emerald-400/60 bg-emerald-500/20" />{t('inventory.layoutManagerView.есть')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-rose-400/40 bg-rose-500/10" />{t('inventory.layoutManagerView.нет')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[var(--fp-gold)]" />{t('inventory.layoutManagerView.обрисован')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" />{t('inventory.layoutManagerView.поэтажка')}</span>
            </div>

            {/* Has-layout filter & Zoom */}
            <div className="ml-auto flex items-center gap-2">
              <div className="flex rounded-md border border-[var(--fp-line)] bg-[var(--fp-fact-bg)] p-0.5">
                {([['all', 'Все'], ['yes', 'Есть'], ['no', 'Нет']] as const).map(([v, lbl]) => (
                  <button key={v} type="button" onClick={() => setHasFilter(v)}
                    className={`rounded-md px-3 py-1.5 text-[16px] font-normal transition-colors ${
                      hasFilter === v ? 'bg-[var(--fp-active-bg)] text-[var(--fp-strong)]' : 'text-[color:var(--fp-muted)] hover:text-[var(--fp-strong)]'
                    }`}>
                    {lbl}
                  </button>
                ))}
              </div>

              {viewMode === 'chessboard' && (
                <>
                  <div className="flex rounded-md border border-[var(--fp-line)] bg-[var(--fp-fact-bg)] p-0.5">
                    <button type="button" title={t('inventory.layoutManagerView.крупные_карточки')} onClick={() => setDensity('large')}
                      className={`inline-flex items-center rounded-md px-2.5 py-1.5 transition-colors ${density === 'large' ? 'bg-[var(--fp-active-bg)] text-[var(--fp-strong)]' : 'text-[var(--fp-muted)] hover:text-[var(--fp-strong)]'}`}>
                      <Maximize2 size={13} />
                    </button>
                    <button type="button" title={t('inventory.layoutManagerView.мелкие_карточки')} onClick={() => setDensity('compact')}
                      className={`inline-flex items-center rounded-md px-2.5 py-1.5 transition-colors ${density === 'compact' ? 'bg-[var(--fp-active-bg)] text-[var(--fp-strong)]' : 'text-[var(--fp-muted)] hover:text-[var(--fp-strong)]'}`}>
                      <Minimize2 size={13} />
                    </button>
                  </div>
                  <ZoomControls zoom={zoomState.zoom} onAdjust={zoomState.adjustZoom} onReset={zoomState.resetZoom} />
                </>
              )}
            </div>
          </div>

          {/* ── Шахматка ── */}
          {viewMode === 'chessboard' && (
            <LayoutChessboardView
              forcedBuildingId={buildingId}
              roomsFilter={roomsFilter}
              hasFilter={hasFilter}
              selected={selected}
              setSelected={setSelected}
              zoomState={zoomState}
              density={density}
            />
          )}

          {/* ── Табличный вид ── */}
          {viewMode === 'list' && (
            <>
              {/* ── Bulk upload bar ── */}
              {selCount > 0 && (
                <div className="flex items-center gap-3 rounded-md border border-[var(--fp-line)] bg-[var(--fp-price-bg)] px-5 py-2.5">
                  <span className="text-[16px] font-normal text-[var(--fp-strong)]">
                    {selCount} {selCount === 1 ? 'лот' : selCount < 5 ? 'лота' : 'лотов'} {t('inventory.layoutManagerView.выбрано')}</span>
                  <button
                    type="button"
                    onClick={() => setShowBulkPicker(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--fp-active-ring)] bg-[var(--fp-hover-bg)] px-4 py-2 text-[16px] font-normal text-[var(--fp-strong)] transition-colors hover:bg-[var(--fp-gold)] hover:text-[var(--fp-canvas)]"
                  >
                    <Upload size={13} />
                    {t('inventory.layoutManagerView.выбрать_из_библиотек')}</button>
                  <button type="button" onClick={() => setSelected(new Set())}
                    className="ml-auto text-[16px] text-[color:var(--fp-muted)] hover:text-[var(--fp-muted)]">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* ── Table ── */}
              <div className="overflow-x-auto rounded-[8px] border border-[var(--fp-line)] bg-[var(--fp-fact-bg)]">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="bg-[var(--fp-hover-bg)] text-[13px] font-normal uppercase tracking-wide text-[var(--fp-muted)]">
                      <th className="w-10 px-4 py-3">
                        <input type="checkbox" checked={allPageSelected}
                          ref={(el) => { if (el) el.indeterminate = somePageSelected }}
                          onChange={toggleAll} className="accent-[var(--fp-gold)] cursor-pointer" />
                      </th>
                      <th className="px-4 py-3 font-normal">{t('inventory.layoutManagerView.этаж')}</th>
                      <th className="px-4 py-3 font-normal">{t('inventory.layoutManagerView.номер')}</th>
                      <th className="px-4 py-3 font-normal">{t('inventory.layoutManagerView.комн')}</th>
                      <th className="px-4 py-3 font-normal">{t('inventory.layoutManagerView.площадь')}</th>
                      <th className="px-4 py-3 font-normal">{t('inventory.layoutManagerView.планировка')}</th>
                      <th className="w-24 px-4 py-3 font-normal">{t('inventory.layoutManagerView.действие')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listFiltered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-[16px] text-[color:var(--fp-muted)]">
                          {t('inventory.layoutManagerView.нет_лотов')}</td>
                      </tr>
                    ) : (
                      listFiltered.map((unit, i) => {
                        const isSel = selected.has(unit._id)
                        const hasPlan = !!unit.layoutImageUrl
                        const isPreviewActive = preview?.unitId === unit._id
                        return (
                          <tr key={unit._id}
                            className={`border-b border-[var(--fp-line)] last:border-0 transition-colors ${
                              isSel ? 'bg-[var(--fp-hover-bg)]' : i % 2 !== 0 ? 'bg-[var(--fp-fact-bg)]' : ''
                            } hover:bg-[var(--fp-hover-bg)]`}>

                            {/* Checkbox */}
                            <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={isSel} onChange={() => toggleUnit(unit._id)}
                                className="accent-[var(--fp-gold)] cursor-pointer" />
                            </td>

                            {/* Floor */}
                            <td className="px-4 py-3 text-[15px] text-[color:var(--fp-muted)]">{unit.floor}</td>

                            {/* Number */}
                            <td className="px-4 py-3 text-[15px] text-[var(--fp-strong)]">{unit.number}</td>

                            {/* Rooms */}
                            <td className="px-4 py-3 text-[15px] text-[color:var(--fp-muted)]">{unit.rooms ? optionLabel(t, 'rooms', unit.rooms) : '—'}</td>

                            {/* Area */}
                            <td className="px-4 py-3 text-[15px] text-[color:var(--fp-muted)]">
                              {unit.area != null ? `${unit.area} м²` : '—'}
                            </td>

                            {/* Layout status */}
                            <td className="px-4 py-3">
                              {hasPlan ? (
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={() => setPreview(isPreviewActive ? null : { unitId: unit._id, url: unit.layoutImageUrl! })}
                                    className="relative h-9 w-9 overflow-hidden rounded-[4px] border border-[var(--fp-line)] bg-[var(--fp-fact-bg)] transition-all hover:border-[var(--fp-active-ring)]">
                                    <img src={unit.layoutImageUrl} alt={t('inventory.layoutManagerView.план')} className="h-full w-full object-cover" />
                                  </button>
                                  <span className="text-[15px] text-[color:var(--fp-icon)]">{t('inventory.layoutManagerView.загружена')}</span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[15px] text-[color:var(--badge-danger-text)]">
                                  <ImageOff size={11} />{t('inventory.layoutManagerView.нет')}</span>
                              )}
                            </td>

                            {/* Action */}
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setPickerUnit(unit)}
                                className="inline-flex items-center gap-1 rounded-[4px] border border-[var(--fp-line)] bg-[var(--fp-fact-bg)] px-2.5 py-1 text-[16px] text-[color:var(--fp-muted)] transition-colors hover:border-[var(--fp-muted)] hover:text-[var(--fp-strong)]"
                              >
                                <Upload size={11} />
                                {hasPlan ? 'Заменить' : 'Загрузить'}
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Image preview modal ── */}
              {preview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPreview(null)}>
                  <div className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-md border border-[var(--fp-line)] bg-[var(--fp-panel)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => setPreview(null)}
                      className="absolute right-3 top-3 z-10 rounded-md bg-black/50 p-2 text-[color:var(--fp-muted)] hover:text-[var(--fp-strong)]">
                      <X size={16} />
                    </button>
                    <img src={preview.url} alt={t('inventory.layoutManagerView.планировка')} className="max-h-[85vh] w-full object-contain" />
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <LayoutLibraryView buildingId={buildingId} />
      )}

      {pickerUnit && (
        <PlanImagePicker
          buildingId={buildingId}
          buildingIds={allBuildingIds}
          currentImageFileId={pickerUnit.imageFileId}
          onSelect={(file) => setUnitPlanImage(pickerUnit._id, file.id)}
          onDetach={pickerUnit.imageFileId ? () => setUnitPlanImage(pickerUnit._id, null) : undefined}
          onClose={() => setPickerUnit(null)}
        />
      )}

      {showBulkPicker && (
        <PlanImagePicker
          buildingId={buildingId}
          buildingIds={allBuildingIds}
          onSelect={async (file) => {
            await Promise.all(Array.from(selected).map((id) => setUnitPlanImage(id, file.id)))
            setSelected(new Set())
          }}
          onClose={() => setShowBulkPicker(false)}
        />
      )}
    </div>
  )
}

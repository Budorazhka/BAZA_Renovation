import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useRolePermissions } from '@/hooks/useRolePermissions'
import { useAuth } from '@/context/AuthContext'
import { canDo } from '@/lib/permissions'
import { propertyAssetsApi, getCreateIdempotencyKey, resetCreateIdempotencyKey } from '@/services/propertyAssetsApi'
import { mapPropertyAssetToUiProperty, uiPropertyTypeToAsset } from '@/lib/map-property-asset'
import { PropertyAlerts, type AlertFilter } from './PropertyAlerts'
import { Toolbar, type TabValue, type ViewMode } from './Toolbar'
import { PropertyTable } from './PropertyTable'
import { BulkBar } from './BulkBar'
import { FilterPanel } from './FilterPanel'
import { ScopeToggle, type Scope } from './ScopeToggle'
import { PropertyWizardDialog } from './PropertyWizardDialog'
import { MlsConfirmDialog, type MlsDialogMode } from '@/components/objects/MlsConfirmDialog'
import { getConditionState } from './utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { FiltersState, Property, PropertyCategory, PropertyWizardValues, SaleStatus } from './types'
import { EMPTY_FILTERS } from './types'
import './my-properties.css'

/** Переход с каталога объектов: открыть нужную вкладку сегмента */
type MyPropertiesLocationState = { defaultTab?: TabValue }

const VALID_ENTRY_TABS: TabValue[] = ['primary', 'secondary', 'rent', 'commercial', 'other']

export function MyPropertiesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isManager, isMarketer } = useRolePermissions()
  const { currentUser } = useAuth()
  const canPublishMls = currentUser ? canDo('publish_mls', currentUser.role) : false
  const isMlsCircleMember = Boolean(currentUser?.mlsCircleVerified)
  /** Идентификатор текущей попытки создания — см. ключи идемпотентности ниже. */
  const createAttemptRef = useRef<string>('')

  const [mlsTarget, setMlsTarget] = useState<{ property: Property; mode: MlsDialogMode } | null>(null)

  // ── состояние интерфейса ───────────────────────────────────────────────────
  const [activeTab, setActiveTab]   = useState<TabValue>('primary')
  const [search, setSearch]         = useState('')
  const [viewMode, setViewMode]     = useState<ViewMode>('table')
  const [sortDesc, setSortDesc]     = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters]       = useState<FiltersState>(EMPTY_FILTERS)
  const [alertFilter, setAlertFilter] = useState<AlertFilter>(null)
  const [agentFilter, setAgentFilter] = useState<string | null>(null)
  const [wizardState, setWizardState] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    propertyId?: string
    defaults?: Partial<PropertyWizardValues>
  }>({
    open: false,
    mode: 'create',
  })

  // Область: менеджер начинает с «мои», РОП+ сразу «все»
  const [scope, setScope] = useState<Scope>(isManager ? 'my' : 'all')
  const readOnly  = isMarketer || (isManager && scope === 'all')
  const isBulkMode = selectedIds.size > 0 && !readOnly
  const isArchive  = activeTab === 'archive'

  // ── данные ─────────────────────────────────────────────────────────────────
  const [properties, setProperties] = useState<Property[]>([])
  const [, setIsLoading] = useState(true)

  const loadProperties = useCallback(async () => {
    setIsLoading(true)
    try {
      const { items } = await propertyAssetsApi.listAllAssetsWithListings()
      const mapped = items.map(({ asset, listings }) => mapPropertyAssetToUiProperty(asset, listings))
      setProperties(mapped)
    } catch (err) {
      console.error('Failed to load properties in MyPropertiesPage:', err)
      setProperties([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProperties()
  }, [loadProperties])

  useEffect(() => {
    const s = location.state as MyPropertiesLocationState | null
    const t = s?.defaultTab
    if (!t || !VALID_ENTRY_TABS.includes(t)) return
    setActiveTab(t)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  /** Базовый список по scope (до tab/search/filters) */
  const scopedProperties = useMemo(() => {
    return scope === 'my'
      ? properties.filter((p) => p.agentId === currentUser?.id)
      : properties
  }, [properties, scope, currentUser])

  /** Статистика менеджеров для фильтра РОП+ (только scope=all) */
  const agentStats = useMemo(() => {
    if (scope !== 'all') return []
    const map = new Map<string, { agentId: string; agentName: string; total: number; overdue: number }>()
    for (const p of scopedProperties) {
      if (p.status === 'archive') continue
      const entry = map.get(p.agentId)
      const isOverdue = getConditionState(p.updatedAt) === 'needs_update'
      if (entry) {
        entry.total++
        if (isOverdue) entry.overdue++
      } else {
        map.set(p.agentId, { agentId: p.agentId, agentName: p.agentName, total: 1, overdue: isOverdue ? 1 : 0 })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.overdue - a.overdue)
  }, [scopedProperties, scope])

  /** Счётчики для панели управления (только активные, не архив) */
  const alertCounts = useMemo(() => {
    const active = scopedProperties.filter((p) => p.status !== 'archive' && p.status !== 'draft')
    return {
      upToDate:       active.filter((p) => getConditionState(p.updatedAt) === 'up_to_date').length,
      needsAttention: active.filter((p) => getConditionState(p.updatedAt) === 'needs_attention').length,
      needsUpdate:    active.filter((p) => getConditionState(p.updatedAt) === 'needs_update').length,
      drafts:         scopedProperties.filter((p) => p.status === 'draft').length,
      archived:       properties.filter((p) => p.status === 'archive' && (scope === 'all' || p.agentId === currentUser?.id)).length,
    }
  }, [scopedProperties, properties, scope, currentUser])

  /** Итоговый отфильтрованный список */
  const filtered = useMemo(() => {
    return scopedProperties.filter((p) => {
      // Таб
      if (activeTab === 'archive') {
        if (p.status !== 'archive') return false
      } else {
        if (p.status === 'archive') return false
        if (p.category !== activeTab) return false
      }

      // Фильтр панели управления (AlertFilter)
      if (alertFilter === 'up_to_date' || alertFilter === 'needs_attention' || alertFilter === 'needs_update') {
        if (p.status === 'draft') return false
        if (getConditionState(p.updatedAt) !== alertFilter) return false
      }
      if (alertFilter === 'draft') {
        if (p.status !== 'draft') return false
      }

      // Поиск
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchTitle  = p.title.toLowerCase().includes(q)
        const matchCity   = p.city.toLowerCase().includes(q)
        const matchStreet = p.street.toLowerCase().includes(q)
        const matchAgent  = p.agentName.toLowerCase().includes(q)
        if (!matchTitle && !matchCity && !matchStreet && !matchAgent) return false
      }

      // Фильтр по менеджеру (РОП+)
      if (agentFilter && p.agentId !== agentFilter) return false

      // Расширенные фильтры
      if (filters.types.length && !filters.types.includes(p.type)) return false
      if (filters.statuses.length && !filters.statuses.includes(p.status)) return false
      if (filters.conditions.length) {
        const c = getConditionState(p.updatedAt)
        if (!filters.conditions.includes(c)) return false
      }
      if (filters.priceMin && p.price < Number(filters.priceMin)) return false
      if (filters.priceMax && p.price > Number(filters.priceMax)) return false
      if (filters.areaMin  && p.area  < Number(filters.areaMin))  return false
      if (filters.areaMax  && p.area  > Number(filters.areaMax))  return false

      return true
    }).sort((a, b) => {
      const da = new Date(a.updatedAt).getTime()
      const db = new Date(b.updatedAt).getTime()
      return sortDesc ? db - da : da - db
    })
  }, [scopedProperties, activeTab, alertFilter, search, agentFilter, filters, sortDesc])

  const totalCount = useMemo(() => {
    return scopedProperties.filter((p) => p.status !== 'archive').length
  }, [scopedProperties])

  const editingProperty = useMemo(() => {
    if (!wizardState.propertyId) return null
    return properties.find((p) => p.id === wizardState.propertyId) ?? null
  }, [properties, wizardState.propertyId])

  // Количество активных фильтров (для бейджа)
  const activeFiltersCount = useMemo(() => {
    let n = 0
    if (filters.types.length)      n++
    if (filters.statuses.length)   n++
    if (filters.conditions.length) n++
    if (filters.priceMin)          n++
    if (filters.priceMax)          n++
    if (filters.areaMin)           n++
    if (filters.areaMax)           n++
    return n
  }, [filters])

  // ── обработчики ───────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    if (readOnly) return
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    if (readOnly) return
    const ids = filtered.map((p) => p.id)
    const all = ids.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const n = new Set(prev)
      all ? ids.forEach((id) => n.delete(id)) : ids.forEach((id) => n.add(id))
      return n
    })
  }

  function handleBulkApply(status: SaleStatus) {
    setProperties((prev) => prev.map((p) => selectedIds.has(p.id) ? { ...p, status } : p))
    setSelectedIds(new Set())
  }

  function handleDeleteSelected() {
    setProperties((prev) => prev.filter((p) => !selectedIds.has(p.id)))
    setSelectedIds(new Set())
  }

  function handleDelete(id: string) {
    setProperties((prev) => prev.filter((p) => p.id !== id))
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  function handleRestore(id: string) {
    setProperties((prev) => prev.map((p) => p.id === id ? { ...p, status: 'for_sale' as const } : p))
  }

  function openMls(id: string) {
    if (!canPublishMls) return
    const property = properties.find((p) => p.id === id)
    if (!property) return
    const mode: MlsDialogMode = !isMlsCircleMember ? 'apply' : property.details?.isMls ? 'remove' : 'publish'
    setMlsTarget({ property, mode })
  }

  function handleMlsConfirmed(id: string, isMlsNow: boolean) {
    setProperties((prev) => prev.map((p) => (
      p.id === id ? { ...p, details: p.details ? { ...p.details, isMls: isMlsNow } : undefined } : p
    )))
    setMlsTarget(null)
  }

  function handleScopeChange(s: Scope) {
    setScope(s)
    setSelectedIds(new Set())
    setActiveTab('primary')
    setSearch('')
    setFilters(EMPTY_FILTERS)
    setAlertFilter(null)
    setAgentFilter(null)
  }

  function handleAlertFilter(f: AlertFilter) {
    setAlertFilter(f)
    if (f && f !== 'archive') setActiveTab('primary')
    if (f === 'archive') setActiveTab('archive')
    setSelectedIds(new Set())
  }

  function closeWizard() {
    setWizardState((prev) => ({ ...prev, open: false, propertyId: undefined, defaults: undefined }))
  }

  function openCreateWizard() {
    const categoryFromTab: PropertyCategory =
      activeTab === 'secondary' || activeTab === 'rent' || activeTab === 'commercial' || activeTab === 'other'
        ? activeTab
        : 'secondary'

    setWizardState({
      open: true,
      mode: 'create',
      defaults: {
        category: categoryFromTab,
        status: activeTab === 'archive' ? 'draft' : 'for_sale',
      },
    })
  }

  function openEditWizard(id: string) {
    setWizardState({
      open: true,
      mode: 'edit',
      propertyId: id,
    })
  }

  async function handleWizardSave(nextProperty: Property) {
    if (wizardState.mode === 'create') {
      // Одна попытка создания = один ключ (см. ObjectEditWizard): повтор после
      // сетевой ошибки уходит с тем же ключом, иначе создастся второй объект.
      if (!createAttemptRef.current) {
        createAttemptRef.current = `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      }
      const attempt = createAttemptRef.current
      try {
        const phone = (nextProperty as any).rawAsset?.representativePhone || '+995500123456'
        const lng = Number(nextProperty.details?.mapLng) || 41.64
        const lat = Number(nextProperty.details?.mapLat) || 41.64
        const asset = await propertyAssetsApi.createAsset({
          propertyType: uiPropertyTypeToAsset(nextProperty.type),
          commercialSubtype: nextProperty.type === 'Коммерция' ? 'office' : undefined,
          location: {
            country: nextProperty.country || 'Грузия',
            city: nextProperty.city || 'Батуми',
            address: nextProperty.street || 'ул. Руставели, 1',
            geo: { type: 'Point', coordinates: [lng, lat] },
          },
          characteristics: {
            area: nextProperty.area || 50,
            rooms: nextProperty.rooms || 1,
            floor: nextProperty.floor || 1,
            totalFloors: nextProperty.totalFloors || 1,
          },
          representativePhone: phone,
        }, getCreateIdempotencyKey(`${attempt}:asset`))
        const dealType = nextProperty.category === 'rent' ? 'rent_long' : 'sale'
        const listing = await propertyAssetsApi.createListing(asset._id, {
          dealType,
          price: {
            amountMinorUnits: Math.round((nextProperty.price || 0) * 100),
            currency: 'USD',
          },
        }, getCreateIdempotencyKey(`${attempt}:listing`))

        resetCreateIdempotencyKey(`${attempt}:asset`)
        resetCreateIdempotencyKey(`${attempt}:listing`)
        createAttemptRef.current = ''

        if (nextProperty.status === 'for_sale') {
          try {
            await propertyAssetsApi.activateListing(asset._id, listing._id)
          } catch {}
        }
      } catch (err: any) {
        console.error('Failed to create asset in wizard:', err)
      }
    }
    await loadProperties()
    setSelectedIds(new Set())
    setSearch('')
    setAlertFilter(nextProperty.status === 'archive' ? 'archive' : nextProperty.status === 'draft' ? 'draft' : null)
    setActiveTab(nextProperty.status === 'archive' ? 'archive' : nextProperty.category)
    closeWizard()
  }

  const wizardActor = {
    id: currentUser?.id ?? 'lm-1',
    name: currentUser?.name ?? 'Менеджер',
  }

  // ── отрисовка ───────────────────────────────────────────────────────────────

  const pageTitle = scope === 'my' ? 'МОИ ОБЪЕКТЫ' : 'ВСЕ ОБЪЕКТЫ'

  return (
    <div className="mp-page-root min-h-full">
      <div className="mp-page-bg" aria-hidden />
      <div className="mp-page-inner space-y-4 p-6 lg:p-8">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 border-b border-[var(--green-border)] pb-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <h1 className="text-lg font-normal tracking-tight text-[color:var(--app-text)]">{pageTitle}</h1>
            <span className="rounded-full border border-[var(--hub-card-border-hover)] bg-[var(--nav-item-bg-active)] px-2.5 py-0.5 text-xs font-normal text-[color:var(--theme-accent-heading)]">
              {totalCount} объектов
            </span>
          </div>

          {!readOnly && (
            <button type="button" onClick={openCreateWizard} className="alphabase-section-primary !normal-case">
              <Plus className="size-4 stroke-[2.5]" />
              Добавить объект
            </button>
          )}
        </div>

        {/* ── Scope toggle (только для менеджера) ── */}
        {isManager && (
          <ScopeToggle scope={scope} onChange={handleScopeChange} />
        )}

        {/* ── Фильтр по менеджерам (РОП+ в scope=all) ── */}
        {scope === 'all' && !isManager && agentStats.length > 0 && (
          <Select value={agentFilter ?? 'all'} onValueChange={(v) => setAgentFilter(v === 'all' ? null : v)}>
            <SelectTrigger className="h-9 w-64 rounded-xl border border-[var(--green-border)] bg-[var(--green-deep)] text-sm text-[color:var(--workspace-text)] shadow-none focus:border-[var(--hub-card-border-hover)] focus:ring-1 focus:ring-[var(--hub-card-border)] [&>span]:text-[color:var(--workspace-text)]">
              <SelectValue placeholder="Все менеджеры" />
            </SelectTrigger>
            <SelectContent className="border-[var(--green-border)] bg-[var(--green-deep)] text-[color:var(--workspace-text)] backdrop-blur-sm">
              <SelectItem value="all" className="focus:bg-[var(--nav-item-bg-active)] focus:text-[color:var(--workspace-text)]">
                Все менеджеры
              </SelectItem>
              {agentStats.map((a) => (
                <SelectItem key={a.agentId} value={a.agentId} className="focus:bg-[var(--nav-item-bg-active)] focus:text-[color:var(--workspace-text)]">
                  <span className="flex items-center gap-2">
                    {a.agentName}
                    {a.overdue > 0 && (
                      <span className="rounded-full bg-red-500/20 border border-red-500/30 px-1.5 text-[10px] font-normal text-red-400">
                        {a.overdue} просрочки
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* ── Обзор / быстрый фильтр ── */}
        <PropertyAlerts
          upToDate={alertCounts.upToDate}
          needsAttention={alertCounts.needsAttention}
          needsUpdate={alertCounts.needsUpdate}
          drafts={alertCounts.drafts}
          archived={alertCounts.archived}
          activeFilter={alertFilter}
          onFilterChange={handleAlertFilter}
        />

        {/* ── Toolbar ── */}
        <Toolbar
          activeTab={activeTab}
          onTabChange={(tab) => { setActiveTab(tab); setSelectedIds(new Set()); setAlertFilter(null) }}
          search={search}
          onSearchChange={setSearch}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortDesc={sortDesc}
          onSortToggle={() => setSortDesc((v) => !v)}
          onFiltersOpen={() => setFiltersOpen(true)}
          activeFiltersCount={activeFiltersCount}
        />

        {/* ── Bulk bar (не-архив, не readOnly) ── */}
        {!isArchive && !readOnly && (
          <BulkBar
            selectedCount={selectedIds.size}
            onApply={handleBulkApply}
            onDeleteSelected={handleDeleteSelected}
          />
        )}

        {/* ── Table / Grid / Compact ── */}
        <PropertyTable
          properties={filtered}
          isArchive={isArchive}
          isBulkMode={isBulkMode}
          selectedIds={selectedIds}
          viewMode={viewMode}
          readOnly={readOnly}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onEdit={openEditWizard}
          onDelete={handleDelete}
          onRestore={handleRestore}
          canPublishMls={canPublishMls}
          onMls={openMls}
        />

        {/* ── Filter dialog ── */}
        <FilterPanel
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          filters={filters}
          onApply={setFilters}
        />

        {!readOnly && (
          <PropertyWizardDialog
            key={
              wizardState.open
                ? `${wizardState.mode}-${wizardState.propertyId ?? `new-${wizardState.defaults?.category ?? 'x'}`}`
                : 'wizard-closed'
            }
            open={wizardState.open}
            mode={wizardState.mode}
            actor={wizardActor}
            property={editingProperty}
            defaults={wizardState.defaults}
            onClose={closeWizard}
            onSave={handleWizardSave}
          />
        )}

        {/* ── MLS диалог ── */}
        {mlsTarget && (
          <MlsConfirmDialog
            property={mlsTarget.property}
            mode={mlsTarget.mode}
            onClose={() => setMlsTarget(null)}
            onConfirmed={handleMlsConfirmed}
          />
        )}

      </div>
    </div>
  )
}

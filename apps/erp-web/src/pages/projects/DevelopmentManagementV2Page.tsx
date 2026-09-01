import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, Plus, RefreshCw, Upload } from 'lucide-react'
import {
  developmentsApiV2,
  type BuildingV2,
  type DevelopmentV2,
  type FloorPlanV2,
  type FloorV2,
  type PublicationStatusResult,
  type SectionV2,
  type UnitKindV2,
  type UnitStatusV2,
  type UnitV2,
} from '@/services/developmentsApiV2'
import { useRolePermissions } from '@/hooks/useRolePermissions'
import {
  BuildingsPanel,
  SectionsPanel,
  FloorsPanel,
  FloorPlansPanel,
  PublishConfirmDialog,
  UnitForm,
  UnitsByFloorList,
  DevelopmentChessboardV2,
  extractErrorMessage,
  usePublicationStatusPolling,
  type ExtractedError,
} from '@/features/developments-v2'

/**
 * P1-фикс (StrictMode): module-level dedup-кэш in-flight publication-status
 * запросов по developmentId. React 18 StrictMode в dev монтирует эффект
 * дважды подряд (mount → cleanup → mount) синхронно, ДО того как первый
 * запрос успевает резолвиться — ref, живущий внутри компонента, пересоздаётся
 * между этими двумя монтированиями и не может служить дедупликатором сам по
 * себе. Module-scope Map переживает оба монтирования StrictMode (тот же
 * модуль, тот же импорт), а запись из неё удаляется только когда сам запрос
 * реально завершился (успехом или ошибкой) — второй эффект просто
 * переиспользует Promise первого, не шлёт второй HTTP-запрос.
 */
const publicationStatusInFlight = new Map<string, Promise<PublicationStatusResult>>()

function fetchPublicationStatusDeduped(developmentId: string): Promise<PublicationStatusResult> {
  const existing = publicationStatusInFlight.get(developmentId)
  if (existing) return existing
  const promise = developmentsApiV2.getPublicationStatus(developmentId).finally(() => {
    publicationStatusInFlight.delete(developmentId)
  })
  publicationStatusInFlight.set(developmentId, promise)
  return promise
}

function isPublicationNotFoundError(err: unknown): boolean {
  const anyErr = err as { response?: { status?: number; data?: { error?: { code?: string } } } }
  return anyErr?.response?.status === 404 && anyErr?.response?.data?.error?.code === 'PUBLICATION_NOT_FOUND'
}

/** Только для тестов — сбрасывает module-level dedup-кэш между тестовыми прогонами. */
export function __resetPublicationStatusDedupCacheForTests(): void {
  publicationStatusInFlight.clear()
}

/**
 * D-02 COMPLETE: родительская страница управления полной иерархией одного
 * Development — Building→Section→Floor→FloorPlan→Unit→V2 chessboard.
 * Владеет всем состоянием локальным useState (никакого Redux/Zustand/
 * Context/useCoreStore) — выбор Development из URL, выбор Building локальный
 * UI-стейт этой страницы, данные пропсами вниз в панели/шахматку.
 */
export function DevelopmentManagementV2Page() {
  const { id: developmentId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isManagementPosition } = useRolePermissions()

  const [development, setDevelopment] = useState<DevelopmentV2 | null>(null)
  const [developmentLoading, setDevelopmentLoading] = useState(true)
  const [developmentError, setDevelopmentError] = useState<string | null>(null)
  const [developmentNotFound, setDevelopmentNotFound] = useState(false)
  const [developmentReloadTrigger, setDevelopmentReloadTrigger] = useState(0)

  const [buildings, setBuildings] = useState<BuildingV2[]>([])
  const [buildingsLoading, setBuildingsLoading] = useState(false)
  const [buildingsError, setBuildingsError] = useState<string | null>(null)
  const [buildingsReloadTrigger, setBuildingsReloadTrigger] = useState(0)
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null)

  const [sections, setSections] = useState<SectionV2[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [sectionsError, setSectionsError] = useState<string | null>(null)
  const [sectionsReloadTrigger, setSectionsReloadTrigger] = useState(0)

  const [floors, setFloors] = useState<FloorV2[]>([])
  const [floorsLoading, setFloorsLoading] = useState(false)
  const [floorsError, setFloorsError] = useState<string | null>(null)
  const [floorsReloadTrigger, setFloorsReloadTrigger] = useState(0)

  const [floorPlans, setFloorPlans] = useState<FloorPlanV2[]>([])
  const [floorPlansLoading, setFloorPlansLoading] = useState(false)
  const [floorPlansError, setFloorPlansError] = useState<string | null>(null)
  const [floorPlansReloadTrigger, setFloorPlansReloadTrigger] = useState(0)

  const [units, setUnits] = useState<UnitV2[]>([])
  const [unitsLoading, setUnitsLoading] = useState(false)
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [unitsReloadTrigger, setUnitsReloadTrigger] = useState(0)
  const [unitKindFilter, setUnitKindFilter] = useState<UnitKindV2 | ''>('')
  const [unitStatusFilter, setUnitStatusFilter] = useState<UnitStatusV2 | ''>('')
  const [unitFormOpen, setUnitFormOpen] = useState(false)

  // D-03: publish state — submitting/confirm-диалог/ошибка publish-запроса
  // отдельно от polling-состояния публикации (publicationStatus).
  const [publishSubmitting, setPublishSubmitting] = useState(false)
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)
  const [publishError, setPublishError] = useState<ExtractedError | null>(null)
  const [publicationStatus, setPublicationStatus] = useState<PublicationStatusResult | null>(null)

  // Development — initial loading блокирует рендер остального дерева.
  useEffect(() => {
    if (!developmentId) return
    setDevelopmentLoading(true)
    setDevelopmentError(null)
    setDevelopmentNotFound(false)
    developmentsApiV2
      .getById(developmentId)
      .then((data) => {
        setDevelopment(data)
        setDevelopmentLoading(false)
      })
      .catch((err: unknown) => {
        const { message, isNotFound } = extractErrorMessage(err, 'Не удалось загрузить ЖК')
        setDevelopmentError(message)
        setDevelopmentNotFound(isNotFound)
        setDevelopmentLoading(false)
      })
  }, [developmentId, developmentReloadTrigger])

  // Buildings — сразу после development успешно загружен.
  const loadBuildings = useCallback(() => {
    if (!developmentId) return
    setBuildingsLoading(true)
    setBuildingsError(null)
    developmentsApiV2
      .listBuildings(developmentId)
      .then((data) => {
        setBuildings(data)
        setBuildingsLoading(false)
      })
      .catch((err: unknown) => {
        setBuildings([])
        setBuildingsError(extractErrorMessage(err, 'Не удалось загрузить корпуса').message)
        setBuildingsLoading(false)
      })
  }, [developmentId])

  useEffect(() => {
    if (!development) return
    loadBuildings()
  }, [development, loadBuildings, buildingsReloadTrigger])

  // Sections/Floors/FloorPlans — три независимых запроса при смене
  // selectedBuildingId (не зависят друг от друга), каждый со своим loading/error.
  useEffect(() => {
    if (!selectedBuildingId) {
      setSections([])
      return
    }
    setSectionsLoading(true)
    setSectionsError(null)
    developmentsApiV2
      .listSections(selectedBuildingId)
      .then((data) => {
        setSections(data)
        setSectionsLoading(false)
      })
      .catch((err: unknown) => {
        setSections([])
        setSectionsError(extractErrorMessage(err, 'Не удалось загрузить секции').message)
        setSectionsLoading(false)
      })
  }, [selectedBuildingId, sectionsReloadTrigger])

  useEffect(() => {
    if (!selectedBuildingId) {
      setFloors([])
      return
    }
    setFloorsLoading(true)
    setFloorsError(null)
    developmentsApiV2
      .listFloors(selectedBuildingId)
      .then((data) => {
        setFloors(data)
        setFloorsLoading(false)
      })
      .catch((err: unknown) => {
        setFloors([])
        setFloorsError(extractErrorMessage(err, 'Не удалось загрузить этажи').message)
        setFloorsLoading(false)
      })
  }, [selectedBuildingId, floorsReloadTrigger])

  useEffect(() => {
    if (!selectedBuildingId) {
      setFloorPlans([])
      return
    }
    setFloorPlansLoading(true)
    setFloorPlansError(null)
    developmentsApiV2
      .listFloorPlans(selectedBuildingId)
      .then((data) => {
        setFloorPlans(data)
        setFloorPlansLoading(false)
      })
      .catch((err: unknown) => {
        setFloorPlans([])
        setFloorPlansError(extractErrorMessage(err, 'Не удалось загрузить планировки').message)
        setFloorPlansLoading(false)
      })
  }, [selectedBuildingId, floorPlansReloadTrigger])

  // Units — server-side рефетч при смене building ИЛИ kind/status фильтра
  // (НЕ client-side фильтр урезанного набора — limit=500 может обрезать
  // релевантные записи при повторной фильтрации уже урезанного списка).
  useEffect(() => {
    if (!selectedBuildingId) {
      setUnits([])
      return
    }
    setUnitsLoading(true)
    setUnitsError(null)
    developmentsApiV2
      .listUnits(selectedBuildingId, {
        kind: unitKindFilter || undefined,
        status: unitStatusFilter || undefined,
        limit: 500,
      })
      .then((data) => {
        setUnits(data)
        setUnitsLoading(false)
      })
      .catch((err: unknown) => {
        setUnits([])
        setUnitsError(extractErrorMessage(err, 'Не удалось загрузить юниты').message)
        setUnitsLoading(false)
      })
  }, [selectedBuildingId, unitKindFilter, unitStatusFilter, unitsReloadTrigger])

  function handleUnitUpdated(updated: UnitV2) {
    setUnits((prev) => prev.map((u) => (u._id === updated._id ? updated : u)))
  }

  // P1-фикс: publicationStatus живёт только в памяти компонента — после
  // reload он теряется, а polling условие (status==='publication_pending')
  // никогда само по себе не станет true. Один раз после успешной загрузки
  // Development спрашиваем реальный статус публикации у backend, чтобы
  // published/pending/build_failed корректно восстанавливались после F5.
  //
  // Только PUBLICATION_NOT_FOUND (error.code, не голый HTTP-статус) для
  // draft — нормальное состояние (публикация ещё не запускалась), не
  // ошибка — publicationStatus остаётся null, никакого error banner. Любой
  // другой 404 (например протухший/битый developmentId) — реальная ошибка,
  // должен попасть в publishError как обычно.
  //
  // fetchPublicationStatusDeduped — module-level dedup, переживает React
  // StrictMode double-invoke (mount→cleanup→mount синхронно, ДО резолва
  // первого запроса): cleanup здесь НЕ сбрасывает "in-flight"-состояние
  // сам — это сделал бы только реальный finally() запроса. cancelled
  // привязан к конкретному запуску эффекта (замыкает свой developmentId) —
  // применяет результат только если ни этот эффект не размонтирован, ни
  // developmentId с тех пор не сменился на другой.
  const developmentLoaded = development !== null
  useEffect(() => {
    if (!developmentLoaded || !developmentId) return
    let cancelled = false
    fetchPublicationStatusDeduped(developmentId)
      .then((result) => {
        if (cancelled) return
        setPublicationStatus(result)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (!isPublicationNotFoundError(err)) {
          setPublishError(extractErrorMessage(err, 'Не удалось загрузить статус публикации'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [developmentLoaded, developmentId])

  // synchronous lock — setPublishSubmitting(true) сам по себе не защищает
  // от двойного клика ДО следующего рендера (React batching: два clientside
  // fireEvent.click подряд в одном event-loop тике могут оба пройти проверку
  // до того, как disabled-пропс дойдёт до DOM). Ref читается/пишется
  // синхронно, не ждёт цикла рендера — вторая попытка отсекается раньше
  // первого await, backend Idempotency-Key — второй, окончательный рубеж.
  const publishInFlightRef = useRef(false)

  async function handlePublish() {
    if (!developmentId || publishInFlightRef.current) return
    publishInFlightRef.current = true
    setPublishSubmitting(true)
    setPublishError(null)
    try {
      const result = await developmentsApiV2.publish(developmentId)
      // Локальное обновление сразу, тот же паттерн handleUnitUpdated — не
      // ждать следующего polling-тика, чтобы UI перестал показывать
      // draft-состояние (сам publish уже подтверждён 202-ответом).
      setDevelopment((prev) => (prev ? { ...prev, status: 'active' } : prev))
      setPublicationStatus({
        publicationId: result.id,
        status: result.status as PublicationStatusResult['status'],
        version: 0,
      })
      setPublishConfirmOpen(false)
    } catch (err) {
      setPublishError(extractErrorMessage(err, 'Не удалось опубликовать ЖК'))
    } finally {
      publishInFlightRef.current = false
      setPublishSubmitting(false)
    }
  }

  // Polling стартует только пока локальный статус публикации pending —
  // останавливается сам, как только onStatusChange получит терминальный статус.
  usePublicationStatusPolling({
    developmentId,
    enabled: publicationStatus?.status === 'publication_pending',
    onStatusChange: setPublicationStatus,
  })

  if (!developmentId) {
    return null
  }

  return (
    <div className="felt-content flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/dashboard/development/projects')}
          className="flex items-center gap-2 rounded-sm border border-[color:var(--green-border)] bg-transparent px-4 py-2 text-[16px] font-normal text-[color:var(--app-text-muted)] hover:bg-[var(--green-card)] hover:text-[color:var(--app-text)]"
        >
          <ArrowLeft className="size-4" />
          Назад к объектам
        </button>
        {development && (
          <h1 className="text-[30px] font-normal tracking-[-0.02em] text-[color:var(--app-text)]">{development.name}</h1>
        )}

        {development?.status === 'draft' && isManagementPosition && (
          <button
            type="button"
            onClick={() => setPublishConfirmOpen(true)}
            data-testid="publish-development-button"
            className="flex items-center gap-2 rounded-sm bg-[var(--gold)] px-4 py-2 text-[16px] font-medium text-[color:var(--gold-btn-text)] hover:bg-[var(--gold-light)]"
          >
            <Upload className="size-4" />
            Опубликовать
          </button>
        )}

        {publicationStatus?.status === 'publication_pending' && (
          <span
            data-testid="publication-status-pending"
            className="flex items-center gap-1.5 rounded-sm bg-[rgba(3,29,22,0.5)] px-3 py-1.5 text-[16px] font-normal text-[color:var(--app-text-muted)]"
          >
            <RefreshCw className="size-4 animate-spin" />
            Публикация…
          </span>
        )}

        {publicationStatus?.status === 'published' && (
          <span
            data-testid="publication-status-published"
            className="flex items-center gap-1.5 rounded-sm bg-[color-mix(in_srgb,var(--gold)_14%,transparent)] px-3 py-1.5 text-[16px] font-normal text-[color:var(--gold)]"
          >
            <CheckCircle2 className="size-4" />
            Опубликовано{publicationStatus.slug ? ` · ${publicationStatus.slug}` : ''}
          </span>
        )}

        {publicationStatus?.status === 'build_failed' && (
          <span
            data-testid="publication-status-build-failed"
            className="flex items-center gap-1.5 rounded-sm bg-[rgba(255,180,171,0.1)] px-3 py-1.5 text-[16px] font-normal text-[#ffb4ab]"
          >
            <AlertCircle className="size-4" />
            {publicationStatus.buildError ?? 'Не удалось опубликовать. Обратитесь в поддержку.'}
          </span>
        )}
      </div>

      {publishError && (
        <div
          data-testid={
            publishError.isForbidden
              ? 'publish-forbidden-banner'
              : publishError.isVersionConflict
                ? 'publish-conflict-banner'
                : 'publish-error-banner'
          }
          className="flex items-center justify-between gap-3 rounded-md bg-[var(--green-card)] px-5 py-4 text-[16px] font-normal text-[#ffb4ab] shadow-[inset_0_0_0_1px_rgba(255,180,171,0.25)]"
        >
          <span>{publishError.message}</span>
          {publishError.isVersionConflict ? (
            <button
              type="button"
              onClick={() => setDevelopmentReloadTrigger((v) => v + 1)}
              className="shrink-0 rounded-sm border border-[#ffb4ab] px-3 py-1.5 text-[16px] font-normal text-[#ffb4ab] hover:bg-[rgba(255,180,171,0.1)]"
            >
              Обновить
            </button>
          ) : !publishError.isForbidden ? (
            <button
              type="button"
              onClick={() => void handlePublish()}
              className="shrink-0 rounded-sm border border-[#ffb4ab] px-3 py-1.5 text-[16px] font-normal text-[#ffb4ab] hover:bg-[rgba(255,180,171,0.1)]"
            >
              Повторить
            </button>
          ) : null}
        </div>
      )}

      <PublishConfirmDialog
        developmentName={development?.name ?? ''}
        open={publishConfirmOpen}
        submitting={publishSubmitting}
        onConfirm={() => void handlePublish()}
        onCancel={() => setPublishConfirmOpen(false)}
      />

      {developmentLoading ? (
        <div
          data-testid="development-management-loading"
          className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-md bg-[var(--green-card)] p-12 text-center shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]"
        >
          <div className="relative size-10">
            <span className="absolute inset-0 rounded-full border-2 border-[color:color-mix(in_srgb,var(--gold)_20%,transparent)]" />
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--gold)]" />
          </div>
          <p className="text-[19px] font-normal text-[color:var(--app-text-muted)]">Загрузка ЖК…</p>
        </div>
      ) : developmentError ? (
        <div
          data-testid={developmentNotFound ? 'development-not-found' : 'development-error'}
          className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-md bg-[var(--green-card)] p-12 text-center shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]"
        >
          <AlertCircle className="size-10 text-[#ffb4ab]" />
          <p className="max-w-md text-[19px] font-normal text-[color:var(--app-text-muted)]">{developmentError}</p>
          {developmentNotFound ? (
            <button
              type="button"
              onClick={() => navigate('/dashboard/development/projects')}
              className="flex items-center gap-2 rounded-sm border border-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_20%,transparent)] px-5 py-2.5 text-[16px] font-medium text-[color:var(--app-text)] hover:bg-[color-mix(in_srgb,var(--gold)_30%,transparent)]"
            >
              <ArrowLeft className="size-4" />
              Назад к списку
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDevelopmentReloadTrigger((v) => v + 1)}
              className="flex items-center gap-2 rounded-sm border border-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_20%,transparent)] px-5 py-2.5 text-[16px] font-medium text-[color:var(--app-text)] hover:bg-[color-mix(in_srgb,var(--gold)_30%,transparent)]"
            >
              <RefreshCw className="size-4" />
              Повторить
            </button>
          )}
        </div>
      ) : (
        <>
          <BuildingsPanel
            developmentId={developmentId}
            buildings={buildings}
            loading={buildingsLoading}
            error={buildingsError}
            onRetry={() => setBuildingsReloadTrigger((v) => v + 1)}
            selectedBuildingId={selectedBuildingId}
            onSelectBuilding={setSelectedBuildingId}
            onCreated={(building) => setBuildings((prev) => [...prev, building])}
            canCreate={isManagementPosition}
          />

          {selectedBuildingId && (
            <>
              <div className="grid gap-6 md:grid-cols-3">
                <SectionsPanel
                  buildingId={selectedBuildingId}
                  sections={sections}
                  loading={sectionsLoading}
                  error={sectionsError}
                  onRetry={() => setSectionsReloadTrigger((v) => v + 1)}
                  onCreated={(section) => setSections((prev) => [...prev, section])}
                  canCreate={isManagementPosition}
                />
                <FloorsPanel
                  buildingId={selectedBuildingId}
                  floors={floors}
                  sections={sections}
                  loading={floorsLoading}
                  error={floorsError}
                  onRetry={() => setFloorsReloadTrigger((v) => v + 1)}
                  onCreated={(floor) => setFloors((prev) => [...prev, floor])}
                  canCreate={isManagementPosition}
                />
                <FloorPlansPanel
                  buildingId={selectedBuildingId}
                  floorPlans={floorPlans}
                  loading={floorPlansLoading}
                  error={floorPlansError}
                  onRetry={() => setFloorPlansReloadTrigger((v) => v + 1)}
                  onCreated={(floorPlan) => setFloorPlans((prev) => [...prev, floorPlan])}
                  canCreate={isManagementPosition}
                />
              </div>

              <section className="rounded-md bg-[var(--green-card)] p-5 shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[24px] font-medium tracking-[-0.02em] text-[color:var(--app-text)]">Создать юнит</h2>
                  {isManagementPosition && !unitFormOpen && (
                    <button
                      type="button"
                      onClick={() => setUnitFormOpen(true)}
                      className="flex items-center gap-2 rounded-sm border border-[color:var(--green-border)] bg-transparent px-4 py-2 text-[16px] font-normal text-[color:var(--app-text-muted)] hover:bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] hover:text-[color:var(--app-text)]"
                    >
                      <Plus className="size-4" />
                      Добавить юнит
                    </button>
                  )}
                </div>
                {unitFormOpen && (
                  <UnitForm
                    buildingId={selectedBuildingId}
                    floors={floors}
                    floorPlans={floorPlans}
                    onCreated={(unit) => {
                      setUnits((prev) => [...prev, unit])
                      setUnitFormOpen(false)
                    }}
                    onCancel={() => setUnitFormOpen(false)}
                  />
                )}
              </section>

              <UnitsByFloorList
                units={units}
                floors={floors}
                loading={unitsLoading}
                error={unitsError}
                onRetry={() => setUnitsReloadTrigger((v) => v + 1)}
                kindFilter={unitKindFilter}
                statusFilter={unitStatusFilter}
                onKindFilterChange={setUnitKindFilter}
                onStatusFilterChange={setUnitStatusFilter}
                onUnitUpdated={handleUnitUpdated}
              />

              <DevelopmentChessboardV2
                buildingId={selectedBuildingId}
                floors={floors}
                units={units}
                loading={unitsLoading || floorsLoading}
                error={unitsError ?? floorsError}
                onRetry={() => {
                  setUnitsReloadTrigger((v) => v + 1)
                  setFloorsReloadTrigger((v) => v + 1)
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

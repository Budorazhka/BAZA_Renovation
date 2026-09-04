import { FormEvent, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApi } from '../api/admin-api'
import { useAdminDuplicateCandidates } from '../hooks/useAdminDuplicateCandidates'
import { useConfirmReasonAction } from '../hooks/useConfirmReasonAction'
import { ConfirmReasonDialog } from '../components/ConfirmReasonDialog'
import { duplicateCandidateStatusLabel, formatDateTime } from '../lib/format'
import type {
  AdminDuplicateCandidateAssetSummary,
  AdminDuplicateCandidateListItem,
  ConfirmDuplicateResult,
  DuplicateCandidateStatus,
} from '../types/admin'

const DUPLICATE_STATUSES: DuplicateCandidateStatus[] = [
  'detected',
  'override_not_duplicate',
  'confirmed_duplicate',
]

function canConfirm(item: AdminDuplicateCandidateListItem): boolean {
  return item.status !== 'confirmed_duplicate'
}

function readStatusFromUrl(value: string | null): DuplicateCandidateStatus | '' {
  return value && (DUPLICATE_STATUSES as string[]).includes(value) ? (value as DuplicateCandidateStatus) : ''
}

function renderAssetSummary(asset: AdminDuplicateCandidateAssetSummary | null) {
  if (!asset) return <span>—</span>
  return (
    <div className="asset-summary">
      <div>
        <strong>{asset.location.city}</strong>, {asset.location.address}
      </div>
      <div className="asset-summary__details">
        {asset.characteristics.area} м²
        {asset.characteristics.rooms != null ? ` • ${asset.characteristics.rooms} комн.` : ''}
        {asset.characteristics.floor != null ? ` • этаж ${asset.characteristics.floor}` : ''}
      </div>
      <div className="asset-summary__phone">Тел: {asset.representativePhone || '—'}</div>
      <div className="asset-summary__id">ID: <code>{asset.id}</code></div>
    </div>
  )
}

function renderSignals(signals: AdminDuplicateCandidateListItem['signals']) {
  const matched: string[] = []
  if (signals.phoneMatch) matched.push('Телефон')
  if (signals.addressMatch) matched.push('Адрес')
  if (signals.roomsAreaFloorMatch) matched.push('Комнаты / Площадь / Этаж')
  return (
    <div className="signals-list">
      {matched.length > 0 ? (
        matched.map((s) => (
          <span key={s} className="signal-pill">
            {s}
          </span>
        ))
      ) : (
        <span>Нет прямых совпадений</span>
      )}
    </div>
  )
}

export function DuplicateCandidatesPage() {
  const [searchParams] = useSearchParams()
  const [statusInput, setStatusInput] = useState<DuplicateCandidateStatus | ''>(() =>
    readStatusFromUrl(searchParams.get('status')),
  )
  const [activeFilter, setActiveFilter] = useState<{ status?: DuplicateCandidateStatus }>(() => {
    const status = readStatusFromUrl(searchParams.get('status'))
    return status ? { status } : {}
  })

  const { state, loadMore, applyConfirmed } = useAdminDuplicateCandidates(activeFilter)

  const confirmAction = useConfirmReasonAction<AdminDuplicateCandidateListItem, ConfirmDuplicateResult>(
    (candidate, reason) => adminApi.confirmDuplicate(candidate.id, reason),
    (result, target) => {
      applyConfirmed({ id: result.id, status: result.status, confirmReason: target.confirmReason })
    },
  )

  function submitFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActiveFilter({ status: statusInput || undefined })
  }

  function resetFilter() {
    setStatusInput('')
    setActiveFilter({})
  }

  return (
    <section className="page">
      <div className="page-header">
        <h1>Очередь дубликатов</h1>
        <p className="page-caption">
          Пары объявлений, заподозренные в дублировании или оспоренные автором. Подтверждение переводит пару в статус подтверждённого дубликата.
        </p>
      </div>

      <form className="filter-bar" onSubmit={submitFilter}>
        <div className="filter-field">
          <label htmlFor="filter-duplicate-status">Статус</label>
          <select
            id="filter-duplicate-status"
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value as DuplicateCandidateStatus | '')}
          >
            <option value="">По умолчанию (на проверке: обнаружены / оспорены)</option>
            {DUPLICATE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {duplicateCandidateStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Применить</button>
        {activeFilter.status ? (
          <button type="button" className="secondary" onClick={resetFilter}>
            Сбросить
          </button>
        ) : null}
      </form>

      {state.status === 'loading' ? <div className="state-panel">Загружаем очередь дубликатов…</div> : null}
      {state.status === 'error' ? (
        <div className="state-panel state-panel--error">
          <p>{state.message}</p>
          <button type="button" onClick={state.retry}>
            Повторить
          </button>
        </div>
      ) : null}
      {state.status === 'empty' ? (
        <div className="state-panel">Дубликатов по этому фильтру нет.</div>
      ) : null}

      {state.status === 'ready' ? (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Объявление A</th>
                  <th>Объявление B</th>
                  <th>Сигналы совпадения</th>
                  <th>Статус</th>
                  <th>Обнаружен</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => (
                  <tr key={item.id}>
                    <td>{renderAssetSummary(item.assetA)}</td>
                    <td>{renderAssetSummary(item.assetB)}</td>
                    <td>{renderSignals(item.signals)}</td>
                    <td>
                      <span className={`status-pill status-pill--${item.status}`}>
                        {duplicateCandidateStatusLabel(item.status)}
                      </span>
                      {item.overrideReason ? (
                        <p className="unpublish-reason">Оспорено автором: {item.overrideReason}</p>
                      ) : null}
                      {item.confirmReason ? (
                        <p className="unpublish-reason">Причина подтверждения: {item.confirmReason}</p>
                      ) : null}
                    </td>
                    <td>{formatDateTime(item.detectedAt)}</td>
                    <td>
                      {canConfirm(item) ? (
                        <button type="button" className="danger" onClick={() => confirmAction.open(item)}>
                          Подтвердить дубль
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.nextCursor ? (
            <button className="load-more" type="button" onClick={loadMore} disabled={state.loadingMore}>
              {state.loadingMore ? 'Загружаем…' : 'Показать ещё'}
            </button>
          ) : null}
        </>
      ) : null}

      <ConfirmReasonDialog
        dialog={confirmAction.dialog}
        title="Подтвердить дубликат?"
        renderTarget={(cand) =>
          `Кандидат ${cand.id} (Объявление A: ${cand.assetA?.id ?? '—'}, Объявление B: ${cand.assetB?.id ?? '—'})`
        }
        warning="Пара объявлений будет зафиксирована как подтверждённый администратором дубликат. Действие необратимо и логируется в аудите."
        confirmLabel="Подтвердить дубль"
        confirmingLabel="Подтверждаем…"
        minReasonLength={confirmAction.minReasonLength}
        canSubmit={confirmAction.canSubmit}
        onReasonChange={confirmAction.setReason}
        onCancel={confirmAction.close}
        onConfirm={() => void confirmAction.submit()}
      />
    </section>
  )
}

import { FormEvent, useState } from 'react'
import { useAdminPublications } from '../hooks/useAdminPublications'
import { useUnpublishAction } from '../hooks/useUnpublishAction'
import { UnpublishDialog } from '../components/UnpublishDialog'
import { formatDateTime, publicationStatusLabel, sourceTypeLabel } from '../lib/format'
import type { AdminPublicationListItem, PublicationSourceType } from '../types/admin'

const SOURCE_TYPES: PublicationSourceType[] = ['development', 'unit', 'listing']

function canUnpublish(item: AdminPublicationListItem): boolean {
  return item.status === 'published'
}

export function PublicationsPage() {
  const [sourceTypeInput, setSourceTypeInput] = useState<PublicationSourceType | ''>('')
  const [cityInput, setCityInput] = useState('')
  const [activeFilter, setActiveFilter] = useState<{ sourceType?: PublicationSourceType; city?: string }>({})

  const { state, loadMore, applyUnpublished } = useAdminPublications(activeFilter)
  const unpublishAction = useUnpublishAction((result) => {
    applyUnpublished({ id: result.id, status: result.status, unpublishReason: result.unpublishReason })
  })

  function submitFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActiveFilter({ sourceType: sourceTypeInput || undefined, city: cityInput.trim() || undefined })
  }

  function resetFilter() {
    setSourceTypeInput('')
    setCityInput('')
    setActiveFilter({})
  }

  return (
    <section className="page">
      <div className="page-header">
        <h1>Публикации</h1>
        <p className="page-caption">Список ограничен вашим scope — вы видите только те source type/города, на которые у вас есть grant.</p>
      </div>

      <form className="filter-bar" onSubmit={submitFilter}>
        <div className="filter-field">
          <label htmlFor="filter-source-type">Тип</label>
          <select id="filter-source-type" value={sourceTypeInput} onChange={(e) => setSourceTypeInput(e.target.value as PublicationSourceType | '')}>
            <option value="">Все типы</option>
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {sourceTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="filter-city">Город</label>
          <input id="filter-city" value={cityInput} onChange={(e) => setCityInput(e.target.value)} placeholder="Например, batumi" />
        </div>
        <button type="submit">Применить</button>
        {activeFilter.sourceType || activeFilter.city ? (
          <button type="button" className="secondary" onClick={resetFilter}>
            Сбросить
          </button>
        ) : null}
      </form>

      {state.status === 'loading' ? <div className="state-panel">Загружаем публикации…</div> : null}
      {state.status === 'error' ? (
        <div className="state-panel state-panel--error">
          <p>{state.message}</p>
          <button type="button" onClick={state.retry}>
            Повторить
          </button>
        </div>
      ) : null}
      {state.status === 'empty' ? <div className="state-panel">По этому фильтру публикаций нет — либо их нет в системе, либо они вне вашего scope.</div> : null}

      {state.status === 'ready' ? (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Город</th>
                  <th>Статус</th>
                  <th>Опубликовано</th>
                  <th>Снято</th>
                  <th>Slug</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {state.items.map((item) => (
                  <tr key={item.id}>
                    <td>{sourceTypeLabel(item.sourceType)}</td>
                    <td>{item.city ?? '—'}</td>
                    <td>
                      <span className={`status-pill status-pill--${item.status}`}>{publicationStatusLabel(item.status)}</span>
                      {item.unpublishReason ? <p className="unpublish-reason">Причина: {item.unpublishReason}</p> : null}
                    </td>
                    <td>{formatDateTime(item.publishedAt)}</td>
                    <td>{formatDateTime(item.unpublishedAt)}</td>
                    <td>{item.slug ?? '—'}</td>
                    <td>
                      {canUnpublish(item) ? (
                        <button type="button" className="danger" onClick={() => unpublishAction.open(item)}>
                          Снять с публикации
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

      <UnpublishDialog
        dialog={unpublishAction.dialog}
        minReasonLength={unpublishAction.minReasonLength}
        canSubmit={unpublishAction.canSubmit}
        onReasonChange={unpublishAction.setReason}
        onCancel={unpublishAction.close}
        onConfirm={() => void unpublishAction.submit()}
      />
    </section>
  )
}

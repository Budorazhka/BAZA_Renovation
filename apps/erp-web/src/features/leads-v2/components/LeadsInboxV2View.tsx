import { useEffect, useState } from 'react'
import { AlertCircle, Eye, Inbox, RefreshCw } from 'lucide-react'
import { leadsApiV2 } from '@/services/leadsApiV2'
import type { LeadStageChangeResult, LeadStageV2, LeadV2 } from '@/types/leadsV2'
import { LEAD_STAGES_V2 } from '@/types/leadsV2'
import { StageBadge } from './StageBadge'
import { STAGE_CONFIG } from '../constants'
import { LeadDetailsModal } from './LeadDetailsModal'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return DATE_FMT.format(d)
}

export function LeadsInboxV2View() {
  const { t } = useI18n()
  const [items, setItems] = useState<LeadV2[]>([])
  const [selectedStage, setSelectedStage] = useState<LeadStageV2 | 'all'>('all')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<LeadV2 | null>(null)
  const [reloadTrigger, setReloadTrigger] = useState<number>(0)

  const handleRefresh = () => {
    setLoading(true)
    setError(null)
    setReloadTrigger((v) => v + 1)
  }

  const handleStageSelect = (stage: LeadStageV2 | 'all') => {
    setLoading(true)
    setError(null)
    setSelectedStage(stage)
  }

  const handleLeadStageChanged = (result: LeadStageChangeResult) => {
    // PATCH возвращает командный результат без contact/createdAt. Сохраняем
    // уже загруженную read-модель и накладываем только подтверждённые поля.
    setItems((prev) => prev.map((item) => (item.id === result.id ? { ...item, ...result } : item)))
    setSelectedLead((prev) => (prev?.id === result.id ? { ...prev, ...result } : prev))
  }

  useEffect(() => {
    let isSubscribed = true
    const params = selectedStage === 'all' ? {} : { stage: selectedStage }

    leadsApiV2
      .list(params)
      .then((response) => {
        if (!isSubscribed) return
        setItems(response.items ?? [])
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!isSubscribed) return
        setItems([])
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        setLoading(false)
      })

    return () => {
      isSubscribed = false
    }
  }, [selectedStage, reloadTrigger])

  const stageLabel = (stage: LeadStageV2): string => {
    return t(`leadsInbox.stages.${stage}`) || stage
  }

  return (
    <div className="min-h-full bg-[var(--app-bg)] px-5 py-6 font-[Montserrat,sans-serif] sm:px-7">
      {/* Шапка экрана */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[24px] font-medium tracking-tight text-[color:var(--app-text)]">
              {t('leadsInbox.title')}
            </h1>
            <span className="rounded-sm border border-[color:color-mix(in_srgb,var(--gold)_30%,transparent)] bg-[color-mix(in_srgb,var(--gold)_12%,transparent)] px-2.5 py-0.5 text-[16px] font-normal text-[color:var(--gold)]">
              {t('leadsInbox.total')}: {items.length}
            </span>
          </div>
          <p className="mt-1 text-[16px] font-normal text-[color:var(--app-text-muted)]">
            {t('leadsInbox.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-[color:color-mix(in_srgb,var(--gold)_50%,transparent)] bg-[color-mix(in_srgb,var(--gold)_14%,transparent)] px-4 py-2 text-[16px] font-medium text-[color:var(--app-text)] transition-colors hover:bg-[color-mix(in_srgb,var(--gold)_22%,transparent)] disabled:opacity-50"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          {t('leadsInbox.refresh')}
        </button>
      </div>

      {/* Фильтр по стадиям */}
      <div className="mb-5 flex flex-wrap items-center gap-2" role="tablist" aria-label={t('leadsInbox.allStages')}>
        <button
          type="button"
          role="tab"
          aria-selected={selectedStage === 'all'}
          onClick={() => handleStageSelect('all')}
          className={cn(
            'flex min-h-9 items-center rounded-sm border px-3.5 py-1.5 text-[16px] font-normal transition-colors',
            selectedStage === 'all'
              ? 'border-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_20%,transparent)] text-[color:var(--app-text)]'
              : 'border-[var(--green-border)] bg-[var(--green-card)] text-[color:var(--app-text-muted)] hover:bg-[var(--dropdown-hover)] hover:text-[color:var(--app-text)]',
          )}
        >
          {t('leadsInbox.allStages')}
        </button>

        {LEAD_STAGES_V2.map((stage) => {
          const isSelected = selectedStage === stage
          const cfg = STAGE_CONFIG[stage]
          return (
            <button
              key={stage}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => handleStageSelect(stage)}
              className={cn(
                'flex min-h-9 items-center gap-2 rounded-sm border px-3.5 py-1.5 text-[16px] font-normal transition-colors',
                isSelected
                  ? 'border-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_20%,transparent)] text-[color:var(--app-text)]'
                  : 'border-[var(--green-border)] bg-[var(--green-card)] text-[color:var(--app-text-muted)] hover:bg-[var(--dropdown-hover)] hover:text-[color:var(--app-text)]',
              )}
            >
              <span className={cn('size-2 rounded-full', cfg.dotClass)} />
              {stageLabel(stage)}
            </button>
          )
        })}
      </div>

      {/* Основная таблица / Состояния */}
      <div className="overflow-hidden rounded-md border border-[var(--green-border)] bg-[var(--green-card)] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.14)]">
        {loading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center" data-testid="leads-loading">
            <div className="relative size-10">
              <span className="absolute inset-0 rounded-full border-2 border-[color:color-mix(in_srgb,var(--gold)_20%,transparent)]" />
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--gold)]" />
            </div>
            <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">
              {t('leadsInbox.loading')}
            </p>
          </div>
        ) : error ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center" data-testid="leads-error">
            <div className="flex size-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
              <AlertCircle className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-[18px] font-medium text-[color:var(--app-text)]">
                {t('leadsInbox.errorTitle')}
              </h2>
              <p className="max-w-md text-[16px] font-normal text-[color:var(--app-text-muted)]">
                {error}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex min-h-10 items-center justify-center rounded-sm border border-[color:var(--gold)] bg-[color-mix(in_srgb,var(--gold)_20%,transparent)] px-5 py-2 text-[16px] font-medium text-[color:var(--app-text)] transition-colors hover:bg-[color-mix(in_srgb,var(--gold)_30%,transparent)]"
            >
              {t('leadsInbox.retry')}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center" data-testid="leads-empty">
            <div className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--gold)_12%,transparent)] text-[color:var(--gold)]">
              <Inbox className="size-6" />
            </div>
            <p className="text-[16px] font-normal text-[color:var(--app-text-muted)]">
              {selectedStage === 'all'
                ? t('leadsInbox.empty')
                : t('leadsInbox.emptyFiltered')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto" data-testid="leads-table">
            <table className="w-full min-w-[960px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--green-border)] bg-[var(--surface-container-high,#163824)]">
                  <th className="px-4 py-3.5 text-[16px] font-medium tracking-wider text-[color:var(--gold)]">
                    {t('leadsInbox.columns.contact')}
                  </th>
                  <th className="px-4 py-3.5 text-[16px] font-medium tracking-wider text-[color:var(--gold)]">
                    {t('leadsInbox.columns.phone')}
                  </th>
                  <th className="px-4 py-3.5 text-[16px] font-medium tracking-wider text-[color:var(--gold)]">
                    {t('leadsInbox.columns.email')}
                  </th>
                  <th className="px-4 py-3.5 text-[16px] font-medium tracking-wider text-[color:var(--gold)]">
                    {t('leadsInbox.columns.stage')}
                  </th>
                  <th className="px-4 py-3.5 text-[16px] font-medium tracking-wider text-[color:var(--gold)]">
                    {t('leadsInbox.columns.createdAt')}
                  </th>
                  <th className="px-4 py-3.5 text-[16px] font-medium tracking-wider text-[color:var(--gold)]">
                    {t('leadsInbox.columns.source')}
                  </th>
                  <th className="w-12 px-3 py-3.5 text-center text-[16px] font-medium text-[color:var(--gold)]">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((lead, idx) => {
                  const zebraClass = idx % 2 === 0 ? 'bg-[#072821]' : 'bg-[#112d1c]'
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedLead(lead)
                        }
                      }}
                      className={cn(
                        'cursor-pointer border-b border-[rgba(30,74,42,0.3)] transition-colors hover:bg-[#163824]',
                        zebraClass,
                      )}
                    >
                      <td className="px-4 py-3 text-[16px] font-normal text-[color:var(--app-text)]">
                        {lead.contact?.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-[16px] font-normal text-[color:var(--app-text-muted)]">
                        {lead.contact?.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-[16px] font-normal text-[color:var(--app-text-muted)]">
                        {lead.contact?.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-[16px]">
                        <StageBadge stage={lead.stage} />
                      </td>
                      <td className="px-4 py-3 text-[16px] font-normal text-[color:var(--app-text-muted)]">
                        {formatDateTime(lead.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-[16px] font-normal text-[color:var(--app-text-muted)]">
                        <span className="font-mono text-[16px] text-[color:var(--mint)]">
                          {lead.source?.route || '—'}
                        </span>
                        {lead.source?.publicationId && (
                          <span className="ml-2 text-[16px] text-[color:var(--app-text-muted)]">
                            (pub: {lead.source.publicationId})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-[color:var(--gold)]">
                        <Eye className="inline size-4 opacity-75" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модальное окно деталей лида */}
      <LeadDetailsModal
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onStageChanged={handleLeadStageChanged}
      />
    </div>
  )
}

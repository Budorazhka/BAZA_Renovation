import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Loader2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { leadsApiV2 } from '@/services/leadsApiV2'
import { teamApi } from '@/services/teamApi'
import type { TeamUser } from '@/types/team'
import type { LeadStageChangeResult, LeadStageV2, LeadV2 } from '@/types/leadsV2'
import { LEAD_STAGES_V2 } from '@/types/leadsV2'
import { StageBadge } from './StageBadge'
import { STAGE_CONFIG } from '../constants'
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

interface LeadDetailsModalProps {
  lead: LeadV2 | null
  onClose: () => void
  onStageChanged?: (result: LeadStageChangeResult) => void
}

export function LeadDetailsModal({ lead, onClose, onStageChanged }: LeadDetailsModalProps) {
  const { t } = useI18n()
  const [isChangingStage, setIsChangingStage] = useState(false)
  const [targetStage, setTargetStage] = useState<LeadStageV2 | null>(null)
  const [stageError, setStageError] = useState<string | null>(null)
  const [stageSuccess, setStageSuccess] = useState(false)

  const [positions, setPositions] = useState<TeamUser[]>([])
  const [positionsLoading, setPositionsLoading] = useState(false)
  const [selectedPositionId, setSelectedPositionId] = useState('')
  const [isAssigning, setIsAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignSuccess, setAssignSuccess] = useState(false)
  const assignInFlightRef = useRef(false)

  // Rules of Hooks: useEffect объявлен безусловно (до раннего return ниже),
  // хотя тело эффекта само по себе ничего не делает при lead:null.
  useEffect(() => {
    if (!lead) return
    let cancelled = false
    setSelectedPositionId('')
    setAssignError(null)
    setAssignSuccess(false)
    setPositionsLoading(true)
    teamApi
      .list()
      .then((users) => {
        if (!cancelled) setPositions(users)
      })
      .catch(() => {
        if (!cancelled) setPositions([])
      })
      .finally(() => {
        if (!cancelled) setPositionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lead?.id])

  if (!lead) return null

  const handleAssign = async () => {
    if (!selectedPositionId || assignInFlightRef.current) return
    assignInFlightRef.current = true
    setIsAssigning(true)
    setAssignError(null)
    setAssignSuccess(false)

    try {
      const updated = await leadsApiV2.assign(lead.id, selectedPositionId)
      setAssignSuccess(true)
      onStageChanged?.(updated)
    } catch (err: unknown) {
      let message = t('leadsInbox.card.assignError')
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response?: { status?: number; data?: { error?: { message?: string }; message?: string } } }).response
        if (resp?.status === 403) {
          message = t('leadsInbox.card.assignErrorForbidden')
        } else if (resp?.status === 404) {
          message = t('leadsInbox.card.assignErrorNotFound')
        } else if (resp?.status === 409) {
          message = t('leadsInbox.card.assignErrorConflict')
        } else if (resp?.status === 400) {
          message = t('leadsInbox.card.assignErrorBadRequest')
        } else if (resp?.data?.error?.message ?? resp?.data?.message) {
          message = resp.data?.error?.message ?? resp.data?.message ?? message
        }
      } else if (err instanceof Error) {
        message = err.message
      }
      setAssignError(message)
    } finally {
      assignInFlightRef.current = false
      setIsAssigning(false)
    }
  }

  const handleStageChange = async (newStage: LeadStageV2) => {
    if (newStage === lead.stage || isChangingStage) return

    setIsChangingStage(true)
    setTargetStage(newStage)
    setStageError(null)
    setStageSuccess(false)

    try {
      const updated = await leadsApiV2.changeStage(lead.id, newStage, lead.version)
      setStageSuccess(true)
      onStageChanged?.(updated)
    } catch (err: unknown) {
      let message = t('leadsInbox.card.changeStageError')
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response?: { status?: number; data?: { message?: string } } }).response
        if (resp?.status === 403) {
          message = `${t('leadsInbox.card.changeStageError')} (403 Forbidden: недостаточно прав)`
        } else if (resp?.status === 404) {
          message = `${t('leadsInbox.card.changeStageError')} (404 Not Found: лид не найден)`
        } else if (resp?.status === 409) {
          // Optimistic concurrency: лид изменился с момента открытия модалки
          // (другой сотрудник уже сменил стадию) — тот же lead prop, что
          // держит эта модалка, устарел, простой ретрай с той же version
          // повторил бы ту же ошибку. Просим пользователя закрыть и открыть
          // карточку заново, а не тихо перезаписываем чужое изменение.
          message = `${t('leadsInbox.card.changeStageError')} (409: лид изменён другим сотрудником — закройте и откройте карточку заново)`
        } else if (resp?.data?.message) {
          message = resp.data.message
        }
      } else if (err instanceof Error) {
        message = err.message
      }
      setStageError(message)
    } finally {
      setIsChangingStage(false)
      setTargetStage(null)
    }
  }

  return (
    <Dialog open={Boolean(lead)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg rounded-lg border border-[color:color-mix(in_srgb,var(--gold)_25%,transparent)] bg-[var(--surface-container,#112d1c)] p-6 font-[Montserrat,sans-serif] text-[color:var(--app-text)] shadow-2xl backdrop-blur-xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[20px] font-medium text-[color:var(--app-text)]">
              {t('leadsInbox.card.title')}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm p-1 text-[color:var(--app-text-muted)] hover:bg-[var(--dropdown-hover)] hover:text-[color:var(--app-text)]"
            >
              <X className="size-5" />
              <span className="sr-only">{t('leadsInbox.card.close')}</span>
            </button>
          </div>
          <DialogDescription className="text-[16px] font-normal text-[color:var(--gold)]">
            {t('leadsInbox.card.readOnlyNotice')}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Смена стадии (PATCH /api/v1/leads/:id/stage) */}
          <div className="rounded-md border border-[var(--green-border)] bg-[#072821] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[16px] font-medium text-[color:var(--gold)]">
                {t('leadsInbox.card.changeStage')}
              </span>
              <StageBadge stage={lead.stage} />
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {LEAD_STAGES_V2.map((stg) => {
                const isCurrent = lead.stage === stg
                const isProcessing = isChangingStage && targetStage === stg
                const cfg = STAGE_CONFIG[stg]

                return (
                  <button
                    key={stg}
                    type="button"
                    data-testid={`stage-button-${stg}`}
                    disabled={isCurrent || isChangingStage}
                    onClick={() => void handleStageChange(stg)}
                    className={cn(
                      'inline-flex min-h-8 items-center gap-1.5 rounded-sm border px-3 py-1 text-[16px] font-normal transition-colors disabled:cursor-not-allowed',
                      isCurrent
                        ? cn('border-current opacity-60', cfg.bgClass, cfg.textClass, cfg.borderClass)
                        : 'border-[var(--green-border)] bg-[var(--green-card)] text-[color:var(--app-text-muted)] hover:bg-[var(--dropdown-hover)] hover:text-[color:var(--app-text)]',
                      isProcessing && 'opacity-80',
                    )}
                  >
                    {isProcessing ? (
                      <Loader2 className="size-3.5 animate-spin text-[color:var(--gold)]" />
                    ) : (
                      <span className={cn('size-2 rounded-full', cfg.dotClass)} />
                    )}
                    {t(`leadsInbox.stages.${stg}`) || stg}
                  </button>
                )
              })}
            </div>

            {stageError && (
              <div
                className="flex items-center gap-2 rounded-sm border border-rose-500/30 bg-rose-500/10 p-2 text-[16px] text-rose-300"
                data-testid="stage-error-banner"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{stageError}</span>
              </div>
            )}

            {stageSuccess && (
              <div
                className="flex items-center gap-2 rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-2 text-[16px] text-emerald-300"
                data-testid="stage-success-banner"
              >
                <Check className="size-4 shrink-0" />
                <span>{t('leadsInbox.card.changeStageSuccess')}</span>
              </div>
            )}
          </div>

          {/* Основные метаданные */}
          <div className="rounded-md border border-[var(--green-border)] bg-[#072821] p-3.5 space-y-2 text-[16px]">
            <div className="flex justify-between gap-2">
              <span className="text-[color:var(--app-text-muted)]">{t('leadsInbox.card.leadId')}:</span>
              <span className="font-mono text-[color:var(--app-text)]">{lead.id}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[color:var(--app-text-muted)]">{t('leadsInbox.card.organizationId')}:</span>
              <span className="font-mono text-[color:var(--app-text)]">{lead.organizationId}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-[color:var(--app-text-muted)]">{t('leadsInbox.card.ownerPositionId')}:</span>
                <span className="font-mono text-[color:var(--app-text)]">{lead.ownerPositionId || '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  data-testid="assign-position-select"
                  value={selectedPositionId}
                  onChange={(e) => setSelectedPositionId(e.target.value)}
                  disabled={positionsLoading || isAssigning}
                  className="flex-1 rounded-sm border border-[var(--green-border)] bg-[var(--green-card)] px-2 py-1 text-[16px] font-normal text-[color:var(--app-text)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">{t('leadsInbox.card.selectPosition')}</option>
                  {positions.map((p) => {
                    const positionId = p.positionId ?? p.id
                    return (
                      <option key={positionId} value={positionId}>
                        {p.position}
                        {p.vacant ? ` (${t('leadsInbox.card.vacant')})` : ''}
                      </option>
                    )
                  })}
                </select>
                <button
                  type="button"
                  data-testid="assign-submit-button"
                  disabled={!selectedPositionId || isAssigning}
                  onClick={() => void handleAssign()}
                  className="flex shrink-0 items-center gap-1.5 rounded-sm border border-[var(--green-border)] bg-[var(--green-card)] px-3 py-1 text-[16px] font-normal text-[color:var(--app-text)] disabled:cursor-not-allowed disabled:opacity-60 hover:bg-[var(--dropdown-hover)]"
                >
                  {isAssigning ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {t('leadsInbox.card.assignSubmit')}
                </button>
              </div>
              {assignError && (
                <div
                  className="flex items-center gap-2 rounded-sm border border-rose-500/30 bg-rose-500/10 p-2 text-[16px] text-rose-300"
                  data-testid="assign-error-banner"
                >
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{assignError}</span>
                </div>
              )}
              {assignSuccess && (
                <div
                  className="flex items-center gap-2 rounded-sm border border-emerald-500/30 bg-emerald-500/10 p-2 text-[16px] text-emerald-300"
                  data-testid="assign-success-banner"
                >
                  <Check className="size-4 shrink-0" />
                  <span>{t('leadsInbox.card.assignSuccess')}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[color:var(--app-text-muted)]">{t('leadsInbox.card.createdAt')}:</span>
              <span className="text-[color:var(--app-text)]">{formatDateTime(lead.createdAt)}</span>
            </div>
          </div>

          {/* Контактная информация */}
          <div className="rounded-md border border-[var(--green-border)] bg-[#072821] p-3.5">
            <h3 className="mb-2 text-[16px] font-medium text-[color:var(--gold)]">
              {t('leadsInbox.card.contactInfo')}
            </h3>
            {lead.contact ? (
              <div className="space-y-2 text-[16px]">
                <div className="flex justify-between gap-2">
                  <span className="text-[color:var(--app-text-muted)]">{t('leadsInbox.card.name')}:</span>
                  <span className="text-[color:var(--app-text)]">{lead.contact.name || '—'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[color:var(--app-text-muted)]">{t('leadsInbox.card.phone')}:</span>
                  <span className="text-[color:var(--mint)]">{lead.contact.phone || '—'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[color:var(--app-text-muted)]">{t('leadsInbox.card.email')}:</span>
                  <span className="text-[color:var(--app-text)]">{lead.contact.email || '—'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-[color:var(--app-text-muted)]">{t('leadsInbox.card.contactId')}:</span>
                  <span className="font-mono text-[color:var(--app-text-muted)]">{lead.contact.id}</span>
                </div>
              </div>
            ) : (
              <p className="text-[16px] text-[color:var(--app-text-muted)]">{t('leadsInbox.card.noContact')}</p>
            )}
          </div>

          {/* Источник */}
          <div className="rounded-md border border-[var(--green-border)] bg-[#072821] p-3.5">
            <h3 className="mb-2 text-[16px] font-medium text-[color:var(--gold)]">
              {t('leadsInbox.card.sourceInfo')}
            </h3>
            <div className="space-y-2 text-[16px]">
              <div className="flex justify-between gap-2">
                <span className="text-[color:var(--app-text-muted)]">{t('leadsInbox.card.route')}:</span>
                <span className="font-mono text-[color:var(--mint)]">{lead.source?.route || '—'}</span>
              </div>
              {lead.source?.publicationId && (
                <div className="flex justify-between gap-2">
                  <span className="text-[color:var(--app-text-muted)]">{t('leadsInbox.card.publicationId')}:</span>
                  <span className="font-mono text-[color:var(--app-text)]">{lead.source.publicationId}</span>
                </div>
              )}
              {lead.source?.referrer && (
                <div className="flex justify-between gap-2">
                  <span className="text-[color:var(--app-text-muted)]">{t('leadsInbox.card.referrer')}:</span>
                  <span className="text-[color:var(--app-text)] truncate max-w-[240px]">{lead.source.referrer}</span>
                </div>
              )}
              <div className="pt-1">
                <span className="block text-[color:var(--app-text-muted)] mb-1">{t('leadsInbox.card.utm')}:</span>
                {lead.source?.utm && Object.keys(lead.source.utm).length > 0 ? (
                  <pre className="max-h-32 overflow-y-auto rounded bg-[#031d16] p-2 font-mono text-[16px] text-[color:var(--mint)]">
                    {JSON.stringify(lead.source.utm, null, 2)}
                  </pre>
                ) : (
                  <span className="text-[16px] text-[color:var(--app-text-muted)]">{t('leadsInbox.card.noUtm')}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

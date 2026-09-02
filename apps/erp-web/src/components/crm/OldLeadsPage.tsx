import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, MessageCircle, Plus, Upload } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { CreateOldLeadModal } from '@/components/crm/CreateOldLeadModal'
import { StartOldLeadDialogModal } from '@/components/crm/StartOldLeadDialogModal'
import { UploadOldLeadsModal } from '@/components/crm/UploadOldLeadsModal'
import { developmentApi, type OldLead, type OldLeadStatus } from '@/services/developmentApi'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const STATUS_TONE: Record<OldLeadStatus, string> = {
  active: 'text-sky-300 bg-sky-500/10 border-sky-500/25',
  deleted: 'text-[color:var(--app-text-subtle)] bg-[var(--green-deep)] border-[var(--green-border)]',
  converted: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return DATE_FMT.format(d)
}

export function OldLeadsPage() {
  const { t } = useI18n()
  const [items, setItems] = useState<OldLead[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [dialogLead, setDialogLead] = useState<OldLead | null>(null)

  const load = useCallback(async (nextPage: number) => {
    setLoading(true)
    setError(null)
    try {
      const resp = await developmentApi.getOldLeads({ page: nextPage, limit: PAGE_SIZE })
      if (!resp.success || !resp.data) {
        throw new Error(resp.message || 'Failed to load old leads')
      }
      setItems(resp.data.items)
      setTotal(resp.data.total)
      setPage(resp.data.page)
      setTotalPages(Math.max(1, resp.data.totalPages))
    } catch (err) {
      setItems([])
      setTotal(0)
      setTotalPages(1)
      setError(err instanceof Error ? err.message : 'Failed to load old leads')
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadFirstPage = useCallback(() => {
    if (page === 1) void load(1)
    else setPage(1)
  }, [load, page])

  const applyLeadUpdate = useCallback((updated: OldLead) => {
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
  }, [])

  useEffect(() => {
    void load(page)
  }, [load, page])

  const startIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const endIdx = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total)

  return (
    <DashboardShell>
      <div className="min-h-full bg-[var(--app-bg)] px-5 py-6 font-[Montserrat,sans-serif] sm:px-7">
        <h1 className="mb-1 text-[22px] font-normal text-[color:var(--theme-accent-heading)]">
          {t('tabs.oldLeads')}
        </h1>
        <p className="mb-5 text-xs tracking-wide text-[color:var(--hub-desc)]">
          {t('oldLeads.subtitle')}
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[color:color-mix(in_srgb,var(--gold)_55%,transparent)] bg-[color-mix(in_srgb,var(--gold)_14%,transparent)] px-3.5 text-[13px] font-normal text-[color:var(--theme-accent-heading)] transition-colors hover:bg-[color-mix(in_srgb,var(--gold)_22%,transparent)]"
          >
            <Plus size={15} />
            {t('oldLeads.createNew')}
          </button>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--green-border)] px-3.5 text-[13px] font-normal text-[color:var(--workspace-text)] transition-colors hover:bg-[var(--dropdown-hover)]"
          >
            <Upload size={15} />
            {t('oldLeads.uploadXls')}
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--green-border)] bg-[var(--green-card)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--green-border)] bg-[var(--workspace-row-bg)]">
                  <th className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-[color:var(--workspace-text-dim)]">
                    {t('oldLeads.columns.name')}
                  </th>
                  <th className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-[color:var(--workspace-text-dim)]">
                    {t('oldLeads.columns.whatsapp')}
                  </th>
                  <th className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-[color:var(--workspace-text-dim)]">
                    {t('oldLeads.columns.telegram')}
                  </th>
                  <th className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-[color:var(--workspace-text-dim)]">
                    {t('oldLeads.columns.lastContact')}
                  </th>
                  <th className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-[color:var(--workspace-text-dim)]">
                    {t('oldLeads.columns.status')}
                  </th>
                  <th className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-[color:var(--workspace-text-dim)]">
                    {t('oldLeads.columns.description')}
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-normal uppercase tracking-wide text-[color:var(--workspace-text-dim)]">
                    {t('oldLeads.columns.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-[color:var(--app-text-subtle)]">
                      {t('oldLeads.loading')}
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-rose-300">
                      {error}
                    </td>
                  </tr>
                )}
                {!loading && !error && items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-[color:var(--app-text-subtle)]">
                      {t('oldLeads.empty')}
                    </td>
                  </tr>
                )}
                {!loading &&
                  !error &&
                  items.map((lead, index) => (
                    <OldLeadRow
                      key={lead.id}
                      lead={lead}
                      isLast={index === items.length - 1}
                      addToChatsLabel={t('oldLeads.addToChats')}
                      statusLabel={lead.status ? t(`oldLeads.status.${lead.status}`) : ''}
                      onStartDialog={setDialogLead}
                    />
                  ))}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--green-border)] bg-[var(--workspace-row-bg)] px-4 py-2.5">
              <p className="m-0 text-[11px] text-[color:var(--workspace-text-dim)]">
                {t('oldLeads.shown')} {startIdx}–{endIdx} {t('oldLeads.of')} {total.toLocaleString('ru-RU')}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-[var(--green-border)] text-[color:var(--workspace-text)] transition-colors hover:bg-[var(--dropdown-hover)] disabled:opacity-40"
                  aria-label={t('oldLeads.prevPage')}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="min-w-[4.5rem] text-center text-xs text-[color:var(--workspace-text-dim)]">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-[var(--green-border)] text-[color:var(--workspace-text)] transition-colors hover:bg-[var(--dropdown-hover)] disabled:opacity-40"
                  aria-label={t('oldLeads.nextPage')}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CreateOldLeadModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={reloadFirstPage}
      />
      <UploadOldLeadsModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onImported={reloadFirstPage}
      />
      {dialogLead && (
        <StartOldLeadDialogModal
          key={dialogLead.id}
          lead={dialogLead}
          onClose={() => setDialogLead(null)}
          onStarted={applyLeadUpdate}
        />
      )}
    </DashboardShell>
  )
}

function OldLeadRow({
  lead,
  isLast,
  addToChatsLabel,
  statusLabel,
  onStartDialog,
}: {
  lead: OldLead
  isLast: boolean
  addToChatsLabel: string
  statusLabel: string
  onStartDialog: (lead: OldLead) => void
}) {
  const canStartDialog = Boolean(lead.whatsapp?.trim() || lead.telegram?.trim())

  return (
    <tr className={cn(!isLast && 'border-b border-[var(--green-border)]')}>
      <td className="px-4 py-3 align-middle">
        <div className="text-[13px] font-normal text-[color:var(--app-text)]">{lead.name || '—'}</div>
      </td>
      <td className="px-4 py-3 align-middle text-[13px] text-[color:var(--app-text-muted)]">
        {lead.whatsapp || '—'}
      </td>
      <td className="px-4 py-3 align-middle text-[13px] text-[color:var(--app-text-muted)]">
        {lead.telegram || '—'}
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-middle text-[13px] text-[color:var(--app-text-muted)]">
        {formatDate(lead.lastContactTime)}
      </td>
      <td className="px-4 py-3 align-middle">
        {lead.status ? (
          <span
            className={cn(
              'inline-flex rounded-md border px-2 py-1 text-[11px] font-normal',
              STATUS_TONE[lead.status] ??
                'text-[color:var(--app-text-subtle)] bg-[var(--green-deep)] border-[var(--green-border)]',
            )}
          >
            {statusLabel}
          </span>
        ) : (
          <span className="text-[13px] text-[color:var(--app-text-subtle)]">—</span>
        )}
      </td>
      <td className="max-w-[280px] px-4 py-3 align-middle">
        <div className="truncate text-[13px] text-[color:var(--hub-body)]" title={lead.description ?? undefined}>
          {lead.description || '—'}
        </div>
      </td>
      <td className="px-4 py-3 align-middle text-right">
        {/* Кнопка только для активных: converted уже в чатах, deleted — не трогаем. */}
        {lead.status === 'active' ? (
          <button
            type="button"
            disabled={!canStartDialog}
            onClick={() => onStartDialog(lead)}
            className={cn(
              'inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[12px] font-normal transition-colors',
              canStartDialog
                ? 'border-[color:color-mix(in_srgb,var(--gold)_55%,transparent)] bg-[color-mix(in_srgb,var(--gold)_14%,transparent)] text-[color:var(--theme-accent-heading)] hover:bg-[color-mix(in_srgb,var(--gold)_22%,transparent)]'
                : 'cursor-not-allowed border-[var(--green-border)] text-[color:var(--app-text-subtle)] opacity-50',
            )}
          >
            <MessageCircle size={14} />
            {addToChatsLabel}
          </button>
        ) : null}
      </td>
    </tr>
  )
}

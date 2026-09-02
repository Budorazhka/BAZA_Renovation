import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { DeskShell, DeskHeader, DESK_HEADER_LINK_CLASS, REPORT_LINKS } from '../desk-shared'
import type { Lead } from '@/types/leads'
import type { WidgetSlot } from '@/config/widgets-config'
import { LEAD_STAGES } from '@/data/leads-mock'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

type ProblemReason = 'sla' | 'no_task' | 'no_manager' | 'no_answer' | 'stale'

function getProblem(l: Lead): ProblemReason | null {
  if (l.taskOverdue) return 'sla'
  if (!l.managerId) return 'no_manager'
  if (!l.hasTask) return 'no_task'
  if (l.status === 'no_answer') return 'no_answer'
  const lastActivity = l.updatedAt ? new Date(l.updatedAt) : new Date(l.createdAt)
  const daysSince = (Date.now() - lastActivity.getTime()) / 86400000
  if (daysSince > 7) return 'stale'
  return null
}

const REASON_LABELS: Record<ProblemReason, { label: string; short: string; color: string }> = {
  sla: {
    label: 'Просрочена задача',
    short: 'Задача',
    color: '#f87171',
  },
  no_manager: { label: 'Нет ответственного', short: 'Нет менедж.', color: '#fb923c' },
  no_task: { label: 'Нет следующей задачи', short: 'Нет задачи', color: '#fbbf24' },
  no_answer: { label: 'Нет ответа клиента', short: 'Недозвон', color: '#a78bfa' },
  stale: { label: 'Нет движения 7+ дней', short: 'Застой', color: '#94a3b8' },
}

function stageTitle(stageId: string): string {
  return LEAD_STAGES.find((s) => s.id === stageId)?.name ?? stageId
}

export function WidgetProblemLeads({ leads, slot }: { leads: Lead[]; slot: WidgetSlot }) {
    const { t } = useI18n();
  const allProblems = useMemo(() => {
    const list: { lead: Lead; reason: ProblemReason }[] = []
    for (const l of leads) {
      const r = getProblem(l)
      if (r) list.push({ lead: l, reason: r })
    }
    const ORDER: ProblemReason[] = ['sla', 'no_manager', 'no_task', 'no_answer', 'stale']
    list.sort((a, b) => ORDER.indexOf(a.reason) - ORDER.indexOf(b.reason))
    return list
  }, [leads])
  const problems = useMemo(
    () => allProblems.slice(0, slot === 'big' ? 14 : slot === 'med' ? 6 : 4),
    [allProblems, slot],
  )
  const totalProblems = allProblems.length

  return (
    <DeskShell
      accent="#fb7185"
      className={cn('flex flex-col', problems.length > 0 && 'ring-1 ring-rose-500/25')}
    >
      <DeskHeader
        icon={<AlertTriangle className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetProblemLeads.проблемные_лиды')}
        accentColor="#fb7185"
        right={
          <div className="flex items-center gap-2">
            {slot === 'small' ? null : (
              <span className="rounded-full border border-[#fb718555] bg-[#fb718512] px-2 py-1 text-[11px] leading-none text-[#fecdd3]">
                {t('dashboard.widgets.widgetProblemLeads.всего')}{totalProblems} {t('dashboard.widgets.widgetProblemLeads.проблемных')}</span>
            )}
            <Link to={REPORT_LINKS.leads} className={DESK_HEADER_LINK_CLASS}>
              {t('dashboard.widgets.widgetProblemLeads.отч_т')}</Link>
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {slot === 'small' && totalProblems > 0 ? (
          <p className="mb-1.5 rounded-md border border-[#fb718555] bg-[#fb718512] px-2 py-1 text-[11px] leading-none text-[#fecdd3]">
            {t('dashboard.widgets.widgetProblemLeads.всего')}{totalProblems} {t('dashboard.widgets.widgetProblemLeads.проблемных')}</p>
        ) : null}
        {problems.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-emerald-400 sm:text-[14px]">{t('dashboard.widgets.widgetProblemLeads.проблем_не_обнаружен')}</p>
        ) : (
          <ul className="space-y-1.5">
            {problems.map(({ lead, reason }) => {
              const { label, short, color } = REASON_LABELS[reason]
              return (
                <li
                  key={lead.id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-2.5 py-1.5',
                    reason === 'sla'
                      ? 'border-red-500/35 bg-red-500/[0.08]'
                      : 'border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)]',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/dashboard/leads/poker?lead=${encodeURIComponent(lead.id)}`}
                      className="block truncate text-[12px] text-[color:var(--theme-accent-link-dim)] hover:text-[color:var(--workspace-text)] hover:underline sm:text-[13px]"
                    >
                      {lead.name ?? lead.id}
                    </Link>
                    <p className="truncate text-[11px] text-[color:var(--workspace-text-muted)] sm:text-[12px]">
                      {stageTitle(lead.stageId)}
                    </p>
                  </div>
                  <span
                    className="max-w-[8.5rem] shrink-0 rounded px-2 py-1 text-right text-[10px] font-normal uppercase leading-tight sm:text-[11px]"
                    style={{ color, border: `1px solid ${color}55` }}
                  >
                    {slot === 'small' ? short : label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </DeskShell>
  )
}

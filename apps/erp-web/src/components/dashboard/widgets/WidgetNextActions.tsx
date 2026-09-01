import { useMemo } from 'react'
import { Zap, Phone, MessageSquare, AlertTriangle } from 'lucide-react'
import { DeskShell, DeskHeader } from '../desk-shared'
import { TASKS_MOCK } from '@/data/tasks-mock'
import type { Lead } from '@/types/leads'
import type { WidgetSlot } from '@/config/widgets-config'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

type ActionItem = {
  id: string
  type: 'call' | 'write' | 'urgent' | 'task'
  label: string
  sub: string
}

function isOverdue(t: { status: string; dueDate: string }, todayIso: string) {
  if (t.status === 'done') return false
  return t.dueDate < todayIso
}

export function WidgetNextActions({
  leads,
  currentUserId,
  slot,
}: {
  leads: Lead[]
  currentUserId: string | null
  slot: WidgetSlot
}) {
    const { t } = useI18n();
  const todayIso = new Date().toISOString().split('T')[0]

  const actions = useMemo((): ActionItem[] => {
    const items: ActionItem[] = []
    // SLA breach leads → urgent
    for (const l of leads.filter((x) => x.taskOverdue).slice(0, 3)) {
      items.push({ id: `sla-${l.id}`, type: 'urgent', label: l.name ?? l.id, sub: 'SLA нарушен — срочно связаться' })
    }
    // Leads with no task → call
    for (const l of leads.filter((x) => !x.hasTask && !x.taskOverdue).slice(0, 3)) {
      items.push({ id: `call-${l.id}`, type: 'call', label: l.name ?? l.id, sub: 'Нет задачи — позвонить и назначить' })
    }
    // No-answer leads → write
    for (const l of leads.filter((x) => x.status === 'no_answer').slice(0, 2)) {
      items.push({ id: `write-${l.id}`, type: 'write', label: l.name ?? l.id, sub: 'Недозвон — написать в мессенджер' })
    }
    // Overdue tasks
    const overdueTasks = TASKS_MOCK.filter(
      (t) =>
        t.status !== 'done' &&
        isOverdue(t, todayIso) &&
        (!currentUserId || t.assignedToId === currentUserId || !t.assignedToId),
    ).slice(0, 3)
    for (const t of overdueTasks) {
      items.push({ id: `task-${t.id}`, type: 'task', label: t.title, sub: `Просрочено · ${t.dueDate}` })
    }
    return items
  }, [leads, currentUserId, todayIso])

  const preview = actions.slice(0, slot === 'big' ? 14 : slot === 'med' ? 8 : 5)

  const icon = (type: ActionItem['type']) => {
    switch (type) {
      case 'urgent': return <AlertTriangle className="size-3.5 text-red-400" />
      case 'call':   return <Phone className="size-3.5 text-blue-400" />
      case 'write':  return <MessageSquare className="size-3.5 text-violet-400" />
      default:       return <Zap className="size-3.5 text-amber-400" />
    }
  }

  return (
    <DeskShell accent="#f87171" className="flex flex-col">
      <DeskHeader
        icon={<Zap className="size-5" strokeWidth={2} />}
        title={t('dashboard.widgets.widgetNextActions.следующие_действия')}
        accentColor="#f87171"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {preview.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[color:var(--workspace-text-muted)]">{t('dashboard.widgets.widgetNextActions.срочных_действий_нет')}</p>
        ) : (
          <ul className="space-y-1">
            {preview.map((a) => (
              <li
                key={a.id}
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-2.5 py-1.5',
                  a.type === 'urgent'
                    ? 'border-red-500/25 bg-red-500/[0.06]'
                    : 'border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)]',
                )}
              >
                <span className="mt-0.5 shrink-0">{icon(a.type)}</span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-[color:var(--workspace-text)]">{a.label}</p>
                  <p className="text-[10px] text-[color:var(--workspace-text-muted)]">{a.sub}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DeskShell>
  )
}

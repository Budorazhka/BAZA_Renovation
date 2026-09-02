import { useEffect, useMemo, useState } from 'react'
import { Zap, Phone, MessageSquare, AlertTriangle } from 'lucide-react'
import { DeskShell, DeskHeader } from '../desk-shared'
import { useAuth } from '@/context/AuthContext'
import { isDisplayableTaskV2, splitIsoToLocalParts } from '@/lib/map-task-v2'
import { tasksApiV2 } from '@/services/tasksApiV2'
import type { TaskV2 } from '@/types/tasksV2'
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

/** Виджет показывает вершину списка — одной страницы задач для этого достаточно. */
const TASKS_LIMIT = 100

/**
 * `currentUserId` больше не принимается: он был id человека из старой CRM и
 * использовался только для отбора задач. Задачи теперь приходят с сервера и
 * отбираются по позиции (`positionId`) из серверной сессии.
 */
export function WidgetNextActions({
  leads,
  slot,
}: {
  leads: Lead[]
  slot: WidgetSlot
}) {
    const { t } = useI18n();
  const { currentUser } = useAuth()
  const myPositionId = currentUser?.positionId ?? null
  const [overdueTasks, setOverdueTasks] = useState<TaskV2[]>([])
  const [tasksUnavailable, setTasksUnavailable] = useState(false)

  /**
   * Просроченные задачи берутся с сервера, а не из `TASKS_MOCK`: виджет
   * называется «следующие действия», и выдуманные действия рядом с настоящими
   * лидами неотличимы от настоящих. Просрочку определяет сервер (`isOverdue`).
   */
  useEffect(() => {
    let cancelled = false
    tasksApiV2
      .list({ limit: TASKS_LIMIT })
      .then(response => {
        if (cancelled) return
        setOverdueTasks(response.items.filter(task => isDisplayableTaskV2(task) && task.isOverdue))
        setTasksUnavailable(false)
      })
      .catch(() => {
        if (cancelled) return
        // Пустой список вместо мока: «задач нет» здесь не утверждается —
        // об отказе виджет говорит отдельной строкой.
        setOverdueTasks([])
        setTasksUnavailable(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
    // Просроченные задачи: свои и ничьи. Задача чужой позиции — не моё
    // следующее действие.
    const mine = overdueTasks
      .filter(task => !task.assignedPositionId || !myPositionId || task.assignedPositionId === myPositionId)
      .slice(0, 3)
    for (const task of mine) {
      items.push({
        id: `task-${task.id}`,
        type: 'task',
        label: task.title,
        sub: `Просрочено · ${splitIsoToLocalParts(task.dueAt).date}`,
      })
    }
    return items
  }, [leads, myPositionId, overdueTasks])

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
        {tasksUnavailable && (
          <p className="pb-2 text-base text-[color:var(--workspace-text)]/80">
            {t('dashboard.widgets.widgetNextActions.просроченные_задачи_')}</p>
        )}
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

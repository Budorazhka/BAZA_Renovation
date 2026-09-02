import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Plus, Zap, Clock, AlertTriangle, CheckCircle, Circle, MapPin, ListChecks, Paperclip, Flame, Target, Timer, Archive } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { CreateTaskModal, type TaskAssigneeOption } from '@/components/tasks/CreateTaskModal'
import { useAuth } from '@/context/AuthContext'
import { buildCreateTaskPayload, isDisplayableTaskV2, mapTaskV2ToUiTask } from '@/lib/map-task-v2'
import { newIdempotencyKey, tasksApiV2 } from '@/services/tasksApiV2'
import { teamApi } from '@/services/teamApi'
import type { TaskV2 } from '@/types/tasksV2'
import {
  PRIORITY_COLORS, STATUS_LABELS,
  type Task, type TaskStatus
} from '@/types/tasks'
import { useI18n } from "@/i18n";

const C = {
  gold: 'var(--gold)',
  white: '#ffffff',
  whiteMid: 'rgba(255,255,255,0.7)',
  whiteLow: 'rgba(255,255,255,0.4)',
  border: 'var(--green-border)',
  card: 'var(--green-card)',
  green: '#4ade80',
  red: '#f87171',
  orange: '#fb923c',
}

type Filter = 'my' | 'today' | 'overdue' | 'team' | 'auto' | 'archive' | 'all'
type EisenhowerKey = 'do' | 'schedule' | 'delegate' | 'eliminate'

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  pending:     <Circle size={14} color="rgba(255,255,255,0.4)" />,
  in_progress: <Clock size={14} color="#60a5fa" />,
  done:        <CheckCircle size={14} color="#4ade80" />,
  overdue:     <AlertTriangle size={14} color="#f87171" />,
}

const EISENHOWER_PRIORITY_LABELS: Record<Task['priority'], string> = {
  critical: 'Срочно и важно',
  high: 'Срочно, не важно',
  medium: 'Важно, не срочно',
  low: 'Не срочно и не важно',
}

/** Реестр читается одной страницей: серверный предел — 100 задач за запрос. */
const TASKS_PAGE_LIMIT = 100

function describeLoadError(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status === 401) return 'Сессия истекла. Войдите заново, чтобы увидеть задачи.'
  if (status === 403) return 'Нет прав на просмотр задач организации.'
  if (status) return `Сервер ответил ошибкой ${status}. Задачи не загружены.`
  return 'Не удалось связаться с сервером. Задачи не загружены.'
}

/**
 * Отказ создания переводится в человеческий текст здесь, а не показывается
 * как «Request failed with status code 403»: сообщение читает менеджер, а не
 * разработчик.
 */
function describeCreateError(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status === 401) return 'Сессия истекла — задача не создана. Войдите заново.'
  if (status === 403) return 'Нет прав на создание задач.'
  if (status === 400) return 'Сервер отклонил задачу: проверьте исполнителя и срок.'
  if (status) return `Задача не создана: сервер ответил ошибкой ${status}.`
  return 'Задача не создана: сервер недоступен.'
}

function taskSortValue(task: Task) {
  const created = new Date(task.createdAt).getTime()
  if (!Number.isNaN(created)) return created
  return 0
}

function sortTasksNewestFirst(items: Task[]) {
  return [...items].sort((a, b) => taskSortValue(b) - taskSortValue(a))
}

function formatTaskDate(date: string, time?: string) {
  // Задача без срока — законное состояние модели, а не потерянная дата.
  if (!date) return 'Без срока'
  const value = new Date(`${date}T${time || '12:00'}`)
  if (Number.isNaN(value.getTime())) return `${date}${time ? ` ${time}` : ''}`
  return value.toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }) + (time ? ` · ${time}` : '')
}

export function TasksPage() {
    const { t } = useI18n();
  const navigate = useNavigate()
  const location = useLocation()
  const createSuccessRef = useRef(false)
  const { currentUser } = useAuth()
  const [filter, setFilter] = useState<Filter>('my')
  const [serverTasks, setServerTasks] = useState<TaskV2[]>([])
  // Обработчики берут задачу отсюда: иначе версия, прочитанная при рендере,
  // устаревала бы после первого же изменения и следующий запрос падал бы 409.
  const serverTasksRef = useRef<TaskV2[]>([])
  const [team, setTeam] = useState<TaskAssigneeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [teamUnavailable, setTeamUnavailable] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  /**
   * «Мои» — это назначенные на мою позицию плюс личные задачи без исполнителя.
   * Раньше признаком личной задачи служило `entityType === 'none'`: в мок-данных
   * связь с лидом или сделкой была почти у всех, и правило работало. На живых
   * данных связей пока нет ни у кого, и то же правило показало бы в «Моих»
   * задачи всей организации.
   */
  const myPositionId = currentUser?.positionId ?? null
  const isMyScope = useCallback(
    (task: Task) =>
      (myPositionId !== null && task.assignedToId === myPositionId) ||
      (task.taskCategory === 'personal' && task.assignedToId === ''),
    [myPositionId],
  )

  /**
   * Реестр задач читается с Platform API. Отказ сервера остаётся отказом:
   * подставлять демо-задачи при 401/403/500 значило бы показать сотруднику
   * чужую выдумку вместо его работы — ровно тот класс подмены, который
   * закрывался в карточке объекта 01.09.2026.
   */
  const loadTasks = useCallback(async () => {
    setLoading(true)
    // Имена сотрудников — вторая, необязательная выборка: их отсутствие не
    // повод прятать задачи, но и молчать о нём нельзя.
    const teamPromise = teamApi
      .list()
      .then(users =>
        users.map(user => ({ id: user.positionId ?? user.id, name: user.name })),
      )
      .catch(() => null)
    try {
      const response = await tasksApiV2.list({ limit: TASKS_PAGE_LIMIT })
      const members = await teamPromise
      setServerTasks(response.items.filter(isDisplayableTaskV2))
      setTeam(members ?? [])
      setTeamUnavailable(members === null)
      setLoadError(null)
    } catch (error) {
      setServerTasks([])
      setLoadError(describeLoadError(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const namesByPositionId = useMemo(
    () => new Map(team.map(member => [member.id, member.name])),
    [team],
  )

  useEffect(() => {
    serverTasksRef.current = serverTasks
  }, [serverTasks])

  const tasks = useMemo(
    () => serverTasks.map(task => mapTaskV2ToUiTask(task, namesByPositionId)),
    [serverTasks, namesByPositionId],
  )

  useEffect(() => {
    const p = location.pathname
    if (p.includes('/tasks/new')) setCreateOpen(true)
    if (p.includes('/tasks/my')) setFilter('my')
    else if (p.includes('/tasks/team')) setFilter('team')
    else if (p.includes('/tasks/auto')) setFilter('auto')
    else if (p.includes('/tasks/archive')) setFilter('archive')
  }, [location.pathname])

  const filtered = useMemo(() => {
    let result: Task[]
    switch (filter) {
      case 'my':
        result = tasks.filter(t => isMyScope(t) && t.status !== 'done')
        break
      case 'today':
        result = tasks.filter(t => isMyScope(t) && t.dueDate === today && t.status !== 'done')
        break
      case 'overdue':
        // Просрочку определяет сервер (isOverdue) — клиент её не пересчитывает:
        // при пустом сроке сравнение строк дало бы «просрочена» задаче без срока.
        result = tasks.filter(t => isMyScope(t) && t.status === 'overdue')
        break
      case 'team':
        result = tasks.filter(t => t.status !== 'done')
        break
      case 'auto':
        result = tasks.filter(t => isMyScope(t) && t.isAutomatic && t.status !== 'done')
        break
      case 'archive':
        result = tasks.filter(t => isMyScope(t) && t.status === 'done')
        break
      default:
        result = tasks
    }
    return sortTasksNewestFirst(result)
  }, [filter, tasks, isMyScope, today])

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedTaskId(null)
      return
    }
    setSelectedTaskId(prev => (prev && filtered.some(t => t.id === prev) ? prev : filtered[0].id))
  }, [filtered])

  const selectedTask = useMemo(
    () => filtered.find(t => t.id === selectedTaskId) ?? null,
    [filtered, selectedTaskId],
  )

  const eisenhower = useMemo(() => {
    const buckets: Record<EisenhowerKey, Task[]> = {
      do: [],
      schedule: [],
      delegate: [],
      eliminate: [],
    }
    for (const t of filtered) {
      if (t.status === 'done') continue
      if (t.priority === 'critical') buckets.do.push(t)
      else if (t.priority === 'high') buckets.delegate.push(t)
      else if (t.priority === 'medium') buckets.schedule.push(t)
      else buckets.eliminate.push(t)
    }
    return buckets
  }, [filtered])

  /**
   * Любое изменение задачи уходит на сервер и возвращается оттуда. Локально
   * состояние не подкручивается: иначе галочка стояла бы и в том случае,
   * когда сервер отказал, а после перезагрузки исчезала без объяснений.
   *
   * `expectedVersion` — версия, которую клиент прочитал: при 409 задачу
   * изменили параллельно, и правильный ответ — перечитать реестр, а не
   * настаивать на своей версии.
   */
  const applyTaskChange = useCallback(
    async (
      taskId: string,
      change: (task: TaskV2) => Promise<TaskV2>,
      failureMessage: string,
    ) => {
      const current = serverTasksRef.current.find(task => task.id === taskId)
      if (!current) return
      try {
        const updated = await change(current)
        setServerTasks(prev => prev.map(task => (task.id === taskId ? updated : task)))
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status
        if (status === 409) {
          toast.error('Задачу изменил кто-то ещё. Реестр обновлён.')
          void loadTasks()
          return
        }
        if (status === 403) {
          toast.error('Нет прав на это действие.')
          return
        }
        toast.error(failureMessage)
      }
    },
    [loadTasks],
  )

  function toggleDone(taskId: string) {
    const current = serverTasks.find(task => task.id === taskId)
    if (!current) return
    const wasCompleted = current.status === 'completed'
    void applyTaskChange(
      taskId,
      task =>
        wasCompleted
          ? tasksApiV2.setStatus(taskId, task.version, 'open')
          : tasksApiV2.complete(taskId, task.version),
      wasCompleted
        ? 'Не удалось снять отметку о выполнении'
        : 'Не удалось отметить задачу выполненной',
    )
  }

  function setInProgress(taskId: string, inProgress: boolean) {
    void applyTaskChange(
      taskId,
      task => tasksApiV2.setStatus(taskId, task.version, inProgress ? 'in_progress' : 'open'),
      inProgress ? 'Не удалось взять задачу в работу' : 'Не удалось вернуть задачу в новые',
    )
  }

  function toggleSubtask(taskId: string, subtaskId: string) {
    void applyTaskChange(
      taskId,
      task =>
        tasksApiV2.setSubtasks(
          taskId,
          task.version,
          task.subtasks.map(subtask =>
            subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask,
          ),
        ),
      'Не удалось изменить подзадачу',
    )
  }

  function reassignTask(taskId: string, positionId: string) {
    void applyTaskChange(
      taskId,
      task => tasksApiV2.reassign(taskId, task.version, positionId || null),
      'Не удалось сменить исполнителя',
    )
  }

  const FILTERS: { key: Filter; label: string; count: () => number }[] = [
    { key: 'my', label: 'Мои задачи', count: () => tasks.filter(t => isMyScope(t) && t.status !== 'done').length },
    { key: 'today', label: 'Сегодня', count: () => tasks.filter(t => isMyScope(t) && t.dueDate === today && t.status !== 'done').length },
    { key: 'overdue', label: 'Просроченные', count: () => tasks.filter(t => isMyScope(t) && t.status === 'overdue').length },
    { key: 'auto', label: 'Автоматические', count: () => tasks.filter(t => isMyScope(t) && t.isAutomatic && t.status !== 'done').length },
    { key: 'archive', label: 'Архив', count: () => tasks.filter(t => isMyScope(t) && t.status === 'done').length },
    { key: 'team', label: 'Вся команда', count: () => tasks.filter(t => t.status !== 'done').length },
    { key: 'all', label: 'Все', count: () => tasks.length },
  ]

  return (
    <DashboardShell>
      <div style={{ padding: '28px 28px 40px', width: '100%', maxWidth: 'none' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 400, color: C.white, letterSpacing: '-0.01em' }}>{t('tasks.tasksPage.задачи')}</div>
            <div style={{ fontSize: 13, color: C.whiteLow, marginTop: 4 }}>{t('tasks.tasksPage.личный_и_командный_т')}</div>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px',
              background: 'var(--gold-dark)',
              border: 'none',
              borderRadius: 7,
              color: '#fff',
              fontSize: 12,
              fontWeight: 400,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              cursor: 'pointer',
            }}
          >
            <Plus size={20} strokeWidth={2} /> {t('tasks.tasksPage.новая_задача')}</button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' as const }}>
          {FILTERS.map(f => {
            const count = f.count()
            const isOverdue = f.key === 'overdue'
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 6,
                  border: `1px solid ${filter === f.key ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  background: filter === f.key ? 'rgba(201,168,76,0.1)' : 'transparent',
                  color: filter === f.key ? C.gold : (isOverdue && count > 0 ? C.red : C.whiteLow),
                  fontSize: 12,
                  fontWeight: filter === f.key ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isOverdue && count > 0 && <AlertTriangle size={11} />}
                {f.label}
                {count > 0 && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 400,
                    background: isOverdue ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.1)',
                    color: isOverdue ? C.red : C.whiteLow,
                    padding: '1px 6px',
                    borderRadius: 10,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {loading && (
          <div style={{ padding: '10px 0 14px', fontSize: 16, color: 'rgba(255,255,255,0.72)' }}>
            {t('tasks.tasksPage.загружаю_задачи')}</div>
        )}

        {loadError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap' as const,
              padding: '12px 14px',
              marginBottom: 14,
              borderRadius: 6,
              background: 'rgba(255,180,171,0.08)',
              fontSize: 16,
              color: '#ffb4ab',
            }}
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void loadTasks()}
              style={{
                padding: '6px 14px',
                borderRadius: 4,
                border: '1px solid rgba(230,195,100,0.4)',
                background: 'transparent',
                color: C.gold,
                fontSize: 16,
                fontWeight: 400,
                cursor: 'pointer',
              }}
            >
              {t('tasks.tasksPage.повторить')}</button>
          </div>
        )}

        {teamUnavailable && !loadError && (
          <div
            style={{
              padding: '12px 14px',
              marginBottom: 14,
              borderRadius: 6,
              background: 'rgba(255,180,171,0.08)',
              fontSize: 16,
              color: '#ffb4ab',
            }}
          >
            {t('tasks.tasksPage.состав_команды_не_за')}</div>
        )}

        {/* Workspace */}
        <div
          style={{
            minHeight: 'calc(100vh - 220px)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) minmax(30vw,440px)',
            gap: 12,
            alignItems: 'start',
          }}
        >
          {/* Left: matrix + list */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                background: C.card,
                padding: 10,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
                <MatrixCard
                  title={t('tasks.tasksPage.сделать_сейчас')}
                  subtitle="Срочно + важно"
                  icon={<Flame size={14} color="#f87171" />}
                  accent="rgba(248,113,113,0.35)"
                  items={eisenhower.do}
                  onPick={setSelectedTaskId}
                />
                <MatrixCard
                  title={t('tasks.tasksPage.запланировать')}
                  subtitle="Не срочно + важно"
                  icon={<Target size={14} color="#60a5fa" />}
                  accent="rgba(96,165,250,0.35)"
                  items={eisenhower.schedule}
                  onPick={setSelectedTaskId}
                />
                <MatrixCard
                  title={t('tasks.tasksPage.делегировать')}
                  subtitle="Срочно + не важно"
                  icon={<Timer size={14} color="#fb923c" />}
                  accent="rgba(251,146,60,0.35)"
                  items={eisenhower.delegate}
                  onPick={setSelectedTaskId}
                />
                <MatrixCard
                  title={t('tasks.tasksPage.снизить_приоритет')}
                  subtitle="Не срочно + не важно"
                  icon={<Archive size={14} color="#94a3b8" />}
                  accent="rgba(148,163,184,0.35)"
                  items={eisenhower.eliminate}
                  onPick={setSelectedTaskId}
                />
              </div>
            </div>

            <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* «Задач не найдено» — утверждение о данных, и говорить его,
                  когда данные не загрузились, нельзя: это разные сообщения. */}
              {!loading && !loadError && filtered.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center' as const, color: C.whiteLow }}>
                  {t('tasks.tasksPage.задач_не_найдено')}</div>
              )}
              <div style={{ minHeight: 0, maxHeight: '52vh', overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => toggleDone(task.id)}
                    active={selectedTaskId === task.id}
                    onOpen={() => setSelectedTaskId(task.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right: details */}
          <TaskDetailsPanel
            task={selectedTask}
            today={today}
            total={filtered.length}
            assignees={team}
            onSetInProgress={setInProgress}
            onToggleSubtask={toggleSubtask}
            onReassign={reassignTask}
          />
        </div>
      </div>

      <CreateTaskModal
        open={createOpen}
        onOpenChange={open => {
          setCreateOpen(open)
          if (!open) {
            if (createSuccessRef.current) {
              createSuccessRef.current = false
              return
            }
            if (location.pathname.includes('/tasks/new')) {
              navigate('/dashboard/tasks')
            }
          }
        }}
        assignees={team}
        onCreate={async task => {
          // Ключ идемпотентности один на попытку отправки: повтор после
          // обрыва не создаст вторую задачу (conventions.md §8).
          let created
          try {
            created = await tasksApiV2.create(
              buildCreateTaskPayload(task, { assignedPositionId: task.assignedToId || undefined }),
              newIdempotencyKey(),
            )
          } catch (error) {
            throw new Error(describeCreateError(error))
          }
          createSuccessRef.current = true
          setServerTasks(prev => [created, ...prev])
          navigate('/dashboard/tasks/my', { replace: true })
        }}
      />
    </DashboardShell>
  )
}

function TaskRow({
  task,
  onToggle,
  active,
  onOpen,
}: {
  task: Task
  onToggle: () => void
  active?: boolean
  onOpen?: () => void
}) {
    const { t } = useI18n();
  const isOverdue = task.status === 'overdue' || (task.dueDate < new Date().toISOString().split('T')[0] && task.status !== 'done')
  const accentColor = task.colorHex && task.colorHex.length >= 4 ? task.colorHex : PRIORITY_COLORS[task.priority]
  const priorityColor = PRIORITY_COLORS[task.priority]

  return (
    <div style={{
      background: active
        ? 'linear-gradient(180deg, rgba(22,74,56,0.98) 0%, rgba(13,48,37,0.98) 100%)'
        : 'linear-gradient(180deg, rgba(15,58,44,0.94) 0%, rgba(8,34,27,0.96) 100%)',
      border: `1px solid ${isOverdue ? 'rgba(248,113,113,0.46)' : 'rgba(110,231,183,0.2)'}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      boxShadow: active ? 'inset 0 0 0 1px rgba(201,168,76,0.55), 0 12px 30px rgba(0,0,0,0.24)' : '0 8px 22px rgba(0,0,0,0.16)',
      cursor: onOpen ? 'pointer' : 'default',
    }}>
      {/* Done toggle */}
      <div onClick={onToggle} style={{ cursor: 'pointer', marginTop: 1, flexShrink: 0 }}>
        {STATUS_ICON[task.status]}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }} onClick={onOpen}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 400,
            color: task.status === 'done' ? 'rgba(224,242,232,0.58)' : '#ffffff',
            textDecoration: task.status === 'done' ? 'line-through' : 'none',
            textDecorationColor: task.status === 'done' ? '#fda4af' : undefined,
            textDecorationThickness: task.status === 'done' ? 3 : undefined,
          }}>
            {task.isAutomatic && <Zap size={12} color="#fb923c" style={{ display: 'inline', marginRight: 5 }} />}
            {task.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 400,
              padding: '2px 7px',
              borderRadius: 10,
              background: priorityColor.startsWith('#') ? `${priorityColor}22` : 'rgba(255,255,255,0.08)',
              border: priorityColor.startsWith('#') ? `1px solid ${priorityColor}55` : '1px solid rgba(255,255,255,0.12)',
              color: priorityColor,
            }}>
              {EISENHOWER_PRIORITY_LABELS[task.priority]}
            </span>
          </div>
        </div>

        {task.description && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>{task.description}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' as const }}>
          {task.taskCategory === 'personal' && (
            <span style={{ fontSize: 10, fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--gold)' }}>
              <MapPin size={11} /> {t('tasks.tasksPage.личная')}</span>
          )}

          {/* Assignee */}
          <span style={{ fontSize: 12, color: 'rgba(216,239,228,0.78)' }}>
            👤 {task.assignedToName}
          </span>

          {task.startDate && (
            <span style={{ fontSize: 13, color: 'rgba(216,239,228,0.78)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 400 }}>
              <Clock size={12} />
              {t('tasks.tasksPage.начало')}{formatTaskDate(task.startDate, task.startTime)}
            </span>
          )}

          {/* Due date */}
          <span style={{ fontSize: 13, color: isOverdue ? '#fca5a5' : '#f1d99d', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 400 }}>
            {isOverdue && <AlertTriangle size={12} />}
            {t('tasks.tasksPage.до')}{formatTaskDate(task.dueDate, task.dueTime)}
          </span>

          {task.subtasks && task.subtasks.length > 0 && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ListChecks size={11} />
              {t('tasks.tasksPage.подзадач')}{task.subtasks.length}
            </span>
          )}

          {task.attachmentFileNames && task.attachmentFileNames.length > 0 && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Paperclip size={11} />
              {task.attachmentFileNames.length} {t('tasks.tasksPage.файл_ов')}</span>
          )}

          {/* Entity link */}
          {task.entityLabel && (
            <span style={{ fontSize: 11, color: 'rgba(201,168,76,0.6)' }}>
              🔗 {task.entityLabel}
            </span>
          )}

          {/* Auto badge */}
          {task.isAutomatic && (
            <span style={{ fontSize: 10, color: '#fb923c', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Zap size={10} /> {t('tasks.tasksPage.автоматическая')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function MatrixCard({
  title,
  subtitle,
  icon,
  accent,
  items,
  onPick,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  accent: string
  items: Task[]
  onPick: (id: string) => void
}) {
    const { t } = useI18n();
  return (
    <div
      style={{
        border: `1px solid ${accent}`,
        borderRadius: 10,
        padding: 10,
        background: 'rgba(0,0,0,0.15)',
        minHeight: 220,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {icon}
          <div style={{ fontSize: 12, fontWeight: 400, color: '#fff' }}>{title}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.75)' }}>{items.length}</span>
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>{subtitle}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 156, overflowY: 'auto', paddingRight: 2 }}>
        {items.slice(0, 8).map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              color: 'rgba(255,255,255,0.88)',
              borderRadius: 6,
              textAlign: 'left',
              padding: '6px 8px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {t.title}
          </button>
        ))}
        {items.length === 0 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{t('tasks.tasksPage.пусто')}</span>}
      </div>
    </div>
  )
}

function TaskDetailsPanel({
  task,
  today,
  total,
  assignees,
  onSetInProgress,
  onToggleSubtask,
  onReassign,
}: {
  task: Task | null
  today: string
  total: number
  assignees: TaskAssigneeOption[]
  onSetInProgress: (taskId: string, inProgress: boolean) => void
  onToggleSubtask: (taskId: string, subtaskId: string) => void
  onReassign: (taskId: string, positionId: string) => void
}) {
    const { t } = useI18n();
  if (!task) {
    return (
      <div style={{ border: '1px solid var(--green-border)', borderRadius: 10, background: 'var(--green-card)', padding: 16, color: 'rgba(255,255,255,0.65)' }}>
        {t('tasks.tasksPage.выбери_задачу_слева')}</div>
    )
  }

  const isOverdue = task.status === 'overdue' || (task.dueDate < today && task.status !== 'done')
  return (
    <div style={{ minWidth: 0, border: '1px solid rgba(110,231,183,0.22)', borderRadius: 10, background: 'linear-gradient(180deg, rgba(13,51,39,0.98) 0%, rgba(7,28,22,0.98) 100%)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '72vh', overflowY: 'auto', boxShadow: '0 14px 34px rgba(0,0,0,0.22)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 400, color: '#fff' }}>{t('tasks.tasksPage.карточка_задачи')}</div>
        <span style={{ fontSize: 12, color: 'rgba(216,239,228,0.72)' }}>{t('tasks.tasksPage.в_списке')}{total}</span>
      </div>

      <div style={{ border: '1px solid rgba(110,231,183,0.16)', borderRadius: 8, padding: 12, background: 'rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: 14, fontWeight: 400, color: '#fff', marginBottom: 5 }}>{task.title}</div>
        {task.description && <div style={{ fontSize: 13, color: 'rgba(216,239,228,0.78)', marginBottom: 10 }}>{task.description}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Meta label={t('tasks.tasksPage.статус')} value={STATUS_LABELS[task.status]} warn={isOverdue} />
          <Meta label={t('tasks.tasksPage.приоритет')} value={EISENHOWER_PRIORITY_LABELS[task.priority]} />
          <Meta label={t('tasks.tasksPage.создал')} value={task.createdByName} />
          <Meta label={t('tasks.tasksPage.срок')} value={formatTaskDate(task.dueDate, task.dueTime)} warn={isOverdue} />
          <Meta label={t('tasks.tasksPage.тип')} value={task.isAutomatic ? 'Автоматическая' : 'Ручная'} />
        </div>

        {/* Исполнитель — не текст, а выбор: смена исполнителя уходит в
            PATCH /tasks/:id/reassign, у которого своё право task.reassign.
            design-ok: rgba(255,255,255,0.035) — заливка блока, как у соседних
            Meta, а не цвет текста. */}
        <div style={{ /* design-ok: заливка блока, как у соседних Meta, не цвет текста */ marginTop: 8, border: '1px solid rgba(110,231,183,0.14)', borderRadius: 7, padding: '8px 9px', background: 'rgba(255,255,255,0.035)' }}>
          <label htmlFor="task-assignee" style={{ display: 'block', fontSize: 16, color: 'rgba(241,217,157,0.76)', marginBottom: 4 }}>
            {t('tasks.tasksPage.исполнитель')}</label>
          <select
            id="task-assignee"
            value={task.assignedToId}
            onChange={event => onReassign(task.id, event.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: 4,
              border: '1px solid rgba(110,231,183,0.2)',
              background: 'rgba(0,0,0,0.25)',
              color: 'rgba(255,255,255,0.92)',
              fontSize: 16,
              fontWeight: 400,
            }}
          >
            <option value="">{task.assignedToName}</option>
            {assignees.map(member => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>

        {task.status !== 'done' && (
          <button
            type="button"
            onClick={() => onSetInProgress(task.id, task.status !== 'in_progress')}
            style={{
              marginTop: 8,
              padding: '8px 14px',
              borderRadius: 4,
              border: '1px solid rgba(230,195,100,0.4)',
              background: 'transparent',
              color: C.gold,
              fontSize: 16,
              fontWeight: 400,
              cursor: 'pointer',
            }}
          >
            {task.status === 'in_progress'
              ? t('tasks.tasksPage.вернуть_в_новые')
              : t('tasks.tasksPage.взять_в_работу')}</button>
        )}
      </div>

      {task.entityLabel && (
        <div style={{ border: '1px solid rgba(201,168,76,0.25)', borderRadius: 8, padding: 10, color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
          {t('tasks.tasksPage.связано')}{task.entityLabel}
        </div>
      )}

      {task.subtasks && task.subtasks.length > 0 && (
        <div style={{ border: '1px solid rgba(110,231,183,0.16)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 400, color: '#fff', marginBottom: 6 }}>{t('tasks.tasksPage.подзадачи')}</div>
          {/* Отметка подзадачи уходит на сервер: модель хранила `done` с самого
              начала, но экран показывал список, который ничего не сохранял. */}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', color: 'rgba(216,239,228,0.82)', fontSize: 16 }}>
            {task.subtasks.map(st => (
              <li key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                <input
                  type="checkbox"
                  id={`subtask-${st.id}`}
                  checked={st.done}
                  onChange={() => onToggleSubtask(task.id, st.id)}
                  style={{ width: 16, height: 16, accentColor: 'var(--gold)', cursor: 'pointer' }}
                />
                <label
                  htmlFor={`subtask-${st.id}`}
                  style={{
                    cursor: 'pointer',
                    textDecoration: st.done ? 'line-through' : 'none',
                    color: st.done ? 'rgba(216,239,228,0.72)' : 'rgba(216,239,228,0.92)',
                  }}
                >
                  {st.title}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Meta({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ border: '1px solid rgba(110,231,183,0.14)', borderRadius: 7, padding: '8px 9px', background: 'rgba(255,255,255,0.035)' }}>
      <div style={{ fontSize: 11, color: 'rgba(241,217,157,0.76)' }}>{label}</div>
      <div style={{ fontSize: label === 'Срок' ? 14 : 12, color: warn ? '#fca5a5' : 'rgba(255,255,255,0.92)', fontWeight: 400 }}>{value}</div>
    </div>
  )
}

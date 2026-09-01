"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { format, isToday, isYesterday } from "date-fns"
import { ru } from "date-fns/locale"
import {
  MessageSquare,
  Phone,
  CheckSquare,
  ArrowUpRight,
  UserPlus,
  CalendarDays,
  Send,
  Plus,
  AlertTriangle,
  Clock,
  ListTodo,
  MoreHorizontal,
  Trash2,
  Pencil,
  ListFilter,
} from "lucide-react"

import { useLeads } from "@/context/LeadsContext"
import type { LeadEvent, LeadEventType, TaskSetByRole } from "@/types/leads"
import { LEAD_STAGES } from "@/data/leads-mock"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/context/AuthContext"
import { useRolePermissions } from "@/hooks/useRolePermissions"
import { EisenhowerChips } from "@/components/shared/EisenhowerChips"
import { useI18n } from "@/i18n";

const TASK_EVENT_TYPES: LeadEventType[] = ['task_created', 'task', 'task_completed', 'overdue']

const TASK_SET_BY_ROLE_LABEL: Record<TaskSetByRole, string> = {
  owner: 'Собственник',
  director: 'Директор',
  rop: 'РОП',
}

function getEventIcon(type: LeadEventType) {
  switch (type) {
    case "created":
      return <UserPlus className="size-4" />
    case "stage_change":
      return <ArrowUpRight className="size-4" />
    case "comment":
      return <MessageSquare className="size-4" />
    case "call":
      return <Phone className="size-4" />
    case "task":
    case "task_completed":
      return <CheckSquare className="size-4" />
    case "task_created":
      return <ListTodo className="size-4" />
    case "overdue":
      return <AlertTriangle className="size-4 stroke-[2.5px]" />
    case "assign":
      return <UserPlus className="size-4" />
    case "buyer_registration":
      return <CalendarDays className="size-4" />
    default:
      return <MessageSquare className="size-4" />
  }
}

function getEventColorClass(type: LeadEventType) {
  switch (type) {
    case "created":
    case "stage_change":
    case "buyer_registration":
    case "task_completed":
      return "text-emerald-600 bg-emerald-100 border-emerald-300 dark:text-emerald-100 dark:bg-emerald-800/85 dark:border-emerald-400/50"
    case "task":
    case "task_created":
    case "call":
    case "assign":
      return "text-amber-600 bg-amber-100 border-amber-300 dark:text-amber-100 dark:bg-amber-800/80 dark:border-amber-300/50"
    case "overdue":
      return "text-rose-600 bg-rose-100 border-rose-300 dark:text-rose-100 dark:bg-rose-800/85 dark:border-rose-300/55"
    case "comment":
      return "text-teal-600 bg-teal-100 border-teal-300 dark:text-cyan-100 dark:bg-teal-800/80 dark:border-cyan-300/45"
    default:
      return "text-slate-600 bg-slate-100 border-slate-300 dark:text-slate-100 dark:bg-slate-700/85 dark:border-slate-300/35"
  }
}

function formatDateHeader(dateString: string) {
  const date = new Date(dateString)
  if (isToday(date)) return "Сегодня"
  if (isYesterday(date)) return "Вчера"
  return format(date, "d MMMM yyyy", { locale: ru })
}

function formatTime(dateString: string) {
  return format(new Date(dateString), "HH:mm")
}

function getEventTypeName(type: LeadEvent['type']) {
  switch(type) {
    case 'stage_change': return 'Смена этапа'
    case 'assign': return 'Назначение'
    case 'created': return 'Создание'
    case 'call': return 'Звонок'
    case 'task_created': return 'Новая задача'
    case 'task_completed': return 'Задача выполнена'
    case 'task': return 'Задача'
    case 'overdue': return 'Просрочка'
    case 'buyer_registration': return 'Регистрация покупателя'
    default: return 'Комментарий'
  }
}

export function LeadHistoryTimeline({
  leadId,
  initialInputType = "comment",
}: {
  leadId: string | null
  initialInputType?: "comment" | "task"
}) {
    const { t } = useI18n();
  const { getLeadWithHistory, dispatch, leadManagers } = useLeads()
  const { currentUser } = useAuth()
  const { isRopOrAbove, role } = useRolePermissions()
  const isManager = currentUser?.role === "manager"
  const scrollRef = useRef<HTMLDivElement>(null)

  const getDefaultDeadline = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }

  const [newComment, setNewComment] = useState("")
  const [inputType, setInputType] = useState<"comment" | "task">(initialInputType)
  const [taskDeadline, setTaskDeadline] = useState(() => initialInputType === "task" ? getDefaultDeadline() : "")
  const [taskAssignee, setTaskAssignee] = useState("")
  const [taskEisenhowerUrgent, setTaskEisenhowerUrgent] = useState<boolean>(false)
  const [taskEisenhowerImportant, setTaskEisenhowerImportant] = useState<boolean>(false)

  const [onlyTasks, setOnlyTasks] = useState(true)

  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editTaskName, setEditTaskName] = useState("")
  const [editDeadline, setEditDeadline] = useState("")
  const [editEisenhowerUrgent, setEditEisenhowerUrgent] = useState<boolean>(false)
  const [editEisenhowerImportant, setEditEisenhowerImportant] = useState<boolean>(false)

  const handleAddEvent = () => {
    if (!leadId) return
    if (!newComment.trim()) return
    if (inputType === 'task' && !taskDeadline.trim()) return
    const leadForSubmit = inputType === 'task' ? getLeadWithHistory(leadId) : null
    const effectiveAssignId = taskAssignee || leadForSubmit?.managerId || currentUser?.id || ''
    if (inputType === 'task' && !effectiveAssignId) return

    const now = new Date().toISOString()

    const authorId = currentUser?.id ?? 'lm-1'
    const authorName = currentUser?.name ?? 'Текущий Пользователь'
    let submitManagerId = authorId
    let submitManagerName = authorName

    if (inputType === 'task') {
      const assignId = effectiveAssignId || authorId
      submitManagerId = assignId
      const mgr = leadManagers?.find((m) => m.id === assignId)
      if (mgr) submitManagerName = mgr.name
      else if (assignId === authorId) submitManagerName = authorName
    }

    const setByRole: TaskSetByRole | undefined =
      inputType === 'task' && isRopOrAbove && (role === 'owner' || role === 'director' || role === 'rop')
        ? role
        : undefined

    const event: LeadEvent = {
       id: `evt-${Date.now()}`,
       type: inputType === 'task' ? 'task_created' : 'comment',
       timestamp: now,
       authorId,
       authorName,
       payload: inputType === 'task'
         ? {
             taskName: newComment,
             deadline: taskDeadline || now,
             managerId: submitManagerId,
             managerName: submitManagerName,
             setByRole,
             eisenhowerUrgent: taskEisenhowerUrgent,
             eisenhowerImportant: taskEisenhowerImportant,
           }
         : { comment: newComment }
    }

    dispatch({ type: 'ADD_LEAD_EVENT', leadId, event })
    setNewComment('')
    setTaskDeadline(getDefaultDeadline())
    setTaskAssignee(leadId ? (getLeadWithHistory(leadId)?.managerId ?? '') : '')
    setTaskEisenhowerUrgent(false)
    setTaskEisenhowerImportant(false)
  }

  const handleStartEdit = (event: LeadEvent) => {
    setEditingEventId(event.id)
    setEditTaskName(event.payload.taskName ?? '')
    setEditEisenhowerUrgent(event.payload.eisenhowerUrgent ?? false)
    setEditEisenhowerImportant(event.payload.eisenhowerImportant ?? false)
    if (event.payload.deadline) {
      const d = new Date(event.payload.deadline)
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      setEditDeadline(local)
    } else {
      setEditDeadline('')
    }
  }

  const handleSaveEdit = (event: LeadEvent) => {
    if (!leadId || !editingEventId) return
    const deadlineIso = editDeadline ? new Date(editDeadline).toISOString() : event.payload.deadline

    dispatch({
      type: 'EDIT_LEAD_EVENT',
      leadId,
      eventId: editingEventId,
      patch: {
        taskName: editTaskName,
        deadline: deadlineIso,
        eisenhowerUrgent: editEisenhowerUrgent,
        eisenhowerImportant: editEisenhowerImportant,
      },
    })

    const oldName = event.payload.taskName ?? ''
    const changedParts: string[] = []
    if (editTaskName !== oldName) changedParts.push(`задача: «${editTaskName}»`)
    if (deadlineIso !== event.payload.deadline) changedParts.push(`срок: ${formatDateHeader(deadlineIso ?? '')}`)
    if (changedParts.length > 0) {
      dispatch({
        type: 'ADD_LEAD_EVENT',
        leadId,
        event: {
          id: `evt-${Date.now()}`,
          type: 'comment',
          timestamp: new Date().toISOString(),
          authorId: currentUser?.id ?? 'lm-1',
          authorName: currentUser?.name ?? 'Текущий Пользователь',
          payload: { comment: `Задача отредактирована: ${changedParts.join(', ')}` },
        },
      })
    }

    setEditingEventId(null)
    setEditTaskName('')
    setEditDeadline('')
  }

  const handleCancelEdit = () => {
    setEditingEventId(null)
    setEditTaskName('')
    setEditDeadline('')
    setEditEisenhowerUrgent(false)
    setEditEisenhowerImportant(false)
  }

  const lead = useMemo(() => {
    if (!leadId) return null
    return getLeadWithHistory(leadId)
  }, [leadId, getLeadWithHistory])

  useEffect(() => {
    if (inputType !== 'task' || !leadId) return
    const l = getLeadWithHistory(leadId)
    if (!l) return
    setTaskAssignee(l.managerId ?? currentUser?.id ?? '')
  }, [inputType, leadId, getLeadWithHistory, currentUser?.id])

  const effectiveTaskAssigneeId = taskAssignee || lead?.managerId || currentUser?.id || ''
  const submitDisabled =
    inputType === 'task'
      ? !newComment.trim() || !taskDeadline.trim() || !effectiveTaskAssigneeId
      : !newComment.trim()

  const groupedEvents = useMemo(() => {
    if (!lead || !lead.history) return []

    const groups: { dateLabel: string; events: LeadEvent[] }[] = []

    const sorted = [...lead.history].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    const filtered = onlyTasks
      ? sorted.filter((e) => TASK_EVENT_TYPES.includes(e.type))
      : sorted

    let currentDateLabel = ""
    let currentGroup: LeadEvent[] = []

    filtered.forEach((event) => {
      const label = formatDateHeader(event.timestamp)
      if (label !== currentDateLabel) {
        if (currentGroup.length > 0) {
          groups.push({ dateLabel: currentDateLabel, events: currentGroup })
        }
        currentDateLabel = label
        currentGroup = [event]
      } else {
        currentGroup.push(event)
      }
    })

    if (currentGroup.length > 0) {
      groups.push({ dateLabel: currentDateLabel, events: currentGroup })
    }

    return groups
  }, [lead, onlyTasks])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [leadId, groupedEvents.length])

  if (!lead) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--green-deep)] text-[var(--app-text-muted)]">
        {t('leads.leadHistoryTimeline.выберите_лида_для_пр')}</div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--green-deep)] font-sans text-[var(--app-text)]">
      {/* Scrollable Timeline Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[var(--green-deep)] p-4 md:p-5 scroll-smooth font-sans lead-history-scroll">
        <div className="mx-auto pb-3">
          {/* Filter toggle */}
          <div className="flex items-center justify-end mb-2">
            <button
              onClick={() => setOnlyTasks((v) => !v)}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-normal uppercase tracking-wide border transition-colors",
                onlyTasks
                  ? "bg-emerald-500/20 text-emerald-700 border-emerald-300 dark:text-emerald-100 dark:bg-emerald-800/85 dark:border-emerald-400/45"
                  : "bg-[var(--green-card)] text-[var(--app-text-muted)] border-[var(--hub-card-border)] hover:bg-[var(--green-card-hover)]"
              )}
            >
              <ListFilter className="size-3" />
              {t('leads.leadHistoryTimeline.только_задачи')}</button>
          </div>

          <div className="space-y-4">
            {groupedEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[var(--app-text-muted)]">
                <MessageSquare className="size-7 mb-2 opacity-50" />
                <p className="text-sm font-medium">{t('leads.leadHistoryTimeline.история_пока_пуста')}</p>
                <p className="text-xs">{t('leads.leadHistoryTimeline.оставьте_первый_комм')}</p>
              </div>
            ) : (
              groupedEvents.map((group) => (
                <div key={group.dateLabel} className="relative">
                  {/* Date header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-normal uppercase tracking-widest text-[var(--gold)] shrink-0 sm:text-[15px]">
                      {group.dateLabel}
                    </span>
                    <div className="flex-1 h-px bg-[color-mix(in_srgb,var(--gold)_20%,transparent)]" />
                  </div>

                  {/* Timeline Line */}
                  <div className="absolute left-6 md:left-[36px] top-8 bottom-0 w-px bg-gradient-to-b from-[color-mix(in_srgb,var(--gold)_45%,transparent)] to-transparent" />

                  <div className="space-y-2.5">
                    {group.events.map((event) => {
                      const isEditing = editingEventId === event.id
                      return (
                        <div key={event.id} className="relative flex gap-2 md:gap-3 group">
                          {/* Time */}
                          <div className="w-14 pt-1 text-right shrink-0 sm:w-16">
                            <span className="text-[13px] font-medium text-[var(--app-text-muted)] tabular-nums sm:text-sm">
                              {formatTime(event.timestamp)}
                            </span>
                          </div>

                          {/* Icon */}
                          <div className="relative z-10 mt-0.5 flex items-center justify-center">
                            <div className={cn(
                              "flex size-8 items-center justify-center rounded-full border shadow-sm ring-2 ring-[var(--green-deep)] transition-all duration-300 group-hover:scale-105 [&>svg]:size-4",
                              getEventColorClass(event.type)
                            )}>
                              {getEventIcon(event.type)}
                            </div>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pt-0 pb-0.5">
                            <div className="rounded-lg border border-[color-mix(in_srgb,var(--gold)_22%,transparent)] bg-[var(--green-card)] px-4 py-3 shadow-sm transition-all hover:border-[color-mix(in_srgb,var(--gold)_45%,transparent)] hover:bg-[var(--green-card-hover)]">
                              <div className="flex items-start justify-between mb-1 gap-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={cn(
                                    "text-[12px] font-normal truncate",
                                    event.type === 'overdue' ? "text-rose-500 dark:text-rose-200" : "text-[var(--app-text)]"
                                  )}>
                                    {event.type === 'overdue'
                                      ? 'Просрочка!'
                                      : event.type === 'task_created' && event.payload.setByRole
                                        ? `${TASK_SET_BY_ROLE_LABEL[event.payload.setByRole]} ${event.authorName}`
                                        : event.authorName}
                                  </span>
                                  <span className={cn(
                                    "text-[10px] uppercase tracking-wider font-normal shrink-0 px-2 py-0.5 rounded border",
                                    event.type === 'overdue' ? "text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-100 dark:bg-rose-500/18 dark:border-rose-300/35" : "text-[var(--app-text-muted)] bg-[var(--green-card)] border-[var(--hub-card-border)] dark:bg-emerald-950/45 dark:border-emerald-300/18"
                                  )}>
                                    {getEventTypeName(event.type)}
                                  </span>
                                </div>

                                {(event.type === 'comment' || event.type === 'task' || event.type === 'task_created') && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-[var(--app-text-subtle)] hover:bg-[var(--green-card-hover)] hover:text-[var(--app-text)]">
                                        <MoreHorizontal className="size-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-36">
                                      {event.type === 'task_created' && (
                                        <DropdownMenuItem
                                          className="cursor-pointer text-[11px]"
                                          onClick={() => handleStartEdit(event)}
                                        >
                                          <Pencil className="size-3 mr-1.5" />
                                          {t('leads.leadHistoryTimeline.редактировать')}</DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem
                                        className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 cursor-pointer text-[11px]"
                                        onClick={() => {
                                          if (!leadId) return
                                          dispatch({ type: 'DELETE_LEAD_EVENT', leadId, eventId: event.id })
                                        }}
                                      >
                                        <Trash2 className="size-3 mr-1.5" />
                                        {t('leads.leadHistoryTimeline.удалить')}</DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>

                              {isEditing ? (
                                <div className="space-y-2 mt-1">
                                  <Input
                                    value={editTaskName}
                                    onChange={(e) => setEditTaskName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(event) }}
                                    placeholder={t('leads.leadHistoryTimeline.название_задачи')}
                                    className="h-8 border-[var(--hub-card-border)] bg-[var(--input)] text-sm text-[var(--app-text)]"
                                    autoFocus
                                  />
                                  <div>
                                    <p className="text-[11px] uppercase text-[var(--app-text-muted)] font-normal tracking-wide mb-1">{t('leads.leadHistoryTimeline.срочность_и_важность')}</p>
                                    <EisenhowerChips
                                      urgent={editEisenhowerUrgent}
                                      important={editEisenhowerImportant}
                                      onChangeUrgent={setEditEisenhowerUrgent}
                                      onChangeImportant={setEditEisenhowerImportant}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] uppercase text-[var(--app-text-muted)] font-normal tracking-wide shrink-0">{t('leads.leadHistoryTimeline.срок')}</span>
                                    <input
                                      type="datetime-local"
                                      value={editDeadline}
                                      onChange={(e) => setEditDeadline(e.target.value)}
                                      className="h-8 rounded-md border border-[var(--hub-card-border)] bg-[var(--input)] px-2 py-0.5 text-xs text-[var(--app-text)] shadow-sm focus:outline-none focus:ring-1 focus:ring-[var(--gold)]/50"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5 pt-0.5">
                                    <Button size="sm" onClick={() => handleSaveEdit(event)} className="h-6 px-2.5 text-[10px]">
                                      {t('leads.leadHistoryTimeline.сохранить')}</Button>
                                    <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-6 px-2.5 text-[10px]">
                                      {t('leads.leadHistoryTimeline.отмена')}</Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-sm text-[var(--app-text-muted)] leading-relaxed">
                                  {event.type === 'stage_change' ? (
                                    <span>
                                      → <span className="font-normal text-[var(--app-text)]">{
                                        LEAD_STAGES.find(s => s.id === event.payload.toStage)?.name
                                        || event.payload.toStageName
                                        || event.payload.toStage
                                      }</span>
                                    </span>
                                  ) : event.type === 'assign' ? (
                                    <span>
                                      {t('leads.leadHistoryTimeline.менеджер')}<span className="font-normal text-[var(--app-text)]">{event.payload.managerName}</span>
                                    </span>
                                  ) : event.type === 'created' ? (
                                    <span>{t('leads.leadHistoryTimeline.лид_поступил_в_систе')}</span>
                                  ) : event.type === 'task_created' ? (
                                    <div className="space-y-1.5">
                                      <span className="text-[var(--app-text)] font-medium">{event.payload.taskName}</span>
                                      {(event.payload.eisenhowerUrgent !== undefined || event.payload.eisenhowerImportant !== undefined) && (
                                        <EisenhowerChips
                                          readOnly
                                          urgent={event.payload.eisenhowerUrgent === true}
                                          important={event.payload.eisenhowerImportant === true}
                                        />
                                      )}
                                      {event.payload.deadline && (
                                        <div className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-100 dark:bg-amber-500/18 dark:border-amber-300/35 w-fit px-2 py-1 rounded border">
                                          <Clock className="size-3" />
                                          <span>{t('leads.leadHistoryTimeline.срок')}{formatDateHeader(event.payload.deadline)}, {formatTime(event.payload.deadline)}</span>
                                        </div>
                                      )}
                                    </div>
                                  ) : event.type === 'task_completed' ? (
                                    <span className="font-normal text-[var(--app-text-muted)] line-through decoration-rose-300 decoration-[3px]">
                                      {event.payload.taskName}
                                    </span>
                                  ) : event.type === 'overdue' ? (
                                    <span className="text-rose-500 dark:text-rose-200 font-medium">
                                      {event.payload.comment}
                                    </span>
                                  ) : (
                                    <span>{event.payload.comment}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className={cn(
        "shrink-0 border-t bg-[var(--green-card)] px-4 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]",
        inputType === "task" ? "border-amber-200 dark:border-amber-300/30 py-3" : "border-[var(--hub-card-border)] py-2"
      )}>
        {inputType === "comment" ? (
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleAddEvent() }}
                placeholder={t('leads.leadHistoryTimeline.комментарий')}
                className="w-full h-9 rounded-lg border-[var(--hub-card-border)] bg-[var(--input)] px-3 py-1 pr-10 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-subtle)] focus-visible:ring-1 focus-visible:ring-[var(--gold)]/50"
              />
              <Button
                size="sm"
                onClick={handleAddEvent}
                disabled={submitDisabled}
                className="absolute right-1 top-1 h-7 w-7 rounded-full p-0 flex items-center justify-center bg-emerald-500 text-white hover:bg-emerald-400 shadow-sm disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-emerald-300/40"
              >
                <Send className="size-3 ml-px" />
              </Button>
            </div>
            <button
              onClick={() => { setInputType("task"); if (!taskDeadline) setTaskDeadline(getDefaultDeadline()) }}
              className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-normal uppercase tracking-wide border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300 dark:border-amber-300/25 dark:bg-amber-500/12 dark:text-amber-100 dark:hover:bg-amber-500/18 dark:hover:border-amber-300/45 transition-colors"
            >
              <Plus className="size-3" />
              {t('leads.leadHistoryTimeline.задача')}</button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleAddEvent() }}
                placeholder={t('leads.leadHistoryTimeline.опишите_задачу')}
                className="flex-1 h-9 rounded-lg border-[var(--hub-card-border)] bg-[var(--input)] px-3 py-1 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-subtle)] focus-visible:ring-1 focus-visible:ring-[var(--gold)]/50"
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleAddEvent}
                disabled={submitDisabled}
                className="shrink-0 h-9 px-4 text-[11px] font-normal uppercase tracking-wide bg-[var(--gold)] text-[var(--gold-btn-text)] hover:bg-[var(--gold-light)] rounded-lg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="size-3 mr-1" />
                {t('leads.leadHistoryTimeline.задача')}</Button>
              <button
                onClick={() => setInputType("comment")}
                className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--green-card-hover)] transition-colors"
              >✕</button>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2.5">
              {!isManager && (
                <Select value={taskAssignee || undefined} onValueChange={setTaskAssignee}>
                  <SelectTrigger className="h-10 min-w-[min(30vw,320px)] max-w-full border-[var(--hub-card-border)] bg-[var(--input)] text-sm font-normal text-[var(--app-text)] shadow-sm">
                    <SelectValue placeholder={t('leads.leadHistoryTimeline.исполнитель')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 border-[var(--hub-card-border)] bg-[var(--green-card)] text-[var(--app-text)]">
                    {leadManagers?.map(mgr => (
                      <SelectItem key={mgr.id} value={mgr.id} className="focus:bg-[var(--dropdown-hover)] focus:text-[var(--app-text)]">{mgr.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex min-w-[min(30vw,360px)] max-w-full flex-1 flex-col gap-1 sm:min-w-[280px]">
                <span className="text-xs font-normal uppercase tracking-wide text-[var(--gold)]">{t('leads.leadHistoryTimeline.срок_выполнения')}</span>
                <input
                  type="datetime-local"
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  className="h-10 w-full rounded-md border border-[var(--hub-card-border)] bg-[var(--input)] px-3 text-sm text-[var(--app-text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/70"
                />
              </div>
              <EisenhowerChips
                urgent={taskEisenhowerUrgent}
                important={taskEisenhowerImportant}
                onChangeUrgent={setTaskEisenhowerUrgent}
                onChangeImportant={setTaskEisenhowerImportant}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

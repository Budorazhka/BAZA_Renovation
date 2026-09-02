import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Clock, User, MapPin, X } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { type CalEvent } from '@/data/calendar-events-mock'
import { useAuth } from '@/context/AuthContext'
import { useCrmSync } from '@/features/crm/context/CrmSyncContext'
import { apiService, EventType } from '@/features/crm/services/api'
import { toast } from 'sonner'
import { useI18n } from "@/i18n";

const C = {
  gold: 'var(--gold)',
  white: '#ffffff',
  whiteMid: 'rgba(255,255,255,0.7)',
  whiteLow: 'rgba(255,255,255,0.4)',
  border: 'var(--green-border)',
  card: 'var(--green-card)',
  green: '#4ade80',
  blue: '#60a5fa',
}

const EVENT_TYPE_COLORS = {
  showing: C.blue,
  meeting: C.gold,
  call: '#a78bfa',
  signing: C.green,
}

const EVENT_CHIP_BG: Record<keyof typeof EVENT_TYPE_COLORS, string> = {
  showing: 'rgba(96,165,250,0.18)',
  meeting: 'rgba(201,168,76,0.2)',
  call: 'rgba(167,139,250,0.2)',
  signing: 'rgba(74,222,128,0.16)',
}

const EVENT_TYPE_LABELS = {
  showing: 'Показ',
  meeting: 'Встреча',
  call: 'Звонок',
  signing: 'Подписание',
}

const today = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
type ViewMode = 'month' | 'week' | 'day'

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfWeek(year: number, month: number) {
  const d = new Date(year, month, 1).getDay()
  return d === 0 ? 6 : d - 1
}
function startOfWeek(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const weekday = d.getDay()
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  d.setDate(d.getDate() + mondayOffset)
  return d
}
function addDays(date: Date, days: number) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + days)
  return d
}

/** Высота области — заполняет оставшееся пространство (хедер убран, кнопка назад ~40px) */
const VIEWPORT_H = 'calc(100vh - 40px)'

export function CalendarPage() {
    const { t } = useI18n();
  const { currentUser } = useAuth()
  const { calendarEvents, isLoading, refresh } = useCrmSync()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(fmt(today))
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [createOpen, setCreateOpen] = useState(false)

  const handleCreateEvent = async (data: Omit<CalEvent, 'id' | 'agentId' | 'agentName'>) => {
    try {
      if (!currentUser?.id) {
        toast.error('Пользователь не авторизован');
        return;
      }

      const start = new Date(`${data.date}T${data.time}:00`);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 час по умолчанию

      const res = await apiService.createCalendarEvent({
        title: data.title,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        type: data.type === 'call' ? EventType.CALL : EventType.MEETING,
        location: data.location,
        description: data.client ? `Клиент: ${data.client}` : undefined,
      }, currentUser.id);

      if (res.success) {
        toast.success('Мероприятие создано');
        refresh(); 
      } else {
        toast.error(res.message || 'Ошибка при создании мероприятия');
      }
    } catch (error) {
      console.error('Failed to create event:', error);
      toast.error('Произошла ошибка при создании мероприятия');
    } finally {
      setCreateOpen(false);
    }
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDow = getFirstDayOfWeek(year, month)

  const monthCells = useMemo(() => {
    const cells: (string | null)[] = []
    for (let i = 0; i < firstDow; i++) cells.push(null)
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(`${year}-${pad(month + 1)}-${pad(day)}`)
    }
    while (cells.length < 42) cells.push(null)
    return cells
  }, [year, month, firstDow, daysInMonth])

  const eventsForDate = (date: string) => calendarEvents.filter(e => e.date === date)
  const selectedEvents = eventsForDate(selectedDate)
  const selectedDateObj = new Date(`${selectedDate}T12:00:00`)
  const weekDates = useMemo(() => {
    const weekStart = startOfWeek(viewDate)
    return Array.from({ length: 7 }, (_, i) => fmt(addDays(weekStart, i)))
  }, [viewDate])
  const periodEvents = useMemo(() => {
    if (viewMode === 'day') return eventsForDate(selectedDate)
    if (viewMode === 'week') {
      const dates = new Set(weekDates)
      return calendarEvents.filter(e => dates.has(e.date))
    }
    return calendarEvents.filter(e => {
      const d = new Date(`${e.date}T12:00:00`)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [viewMode, selectedDate, weekDates, year, month, calendarEvents])
  const reportByType = useMemo(
    () =>
      periodEvents.reduce<Record<keyof typeof EVENT_TYPE_COLORS, number>>(
        (acc, event) => {
          acc[event.type] += 1
          return acc
        },
        { showing: 0, meeting: 0, call: 0, signing: 0 },
      ),
    [periodEvents],
  )

  function prevPeriod() {
    if (viewMode === 'day') {
      const nextSelected = addDays(selectedDateObj, -1)
      setSelectedDate(fmt(nextSelected))
      setViewDate(nextSelected)
      return
    }
    if (viewMode === 'week') {
      const nextSelected = addDays(selectedDateObj, -7)
      setSelectedDate(fmt(nextSelected))
      setViewDate(nextSelected)
      return
    }
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }
  function nextPeriod() {
    if (viewMode === 'day') {
      const nextSelected = addDays(selectedDateObj, 1)
      setSelectedDate(fmt(nextSelected))
      setViewDate(nextSelected)
      return
    }
    if (viewMode === 'week') {
      const nextSelected = addDays(selectedDateObj, 7)
      setSelectedDate(fmt(nextSelected))
      setViewDate(nextSelected)
      return
    }
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }
  function goToday() {
    const t = new Date()
    setViewDate(new Date(t.getFullYear(), t.getMonth(), t.getDate()))
    setSelectedDate(fmt(t))
  }

  const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
  const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  function cellBackground(isSelected: boolean, isToday: boolean, _isWeekend: boolean) {
    if (isSelected) return 'var(--nav-item-bg-active)'
    if (isToday) return 'var(--workspace-cal-chip-bg)'
    return 'var(--workspace-cal-cell-fill)'
  }
  const periodTitle =
    viewMode === 'month'
      ? `${MONTH_NAMES[month]} ${year}`
      : viewMode === 'week'
        ? `${new Date(`${weekDates[0]}T12:00:00`).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
          })} — ${new Date(`${weekDates[6]}T12:00:00`).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
          })}`
        : new Date(`${selectedDate}T12:00:00`).toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
  const periodLabel = viewMode === 'month' ? 'за месяц' : viewMode === 'week' ? 'за неделю' : 'за день'

  return (
    <DashboardShell>
      <div
        style={{
          height: VIEWPORT_H,
          maxHeight: VIEWPORT_H,
          width: '100%',
          boxSizing: 'border-box',
          padding: '12px 16px 14px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
          background: 'var(--app-bg)',
        }}
      >
        {/* Две колонки: сетка + выбранный день — на одну высоту экрана */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'row',
            gap: 14,
            alignItems: 'stretch',
            overflow: 'hidden',
          }}
        >
          {/* Левая: месяц */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0,
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 20, fontWeight: 400, color: 'var(--app-text)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                {periodTitle}
              </div>
              {isLoading && (
                <div className="animate-pulse" style={{ fontSize: 12, color: 'var(--gold)' }}>{t('calendar.calendarPage.обновление')}</div>
              )}
            </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div
                  style={{
                    display: 'inline-flex',
                    border: '1px solid var(--green-border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    marginRight: 4,
                  }}
                >
                  {([
                    { id: 'month', label: 'Месяц' },
                    { id: 'week', label: 'Неделя' },
                    { id: 'day', label: 'День' },
                  ] as const).map(mode => {
                    const active = viewMode === mode.id
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          setViewMode(mode.id)
                          const base = new Date(`${selectedDate}T12:00:00`)
                          setViewDate(mode.id === 'month' ? new Date(base.getFullYear(), base.getMonth(), 1) : base)
                        }}
                        style={{
                          padding: '6px 10px',
                          background: active ? 'rgba(201,168,76,0.16)' : 'var(--workspace-cal-nav-bg)',
                          border: 'none',
                          borderRight: mode.id === 'day' ? 'none' : '1px solid var(--green-border)',
                          color: active ? 'var(--gold)' : 'var(--app-text-muted)',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        {mode.label}
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={prevPeriod}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--workspace-cal-nav-bg)',
                    border: '1px solid var(--green-border)',
                    borderRadius: 8,
                    color: 'var(--app-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(201,168,76,0.14)',
                    border: '1px solid rgba(201,168,76,0.45)',
                    borderRadius: 8,
                    color: 'var(--gold)',
                    fontSize: 12,
                    fontWeight: 400,
                    cursor: 'pointer',
                  }}
                >
                  {t('calendar.calendarPage.сегодня')}</button>
                <button
                  type="button"
                  onClick={nextPeriod}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--workspace-cal-nav-bg)',
                    border: '1px solid var(--green-border)',
                    borderRadius: 8,
                    color: 'var(--app-text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {viewMode !== 'day' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 4,
                  marginBottom: 6,
                  flexShrink: 0,
                }}
              >
                {DAY_NAMES.map(d => (
                  <div
                    key={d}
                    style={{
                      fontSize: 10,
                      fontWeight: 400,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase' as const,
                      color: 'var(--app-text-subtle)',
                      textAlign: 'center' as const,
                      padding: '4px 2px',
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>
            )}

            {viewMode === 'month' && (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gridTemplateRows: 'repeat(6, minmax(0, 1fr))',
                  gap: 3,
                }}
              >
                {monthCells.map((date, i) => {
                  if (!date) {
                    return <div key={`e-${i}`} style={{ minHeight: 0, borderRadius: 8, background: 'var(--green-deep)' }} />
                  }
                  const dayEvents = eventsForDate(date)
                  const isToday = date === fmt(today)
                  const isSelected = date === selectedDate
                  const [, , d] = date.split('-')
                  const weekday = new Date(`${date}T12:00:00`).getDay()
                  const isWeekend = weekday === 0 || weekday === 6
                  const show = dayEvents.slice(0, 2)

                  return (
                    <div
                      key={date}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedDate(date)
                        }
                      }}
                      onClick={() => setSelectedDate(date)}
                      style={{
                        minHeight: 0,
                        minWidth: 0,
                        padding: '6px 5px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: cellBackground(isSelected, isToday, isWeekend),
                        border: `1px solid ${isSelected ? 'var(--workspace-cal-chip-border)' : isToday ? 'var(--hub-card-border-hover)' : 'var(--green-border)'}`,
                        transition: 'background 0.12s, border-color 0.12s',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          alignSelf: 'flex-start',
                          minWidth: 22,
                          height: 22,
                          padding: '0 5px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: isToday ? 800 : 600,
                          color: isToday ? 'var(--workspace-cal-today-fg)' : 'var(--app-text)',
                          background: isToday ? 'var(--workspace-cal-today-bg)' : 'transparent',
                          border: isToday ? 'none' : '1px solid var(--hub-card-border)',
                          flexShrink: 0,
                        }}
                      >
                        {parseInt(d, 10)}
                      </span>
                      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                        {show.map(ev => (
                          <div
                            key={ev.id}
                            title={`${ev.time} — ${ev.title}`}
                            style={{
                              fontSize: 9,
                              lineHeight: 1.25,
                              padding: '3px 5px',
                              borderRadius: 4,
                              borderLeft: `2px solid ${EVENT_TYPE_COLORS[ev.type]}`,
                              background: EVENT_CHIP_BG[ev.type],
                              color: 'var(--app-text)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' as const,
                            }}
                          >
                            <span style={{ color: 'var(--gold)', fontWeight: 400 }}>{ev.time}</span>{' '}
                            {ev.title}
                          </div>
                        ))}
                      </div>
                      {dayEvents.length > 2 && (
                        <div style={{ fontSize: 9, fontWeight: 400, color: 'rgba(201,168,76,0.85)', flexShrink: 0 }}>
                          +{dayEvents.length - 2}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {viewMode === 'week' && (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gap: 3,
                }}
              >
                {weekDates.map(date => {
                  const dayEvents = eventsForDate(date)
                  const isToday = date === fmt(today)
                  const isSelected = date === selectedDate
                  const dayNum = new Date(`${date}T12:00:00`).getDate()
                  return (
                    <div
                      key={date}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDate(date)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedDate(date)
                        }
                      }}
                      style={{
                        border: `1px solid ${isSelected ? 'var(--workspace-cal-chip-border)' : 'var(--green-border)'}`,
                        background: cellBackground(isSelected, isToday, false),
                        borderRadius: 8,
                        minHeight: 0,
                        padding: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ fontSize: 11, color: isToday ? 'var(--gold)' : 'var(--app-text-muted)', fontWeight: 400 }}>{dayNum}</div>
                      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {dayEvents.length === 0 ? (
                          <div style={{ fontSize: 10, color: 'var(--app-text-subtle)' }}>—</div>
                        ) : (
                          dayEvents.map(ev => (
                            <div
                              key={ev.id}
                              style={{
                                fontSize: 10,
                                lineHeight: 1.3,
                                padding: '4px 5px',
                                borderRadius: 5,
                                borderLeft: `2px solid ${EVENT_TYPE_COLORS[ev.type]}`,
                                background: EVENT_CHIP_BG[ev.type],
                                color: 'var(--app-text)',
                              }}
                            >
                              <span style={{ color: 'var(--gold)' }}>{ev.time}</span> {ev.title}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {viewMode === 'day' && (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  border: '1px solid var(--green-border)',
                  borderRadius: 10,
                  background: 'var(--workspace-row-bg)',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {selectedEvents.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--app-text-subtle)' }}>{t('calendar.calendarPage.на_выбранный_день_со')}</div>
                ) : (
                  selectedEvents.map(ev => (
                    <div
                      key={ev.id}
                      style={{
                        border: '1px solid var(--green-border)',
                        borderLeft: `3px solid ${EVENT_TYPE_COLORS[ev.type]}`,
                        borderRadius: 8,
                        padding: '10px',
                        background: 'var(--green-card)',
                      }}
                    >
                      <div style={{ fontSize: 11, color: EVENT_TYPE_COLORS[ev.type], marginBottom: 4 }}>{EVENT_TYPE_LABELS[ev.type]}</div>
                      <div style={{ fontSize: 14, color: 'var(--app-text)', marginBottom: 4 }}>{ev.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--gold)' }}>{ev.time}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Правая: выбранный день — та же высота, скролл только у списка */}
          <aside
            style={{
              width: 300,
              maxWidth: '34vw',
              flexShrink: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--hub-card-bg)',
                border: '1px solid var(--hub-card-border)',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--divider-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 400,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase' as const,
                      color: 'rgba(201,168,76,0.85)',
                      marginBottom: 3,
                    }}
                  >
                    {t('calendar.calendarPage.выбранный_день')}</div>
                  <div style={{ fontSize: 15, fontWeight: 400, color: 'var(--app-text)', lineHeight: 1.25 }}>
                    {selectedDateObj.toLocaleDateString('ru-RU', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    background: 'rgba(201,168,76,0.1)',
                    border: '1px solid rgba(201,168,76,0.3)',
                    borderRadius: 8,
                    color: 'var(--gold)',
                    fontSize: 11,
                    fontWeight: 400,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Plus size={13} /> {t('calendar.calendarPage.создать')}</button>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '6px 0',
                }}
              >
                <div
                  style={{
                    margin: '0 10px 10px',
                    border: '1px solid var(--green-border)',
                    borderRadius: 8,
                    background: 'var(--workspace-row-bg)',
                    padding: '10px',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--gold)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                    {t('calendar.calendarPage.полный_отчет')}{periodLabel}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--app-text-muted)', marginBottom: 8 }}>
                    {t('calendar.calendarPage.всего_событий')}<span style={{ color: 'var(--app-text)' }}>{periodEvents.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
                    {(Object.keys(reportByType) as Array<keyof typeof reportByType>).map(type => (
                      <div key={type} style={{ fontSize: 11, color: 'var(--app-text-muted)' }}>
                        <span style={{ color: EVENT_TYPE_COLORS[type] }}>{EVENT_TYPE_LABELS[type]}</span>: {reportByType[type]}
                      </div>
                    ))}
                  </div>
                </div>
                {selectedEvents.length === 0 ? (
                  <div
                    style={{
                      padding: 20,
                      color: 'var(--app-text-subtle)',
                      fontSize: 13,
                      textAlign: 'center',
                    }}
                  >
                    {t('calendar.calendarPage.на_этот_день_событий')}</div>
                ) : (
                  selectedEvents.map(ev => (
                    <div
                      key={ev.id}
                      style={{
                        padding: '10px 14px',
                        borderLeft: `3px solid ${EVENT_TYPE_COLORS[ev.type]}`,
                        marginBottom: 2,
                        borderBottom: '1px solid var(--divider-subtle)',
                        background: 'var(--workspace-row-bg)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 400,
                            color: EVENT_TYPE_COLORS[ev.type],
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase' as const,
                          }}
                        >
                          {EVENT_TYPE_LABELS[ev.type]}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 400,
                            color: 'var(--gold)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            flexShrink: 0,
                          }}
                        >
                          <Clock size={12} /> {ev.time}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--app-text)', fontWeight: 400, marginBottom: 6, lineHeight: 1.35 }}>
                        {ev.title}
                      </div>
                      {ev.client && (
                        <div style={{ fontSize: 12, color: 'var(--app-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <User size={12} /> {ev.client}
                        </div>
                      )}
                      {ev.location && (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--app-text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            marginTop: 4,
                          }}
                        >
                          <MapPin size={12} /> {ev.location}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {createOpen && (
        <CreateEventModal
          defaultDate={selectedDate}
          onSave={handleCreateEvent}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </DashboardShell>
  )
}

/* ─── Модалка создания мероприятия ─── */

const EVENT_TYPE_ORDER = ['showing', 'meeting', 'call', 'signing'] as const

function CreateEventModal({
  defaultDate,
  onSave,
  onClose,
}: {
  defaultDate: string
  onSave: (data: Omit<CalEvent, 'id' | 'agentId' | 'agentName'>) => void
  onClose: () => void
}) {
    const { t } = useI18n();
  const [type, setType] = useState<CalEvent['type']>('showing')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState('10:00')
  const [client, setClient] = useState('')
  const [location, setLocation] = useState('')
  const valid = title.trim() !== '' && date !== '' && time !== ''

  const field: React.CSSProperties = {
    height: 38, width: '100%', borderRadius: 6,
    border: '1px solid var(--green-border)', background: 'var(--green-deep)',
    color: 'var(--app-text)', fontSize: 16, padding: '0 12px', outline: 'none',
  }
  const label: React.CSSProperties = {
    display: 'block', fontSize: 16, color: 'var(--app-text-muted)', marginBottom: 6,
  }

  const submit = () => {
    if (!valid) return
    onSave({
      type,
      title: title.trim(),
      date,
      time,
      client: client.trim() || undefined,
      location: location.trim() || undefined,
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 94vw)', maxHeight: '92vh', overflowY: 'auto',
          background: 'var(--green-card)', borderRadius: 8,
          boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.18), 0 12px 48px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', background: 'var(--green-deep)' }}>
          <span style={{ fontSize: 17, fontWeight: 500, color: 'var(--app-text)' }}>{t('calendar.calendarPage.новое_мероприятие')}</span>
          <button type="button" onClick={onClose} aria-label={t('calendar.calendarPage.закрыть')} style={{ padding: 6, background: 'none', border: 'none', color: 'var(--app-text-muted)', cursor: 'pointer', borderRadius: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 14, padding: '18px 20px' }}>
          <div>
            <label style={label}>{t('calendar.calendarPage.тип')}</label>
            <select style={{ ...field, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }} value={type} onChange={(e) => setType(e.target.value as CalEvent['type'])}>
              {EVENT_TYPE_ORDER.map((t) => (
                <option key={t} value={t} style={{ background: 'var(--green-deep)' }}>{EVENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={label}>{t('calendar.calendarPage.название')}</label>
            <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('calendar.calendarPage.показ_жк_олимп')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={label}>{t('calendar.calendarPage.дата')}</label>
              <input type="date" style={{ ...field, colorScheme: 'dark' }} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label style={label}>{t('calendar.calendarPage.время')}</label>
              <input type="time" style={{ ...field, colorScheme: 'dark' }} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={label}>{t('calendar.calendarPage.клиент')}</label>
            <input style={field} value={client} onChange={(e) => setClient(e.target.value)} placeholder={t('calendar.calendarPage.иванов_а_в')} />
          </div>
          <div>
            <label style={label}>{t('calendar.calendarPage.место')}</label>
            <input style={field} value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('calendar.calendarPage.офис_садовая')} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '14px 20px', background: 'var(--green-deep)' }}>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            style={{
              flex: 1, height: 40, borderRadius: 6, border: '1px solid rgba(201,168,76,0.4)',
              background: valid ? 'var(--gold)' : 'rgba(201,168,76,0.12)',
              color: valid ? '#1c140a' : 'var(--app-text-muted)',
              fontSize: 16, fontWeight: 500, cursor: valid ? 'pointer' : 'not-allowed',
              opacity: valid ? 1 : 0.6,
            }}
          >
            {t('calendar.calendarPage.создать')}</button>
          <button
            type="button"
            onClick={onClose}
            style={{ height: 40, paddingInline: 18, borderRadius: 6, border: '1px solid var(--green-border)', background: 'transparent', color: 'var(--app-text-muted)', fontSize: 16, cursor: 'pointer' }}
          >
            {t('calendar.calendarPage.отмена')}</button>
        </div>
      </div>
    </div>
  )
}

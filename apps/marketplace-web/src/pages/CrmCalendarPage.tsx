import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeoMetadata } from '../hooks/useSeoMetadata'

export interface CalendarEventItem {
  id: string
  dayIndex: number
  time: string
  title: string
  clientName: string
  location: string
}

const INITIAL_EVENTS: CalendarEventItem[] = [
  {
    id: 'ev-1',
    dayIndex: 0,
    time: '14:00',
    title: 'Показ апартаментов у моря',
    clientName: 'Михаил К.',
    location: 'ул. Шерифа Химшиашвили, 15',
  },
  {
    id: 'ev-2',
    dayIndex: 2,
    time: '11:30',
    title: 'Встреча в офисе застройщика',
    clientName: 'Елена С.',
    location: 'Офис Orbi Group',
  },
  {
    id: 'ev-3',
    dayIndex: 4,
    time: '16:00',
    title: 'Просмотр таунхауса',
    clientName: 'Давид Б.',
    location: 'ул. Мазнева, 4',
  },
]

const DAYS = ['Пн, 07 сен', 'Вт, 08 сен', 'Ср, 09 сен', 'Чт, 10 сен', 'Пт, 11 сен', 'Сб, 12 сен', 'Вс, 13 сен']

export function CrmCalendarPage() {
  const [events] = useState<CalendarEventItem[]>(INITIAL_EVENTS)

  useSeoMetadata({
    title: 'CRM Календарь показов | BAZA',
    description: 'Расписание показов объектов недвижимости, встреч с клиентами и застройщиками.',
  })

  return (
    <div className="figma-crm-page">
      <div className="figma-crm-header">
        <div>
          <h1 className="figma-crm-title">Календарь показов</h1>
          <p className="figma-crm-desc">
            График запланированных встреч и выездов на объекты на текущую неделю.
          </p>
        </div>

        <button
          type="button"
          className="figma-crm-add-btn"
          onClick={() => alert('Назначить показ')}
          data-testid="add-showing-btn"
        >
          + Назначить показ
        </button>
      </div>

      <nav className="figma-crm-nav" aria-label="Разделы CRM">
        <Link to="/account/crm" className="figma-crm-nav-link">
          📊 Воронка сделок
        </Link>
        <Link to="/account/tasks" className="figma-crm-nav-link">
          ✓ Задачи и заметки
        </Link>
        <Link to="/account/calendar" className="figma-crm-nav-link is-active">
          📅 Календарь показов
        </Link>
      </nav>

      <div className="figma-calendar-grid" aria-label="Сетка расписания недели">
        {DAYS.map((dayLabel, idx) => {
          const dayEvents = events.filter((e) => e.dayIndex === idx)
          return (
            <div key={idx} className="figma-calendar-day-col">
              <div className="figma-calendar-day-header">{dayLabel}</div>
              {dayEvents.map((ev) => (
                <div key={ev.id} className="figma-calendar-event">
                  <div className="figma-calendar-event__time">🕒 {ev.time}</div>
                  <div className="figma-calendar-event__title">{ev.title}</div>
                  <div style={{ color: '#555555' }}>👤 {ev.clientName}</div>
                  <div style={{ color: '#757575', fontSize: '11px', marginTop: '2px' }}>
                    📍 {ev.location}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

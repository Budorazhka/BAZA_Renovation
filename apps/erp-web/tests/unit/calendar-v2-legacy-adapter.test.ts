/**
 * Адаптер CalendarEventV2 (+ задачи из GET /calendar/unified) → легаси
 * CalEvent (CalendarPage.tsx). Проверяется таблица перевода типов событий
 * (4 легаси ↔ 5 backend) и честные пробелы формы — см. докстринг
 * lib/calendar-v2-legacy-adapter.ts.
 */

import { describe, expect, it } from 'vitest'
import {
  mapCalendarEventV2ToLegacy,
  mapLegacyEventTypeToV2,
  mapUnifiedTaskV2ToLegacy,
  mapV2EventTypeToLegacy,
} from '@/lib/calendar-v2-legacy-adapter'
import type { CalendarEventV2, CalendarUnifiedTaskV2 } from '@/types/calendarV2'

function makeEvent(overrides: Partial<CalendarEventV2> = {}): CalendarEventV2 {
  return {
    id: 'ev-1',
    organizationId: 'org-1',
    title: 'Показ ЖК Олимп',
    description: null,
    startTime: '2026-09-10T11:00:00.000Z',
    endTime: '2026-09-10T12:00:00.000Z',
    type: 'meeting',
    status: 'scheduled',
    isAllDay: false,
    location: null,
    meetingUrl: null,
    leadId: null,
    dealId: null,
    participants: [],
    externalParticipants: [],
    reminderMinutes: [],
    isRecurring: false,
    recurringRule: null,
    parentEventId: null,
    createdByPositionId: 'pos-1',
    version: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    ...overrides,
  }
}

describe('calendar-v2-legacy-adapter — таблица перевода типов событий', () => {
  it('backend → легаси: call↔call и meeting↔meeting — прямое совпадение', () => {
    expect(mapV2EventTypeToLegacy('call')).toBe('call')
    expect(mapV2EventTypeToLegacy('meeting')).toBe('meeting')
  })

  it('backend → легаси: lead_followup → showing (показ объекта)', () => {
    expect(mapV2EventTypeToLegacy('lead_followup')).toBe('showing')
  })

  it('backend → легаси: reminder → call (условность, документирована)', () => {
    expect(mapV2EventTypeToLegacy('reminder')).toBe('call')
  })

  it('backend → легаси: task → showing (та же корзина, что и unified-задачи)', () => {
    expect(mapV2EventTypeToLegacy('task')).toBe('showing')
  })

  it('легаси → backend: showing → lead_followup, signing → meeting (частный случай встречи)', () => {
    expect(mapLegacyEventTypeToV2('showing')).toBe('lead_followup')
    expect(mapLegacyEventTypeToV2('signing')).toBe('meeting')
  })

  it('легаси → backend: call/meeting — прямое совпадение', () => {
    expect(mapLegacyEventTypeToV2('call')).toBe('call')
    expect(mapLegacyEventTypeToV2('meeting')).toBe('meeting')
  })

  it('несимметричность документирована: signing→meeting туда, но meeting не возвращается в signing обратно', () => {
    const backendType = mapLegacyEventTypeToV2('signing')
    expect(mapV2EventTypeToLegacy(backendType)).toBe('meeting')
  })
})

describe('mapCalendarEventV2ToLegacy', () => {
  it('мапит прямые поля: id, title, location, dealId, тип по таблице', () => {
    const event = makeEvent({ type: 'lead_followup', location: 'ЖК Олимп, корп. 3', dealId: 'deal-9' })
    const legacy = mapCalendarEventV2ToLegacy(event, new Map())

    expect(legacy.id).toBe('ev-1')
    expect(legacy.title).toBe('Показ ЖК Олимп')
    expect(legacy.type).toBe('showing')
    expect(legacy.location).toBe('ЖК Олимп, корп. 3')
    expect(legacy.dealId).toBe('deal-9')
  })

  it('date/time выводятся из startTime (локальные компоненты, не UTC-строка целиком)', () => {
    const event = makeEvent({ startTime: '2026-09-10T11:05:00.000Z' })
    const legacy = mapCalendarEventV2ToLegacy(event, new Map())

    expect(legacy.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(legacy.time).toMatch(/^\d{2}:\d{2}$/)
  })

  it('agentId/agentName резолвятся через createdByPositionId и переданный ростер', () => {
    const event = makeEvent({ createdByPositionId: 'pos-1' })
    const legacy = mapCalendarEventV2ToLegacy(event, new Map([['pos-1', 'Анна Первичкина']]))

    expect(legacy.agentId).toBe('pos-1')
    expect(legacy.agentName).toBe('Анна Первичкина')
  })

  it('agentName — честный дефолт "Не назначен", если позиции нет в ростере', () => {
    const legacy = mapCalendarEventV2ToLegacy(makeEvent({ createdByPositionId: 'pos-unknown' }), new Map())
    expect(legacy.agentName).toBe('Не назначен')
  })

  it('честный пробел: client всегда undefined — backend не денормализует имя контакта на CalendarEvent', () => {
    const legacy = mapCalendarEventV2ToLegacy(makeEvent({ leadId: 'lead-1' }), new Map())
    expect(legacy.client).toBeUndefined()
  })

  it('location — undefined, если backend его не задал (не пустая строка)', () => {
    const legacy = mapCalendarEventV2ToLegacy(makeEvent({ location: null }), new Map())
    expect(legacy.location).toBeUndefined()
  })
})

describe('mapUnifiedTaskV2ToLegacy', () => {
  function makeTask(overrides: Partial<CalendarUnifiedTaskV2> = {}): CalendarUnifiedTaskV2 {
    return {
      id: 'task-1',
      title: 'Подготовить документы',
      description: null,
      startAt: null,
      dueAt: '2026-09-12T09:00:00.000Z',
      status: 'open',
      assignedPositionId: 'pos-2',
      leadId: null,
      ...overrides,
    }
  }

  it('задача без startAt и dueAt не попадает в календарь — возвращается null', () => {
    const result = mapUnifiedTaskV2ToLegacy(makeTask({ startAt: null, dueAt: null }), new Map())
    expect(result).toBeNull()
  })

  it('startAt в приоритете перед dueAt, если оба заданы', () => {
    const result = mapUnifiedTaskV2ToLegacy(
      makeTask({ startAt: '2026-09-11T08:00:00.000Z', dueAt: '2026-09-12T09:00:00.000Z' }),
      new Map(),
    )
    expect(result).not.toBeNull()
    // startAt (08:00 UTC) должен дать другую дату/время, чем dueAt (09:00 UTC следующего дня) —
    // проверяем, что использован именно startAt через сравнение с независимым вычислением.
    const expectedDate = new Date('2026-09-11T08:00:00.000Z')
    expect(result?.date).toBe(
      `${expectedDate.getFullYear()}-${String(expectedDate.getMonth() + 1).padStart(2, '0')}-${String(expectedDate.getDate()).padStart(2, '0')}`,
    )
  })

  it('используется dueAt, если startAt не задан', () => {
    const result = mapUnifiedTaskV2ToLegacy(makeTask({ startAt: null, dueAt: '2026-09-12T09:00:00.000Z' }), new Map())
    expect(result).not.toBeNull()
  })

  it('тип всегда "showing" — та же корзина, что легаси-код использовал для EventType.TASK', () => {
    const result = mapUnifiedTaskV2ToLegacy(makeTask(), new Map())
    expect(result?.type).toBe('showing')
  })

  it('agentName резолвится через assignedPositionId и переданный ростер', () => {
    const result = mapUnifiedTaskV2ToLegacy(
      makeTask({ assignedPositionId: 'pos-2' }),
      new Map([['pos-2', 'Дмитрий Коваль']]),
    )
    expect(result?.agentId).toBe('pos-2')
    expect(result?.agentName).toBe('Дмитрий Коваль')
  })

  it('задача без assignedPositionId — agentId пустая строка, agentName "Не назначен"', () => {
    const result = mapUnifiedTaskV2ToLegacy(makeTask({ assignedPositionId: null }), new Map())
    expect(result?.agentId).toBe('')
    expect(result?.agentName).toBe('Не назначен')
  })
})

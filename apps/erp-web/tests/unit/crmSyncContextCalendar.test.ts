/** @vitest-environment jsdom */

/**
 * CrmSyncContext — только календарная часть. До этого прохода
 * `calendarEvents` читались через `apiService.getCalendarUnified` (легаси
 * api-crm.baza.sale, см. features/crm/services/api/calendar.ts). Теперь
 * источник — `calendarApiV2.getUnified` (apps/api) + адаптер
 * `calendar-v2-legacy-adapter.ts`. tasks/notifications/reminders(-механика
 * archiveReminder)/news читаются как прежде — тест намеренно НЕ проверяет
 * их поведение (не тронуто), только календарь.
 *
 * Сокет-слой замокан целиком, тот же приём, что useCrmData.test.ts —
 * реальные попытки WebSocket-подключения в юнит-тесте не нужны.
 */

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getTasksMock = vi.fn()
const getNotificationsMock = vi.fn()
const getUnifiedMock = vi.fn()
const teamListMock = vi.fn()

const mockUser = { id: 'user-1', role: 'manager' }

vi.mock('@/features/crm/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn() }),
}))

vi.mock('@/features/crm/services/socket', () => ({
  getSocket: () => null,
  onPush: () => () => {},
  offPush: () => {},
  subscribeRooms: () => {},
  fetchReplay: () => Promise.resolve([]),
}))

vi.mock('@/features/crm/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/crm/services/api')>()
  return {
    ...actual,
    apiService: {
      ...actual.apiService,
      getTasks: getTasksMock,
      getNotifications: getNotificationsMock,
      markNotificationRead: vi.fn(),
      archiveNotification: vi.fn(),
    },
  }
})

vi.mock('@/services/calendarApiV2', () => ({
  calendarApiV2: { getUnified: getUnifiedMock },
}))

vi.mock('@/services/teamApi', () => ({
  teamApi: { list: teamListMock },
}))

function makeCalendarEventV2(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ev-1',
    organizationId: 'org-1',
    title: 'Показ ЖК Олимп',
    description: null,
    startTime: '2026-09-10T11:00:00.000Z',
    endTime: '2026-09-10T12:00:00.000Z',
    type: 'lead_followup',
    status: 'scheduled',
    isAllDay: false,
    location: 'ЖК Олимп, корп. 3',
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

describe('CrmSyncContext — календарь на calendarApiV2 (не легаси getCalendarUnified)', () => {
  beforeEach(() => {
    getTasksMock.mockReset().mockResolvedValue({ success: true, data: { items: [] } })
    getNotificationsMock.mockReset().mockResolvedValue({ success: true, data: { items: [] } })
    getUnifiedMock.mockReset().mockResolvedValue({ events: [makeCalendarEventV2()], tasks: [] })
    teamListMock.mockReset().mockResolvedValue([
      { id: 'pos-1', positionId: 'pos-1', name: 'Анна Первичкина', email: 'anna@test.com', vacant: false, position: 'Агент' },
    ])
  })

  afterEach(() => {
    cleanup()
  })

  async function renderCrmSync() {
    const { CrmSyncProvider, useCrmSync } = await import('@/features/crm/context/CrmSyncContext')
    const wrapper = ({ children }: { children: React.ReactNode }) => createElement(CrmSyncProvider, null, children)
    return renderHook(() => useCrmSync(), { wrapper })
  }

  it('читает события через calendarApiV2.getUnified, не через легаси apiService.getCalendarUnified', async () => {
    const { result } = await renderCrmSync()

    await waitFor(() => expect(getUnifiedMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.calendarEvents).toHaveLength(1))

    expect(result.current.calendarEvents[0]?.id).toBe('ev-1')
  })

  it('переводит тип события через таблицу адаптера (lead_followup → showing) и резолвит agentName через ростер', async () => {
    const { result } = await renderCrmSync()
    await waitFor(() => expect(result.current.calendarEvents).toHaveLength(1))

    const event = result.current.calendarEvents[0]
    expect(event?.type).toBe('showing')
    expect(event?.agentName).toBe('Анна Первичкина')
    expect(event?.location).toBe('ЖК Олимп, корп. 3')
  })

  it('объединяет события с задачами из GET /calendar/unified (задача без даты не попадает в календарь)', async () => {
    getUnifiedMock.mockResolvedValueOnce({
      events: [],
      tasks: [
        {
          id: 'task-1',
          title: 'Подготовить документы',
          description: null,
          startAt: null,
          dueAt: '2026-09-12T09:00:00.000Z',
          status: 'open',
          assignedPositionId: 'pos-1',
          leadId: null,
        },
        {
          id: 'task-2',
          title: 'Без даты — не попадает в календарь',
          description: null,
          startAt: null,
          dueAt: null,
          status: 'open',
          assignedPositionId: 'pos-1',
          leadId: null,
        },
      ],
    })

    const { result } = await renderCrmSync()
    await waitFor(() => expect(result.current.calendarEvents).toHaveLength(1))
    expect(result.current.calendarEvents[0]?.title).toBe('Подготовить документы')
  })

  it('запрос диапазона: startDate/endDate — ISO-строки трёхмесячного окна', async () => {
    await renderCrmSync()

    await waitFor(() => expect(getUnifiedMock).toHaveBeenCalledTimes(1))
    const callArgs = getUnifiedMock.mock.calls[0]?.[0] as { startDate: string; endDate: string }
    expect(typeof callArgs.startDate).toBe('string')
    expect(typeof callArgs.endDate).toBe('string')
    expect(new Date(callArgs.startDate).getTime()).toBeLessThan(new Date(callArgs.endDate).getTime())
  })
})

/**
 * Перевод задачи Platform API в модель экрана.
 *
 * Проверяется не «поля переложились», а три места, где перевод может соврать:
 * выдуманное имя вместо неизвестного, сдвиг даты при переводе UTC в местное
 * время и самостоятельный пересчёт просрочки на клиенте.
 */

import { describe, expect, it } from 'vitest'
import {
  UNKNOWN_VALUE,
  buildCreateTaskPayload,
  isDisplayableTaskV2,
  joinLocalPartsToIso,
  mapTaskV2ToUiTask,
  splitIsoToLocalParts,
} from '@/lib/map-task-v2'
import type { Task } from '@/types/tasks'
import type { TaskV2 } from '@/types/tasksV2'

const NAMES = new Map([
  ['pos-1', 'Анна Первичкина'],
  ['pos-2', 'Дмитрий Коваль'],
])

function serverTask(overrides: Partial<TaskV2> = {}): TaskV2 {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Связаться с клиентом',
    description: null,
    status: 'open',
    dueAt: '2026-09-10T09:00:00.000Z',
    startAt: null,
    isUrgent: false,
    isImportant: true,
    priority: 'medium',
    taskCategory: 'work',
    colorHex: null,
    reminderOffsetsMinutes: [],
    subtasks: [],
    attachmentFileNames: [],
    entityType: 'none',
    entityId: null,
    isAutomatic: false,
    triggerType: null,
    assignedPositionId: 'pos-1',
    createdByPositionId: 'pos-2',
    leadId: null,
    contactId: null,
    completedAt: null,
    completedByPositionId: null,
    isOverdue: false,
    version: 3,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: null,
    ...overrides,
  }
}

describe('mapTaskV2ToUiTask', () => {
  it('подставляет имена исполнителя и создателя по позициям', () => {
    const ui = mapTaskV2ToUiTask(serverTask(), NAMES)
    expect(ui.assignedToId).toBe('pos-1')
    expect(ui.assignedToName).toBe('Анна Первичкина')
    expect(ui.createdByName).toBe('Дмитрий Коваль')
  })

  it('ставит прочерк, а не выдуманное имя, когда позиция неизвестна', () => {
    const ui = mapTaskV2ToUiTask(
      serverTask({ assignedPositionId: 'pos-404', createdByPositionId: null }),
      NAMES,
    )
    // Сравнение именно с литералом: проверка через UNKNOWN_VALUE была бы
    // тавтологией — подмена прочерка на «Пользователь» изменила бы и константу,
    // и ожидание разом, и тест остался бы зелёным.
    expect(ui.assignedToName).toBe('—')
    expect(ui.createdByName).toBe('—')
    expect(UNKNOWN_VALUE).toBe('—')
  })

  it('переводит статусы сервера в состояния экрана', () => {
    expect(mapTaskV2ToUiTask(serverTask({ status: 'open' }), NAMES).status).toBe('pending')
    expect(mapTaskV2ToUiTask(serverTask({ status: 'in_progress' }), NAMES).status).toBe('in_progress')
    expect(mapTaskV2ToUiTask(serverTask({ status: 'completed' }), NAMES).status).toBe('done')
  })

  it('берёт просрочку из ответа сервера, а не пересчитывает срок сам', () => {
    // Срок в далёком будущем, но сервер сказал «просрочена» — верим серверу:
    // он единственный, кто знает своё «сейчас».
    const ui = mapTaskV2ToUiTask(
      serverTask({ dueAt: '2099-01-01T00:00:00.000Z', isOverdue: true }),
      NAMES,
    )
    expect(ui.status).toBe('overdue')
  })

  it('не считает завершённую задачу просроченной', () => {
    const ui = mapTaskV2ToUiTask(
      serverTask({ status: 'completed', dueAt: '2000-01-01T00:00:00.000Z', isOverdue: false }),
      NAMES,
    )
    expect(ui.status).toBe('done')
  })

  it('оставляет срок пустым, когда его нет, и не подставляет сегодняшнюю дату', () => {
    const ui = mapTaskV2ToUiTask(serverTask({ dueAt: null }), NAMES)
    expect(ui.dueDate).toBe('')
    expect(ui.dueTime).toBeUndefined()
  })

  it('не выдумывает подпись связанной сущности из идентификатора', () => {
    const ui = mapTaskV2ToUiTask(
      serverTask({ entityType: 'lead', entityId: '68b6a1f2c3d4e5f6a7b8c9d0' }),
      NAMES,
    )
    expect(ui.entityId).toBe('68b6a1f2c3d4e5f6a7b8c9d0')
    expect(ui.entityLabel).toBeUndefined()
  })
})

describe('isDisplayableTaskV2', () => {
  it('исключает отменённые задачи: состояния «Отменена» на экране нет', () => {
    expect(isDisplayableTaskV2(serverTask({ status: 'cancelled' }))).toBe(false)
    expect(isDisplayableTaskV2(serverTask({ status: 'open' }))).toBe(true)
  })
})

describe('перевод времени', () => {
  it('разбирает ISO-момент в местные дату и время, а не в UTC', () => {
    const iso = '2026-09-10T21:30:00.000Z'
    const local = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    expect(splitIsoToLocalParts(iso)).toEqual({
      date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`,
      time: `${pad(local.getHours())}:${pad(local.getMinutes())}`,
    })
  })

  it('собирает обратно тот же момент времени', () => {
    const iso = '2026-09-10T21:30:00.000Z'
    const parts = splitIsoToLocalParts(iso)
    expect(joinLocalPartsToIso(parts.date, parts.time)).toBe(iso)
  })

  it('пустая дата не превращается в момент времени', () => {
    expect(splitIsoToLocalParts(null)).toEqual({ date: '' })
    expect(joinLocalPartsToIso('')).toBeUndefined()
  })
})

describe('buildCreateTaskPayload', () => {
  const formTask: Task = {
    id: 'local-1',
    title: 'Перезвонить',
    status: 'pending',
    priority: 'high',
    assignedToId: 'ignored-in-payload',
    assignedToName: 'Анна Первичкина',
    createdByName: 'Анна Первичкина',
    dueDate: '2026-09-10',
    dueTime: '19:00',
    startDate: '2026-09-10',
    startTime: '09:00',
    taskCategory: 'work',
    entityType: 'lead',
    entityId: 'legacy-crm-id',
    isAutomatic: false,
    createdAt: '2026-09-10',
  }

  it('берёт исполнителя из позиции, а не из id человека в форме', () => {
    const payload = buildCreateTaskPayload(formTask, { assignedPositionId: 'pos-1' })
    expect(payload.assignedPositionId).toBe('pos-1')
  })

  it('не отправляет связь без идентификатора в новом API', () => {
    // Лид выбран в старой CRM: его id не существует в Platform, и задача
    // уходит вообще без связи, а не со связью в никуда.
    const payload = buildCreateTaskPayload(formTask, { assignedPositionId: 'pos-1' })
    expect(payload.leadId).toBeUndefined()
    // Связь идёт одной ссылкой — второй пары полей в теле запроса нет.
    expect(payload).not.toHaveProperty('entityType')
    expect(payload).not.toHaveProperty('entityId')
  })

  it('сохраняет связь одной ссылкой, когда идентификатор лида известен новому API', () => {
    const payload = buildCreateTaskPayload(formTask, {
      assignedPositionId: 'pos-1',
      leadId: '68b6a1f2c3d4e5f6a7b8c9d0',
    })
    expect(payload.leadId).toBe('68b6a1f2c3d4e5f6a7b8c9d0')
  })

  it('квадрант формы уходит на сервер парой признаков, обратимо', () => {
    const flags = (priority: Task['priority']) => {
      const payload = buildCreateTaskPayload({ ...formTask, priority }, {})
      return [payload.isUrgent, payload.isImportant]
    }
    expect(flags('critical')).toEqual([true, true])
    expect(flags('high')).toEqual([true, false])
    expect(flags('medium')).toEqual([false, true])
    expect(flags('low')).toEqual([false, false])
    expect(buildCreateTaskPayload(formTask, {})).not.toHaveProperty('priority')
  })

  it('золотой пресет формы уходит на сервер как hex, а не как CSS-токен', () => {
    // Сервер принимает только #rrggbb; токен var(--gold) давал 400 на
    // создание задачи ровно при выборе золотой метки.
    const payload = buildCreateTaskPayload({ ...formTask, colorHex: 'var(--gold)' }, {})
    expect(payload.colorHex).toBe('#e6c364')
  })

  it('hex-цвет и отсутствие метки проходят без изменений', () => {
    expect(buildCreateTaskPayload({ ...formTask, colorHex: '#60a5fa' }, {}).colorHex).toBe('#60a5fa')
    expect(buildCreateTaskPayload({ ...formTask, colorHex: null }, {}).colorHex).toBeNull()
  })

  it('переводит дату и время формы в момент времени', () => {
    const payload = buildCreateTaskPayload(formTask, {})
    expect(payload.dueAt).toBe(new Date('2026-09-10T19:00').toISOString())
    expect(payload.startAt).toBe(new Date('2026-09-10T09:00').toISOString())
  })
})

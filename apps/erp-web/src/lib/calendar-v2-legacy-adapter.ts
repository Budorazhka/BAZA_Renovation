import type { CalEvent } from '@/data/calendar-events-mock'
import type { CalendarEventTypeV2, CalendarEventV2, CalendarUnifiedTaskV2 } from '@/types/calendarV2'

/**
 * Адаптер: CalendarEventV2 (+ задачи из GET /calendar/unified) → легаси
 * `CalEvent` (data/calendar-events-mock.ts), которым уже оперирует
 * CalendarPage.tsx — вёрстка не меняется, меняется только источник данных.
 * Тот же принцип, что deal-v2-legacy-adapter.ts::mapDealV2ToLegacy.
 *
 * `agentNameById` — резолвинг имени по Position id, тот же приём, что
 * `managerNameById` в deal-v2-legacy-adapter.ts (строится один раз через
 * `teamApi.list()`, не отдельным запросом на каждое событие).
 *
 * ТАБЛИЦА ПЕРЕВОДА ТИПОВ СОБЫТИЙ (4 легаси ↔ 5 backend) — НЕ идеальное 1:1
 * соответствие, backend-таксономия шире:
 *
 *  - `call` ↔ `call` — прямое совпадение, единственная пара без компромисса.
 *  - `meeting` ↔ `meeting` — прямое совпадение, дефолтный/общий случай.
 *  - `showing` ↔ `lead_followup` — «показ объекта» лиду это и есть частный
 *    случай follow-up по лиду в терминах backend; обратного пути для
 *    `lead_followup` в легаси-наборе больше нет ни у чего, поэтому
 *    соответствие однозначно в обе стороны.
 *  - `signing` → `meeting` (легаси→backend): подписание документов — частный
 *    случай встречи, отдельного backend-типа для этого нет. Обратного пути
 *    `meeting` → `signing` НЕТ НАМЕРЕННО: `meeting` уже означает «meeting»
 *    (прямое совпадение выше) — событие, реально подписанное на backend как
 *    `meeting`, на экране будет показано как «Встреча», не «Подписание».
 *    Это ПОТЕРЯ ИНФОРМАЦИИ при обратном чтении, честно принятая: у backend
 *    физически нет отдельного «signing»-типа, различить «это была встреча»
 *    от «это было подписание» после сохранения нечем.
 *  - `reminder` → `call` (только backend→легаси, у `reminder` нет легаси-
 *    аналога вообще): в риелторской практике напоминание чаще всего значит
 *    «не забыть позвонить» — ближайшая по смыслу из четырёх легаси-корзин.
 *    Условность, не точный перевод.
 *  - `task` → `showing` (только backend→легаси): CalendarEventDocument.type
 *    `task` — это ручное календарное событие с типом «задача» (НЕ то же
 *    самое, что настоящая Task-сущность из GET /calendar/unified — та
 *    отображается отдельной функцией `mapUnifiedTaskV2ToLegacy` ниже с тем
 *    же выбором `showing`, ради единообразия одной "рабочей", не
 *    встречной/звонковой корзины).
 */
const LEGACY_TYPE_TO_BACKEND: Record<CalEvent['type'], CalendarEventTypeV2> = {
  showing: 'lead_followup',
  meeting: 'meeting',
  call: 'call',
  signing: 'meeting',
}

const BACKEND_TYPE_TO_LEGACY: Record<CalendarEventTypeV2, CalEvent['type']> = {
  meeting: 'meeting',
  call: 'call',
  reminder: 'call',
  task: 'showing',
  lead_followup: 'showing',
}

export function mapLegacyEventTypeToV2(type: CalEvent['type']): CalendarEventTypeV2 {
  return LEGACY_TYPE_TO_BACKEND[type]
}

export function mapV2EventTypeToLegacy(type: CalendarEventTypeV2): CalEvent['type'] {
  return BACKEND_TYPE_TO_LEGACY[type]
}

const pad = (n: number) => String(n).padStart(2, '0')

function splitDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/**
 * Честные пробелы этого адаптера (backend CalendarEvent не хранит эти поля
 * в форме, годной для прямого показа — не выдумываются, не подставляются
 * фиктивные данные):
 *  - `client` — backend хранит только `leadId`/`dealId` (opaque id), без
 *    денормализованного имени контакта на этом read-модели (в отличие от
 *    легаси `CalendarEvent.leadId`, который мог прийти объектом
 *    `{_id,name,phone}`). Всегда `undefined`.
 *  - `agentName` — резолвится через `agentNameById`; если Position не
 *    найдена в ростере (уволен/не команда), 'Не назначен', тот же fallback,
 *    что `deal-v2-legacy-adapter.ts`.
 */
export function mapCalendarEventV2ToLegacy(event: CalendarEventV2, agentNameById: Map<string, string>): CalEvent {
  const { date, time } = splitDateTime(event.startTime)
  return {
    id: event.id,
    date,
    time,
    type: mapV2EventTypeToLegacy(event.type),
    title: event.title,
    client: undefined,
    location: event.location ?? undefined,
    agentId: event.createdByPositionId,
    agentName: agentNameById.get(event.createdByPositionId) ?? 'Не назначен',
    dealId: event.dealId ?? undefined,
  }
}

/**
 * Задачи из GET /calendar/unified → CalEvent. Тот же выбор корзины
 * (`showing`), что легаси-код ERP делал для `EventType.TASK`
 * (CrmSyncContext.tsx до этого прохода: "'showing' как аналог задачи").
 * Задача без `startAt` И без `dueAt` не попадает в календарь — нечего
 * показать на сетке дат (тот же фильтр, что легаси `.filter(t => t.startDate)`,
 * только с fallback на `dueAt`, если `startAt` не задан).
 */
export function mapUnifiedTaskV2ToLegacy(
  task: CalendarUnifiedTaskV2,
  agentNameById: Map<string, string>,
): CalEvent | null {
  const anchor = task.startAt ?? task.dueAt
  if (!anchor) return null
  const { date, time } = splitDateTime(anchor)
  return {
    id: task.id,
    date,
    time,
    type: 'showing',
    title: task.title,
    client: undefined,
    location: undefined,
    agentId: task.assignedPositionId ?? '',
    agentName: task.assignedPositionId ? agentNameById.get(task.assignedPositionId) ?? 'Не назначен' : 'Не назначен',
    dealId: undefined,
  }
}

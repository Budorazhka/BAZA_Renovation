import type { Task, TaskStatus } from '@/types/tasks'
import type { CreateTaskV2Payload, TaskV2 } from '@/types/tasksV2'

/**
 * Перевод задачи Platform API в модель, которую рисует экран.
 *
 * Экран и сервер описывают одну сущность разными словами, и перевод собран в
 * одном месте намеренно: пока он был размазан по компонентам, расхождение
 * между «что сервер умеет» и «что показано» никто не мог измерить.
 *
 * Два правила, которые здесь соблюдаются:
 *
 * 1. Ничего не выдумывается. Неизвестное имя — прочерк, а не «Пользователь»;
 *    отсутствующий срок — пустая строка, которую экран показывает как «Без
 *    срока», а не сегодняшняя дата.
 * 2. Просрочку считает сервер (`isOverdue`), клиент её не пересчитывает: два
 *    места, отвечающих на один вопрос, рано или поздно ответят по-разному.
 */

/** Значение для поля, которого у сервера нет. Именно прочерк, не выдуманное имя. */
export const UNKNOWN_VALUE = '—'

/**
 * Пресеты цвета в форме — CSS-значения экрана, а сервер хранит цвет как
 * `#rrggbb` и другого не принимает. Золотой пресет в форме записан токеном
 * `var(--gold)`: без перевода выбор золотой метки отвечал 400 на создание
 * задачи (найдено аудитом 02.09.2026). Значение токена — из DESIGN.md.
 */
const CSS_COLOR_TOKENS: Record<string, string> = {
  'var(--gold)': '#e6c364',
}

export function toStoredColor(colorHex: string | null | undefined): string | null {
  if (!colorHex) return null
  return CSS_COLOR_TOKENS[colorHex] ?? colorHex
}

/**
 * Отменённые задачи экран не показывает: состояния «Отменена» в интерфейсе
 * нет, а рисовать её как «Новая» значило бы соврать. Отбор вынесен отдельной
 * функцией, чтобы пропажа была видна в коде страницы, а не спрятана в маппере.
 */
export function isDisplayableTaskV2(task: TaskV2): boolean {
  return task.status !== 'cancelled'
}

function toUiStatus(task: TaskV2): TaskStatus {
  if (task.status === 'completed') return 'done'
  if (task.isOverdue) return 'overdue'
  if (task.status === 'in_progress') return 'in_progress'
  return 'pending'
}

/** ISO-момент → дата и время в часовом поясе пользователя (экран показывает местное время). */
export function splitIsoToLocalParts(iso: string | null): { date: string; time?: string } {
  if (!iso) return { date: '' }
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return { date: '' }
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  }
}

/** Дата и время из формы → ISO-момент. Строка без зоны разбирается как местное время. */
export function joinLocalPartsToIso(date: string, time?: string): string | undefined {
  if (!date) return undefined
  const value = new Date(`${date}T${time || '12:00'}`)
  if (Number.isNaN(value.getTime())) return undefined
  return value.toISOString()
}

export function mapTaskV2ToUiTask(
  task: TaskV2,
  namesByPositionId: ReadonlyMap<string, string>,
): Task {
  const due = splitIsoToLocalParts(task.dueAt)
  const start = splitIsoToLocalParts(task.startAt)
  const assignedName = task.assignedPositionId
    ? namesByPositionId.get(task.assignedPositionId)
    : undefined
  const createdByName = task.createdByPositionId
    ? namesByPositionId.get(task.createdByPositionId)
    : undefined

  return {
    id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    status: toUiStatus(task),
    priority: task.priority,
    assignedToId: task.assignedPositionId ?? '',
    assignedToName: assignedName ?? UNKNOWN_VALUE,
    createdByName: createdByName ?? UNKNOWN_VALUE,
    dueDate: due.date,
    dueTime: due.time,
    startDate: start.date || undefined,
    startTime: start.time,
    taskCategory: task.taskCategory,
    colorHex: task.colorHex,
    reminderOffsetsMinutes: task.reminderOffsetsMinutes.length
      ? task.reminderOffsetsMinutes
      : undefined,
    subtasks: task.subtasks.length ? task.subtasks : undefined,
    attachmentFileNames: task.attachmentFileNames.length ? task.attachmentFileNames : undefined,
    entityType: task.entityType,
    entityId: task.entityId ?? undefined,
    // entityLabel не заполняется: человекочитаемое название связанной сущности
    // сервер не отдаёт, а собирать «Лид <ObjectId>» — показывать пользователю
    // технический идентификатор вместо имени. Блок «Связано» останется скрытым,
    // пока лиды и сделки не переедут на Platform API.
    isAutomatic: task.isAutomatic,
    triggerType: task.triggerType ?? undefined,
    createdAt: task.createdAt,
  }
}

/**
 * Задача из формы создания → тело POST /tasks.
 *
 * `assignedPositionId` передаётся отдельным аргументом, а не берётся из
 * `task.assignedToId`: форма знает исполнителя как человека, сервер — как
 * позицию, и подстановка одного вместо другого молча назначила бы задачу не
 * тому.
 */
export function buildCreateTaskPayload(
  task: Task,
  options: { assignedPositionId?: string; leadId?: string },
): CreateTaskV2Payload {
  return {
    title: task.title,
    description: task.description,
    dueAt: joinLocalPartsToIso(task.dueDate, task.dueTime),
    startAt: task.startDate ? joinLocalPartsToIso(task.startDate, task.startTime) : undefined,
    // Экран оперирует парой «срочно / важно»; название квадранта обратимо
    // без потерь, и сервер хранит именно пару, а не порядковую шкалу.
    isUrgent: task.priority === 'critical' || task.priority === 'high',
    isImportant: task.priority === 'critical' || task.priority === 'medium',
    taskCategory: task.taskCategory,
    colorHex: toStoredColor(task.colorHex),
    reminderOffsetsMinutes: task.reminderOffsetsMinutes,
    subtasks: task.subtasks,
    // Только ссылки на уже загруженные файлы. Имена без файлов сервер больше
    // не принимает — они были «демо, без загрузки», как честно говорил
    // легаси-тип.
    attachments: task.attachments,
    // Связь уходит одной ссылкой: entityType/entityId сервер выводит сам из
    // leadId/contactId. Две пары полей про одну связь были двумя источниками
    // правды, которые никто не сверял.
    assignedPositionId: options.assignedPositionId,
    leadId: options.leadId,
  }
}

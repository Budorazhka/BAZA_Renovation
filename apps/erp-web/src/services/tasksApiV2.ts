import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'
import type {
  CreateTaskV2Payload,
  ListTasksV2Params,
  ListTasksV2Response,
  TaskV2,
} from '@/types/tasksV2'

export * from '@/types/tasksV2'

/**
 * Изолированный клиент к API задач BAZA
 * (apps/api/src/modules/crm/task.controller.ts).
 *
 * Эндпоинты:
 * - GET   /api/v1/tasks?status=&assignedPositionId=&limit=<1..100>
 * - POST  /api/v1/tasks                     (требует заголовок Idempotency-Key)
 * - POST  /api/v1/tasks/:taskId/complete    body: { expectedVersion }
 * - PATCH /api/v1/tasks/:taskId             body: { expectedVersion, status?, ... }
 *
 * Авторизация только через cookie (withCredentials: true). Организация,
 * создатель и область видимости выводятся сервером из сессии — клиент их не
 * передаёт (conventions.md §7).
 *
 * Ошибки НЕ проглатываются: вызывающий код обязан показать отказ, а не
 * подставить выдуманные данные вместо ответа сервера.
 */
const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

/**
 * Ключ идемпотентности: повтор отправки той же формы (двойной клик, ретрай
 * после обрыва) не должен создавать вторую задачу. Генерируется один раз на
 * попытку отправки, а не на каждый HTTP-запрос.
 */
export function newIdempotencyKey(): string {
  const globalCrypto = globalThis.crypto
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const tasksApiV2 = {
  /** GET /api/v1/tasks */
  async list(params?: ListTasksV2Params): Promise<ListTasksV2Response> {
    const { data } = await api.get<ListTasksV2Response>('/api/v1/tasks', { params })
    return data
  },

  /** GET /api/v1/tasks/:taskId */
  async getById(taskId: string): Promise<TaskV2> {
    const { data } = await api.get<TaskV2>(`/api/v1/tasks/${taskId}`)
    return data
  },

  /** POST /api/v1/tasks. Заголовок Idempotency-Key обязателен — без него 400. */
  async create(payload: CreateTaskV2Payload, idempotencyKey: string): Promise<TaskV2> {
    const { data } = await api.post<TaskV2>('/api/v1/tasks', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  /**
   * POST /api/v1/tasks/:taskId/complete. expectedVersion — прочитанная
   * клиентом version задачи: backend отклонит запрос с 409 VERSION_CONFLICT,
   * если задача изменилась с момента чтения. Вызывающий код должен перечитать
   * задачу, а не считать это фатальной ошибкой.
   */
  async complete(taskId: string, expectedVersion: number): Promise<TaskV2> {
    const { data } = await api.post<TaskV2>(`/api/v1/tasks/${taskId}/complete`, { expectedVersion })
    return data
  },

  /**
   * Снятие отметки о выполнении — PATCH со статусом `open`. Отдельного
   * эндпоинта reopen на сервере нет, и заводить его ради одной кнопки не
   * нужно: PATCH уже умеет ровно этот переход.
   */
  async reopen(taskId: string, expectedVersion: number): Promise<TaskV2> {
    const { data } = await api.patch<TaskV2>(`/api/v1/tasks/${taskId}`, {
      expectedVersion,
      status: 'open',
    })
    return data
  },
}

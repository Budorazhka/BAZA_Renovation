/**
 * Постановка объекта вторичного рынка в MLS (множественный листинг).
 *
 * ⚠️ ЗАГОТОВКА ДЛЯ БЭКЕНДА — серверная проверка прав ОБЯЗАТЕЛЬНА.
 *
 * Фронт скрывает кнопку и проверяет canDo('publish_mls', role) — это ТОЛЬКО UX,
 * а не безопасность. Сервер на POST /objects/:id/mls обязан НЕЗАВИСИМО проверить:
 *   1) право publish_mls у текущего пользователя (по JWT, не по телу запроса);
 *   2) принадлежность объекта пользователю/его агентству (ownership / data scope);
 *   3) активное MLS-соглашение у агентства;
 *   4) что переданы и приняты обязательные условия MLS (acceptedTerms);
 *   5) что объект ещё не в MLS и находится в публикуемом статусе.
 * При любом непрохождении — 403/409, объект НЕ переводится в MLS.
 */

export interface AddToMlsRequest {
  propertyId: string
  /** Тексты/идентификаторы подтверждённых пользователем условий MLS */
  acceptedTerms: string[]
}

export interface AddToMlsResult {
  success: boolean
  message?: string
}

/**
 * Запрос на добавление объекта в MLS.
 *
 * Сейчас — фронтовая заглушка (мок). Бэкендеру: заменить тело на реальный вызов
 * и удалить мок. Пример:
 *
 *   import axios from 'axios'
 *   import { CRM_API_BASE_URL } from '@/config/backend'
 *   const api = axios.create({ baseURL: CRM_API_BASE_URL })
 *   api.interceptors.request.use((c) => {
 *     const t = localStorage.getItem('jwt_token')
 *     if (t) c.headers.Authorization = `Bearer ${t}`
 *     return c
 *   })
 *   const { data } = await api.post<AddToMlsResult>(
 *     `/objects/${req.propertyId}/mls`,
 *     { acceptedTerms: req.acceptedTerms },
 *   )
 *   return data   // сервер сам вернёт 403, если прав нет
 */
export async function requestAddToMls(req: AddToMlsRequest): Promise<AddToMlsResult> {
  await new Promise((resolve) => setTimeout(resolve, 600))
  if (req.acceptedTerms.length === 0) {
    return { success: false, message: 'Не приняты условия MLS' }
  }
  return { success: true }
}

export interface MlsAccessRequest {
  propertyId: string
}

/**
 * Заявка на доступ к MLS (онбординг агентства).
 *
 * Если у пользователя/агентства ещё нет права publish_mls (не пройден онбординг MLS),
 * вместо публикации оставляется заявка — её обрабатывает менеджер MLS / бэкенд.
 *
 * Бэкендеру: POST /mls/access-requests — создать заявку, привязать к агентству и
 * текущему пользователю (по JWT), уведомить менеджера MLS. Права и здесь проверяются
 * на сервере (кто может оставлять заявку), фронт лишь отправляет.
 */
export async function requestMlsAccess(req: MlsAccessRequest): Promise<AddToMlsResult> {
  await new Promise((resolve) => setTimeout(resolve, 600))
  if (!req.propertyId) {
    return { success: false, message: 'Объект не указан' }
  }
  return { success: true }
}

/**
 * Снять объект с публикации в MLS.
 * Бэкендеру: DELETE /objects/:id/mls — сервер так же проверяет права (publish_mls)
 * и владение объектом, прежде чем убрать его из MLS.
 */
export async function requestRemoveFromMls(req: MlsAccessRequest): Promise<AddToMlsResult> {
  await new Promise((resolve) => setTimeout(resolve, 600))
  if (!req.propertyId) {
    return { success: false, message: 'Объект не указан' }
  }
  return { success: true }
}

/**
 * Заявка на вступление в MLS-круг BAZA.sale — не привязана к конкретному объекту
 * (кнопка на главной странице «Вторичка», а не в карточке объекта).
 *
 * Бэкендеру: POST /mls/membership-requests — создать заявку на верификацию текущего
 * пользователя в MLS-круге (привязка по JWT), уведомить менеджера MLS.
 */
export async function requestMlsMembership(): Promise<AddToMlsResult> {
  await new Promise((resolve) => setTimeout(resolve, 600))
  return { success: true }
}

import axios from 'axios'
import { CRM_API_BASE_URL } from '@/config/backend'

/**
 * Клиент реального API застройщиков (`/api/developers` на api-crm).
 *
 * Бэкенд работает напрямую с platform-коллекцией `developers` — та же запись,
 * которую отдаёт основной API и публичный лендинг лота. Без моков.
 *
 * Ответы приходят в конверте `{ success, data }` / `{ success: false, message }`
 * (HTTP всегда 200), поэтому `success` проверяется на клиенте.
 *
 * См. bz26-api-crm/docs/erp-developers-implementation.md
 */

const api = axios.create({
  baseURL: CRM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

/** Запись застройщика (маппинг `mapDeveloper` на бэке; `_id` — как в основном API). */
export interface DeveloperProfile {
  _id: string
  title: string
  email: string
  contactPhone?: string
  contactTelegram?: string
  contactWhatsapp?: string
  website?: string
  image?: string
  description?: string
  status: string
  rating: number
  author: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** Публичная форма (без rating/author/дат) — `GET /api/developers/public/:id`. */
export type PublicDeveloperProfile = Omit<
  DeveloperProfile,
  'rating' | 'author' | 'createdAt' | 'updatedAt'
>

export interface DeveloperPayload {
  title?: string
  email?: string
  contactPhone?: string
  contactTelegram?: string
  contactWhatsapp?: string
  website?: string
  image?: string
  description?: string
  status?: string
}

export interface DevelopersPage {
  items: DeveloperProfile[]
  total: number
  page: number
  totalPages: number
}

export interface ListDevelopersParams {
  page?: number
  limit?: number
  search?: string
  sort?: 'createdAt' | 'updatedAt' | 'title' | 'rating'
  order?: 'asc' | 'desc'
}

function unwrap<T>(payload: ApiResponse<T>): T {
  if (!payload.success) {
    throw new Error(payload.message || 'Запрос к API застройщиков не удался')
  }
  return payload.data
}

export const developersApi = {
  async list(params: ListDevelopersParams = {}): Promise<DevelopersPage> {
    const { data } = await api.get<ApiResponse<DevelopersPage>>('/api/developers', { params })
    return unwrap(data)
  },

  /** Профиль застройщика текущего пользователя (`author` из JWT); `null`, если записи нет. */
  async me(): Promise<DeveloperProfile | null> {
    const { data } = await api.get<ApiResponse<DeveloperProfile | null>>('/api/developers/me')
    return unwrap(data)
  },

  /**
   * Создать-или-вернуть запись текущего пользователя. Безопасно звать на boot:
   * для ролей ≠ `developer` без записи вернётся `null`, ничего не создаётся.
   */
  async ensureSelf(): Promise<DeveloperProfile | null> {
    const { data } = await api.post<ApiResponse<DeveloperProfile | null>>('/api/developers/ensure-self')
    return unwrap(data)
  },

  async getById(id: string): Promise<DeveloperProfile | null> {
    const { data } = await api.get<ApiResponse<DeveloperProfile | null>>(`/api/developers/${id}`)
    return unwrap(data)
  },

  async getPublic(id: string): Promise<PublicDeveloperProfile | null> {
    const { data } = await api.get<ApiResponse<PublicDeveloperProfile | null>>(
      `/api/developers/public/${id}`,
    )
    return unwrap(data)
  },

  async create(payload: DeveloperPayload): Promise<DeveloperProfile> {
    const { data } = await api.post<ApiResponse<DeveloperProfile>>('/api/developers', payload)
    return unwrap(data)
  },

  /**
   * Обновить запись. С `imageFile` уходит multipart (поле `image`) — бэкенд
   * валидирует файл (jpeg/png/gif/webp, ≤5MB) и заливает на CDN, как при
   * создании ЖК; без файла — обычный JSON PATCH.
   */
  async update(id: string, payload: DeveloperPayload, imageFile?: File | null): Promise<DeveloperProfile> {
    if (imageFile) {
      const fd = new FormData()
      for (const [key, value] of Object.entries(payload)) {
        if (value !== undefined) fd.append(key, value)
      }
      fd.append('image', imageFile)
      const { data } = await api.patch<ApiResponse<DeveloperProfile>>(`/api/developers/${id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return unwrap(data)
    }
    const { data } = await api.patch<ApiResponse<DeveloperProfile>>(`/api/developers/${id}`, payload)
    return unwrap(data)
  },

  /** Только admin; на бэке soft delete (`status: 'deleted'`). */
  async remove(id: string): Promise<void> {
    const { data } = await api.delete<ApiResponse<{ deleted: boolean }>>(`/api/developers/${id}`)
    unwrap(data)
  },

  /** Логотип/аватар застройщика: `POST /api/files` c `purpose=developer_logo` → CDN URL для поля `image`. */
  async uploadLogo(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('purpose', 'developer_logo')
    const { data } = await api.post<ApiResponse<{ url: string }>>('/api/files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    const url = unwrap(data)?.url
    if (!url) throw new Error('Не удалось загрузить логотип')
    return url
  },
}

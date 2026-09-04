import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'
import type { DevSelectionCustomization } from '@/config/dev-selection-customization'
import type { DevSelection, DevSelectionItem, DevSelectionReaction, DevSelectionStatus } from '@/types/dev-selection'

/**
 * Публичный (без аутентификации, без cookie) клиент — открывается клиентом
 * с чужого устройства/браузера по ссылке `/selection/:token`, поэтому
 * `withCredentials: false` и никаких заголовков авторизации.
 */
const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

interface ApiPublicSelectionItem {
  unitId: string
  agentNote?: string
  reaction?: DevSelectionReaction
  viewedAt?: string
}

interface ApiPublicSelectionResponse {
  title: string
  clientName?: string
  clientPhone?: string
  agentNote?: string
  status: DevSelectionStatus
  items: ApiPublicSelectionItem[]
  createdAt: string
  sentAt?: string
  viewCount: number
  customization?: DevSelectionCustomization
}

/** Публичная проекция не содержит id/publicToken/leadId — служебные поля стору не нужны за пределами публичного просмотра. */
export type PublicDevSelection = Omit<DevSelection, 'id' | 'publicToken' | 'leadId'>

function mapApiPublicSelectionToFrontend(raw: ApiPublicSelectionResponse): PublicDevSelection {
  return {
    title: raw.title,
    clientName: raw.clientName,
    clientPhone: raw.clientPhone,
    agentNote: raw.agentNote,
    status: raw.status,
    items: raw.items.map((item): DevSelectionItem => ({
      unitId: item.unitId,
      agentNote: item.agentNote,
      reaction: item.reaction,
      viewedAt: item.viewedAt,
    })),
    createdAt: raw.createdAt,
    sentAt: raw.sentAt,
    viewCount: raw.viewCount,
    customization: raw.customization,
  }
}

export const publicSelectionsApi = {
  /**
   * GET /api/v1/public/selections/:token — side-effect на сервере:
   * инкремент viewCount/lastOpenedAt, sent->viewed. Каждый вызов ЭТОГО
   * метода и есть факт "клиент открыл подборку".
   */
  async getByToken(token: string): Promise<PublicDevSelection> {
    const { data } = await api.get<ApiPublicSelectionResponse>(`/api/v1/public/selections/${token}`)
    return mapApiPublicSelectionToFrontend(data)
  },
}

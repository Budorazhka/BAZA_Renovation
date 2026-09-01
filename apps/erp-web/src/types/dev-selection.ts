import type { DevSelectionCustomization } from '@/config/dev-selection-customization'

export type DevSelectionStatus = 'draft' | 'sent' | 'viewed' | 'archived'

export const DEV_SELECTION_STATUS_LABELS: Record<DevSelectionStatus, string> = {
  draft: 'Черновик',
  sent: 'Отправлена',
  viewed: 'Просмотрена',
  archived: 'Архив',
}

export const DEV_SELECTION_STATUS_COLORS: Record<DevSelectionStatus, string> = {
  draft: 'rgba(242,207,141,0.72)',
  sent: '#d0e8df',
  viewed: '#c9a84c',
  archived: 'rgba(242,207,141,0.72)',
}

export type DevSelectionReaction = 'liked' | 'disliked' | 'question'

export interface DevSelectionItem {
  unitId: string
  agentNote?: string
  reaction?: DevSelectionReaction
  viewedAt?: string
}

export interface DevSelection {
  id: string
  publicToken: string
  title: string
  leadId?: string
  clientName?: string
  clientPhone?: string
  agentNote?: string
  status: DevSelectionStatus
  items: DevSelectionItem[]
  createdAt: string
  sentAt?: string
  lastOpenedAt?: string
  viewCount: number
  /** Настройки клиентского отображения (язык, валюта, видимость блоков). */
  customization?: DevSelectionCustomization
}

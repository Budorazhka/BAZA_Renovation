import type { PublicationStatus } from '../types/admin'

const STATUS_LABELS: Record<PublicationStatus, string> = {
  publication_pending: 'Готовится к публикации',
  published: 'Опубликовано',
  unpublished: 'Снято с публикации',
  build_failed: 'Ошибка сборки',
}

export function publicationStatusLabel(status: string): string {
  return STATUS_LABELS[status as PublicationStatus] ?? status
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  development: 'ЖК',
  unit: 'Юнит',
  listing: 'Объявление',
}

export function sourceTypeLabel(sourceType: string): string {
  return SOURCE_TYPE_LABELS[sourceType] ?? sourceType
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
}

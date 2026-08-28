import type { PublicDevelopmentCard } from '../types/marketplace'

export function developmentTitle(item: PublicDevelopmentCard): string {
  return item.name?.trim() || 'Жилой комплекс'
}

export function developmentAddress(item: PublicDevelopmentCard): string {
  return [item.location?.city, item.location?.address].filter(Boolean).join(', ') || 'Адрес уточняется'
}

export function completionLabel(value?: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `Сдача ${new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date)}`
}

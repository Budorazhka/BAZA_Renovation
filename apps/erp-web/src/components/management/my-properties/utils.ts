import type { ConditionState, PropertyCategory } from './types'

/** Вычисляет состояние объекта по дате последнего обновления */
export function getConditionState(
  updatedAt: string,
  category?: PropertyCategory,
): ConditionState {
  const updated = new Date(updatedAt)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24))

  const thresholds = category === 'rent'
    ? { warning: 14, overdue: 21 }
    : category === 'secondary'
      ? { warning: 28, overdue: 60 }
      : { warning: 10, overdue: 15 }

  if (diffDays >= thresholds.overdue) return 'needs_update'
  if (diffDays >= thresholds.warning) return 'needs_attention'
  return 'up_to_date'
}

export function formatPrice(price: number): string {
  return price.toLocaleString('en-US')
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Палитра данных отчёта девелопера.
 *
 * Правило: цвет кодирует сущность, а не украшает. Одна сущность — один цвет по
 * всему отчёту (воронка везде мятная, деньги везде золотые). Оттенки
 * приглушённые, под тёмно-зелёный фон — «institutional luxury», а не SaaS.
 * Используется ТОЛЬКО в графиках, барах и легендах, никогда в хроме интерфейса.
 */
export const DATA_COLORS = {
  /** Деньги, план, выручка — главное в отчёте. */
  money: '#e6c364',
  /** Объём: лиды, остатки, показы. */
  volume: '#d0e8df',
  /** Брони — промежуточное состояние. */
  booking: '#c9a3c4',
  /** Оплачено, закрытые сделки. */
  paid: '#8fbf9f',
  /** Показы, партнёрский канал. */
  showing: '#d9a67e',
  /** Просрочки, отказы, риски. */
  danger: '#ffb4ab',
} as const

/** Этапы воронки сверху вниз — от широкого охвата к деньгам. */
export const FUNNEL_COLORS: Record<string, string> = {
  new: '#d0e8df',
  qualified: '#a9cfc4',
  showing: '#d9a67e',
  booking: '#c9a3c4',
  paid: '#e6c364',
}

export function funnelColor(stage: string) {
  return FUNNEL_COLORS[stage] ?? DATA_COLORS.money
}

/** Цвета статусов брони — совпадают с семантикой таблиц. */
export const BOOKING_STATUS_COLORS: Record<string, string> = {
  active: '#8fbf9f',
  expiring: '#e6c364',
  expired: '#ffb4ab',
  paid: '#d0e8df',
}

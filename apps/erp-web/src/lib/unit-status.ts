import type { UnitStatus } from '@/types/core'

/** Канонический порядок статусов лота для легенд, фильтров и сводок. */
export const UNIT_STATUS_ORDER: UnitStatus[] = ['free', 'booked', 'sold', 'withdrawn']

export interface UnitStatusMeta {
  /** Подпись для легенд и карточек. */
  label: string
  /** Цвет точки-индикатора. */
  dot: string
  /** Заливка полигона на поэтажном плане. */
  fill: string
  /** Цвет обводки полигона на поэтажном плане. */
  stroke: string
  /** Цвет текста-метки поверх плана. */
  text: string
}

/**
 * Единый источник цветов и подписей статусов лота.
 * Значения соответствуют ячейкам шахматки `.cb-unit[data-status]` (тёмная тема) в index.css,
 * чтобы статусы одинаково читались в шахматке, таблице и на поэтажном плане.
 */
export const UNIT_STATUS_META: Record<UnitStatus, UnitStatusMeta> = {
  free:      { label: 'В продаже',       dot: '#10b981', fill: 'rgba(16,185,129,0.20)',  stroke: 'rgba(16,185,129,0.85)', text: '#d1fae5' },
  booked:    { label: 'Бронь',           dot: '#f2c040', fill: 'rgba(242,192,64,0.22)',  stroke: 'rgba(242,192,64,0.90)', text: '#f7da6a' },
  sold:      { label: 'Продано',         dot: '#cd9196', fill: 'rgba(205,145,150,0.18)', stroke: 'rgba(205,145,150,0.80)', text: 'rgba(225,170,175,0.85)' },
  withdrawn: { label: 'Снято с продажи', dot: '#94a3b8', fill: 'rgba(100,116,139,0.22)', stroke: 'rgba(100,116,139,0.80)', text: '#e2e8f0' },
}

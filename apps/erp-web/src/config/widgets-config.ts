import type { UserRole } from '@/types/auth'

export type WidgetId =
  | 'opportunities'
  | 'next_actions'
  | 'funnel'
  | 'clients'
  | 'prospect_leads'
  | 'problem_leads'
  | 'problem_deals'
  | 'deals'
  | 'plan_result'
  | 'income'
  | 'team'
  | 'marketing'
  | 'objects'
  | 'object_quality'
  | 'partners'
  | 'newbuilds'
  | 'community'
  | 'documents'
  | 'owner_pulse'
  | 'dev_funnel'
  | 'dev_inventory'
  | 'dev_partners'
  | 'dev_bookings'
  | 'dev_marketing'
  | 'dev_sales_plan'

export type WidgetSlot = 'big' | 'med' | 'small'

export interface WidgetSlotConfig {
  widgetId: WidgetId
  slot: WidgetSlot
}

/**
 * Bento-cell: явная позиция виджета в CSS-сетке 4 col × 2 row.
 * colSpan/rowSpan > 1 создают "featured" карточки.
 * slot определяет плотность контента виджета:
 *   big   → rowSpan 2, высокая колонка — полный список
 *   med   → colSpan 2, широкая карточка — средняя плотность
 *   small → 1×1, компактный hero-формат
 */
export interface BentoCell {
  widgetId: WidgetId
  col: number       // 1–4
  row: number       // 1–2
  colSpan?: number  // default 1
  rowSpan?: number  // default 1
  slot: WidgetSlot
}

export const WIDGET_META: Record<WidgetId, { label: string; accent: string }> = {
  opportunities:  { label: 'Возможности',               accent: '#f59e0b' },
  next_actions:   { label: 'Следующие действия',         accent: '#f87171' },
  funnel:         { label: 'Воронка продаж',             accent: '#a78bfa' },
  clients:        { label: 'Клиенты',                   accent: '#8b5cf6' },
  prospect_leads: { label: 'Перспективные лиды',        accent: '#34d399' },
  problem_leads:  { label: 'Проблемные лиды',           accent: '#fb7185' },
  problem_deals:  { label: 'Сделки без движения',       accent: '#f87171' },
  deals:          { label: 'Сделки',                    accent: '#fbbf24' },
  plan_result:    { label: 'План и результат',           accent: '#fb923c' },
  income:         { label: 'Доход и финрезультат',      accent: '#4ade80' },
  team:           { label: 'Команда',                   accent: '#60a5fa' },
  marketing:      { label: 'Маркетинг',                 accent: '#c084fc' },
  objects:        { label: 'Объекты, спрос и активность', accent: '#38bdf8' },
  object_quality: { label: 'Качество объектов',         accent: '#fb7185' },
  partners:       { label: 'Партнёры и сеть',           accent: '#a3e635' },
  newbuilds:      { label: 'Первичный рынок',           accent: '#fdba74' },
  community:      { label: 'Сообщество',                accent: '#67e8f9' },
  documents:      { label: 'Документы',                 accent: '#94a3b8' },
  owner_pulse:    { label: 'Пульс бизнеса',             accent: '#22d3ee' },
  dev_funnel:       { label: 'Воронка продаж',           accent: '#e6c364' },
  dev_inventory:    { label: 'Остатки',                  accent: '#d0e8df' },
  dev_partners:     { label: 'Партнёрский канал',        accent: '#d0e8df' },
  dev_bookings:     { label: 'Брони',                    accent: '#ffb4ab' },
  dev_marketing:    { label: 'Маркетинг',                accent: '#e6c364' },
  dev_sales_plan:   { label: 'Выполнение плана',         accent: '#e6c364' },
}

/**
 * Единый паттерн для всех ролей: 6 равных колонок × 2 строки.
 *
 *   ┌──────────┬─────────┬─────────┐
 *   │  BIG     │  MED 1  │  MED 2  │  row 1
 *   │  2×2     │  2×1    │  2×1    │
 *   │          ├────┬────┼────┬────┤
 *   │          │ S1 │ S2 │ S3 │ S4 │  row 2
 *   └──────────┴────┴────┴────┴────┘
 *
 * big  = col 1-2, row 1-2 (4 ячейки, самый крупный)
 * med  = 2 cols × 1 row   (2 ячейки, вдвое меньше big)
 * small= 1 col  × 1 row   (1 ячейка, вчетверо меньше big)
 */
export const ROLE_BENTO: Partial<Record<UserRole, BentoCell[]>> = {
  owner: [
    { widgetId: 'funnel',        col: 1, row: 1, colSpan: 2, rowSpan: 3, slot: 'big'   },
    { widgetId: 'income',        col: 3, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'owner_pulse',   col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'plan_result',   col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'problem_deals', col: 6, row: 2,                         slot: 'small' },
    { widgetId: 'marketing',     col: 3, row: 3, colSpan: 2,             slot: 'med'   },
    { widgetId: 'problem_leads', col: 5, row: 3, colSpan: 2,             slot: 'med'   },
  ],

  director: [
    { widgetId: 'funnel',        col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'income',        col: 3, row: 1, colSpan: 3,             slot: 'med'   },
    { widgetId: 'team',          col: 6, row: 1, colSpan: 1,             slot: 'med'   },
    { widgetId: 'problem_deals', col: 3, row: 2,                         slot: 'small' },
    { widgetId: 'plan_result',   col: 4, row: 2,                         slot: 'small' },
    { widgetId: 'objects',       col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'problem_leads', col: 6, row: 2,                         slot: 'small' },
  ],

  rop: [
    { widgetId: 'team',            col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'funnel',          col: 3, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'deals',           col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'plan_result',     col: 3, row: 2,                         slot: 'small' },
    { widgetId: 'problem_leads',   col: 4, row: 2,                         slot: 'small' },
    { widgetId: 'problem_deals',   col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'next_actions',    col: 6, row: 2,                         slot: 'small' },
  ],

  manager: [
    { widgetId: 'next_actions',    col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'funnel',          col: 3, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'deals',           col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'clients',         col: 3, row: 2,                         slot: 'small' },
    { widgetId: 'prospect_leads',  col: 4, row: 2,                         slot: 'small' },
    { widgetId: 'income',          col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'opportunities',   col: 6, row: 2,                         slot: 'small' },
  ],

  marketer: [
    { widgetId: 'marketing',       col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'funnel',          col: 3, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'objects',         col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'prospect_leads',  col: 3, row: 2,                         slot: 'small' },
    { widgetId: 'problem_leads',   col: 4, row: 2,                         slot: 'small' },
    { widgetId: 'deals',           col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'clients',         col: 6, row: 2,                         slot: 'small' },
  ],

  administrator: [
    { widgetId: 'team',            col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'deals',           col: 3, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'problem_leads',   col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'next_actions',    col: 3, row: 2,                         slot: 'small' },
    { widgetId: 'clients',         col: 4, row: 2,                         slot: 'small' },
    { widgetId: 'objects',         col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'documents',       col: 6, row: 2,                         slot: 'small' },
  ],

  trainee: [
    { widgetId: 'opportunities',   col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'next_actions',    col: 3, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'funnel',          col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'clients',         col: 3, row: 2,                         slot: 'small' },
    { widgetId: 'deals',           col: 4, row: 2,                         slot: 'small' },
    { widgetId: 'prospect_leads',  col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'objects',         col: 6, row: 2,                         slot: 'small' },
  ],

  procurement_head: [
    { widgetId: 'objects',         col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'object_quality',  col: 3, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'deals',           col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'next_actions',    col: 3, row: 2,                         slot: 'small' },
    { widgetId: 'problem_leads',   col: 4, row: 2,                         slot: 'small' },
    { widgetId: 'opportunities',   col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'documents',       col: 6, row: 2,                         slot: 'small' },
  ],

  finance: [
    { widgetId: 'income',          col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'deals',           col: 3, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'plan_result',     col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'team',            col: 3, row: 2,                         slot: 'small' },
    { widgetId: 'marketing',       col: 4, row: 2,                         slot: 'small' },
    { widgetId: 'funnel',          col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'documents',       col: 6, row: 2,                         slot: 'small' },
  ],

  lawyer: [
    { widgetId: 'documents',       col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'deals',           col: 3, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'clients',         col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'problem_leads',   col: 3, row: 2,                         slot: 'small' },
    { widgetId: 'objects',         col: 4, row: 2,                         slot: 'small' },
    { widgetId: 'funnel',          col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'next_actions',    col: 6, row: 2,                         slot: 'small' },
  ],

  hr: [
    { widgetId: 'team',            col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'plan_result',     col: 3, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'next_actions',    col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'documents',       col: 3, row: 2,                         slot: 'small' },
    { widgetId: 'deals',           col: 4, row: 2,                         slot: 'small' },
    { widgetId: 'clients',         col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'problem_leads',   col: 6, row: 2,                         slot: 'small' },
  ],

  partner: [
    { widgetId: 'opportunities',   col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'deals',           col: 3, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'clients',         col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'prospect_leads',  col: 3, row: 2,                         slot: 'small' },
    { widgetId: 'funnel',          col: 4, row: 2,                         slot: 'small' },
    { widgetId: 'income',          col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'next_actions',    col: 6, row: 2,                         slot: 'small' },
  ],

  developer: [
    { widgetId: 'dev_funnel',        col: 1, row: 1, colSpan: 2, rowSpan: 2, slot: 'big'   },
    { widgetId: 'dev_inventory',     col: 3, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'dev_sales_plan',    col: 5, row: 1, colSpan: 2,             slot: 'med'   },
    { widgetId: 'dev_partners',      col: 3, row: 2, colSpan: 2,             slot: 'med'   },
    { widgetId: 'dev_bookings',      col: 5, row: 2,                         slot: 'small' },
    { widgetId: 'dev_marketing',     col: 6, row: 2,                         slot: 'small' },
  ],
}

// Обратная совместимость — используется только если ROLE_BENTO не покрывает роль.
export const ROLE_SCREEN2: Partial<Record<UserRole, WidgetSlotConfig[]>> = {}

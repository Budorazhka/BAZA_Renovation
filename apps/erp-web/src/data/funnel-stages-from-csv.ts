/**
 * Этапы воронок из учётных CSV:
 * «ВОРОНКИ - Продажи.csv», «ВОРОНКИ - Собственник.csv», «ВОРОНКИ - СЕТЬ.csv», «ВОРОНКИ - Посредник.csv»
 *
 * Используется виджетом рабочего стола и моками analytics-network (единые подписи этапов).
 */

import type { FunnelId } from '@/types/analytics'

export type CsvFunnelColumnDef = {
  id: string
  /** Подпись колонки как в CSV (Отказ / В работе / …) */
  name: string
  stages: string[]
}

export type CsvFunnelDefinition = {
  id: FunnelId
  /** Полное имя контура */
  name: string
  /** Короткое имя для вкладок */
  shortName: string
  columns: CsvFunnelColumnDef[]
}

/** Продажи — файл «ВОРОНКИ - Продажи.csv» (колонки «Отказ», «В работе», «Купили»). */
export const FUNNEL_SALES_CSV: CsvFunnelDefinition = {
  id: 'sales',
  name: 'Продажи',
  shortName: 'Продажи',
  columns: [
    {
      id: 'rejection',
      name: 'Отказ',
      stages: ['Бракованный лид', 'Отказ', 'Недозвонился 3', 'Недозвонился 2', 'Недозвонился 1'],
    },
    {
      id: 'in_progress',
      name: 'В работе',
      stages: [
        'Новый лид',
        'Попросил связаться позже',
        'Презентовали компанию',
        'Обсудили ситуацию в стране',
        'Выявлена потребность',
        'Потребность скорректирована',
        'Отправлено КП',
        'Отработка возражений',
        'Отложенный спрос',
        'Прогрев',
        'Показ',
        'Задаток получен',
        'Заключен договор',
      ],
    },
    {
      id: 'success',
      name: 'Купили',
      stages: ['Золотой фонд', 'Узнал как дела', 'Взять рекомендацию', 'Выявление потребности о новых сделках'],
    },
  ],
}

/** Собственник — «ВОРОНКИ - Собственник.csv». */
export const FUNNEL_OWNER_CSV: CsvFunnelDefinition = {
  id: 'owner',
  name: 'Собственник',
  shortName: 'Собственник',
  columns: [
    {
      id: 'rejection',
      name: 'Отказ',
      stages: ['Бракованный контакт', 'Отказ собственника', 'Недозвонился 3', 'Недозвонился 2', 'Недозвонился 1'],
    },
    {
      id: 'preparation',
      name: 'Подготовка',
      stages: [
        'Новый собственник',
        'Попросил связаться позже',
        'Презентовали компанию',
        'Обсудили объект и условия',
        'Предложили фотосессию',
        'Предложен эксклюзив',
        'Отработали возражения',
        'Договорились о сотрудничестве',
      ],
    },
    {
      id: 'in_progress',
      name: 'В работе',
      stages: ['Объект активен в продаже', 'Взять рекомендацию', 'Узнать о новом объекте'],
    },
  ],
}

/** Сеть — «ВОРОНКИ - СЕТЬ.csv». */
export const FUNNEL_NETWORK_CSV: CsvFunnelDefinition = {
  id: 'network',
  name: 'Сеть',
  shortName: 'Сеть',
  columns: [
    {
      id: 'rejection',
      name: 'Отказ',
      stages: ['Бракованный лид', 'Отказ', 'Недозвонился 3', 'Недозвонился 2', 'Недозвонился 1'],
    },
    {
      id: 'in_progress',
      name: 'В работе',
      stages: [
        'Новый лид',
        'Попросил связаться позже',
        'Презентовали компанию и стратегию',
        'Презентовали платформу',
        'Вручили офер',
        'Работа с возражениями',
        'Отложенный спрос',
        'Согласие',
        'Заполнена анкеты',
        'Регистрация в личном кабинете',
        'Подписание аферты',
        'Начало работы',
      ],
    },
    {
      id: 'active',
      name: 'Активный',
      stages: ['Активный партнёр'],
    },
  ],
}

/** Посредник — «ВОРОНКИ - Посредник.csv» (в CSV опечатка «Презентавали» — в интерфейсе нормализуем). */
export const FUNNEL_BROKER_CSV: CsvFunnelDefinition = {
  id: 'broker',
  name: 'Посредник',
  shortName: 'Посредник',
  columns: [
    {
      id: 'rejection',
      name: 'Отказ',
      stages: ['Бракованный контакт', 'Отказ', 'Недозвонился 3', 'Недозвонился 2', 'Недозвонился 1'],
    },
    {
      id: 'in_progress',
      name: 'В работе',
      stages: [
        'Новый посредник',
        'Попросил связаться позже',
        'Презентовали компанию',
        'Формат сотрудничества',
        'Работа с возражениями',
        'Согласие сотрудничать',
      ],
    },
    {
      id: 'active',
      name: 'Активный',
      stages: ['Активный посредник'],
    },
  ],
}

export const ALL_CSV_FUNNELS: CsvFunnelDefinition[] = [
  FUNNEL_SALES_CSV,
  FUNNEL_OWNER_CSV,
  FUNNEL_NETWORK_CSV,
  FUNNEL_BROKER_CSV,
]

export type DeskFunnelRow = {
  id: string
  name: string
  /** Колонка из CSV (Отказ / Подготовка / В работе / …) */
  group: string
  count: number
  activity: number
}

/** Разворачивает колонки CSV в строки для виджета + демо-счётчики (пока нет API). */
export function funnelDefinitionToDeskRows(def: CsvFunnelDefinition, prefix: string): DeskFunnelRow[] {
  const rows: DeskFunnelRow[] = []
  let globalIdx = 0
  for (const col of def.columns) {
    col.stages.forEach((name, i) => {
      const depth = globalIdx
      globalIdx += 1
      const base = Math.max(1, Math.round(22 * (1 - depth / 28) + ((i + depth) % 4)))
      rows.push({
        id: `${prefix}-${col.id}-${i}`,
        name,
        group: col.name,
        count: base,
        activity: (i + depth) % 5,
      })
    })
  }
  return rows
}

export const OWNER_DESK_ROWS = funnelDefinitionToDeskRows(FUNNEL_OWNER_CSV, 'own')
export const NETWORK_DESK_ROWS = funnelDefinitionToDeskRows(FUNNEL_NETWORK_CSV, 'net')
export const BROKER_DESK_ROWS = funnelDefinitionToDeskRows(FUNNEL_BROKER_CSV, 'brk')

export function sumCounts(rows: DeskFunnelRow[]): number {
  return rows.reduce((s, r) => s + r.count, 0)
}

export function sumCountsByGroup(rows: DeskFunnelRow[], group: string): number {
  return rows.filter((r) => r.group === group).reduce((s, r) => s + r.count, 0)
}

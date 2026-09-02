import type { EmployeeRole } from '@/types/personnel'

export type PermissionKey =
  | 'chessboard'
  | 'properties'
  | 'prices'
  | 'discounts'
  | 'bookings'
  | 'deals'
  | 'leads'
  | 'finance'
  | 'export'
  | 'mailings'

export interface PermissionMeta {
  key: PermissionKey
  label: string
  group: 'Каталог' | 'Сделки' | 'Отчёты'
  hint: string
}

export const PERMISSIONS: PermissionMeta[] = [
  { key: 'chessboard', group: 'Каталог', label: 'Шахматка',           hint: 'Менять статусы юнитов, ставить и снимать брони, переносить' },
  { key: 'properties', group: 'Каталог', label: 'ЖК и объекты',       hint: 'Редактировать ЖК, корпуса, планировки, медиа' },
  { key: 'prices',     group: 'Каталог', label: 'Цены',               hint: 'Менять прайс по юнитам, массовая правка' },
  { key: 'discounts',  group: 'Каталог', label: 'Скидки и акции',     hint: 'Выдавать персональные скидки, создавать акции' },
  { key: 'bookings',   group: 'Сделки',  label: 'Брони',              hint: 'Подтверждать, отменять, продлевать брони' },
  { key: 'deals',      group: 'Сделки',  label: 'Сделки',             hint: 'Создавать сделки и переводить по этапам' },
  { key: 'leads',      group: 'Сделки',  label: 'Лиды',               hint: 'Перераспределять между менеджерами, менять источники' },
  { key: 'finance',    group: 'Отчёты',  label: 'Финансы и комиссии', hint: 'Видеть суммы комиссий, рентабельность' },
  { key: 'export',     group: 'Отчёты',  label: 'Экспорт данных',     hint: 'Выгружать таблицы (Excel/CSV)' },
  { key: 'mailings',   group: 'Отчёты',  label: 'Рассылки',           hint: 'Отправлять рассылки клиентам' },
]

export type PermissionLevel = 'none' | 'view' | 'edit'
export type PermissionMap = Record<PermissionKey, PermissionLevel>

const ALL_EDIT: PermissionMap = {
  chessboard: 'edit', properties: 'edit', prices: 'edit', discounts: 'edit',
  bookings: 'edit', deals: 'edit', leads: 'edit',
  finance: 'edit', export: 'edit', mailings: 'edit',
}

export const FULL_ACCESS: PermissionMap = { ...ALL_EDIT }

export const DEFAULT_PERMISSIONS: Record<EmployeeRole, PermissionMap> = {
  owner:    { ...ALL_EDIT },
  director: { ...ALL_EDIT },
  rop: {
    chessboard: 'edit',
    properties: 'edit',
    prices: 'view',
    discounts: 'view',
    bookings: 'edit',
    deals: 'edit',
    leads: 'edit',
    finance: 'view',
    export: 'edit',
    mailings: 'none',
  },
  marketer: {
    chessboard: 'none',
    properties: 'view',
    prices: 'view',
    discounts: 'edit',
    bookings: 'none',
    deals: 'none',
    leads: 'view',
    finance: 'none',
    export: 'view',
    mailings: 'edit',
  },
  administrator: {
    chessboard: 'view',
    properties: 'view',
    prices: 'view',
    discounts: 'view',
    bookings: 'edit',
    deals: 'view',
    leads: 'edit',
    finance: 'none',
    export: 'view',
    mailings: 'view',
  },
  manager: {
    chessboard: 'edit',
    properties: 'view',
    prices: 'view',
    discounts: 'view',
    bookings: 'edit',
    deals: 'edit',
    leads: 'view',
    finance: 'none',
    export: 'edit',
    mailings: 'none',
  },
}

export function getDefaultPermissionsForRole(role: string): PermissionMap {
  if (role === 'owner') return { ...FULL_ACCESS }
  if (role in DEFAULT_PERMISSIONS) {
    return { ...DEFAULT_PERMISSIONS[role as EmployeeRole] }
  }
  return { ...DEFAULT_PERMISSIONS.manager }
}

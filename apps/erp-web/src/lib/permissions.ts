import {
  type UserRole,
  type AccountType,
  type PermissionAction,
  ROLE_PERMISSIONS,
  PERMISSION_DENIED_REASON,
} from '@/types/auth'

/**
 * Проверяет, может ли пользователь с данной ролью выполнить действие.
 */
export function canDo(action: PermissionAction, role: UserRole): boolean {
  const permissions = ROLE_PERMISSIONS[role]
  if (!permissions) return false
  return permissions.includes(action)
}

/**
 * Возвращает объект для использования в кнопках.
 * В финальном контуре предпочтительно скрывать недоступные действия целиком.
 * Этот helper оставлен для локальных исключений.
 */
export function usePermissionProps(
  action: PermissionAction,
  role: UserRole,
): { allowed: boolean; reason: string } {
  const allowed = canDo(action, role)
  return {
    allowed,
    reason: allowed ? '' : PERMISSION_DENIED_REASON[action],
  }
}

/** Ярлык: минимальная роль для отображения в UI */
export const ROLE_LABEL: Record<string, string> = {
  owner: 'Собственник',
  director: 'Руководитель агентства',
  rop: 'РОП',
  marketer: 'Маркетолог',
  manager: 'Менеджер / риелтор',
  lawyer: 'Юрист / документы',
  procurement_head: 'Специалист по закупке объектов',
  administrator: 'Администратор агентства',
  trainee: 'Стажёр',
  finance: 'Финансовый руководитель',
  developer: 'Застройщик',
  hr: 'HR / обучение (legacy)',
  partner: 'Партнёрский риелтор (legacy)',
}

/** Цвет бейджа роли */
export const ROLE_COLOR: Record<string, string> = {
  owner: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  director: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  rop: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  marketer: 'text-violet-400 bg-violet-400/10 border-violet-400/30',
  manager: 'text-slate-400 bg-slate-400/10 border-slate-400/30',
  lawyer: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
  procurement_head: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  administrator: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/30',
  trainee: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/30',
  finance: 'text-lime-400 bg-lime-400/10 border-lime-400/30',
  developer: 'text-amber-300 bg-amber-300/10 border-amber-300/30',
  hr: 'text-rose-400 bg-rose-400/10 border-rose-400/30',
  partner: 'text-pink-400 bg-pink-400/10 border-pink-400/30',
}

/**
 * Получить название роли с fallback.
 */
export function getRoleLabel(role?: string): string {
  if (!role) return '—'
  return ROLE_LABEL[role] || role
}

/**
 * Получить стили роли с fallback.
 */
export function getRoleColor(role?: string): string {
  if (!role) return 'text-slate-400 bg-slate-400/10 border-slate-400/30'
  return ROLE_COLOR[role] || 'text-slate-400 bg-slate-400/10 border-slate-400/30'
}

/** Подпись типа кабинета для маршрутизации и UI */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  agency: 'Агентство',
  developer: 'Застройщик',
  realtor: 'Риэлтор',
  internal: 'Внутренние сотрудники',
}

import {
  getDefaultPermissionsForRole,
  type PermissionKey,
  type PermissionLevel,
  type PermissionMap,
} from '@/data/personnel-permissions'
import type { UserRole } from '@/types/auth'

export function parsePermissionOverrides(
  raw?: Record<string, string> | null,
): Partial<PermissionMap> {
  if (!raw) return {}
  const result: Partial<PermissionMap> = {}
  for (const [key, val] of Object.entries(raw)) {
    if (val === 'none' || val === 'view' || val === 'edit') {
      result[key as PermissionKey] = val
    }
  }
  return result
}

/** Сериализует только отличия от базовой матрицы роли (для API). */
export function serializePermissionOverrides(
  role: string,
  overrides: Partial<PermissionMap>,
): Record<string, string> {
  const base = getDefaultPermissionsForRole(role)
  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(overrides) as [PermissionKey, PermissionLevel][]) {
    if (base[key] !== val) result[key] = val
  }
  return result
}

/**
 * Абсолютный профиль доступа ПОЗИЦИИ.
 * Если у позиции задан accessProfile (полный снимок) — берём его; иначе дефолт роли.
 * В отличие от diff-от-роли это не «протухает» при смене роли.
 */
export function resolvePositionProfile(
  role: UserRole | string,
  accessProfile?: Record<string, string> | null,
): PermissionMap {
  const base = getDefaultPermissionsForRole(role)
  const parsed = parsePermissionOverrides(accessProfile)
  return { ...base, ...parsed }
}

/**
 * Итоговый доступ сотрудника = абсолютный профиль позиции + персональные дельты человека.
 * Персональные дельты «едут» с человеком между позициями.
 */
export function resolveEffectiveAccess(
  role: UserRole | string,
  accessProfile?: Record<string, string> | null,
  personalAccess?: Record<string, string> | null,
): PermissionMap {
  const profile = resolvePositionProfile(role, accessProfile)
  const personal = parsePermissionOverrides(personalAccess)
  return { ...profile, ...personal }
}

/** Сериализует полный (абсолютный) профиль доступа позиции для хранения/API. */
export function serializeAccessProfile(map: PermissionMap): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(map) as [PermissionKey, PermissionLevel][]) {
    result[key] = val
  }
  return result
}

export function resolveModulePermissions(
  role: UserRole | string,
  overrides?: Record<string, string> | Partial<PermissionMap> | null,
): PermissionMap {
  const base = getDefaultPermissionsForRole(role)
  if (!overrides || Object.keys(overrides).length === 0) return base

  const parsed =
    'chessboard' in overrides ||
    Object.values(overrides).some((v) => v === 'view' || v === 'edit' || v === 'none')
      ? (overrides as Partial<PermissionMap>)
      : parsePermissionOverrides(overrides as Record<string, string>)

  return { ...base, ...parsed }
}

export function canViewModule(perms: PermissionMap, key: PermissionKey): boolean {
  const lvl = perms[key]
  return lvl === 'view' || lvl === 'edit'
}

export function canEditModule(perms: PermissionMap, key: PermissionKey): boolean {
  return perms[key] === 'edit'
}

/** Определяет категорию доступа по URL (null = нет привязки к матрице модулей). */
export function getPermissionKeyForPath(pathname: string): PermissionKey | null {
  const p = pathname.split('?')[0]

  if (p.includes('/chessboard')) return 'chessboard'
  if (p.startsWith('/dashboard/finance')) return 'finance'
  if (p.startsWith('/dashboard/leads') || p.startsWith('/dashboard/clients') || p.startsWith('/dashboard/leads-hub')) {
    return 'leads'
  }
  if (p.startsWith('/dashboard/deals') || p.startsWith('/dashboard/crm')) return 'deals'
  if (
    p.startsWith('/dashboard/bookings') ||
    p.includes('/bookings-registrations') ||
    p.includes('/management/bookings') ||
    p.includes('/management/registrations')
  ) {
    return 'bookings'
  }
  if (p.includes('/broadcasts') || p.includes('/mailings')) return 'mailings'
  if (p.includes('/promotion')) return 'discounts'
  if (p.includes('/installments')) return 'prices'
  if (p.startsWith('/dashboard/development/floorplans')) return 'properties'
  if (p.startsWith('/dashboard/development/projects')) return 'properties'
  if (p.startsWith('/dashboard/development/management')) return 'bookings'
  if (p.startsWith('/dashboard/development')) return 'properties'
  if (p.startsWith('/dashboard/my-properties') || p.startsWith('/dashboard/objects')) return 'properties'
  if (p.startsWith('/dashboard/new-buildings')) return 'properties'

  return null
}

/** Скрыть пункт rail, если ни одна из категорий раздела не доступна на просмотр. */
export const RAIL_MODULE_REQUIREMENTS: Partial<Record<string, PermissionKey[]>> = {
  development: ['properties', 'chessboard'],
  crm: ['leads', 'deals'],
  newbuild: ['properties', 'chessboard', 'bookings'],
  secondary: ['properties'],
  finance: ['finance'],
  analytics: ['finance', 'export'],
}

export function railSectionVisibleForPermissions(
  sectionId: string,
  permissions: PermissionMap,
): boolean {
  const keys = RAIL_MODULE_REQUIREMENTS[sectionId]
  if (!keys?.length) return true
  return keys.some((key) => canViewModule(permissions, key))
}

export function isPathBlockedByModulePermissions(
  pathname: string,
  permissions: PermissionMap,
): boolean {
  const key = getPermissionKeyForPath(pathname)
  if (!key) return false
  return !canViewModule(permissions, key)
}

export function isHubSectionVisible(
  route: string | undefined,
  permissions: PermissionMap,
): boolean {
  if (!route) return true
  const key = getPermissionKeyForPath(route)
  if (!key) return true
  return canViewModule(permissions, key)
}

import { useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  canEditModule,
  canViewModule,
  resolveModulePermissions,
} from '@/lib/module-permissions'
import type { PermissionKey, PermissionMap } from '@/data/personnel-permissions'

/**
 * Гранулярные права по категориям (шахматка, лиды, финансы…).
 * Учитывает роль + персональные overrides из team_users.
 */
export function useModulePermissions() {
  const { currentUser } = useAuth()
  const role = currentUser?.role ?? 'manager'

  const permissions = useMemo<PermissionMap>(
    () => resolveModulePermissions(role, currentUser?.permissionOverrides),
    [role, currentUser?.permissionOverrides],
  )

  return {
    permissions,
    canView: (key: PermissionKey) => canViewModule(permissions, key),
    canEdit: (key: PermissionKey) => canEditModule(permissions, key),
  }
}

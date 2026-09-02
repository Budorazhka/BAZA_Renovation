import { useAuth } from '@/context/AuthContext'
import { canDo } from '@/lib/permissions'
import { teamSectionAccessible } from '@/config/dashboard-rail'

/**
 * Хук для удобного доступа к ролевым правам текущего пользователя.
 * Используйте этот хук во всех компонентах вкладки "Лиды" и других разделах,
 * где нужна проверка разрешений.
 */
export function useRolePermissions() {
  const { currentUser } = useAuth()
  const role = currentUser?.role ?? 'manager'
  const teamRole = currentUser?.teamRole

  return {
    role,
    teamRole,
    /**
     * Управленческая тройка позиций (owner/director/rop) по роли занимаемой
     * позиции — тот же контур, что у раздела «Команда». В отличие от canDo по
     * аккаунтной роли не даёт прав сотрудникам с role «developer»/«agency».
     */
    isManagementPosition: teamSectionAccessible(role, teamRole),
    isManager: role === 'manager',
    isMarketer: role === 'marketer',
    isRop: role === 'rop',
    isDirector: role === 'director',
    isOwner: role === 'owner',
    isDirectorOrAbove: role === 'director' || role === 'owner',
    isRopOrAbove: role === 'rop' || role === 'director' || role === 'owner',

    // Действия
    canTransferLeads: canDo('transfer_leads', role),
    canViewAllLeads: canDo('view_all_leads', role),
    canManageTeam: canDo('manage_team', role),
    canChangeDistribution: canDo('change_distribution', role),
    canSetSubstitute: canDo('set_substitute', role),
    canViewNetworkAnalytics: canDo('view_network_analytics', role),
    canManagePartners: canDo('manage_partners', role),
    canAddLeadSource: canDo('add_lead_source', role),
    canViewLeadAnalytics: canDo('view_lead_analytics', role),
    canManageProperties: canDo('manage_properties', role),
  }
}

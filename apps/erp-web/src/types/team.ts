export type TeamUserRole = 'owner' | 'director' | 'rop' | 'marketer' | 'administrator' | 'manager'
export type TeamUserStatus = 'active' | 'blocked' | 'invited'

/**
 * Одна запись истории занятости позиции: кто и когда её занимал.
 * Открытая занятость — endedAt === null (текущий занимающий).
 */
export interface OccupancyEntry {
  accountId: string
  name: string
  startedAt: string
  endedAt: string | null
}

export interface TeamUser {
  id: string
  platformUserId: string
  teamId: string
  name: string
  role: TeamUserRole
  position: string
  managerId: string | null
  loginEmail: string
  email: string
  status: TeamUserStatus
  phone?: string
  hireDate?: string
  birthDate?: string
  department?: string
  city?: string
  telegram?: string
  aboutMe?: string
  /** О компании/застройщике — отдельно от личного «о себе» (для офера/визитки). */
  aboutCompany?: string
  skills: string[]
  whatsapp?: string
  vk?: string
  instagram?: string
  website?: string
  avatarUrl?: string
  permissionOverrides: Record<string, string>
  createdAt?: string
  updatedAt?: string

  /* ── Модель позиций (Stage A, фронт). Все поля опциональны для обратной совместимости. ──
   * Запись = ПОЗИЦИЯ в оргструктуре + её текущий занимающий (человек).
   * Клиентская база и доступы принадлежат позиции (positionId), а не человеку. */

  /** Стабильный id позиции; не меняется при смене человека. Бэкфилл: positionId ??= id. */
  positionId?: string
  /** Позиция-родитель в структуре (зеркалит managerId, но по позиции, а не по человеку). */
  parentPositionId?: string | null
  /** Позиция свободна: занимающего сейчас нет (клиенты и доступы остаются на позиции). */
  vacant?: boolean
  /** История занятости позиции (кто и когда занимал). */
  occupancyHistory?: OccupancyEntry[]
  /** Абсолютный профиль доступа позиции (сериализованный PermissionMap). Если не задан — берётся от роли. */
  accessProfile?: Record<string, string>
  /** Персональные дельты доступа текущего человека поверх профиля позиции (едут с человеком). */
  personalAccess?: Record<string, string>
  /** RBAC: строковые права по функциональным доменам. Управляется слоем прав, не формой позиции. */
  rbac?: string[]

  /* ── Занимаемая позиция (только ответ ensure-self). Аккаунтная role в CRM остаётся
   * как есть (agency/developer/…) — доступы считаются по роли занимаемой позиции. ── */

  /** Роль занимаемой позиции в оргструктуре; null — не занимает ни одной. */
  teamRole?: TeamUserRole | null
  /** Название занимаемой позиции («Owner», «Director», …); не путать с profile-полем position. */
  teamPosition?: string | null
}

export interface CreateTeamUserPayload {
  name: string
  role: TeamUserRole
  position: string
  managerId?: string
  loginEmail: string
  password: string
  email?: string
  phone?: string
  hireDate?: string
  birthDate?: string
  department?: string
  city?: string
  telegram?: string
  aboutMe?: string
  aboutCompany?: string
  skills?: string[]
  whatsapp?: string
  vk?: string
  instagram?: string
  website?: string
}

export interface CreateTeamAccountSlotPayload {
  role: TeamUserRole
  position: string
  managerId?: string | null
  accessProfile?: Record<string, string>
}

export type UpdateTeamUserPayload = Partial<Omit<CreateTeamUserPayload, 'password' | 'managerId'>> & {
  password?: string
  managerId?: string | null
  avatarUrl?: string
  permissionOverrides?: Record<string, string>
  /** Абсолютный профиль доступа позиции. */
  accessProfile?: Record<string, string>
  /** Персональные дельты доступа текущего человека. */
  personalAccess?: Record<string, string>
}

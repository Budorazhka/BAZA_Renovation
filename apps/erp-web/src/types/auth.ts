/**
 * Типы авторизации и ролевой модели платформы.
 * Иерархия: Собственник → Директор → РОП → Менеджер
 * Расширено по финальному ТЗ: +lawyer, +procurement_head, +finance, +administrator, +trainee
 * Legacy-совместимость: `hr` и `partner` оставлены в типе только для обратной совместимости старых моков.
 *
 * Контракт для бэкенда: в JWT/API поле `role` — строка, совпадающая с литералом UserRole (нижний регистр, snake_case).
 * Активный список ролей задается в `USER_ROLES` и соответствует финальному ТЗ.
 */

/** Роль пользователя в системе */
export type UserRole =
  | 'owner'
  | 'director'
  | 'rop'
  | 'marketer'
  | 'manager'
  | 'lawyer'
  | 'procurement_head'
  | 'administrator'
  | 'trainee'
  | 'finance'
  | 'developer'
  // Legacy роли: не используются в финальной матрице ТЗ.
  | 'hr'
  | 'partner'

/** Все роли в порядке для селекторов (логин, демо) */
export const USER_ROLES: UserRole[] = [
  'owner',
  'director',
  'rop',
  'marketer',
  'manager',
  'procurement_head',
  'administrator',
  'trainee',
  'lawyer',
  'finance',
]

/**
 * Уровень доступа к данным (Data Scope по ТЗ RBAC+ABAC).
 * own — только свои записи
 * team — своя команда/отдел
 * branch — филиал
 * project — конкретный ЖК/проект
 * assigned — только если явно назначен
 * all — все данные
 */
export type DataScope = 'own' | 'team' | 'branch' | 'project' | 'assigned' | 'all'

/** Тип бизнес-аккаунта: четыре версии продукта — один вход, разные кабинеты */
export type AccountType = 'agency' | 'developer' | 'realtor' | 'internal'

/**
 * Один активный PermissionGrant позиции, как его отдаёт GET /api/v1/me.
 * Серверная правда о правах: считается по PermissionGrant'ам позиции, а не
 * выводится на клиенте из ROLE_PERMISSIONS (та матрица остаётся для мок- и
 * демо-сессий, у которых сервера за спиной нет).
 */
export interface ServerPermission {
  resource: string
  action: string
  scope: string
  scopeValue?: string
}

/** Текущий авторизованный пользователь */
export interface CurrentUser {
  id: string
  name: string
  login: string
  role: UserRole
  accountType: AccountType
  companyId: string
  companyName: string
  /** Владелец команды (флаг isOwner из CRM-записи; ставится админ-системой, приходит в логине). */
  isOwner?: boolean
  /**
   * Роль занимаемой позиции в оргструктуре (team_positions; приходит из ensure-self).
   * Аккаунтная `role` — идентичность кабинета (agency/developer/…) и в матрице прав
   * не участвует; доступы на странице «Команда» считаются по teamRole.
   */
  teamRole?: UserRole
  /** Position._id (реальный backend, ensure-self) — нужен teamApi.uploadAvatar для PATCH .../avatar на СВОЮ позицию. */
  positionId?: string
  avatarUrl?: string
  /** Контакты из «О себе» — используются в PDF-карточке консультанта. */
  position?: string
  phone?: string
  telegram?: string
  whatsapp?: string
  aboutMe?: string
  /** О компании/застройщике — отдельно от личного «о себе» (для офера/визитки). */
  aboutCompany?: string
  skills?: string[]
  city?: string
  birthDate?: string
  department?: string
  vk?: string
  instagram?: string
  website?: string
  /** Персональные overrides категорий доступа (из team_users). */
  permissionOverrides?: Record<string, string>
  /**
   * Тип организации из GET /me: 'agency' | 'developer' и т.д. Серверное
   * значение, а не догадка по роли пользователя.
   */
  organizationType?: string
  /**
   * Активные права позиции из GET /me. Заполнено только у реальной серверной
   * сессии; у мок- и демо-входа отсутствует — по этому признаку код и отличает
   * «прав нет» от «сервера не спрашивали».
   */
  serverPermissions?: ServerPermission[]
  /** Верификация в MLS-круге BAZA.sale — отдельно от ролевого доступа к publish_mls. */
  mlsCircleVerified?: boolean
}

/** Действия, доступность которых зависит от роли */
export type PermissionAction =
  | 'manage_team'           // Управление командой (добавить/удалить менеджера)
  | 'transfer_leads'        // Массовая передача лидов
  | 'change_distribution'   // Изменить правило раздачи лидов
  | 'view_all_leads'        // Видеть лиды всех менеджеров
  | 'view_network_analytics'// Аналитика всей сети
  | 'manage_partners'       // Управление партнёрами и городами
  | 'manage_mailings'       // Рассылки
  | 'export_data'           // Экспорт данных
  | 'add_lead_source'       // Добавить источник лидов
  | 'view_all_stages'       // Видеть все стадии воронки
  | 'set_substitute'        // Назначить подменного дежурного
  | 'view_lead_analytics'   // Аналитика лидов и рекламных кампаний
  | 'block_account'         // Блокировка аккаунтов сотрудников (только собственник)
  | 'manage_properties'     // Добавление, редактирование и удаление объектов недвижимости
  | 'publish_mls'           // Публикация объекта в MLS (множественный листинг)
  // Новые действия по ТЗ
  | 'see_finance'           // Просмотр комиссий, бюджетов, рентабельности
  | 'see_analytics'         // Просмотр агрегированных BI-дашбордов
  | 'approve_deal'          // Согласование критических переходов в сделке
  | 'legal_approve'         // Юридический апрув сделки
  | 'manage_bookings'       // Управление бронями
  | 'create_deal'           // Создание сделки
  | 'assign_lead'           // Назначение ответственного по лиду
  | 'view_commissions'      // Просмотр комиссионных начислений

/** Матрица прав: роль → список разрешённых действий */
export const ROLE_PERMISSIONS: Record<UserRole, PermissionAction[]> = {
  owner: [
    'manage_team',
    'transfer_leads',
    'change_distribution',
    'view_all_leads',
    'view_network_analytics',
    'manage_partners',
    'manage_mailings',
    'export_data',
    'add_lead_source',
    'view_all_stages',
    'set_substitute',
    'view_lead_analytics',
    'manage_properties',
    'publish_mls',
    'block_account',
    'see_finance',
    'see_analytics',
    'approve_deal',
    'manage_bookings',
    'create_deal',
    'assign_lead',
    'view_commissions',
  ],
  director: [
    'manage_team',
    'transfer_leads',
    'change_distribution',
    'view_all_leads',
    'view_network_analytics',
    'manage_mailings',
    'export_data',
    'add_lead_source',
    'view_all_stages',
    'set_substitute',
    'view_lead_analytics',
    'manage_properties',
    'publish_mls',
    'see_finance',
    'see_analytics',
    'approve_deal',
    'manage_bookings',
    'create_deal',
    'assign_lead',
    'view_commissions',
  ],
  rop: [
    'change_distribution',
    'view_all_leads',
    'view_all_stages',
    'set_substitute',
    'view_lead_analytics',
    'manage_properties',
    'publish_mls',
    'see_analytics',
    'approve_deal',
    'manage_bookings',
    'create_deal',
    'assign_lead',
    'see_finance',
    'view_commissions',
    'manage_team',
  ],
  marketer: [
    'view_lead_analytics',
    'view_all_stages',
    'add_lead_source',
    'see_analytics',
  ],
  manager: [
    'view_all_stages',
    'manage_properties',
    'publish_mls',
    'create_deal',
    'manage_bookings',
  ],
  lawyer: [
    'view_all_stages',
    'legal_approve',
    'see_finance',
    'export_data',
  ],
  procurement_head: [
    'manage_properties',
    'publish_mls',
    'view_all_stages',
    'approve_deal',
    'see_finance',
    'see_analytics',
    'export_data',
    'view_commissions',
  ],
  administrator: [
    'view_all_stages',
    'create_deal',
    'manage_bookings',
    'assign_lead',
    'view_lead_analytics',
  ],
  trainee: [
    'view_all_stages',
  ],
  partner: [
    'view_all_stages',
    'view_commissions',
  ],
  /** Финансы, отчёты, просмотр сделок/документов — уточняется по матрице; стартовый набор для UI */
  finance: [
    'view_all_stages',
    'see_finance',
    'see_analytics',
    'view_commissions',
    'export_data',
    'view_lead_analytics',
  ],
  developer: [
    'manage_team',
    'transfer_leads',
    'change_distribution',
    'view_all_leads',
    'view_network_analytics',
    'manage_partners',
    'manage_mailings',
    'export_data',
    'add_lead_source',
    'view_all_stages',
    'set_substitute',
    'view_lead_analytics',
    'manage_properties',
    'publish_mls',
    'block_account',
    'see_finance',
    'see_analytics',
    'approve_deal',
    'manage_bookings',
    'create_deal',
    'assign_lead',
    'view_commissions',
  ],
  /** Команда и обучение, без операционных продажных контуров */
  hr: [
    'manage_team',
    'view_all_stages',
    'see_analytics',
  ],
}

/** Описания ограничений для тултипов */
export const PERMISSION_DENIED_REASON: Record<PermissionAction, string> = {
  manage_team: 'Доступно с уровня Директора',
  transfer_leads: 'Доступно с уровня Директора',
  change_distribution: 'Доступно с уровня РОПа',
  view_all_leads: 'Доступно с уровня РОПа',
  view_network_analytics: 'Доступно с уровня Директора',
  manage_partners: 'Только для Собственника',
  manage_mailings: 'Доступно с уровня Директора',
  export_data: 'Доступно с уровня Директора',
  add_lead_source: 'Доступно с уровня Директора',
  view_all_stages: 'Доступно всем',
  set_substitute: 'Доступно с уровня РОПа',
  view_lead_analytics: 'Доступно с уровня РОПа и для Маркетолога',
  block_account: 'Только для Собственника',
  manage_properties: 'Доступно с уровня Менеджера',
  publish_mls: 'Публикация в MLS доступна с уровня Менеджера',
  see_finance: 'Недостаточно прав для просмотра финансовых данных',
  see_analytics: 'Недостаточно прав для просмотра аналитики',
  approve_deal: 'Доступно с уровня РОПа',
  legal_approve: 'Только для Юриста',
  manage_bookings: 'Доступно с уровня Менеджера',
  create_deal: 'Доступно с уровня Менеджера',
  assign_lead: 'Доступно с уровня РОПа',
  view_commissions: 'Недостаточно прав для просмотра комиссий',
}

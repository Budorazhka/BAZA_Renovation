import axios from 'axios'
import { CRM_API_BASE_URL, PLATFORM_API_BASE_URL } from '@/config/backend'
import type {
  CreateTeamAccountSlotPayload,
  CreateTeamUserPayload,
  TeamUser,
  TeamUserStatus,
  UpdateTeamUserPayload,
} from '@/types/team'

const api = axios.create({
  baseURL: CRM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

/**
 * Read-path команды уже реализован в новом Platform API. Пишущие legacy
 * операции ниже пока остаются на прежнем адаптере, пока их contracts не
 * переведены отдельно — это не даёт незаметно смешать несовместимые DTO.
 */
const platformApi = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

/* ─────────────────────────────────────────────────────────────────────────────
 * МОК ВКЛЮЧЁН: эндпоинты /team-users на api-crm ещё не реализованы (отложены —
 * см. bz26-api-crm/docs/erp-developers-implementation.md, «Deferred» п.8).
 * Профиль застройщика уже ходит на реальный API — см. src/services/developersApi.ts.
 * Когда бэкенд добавит /team-users, переключить USE_MOCK_TEAM = false.
 *
 * БЭКЕНДЕРУ: что нужно реализовать, чтобы раздел «Команда» заработал полностью.
 *
 * ── Реализовано на новом backend (baza-platform/apps/api, 25.08.2026) ────────
 *   GET    /team-users                     — список позиций организации (TenantContext,
 *                                            не params.teamId — organizationId server-derived,
 *                                            ADR-002). READ-ONLY минимальный adapter поверх
 *                                            Position+PositionAssignment+Identity — HR-профильные
 *                                            поля (phone/telegram/birthDate/skills/vk/instagram/
 *                                            website/aboutMe/department/city/hireDate/avatarUrl)
 *                                            приходят undefined (нет источника в backend-модели,
 *                                            см. apps/api/.../organizations/team.service.ts комментарий).
 *   POST   /team-users/ensure-self         — TenantContext.positionId текущей identity.
 *   POST   /team-users/ensure-team         — idempotent no-op (организация уже существует
 *                                            к моменту логина, OrganizationsService.
 *                                            createOrganizationWithOwner создаёт её атомарно
 *                                            при регистрации, не отдельным ensure-шагом).
 *   occupancyHistory — ВСЕГДА пустой массив (backend не хранит полную историю занятости
 *                      как единый массив на позиции — честный пробел, не баг ответа).
 *
 * ── НЕ реализовано на новом backend (мок остаётся для этих операций) ────────
 *   GET    /team-users/:id, POST /team-users, PATCH .../:id, PATCH .../:id/status,
 *   PATCH .../:id/move, DELETE /team-users/:id, POST /api/files (аватар),
 *   POST .../:positionId/vacate, POST .../:positionId/assign — write-операции
 *   уже есть как OrganizationsService.assignOccupant/vacatePosition под другими
 *   URL-путями и в другой форме ответа, но НЕ смаплены на этот teamApi-контракт
 *   в этом проходе — отдельная задача, не молча забытая.
 *
 * ── Новые поля на записи TeamUser (хранить в БД): ────────────────────────────
 *   positionId         string   — стабильный UUID позиции; не меняется при смене человека
 *   parentPositionId   string?  — positionId родительской позиции (зеркалит managerId по позиции)
 *   vacant             boolean  — позиция свободна (нет текущего человека)
 *   occupancyHistory   array    — история занятости: [{ accountId, name, startedAt, endedAt }]
 *   accessProfile      object   — абсолютный профиль прав позиции: { [moduleKey]: 'none'|'view'|'edit' }
 *   personalAccess     object   — персональные дельты конкретного человека поверх профиля позиции
 *
 * ── Типы: см. src/types/team.ts ───────────────────────────────────────────────
 * ───────────────────────────────────────────────────────────────────────────── */
/**
 * getById/createAccountSlot ещё не реализованы на backend (createAccountSlot
 * концептуально возможен через createVacantPosition, но без явного HTTP-
 * endpoint для "пустого слота без occupant'а" — отдельная задача) —
 * общий флаг остаётся ТОЛЬКО для них. Все остальные операции переключены
 * отдельными узкими флагами ниже, каждый читается независимо в своём
 * методе — не единый переключатель.
 */
const USE_MOCK_TEAM = true
const USE_MOCK_TEAM_READ = false
/**
 * move/vacate/setStatus/remove реализованы на backend — не смешаны с общим
 * USE_MOCK_TEAM.
 */
const USE_MOCK_TEAM_WRITE_BASIC = false
/**
 * create/update реализованы на backend (26.08.2026, honest gap закрыт) —
 * HR-профильные поля хранятся в отдельной коллекции position_profiles
 * (technical decision, не расширение domain-model.md). create принимает
 * password напрямую (человек сразу active) — отдельный от assignOccupant-
 * invite-flow путь, не invite-token.
 */
const USE_MOCK_TEAM_CREATE_UPDATE = false
/**
 * assignOccupant реализован на backend как email-based invite-flow
 * (26.08.2026, D-05/team-users honest gap закрыт) — существующая identity
 * линкуется, для новой создаётся pending Identity + Invitation с токеном
 * (менеджер делится ссылкой вручную, activateInvite() уже был готов на
 * этой стороне заранее). Отдельный флаг, не смешан с WRITE_BASIC — эти два
 * пути реализованы backend'ом в разное время этой сессии.
 */
const USE_MOCK_TEAM_ASSIGN = false
const MOCK_STORAGE_KEY = 'mock_team_accounts_v2'

const MOCK_TEAM_ID = 'default'

function occupancy(accountId: string, name: string): TeamUser['occupancyHistory'] {
  return [{ accountId, name, startedAt: '2026-01-01T00:00:00.000Z', endedAt: null }]
}

function mockSeed(): TeamUser[] {
  const base = { teamId: MOCK_TEAM_ID, status: 'active' as const, skills: [], permissionOverrides: {} }
  return [
    {
      ...base,
      id: 'u1',
      platformUserId: 'acc-owner',
      name: 'Артём Власов',
      role: 'owner',
      position: 'Собственник',
      managerId: null,
      loginEmail: '@owner',
      email: '@owner',
      phone: '+7 900 000-00-00',
      telegram: '@owner',
      positionId: 'pos-owner',
      parentPositionId: null,
      vacant: false,
      accessProfile: {},
      personalAccess: {},
      occupancyHistory: occupancy('acc-owner', 'Артём Власов'),
    },
    {
      ...base,
      id: 'u2',
      platformUserId: 'acc-director',
      name: 'Анна Директорова',
      role: 'director',
      position: 'Директор',
      managerId: 'u1',
      loginEmail: '@director',
      email: '@director',
      phone: '+7 900 000-00-01',
      telegram: '@director',
      positionId: 'pos-director',
      parentPositionId: 'pos-owner',
      vacant: false,
      accessProfile: {},
      personalAccess: {},
      occupancyHistory: occupancy('acc-director', 'Анна Директорова'),
    },
    {
      ...base,
      id: 'u3',
      platformUserId: 'acc-rop',
      name: 'Игорь Ропов',
      role: 'rop',
      position: 'РОП',
      managerId: 'u2',
      loginEmail: '@rop',
      email: '@rop',
      phone: '+7 900 000-00-02',
      telegram: '@rop',
      positionId: 'pos-rop',
      parentPositionId: 'pos-director',
      vacant: false,
      accessProfile: {},
      personalAccess: {},
      occupancyHistory: occupancy('acc-rop', 'Игорь Ропов'),
    },
    {
      ...base,
      id: 'u-marketer',
      platformUserId: '',
      name: '',
      role: 'marketer',
      position: 'Маркетолог',
      managerId: 'u2',
      loginEmail: '',
      email: '',
      vacant: true,
      positionId: 'pos-marketer',
      parentPositionId: 'pos-director',
      accessProfile: {},
      personalAccess: {},
      occupancyHistory: [],
    },
    {
      ...base,
      id: 'u-admin',
      platformUserId: '',
      name: '',
      role: 'administrator',
      position: 'Администратор',
      managerId: 'u2',
      loginEmail: '',
      email: '',
      vacant: true,
      positionId: 'pos-admin',
      parentPositionId: 'pos-director',
      accessProfile: {},
      personalAccess: {},
      occupancyHistory: [],
    },
    {
      ...base,
      id: 'lm-1',
      platformUserId: 'acc-mgr-1',
      name: 'Мария Менеджерова',
      role: 'manager',
      position: 'Менеджер 1',
      managerId: 'u3',
      loginEmail: '@manager_1',
      email: '@manager_1',
      phone: '+7 900 000-00-03',
      telegram: '@manager_1',
      positionId: 'pos-mgr-1',
      parentPositionId: 'pos-rop',
      vacant: false,
      accessProfile: {},
      personalAccess: {},
      occupancyHistory: occupancy('acc-mgr-1', 'Мария Менеджерова'),
    },
    {
      ...base,
      id: 'mock-mgr-2',
      platformUserId: 'acc-mgr-2',
      name: 'Пётр Сделкин',
      role: 'manager',
      position: 'Менеджер 2',
      managerId: 'u3',
      loginEmail: '@manager_2',
      email: '@manager_2',
      phone: '+7 900 000-00-04',
      telegram: '@manager_2',
      positionId: 'pos-mgr-2',
      parentPositionId: 'pos-rop',
      vacant: false,
      accessProfile: {},
      personalAccess: {},
      occupancyHistory: occupancy('acc-mgr-2', 'Пётр Сделкин'),
    },
    {
      ...base,
      id: 'pos-mgr-3',
      platformUserId: '',
      name: '',
      role: 'manager',
      position: 'Менеджер 3',
      managerId: 'u3',
      loginEmail: '',
      email: '',
      vacant: true,
      positionId: 'pos-mgr-3',
      parentPositionId: 'pos-rop',
      accessProfile: {},
      personalAccess: {},
      occupancyHistory: [],
    },
  ]
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Бэкфилл полей модели позиций на легаси-записях (positionId ??= id и т.д.). Мутирует и возвращает массив. */
function mockBackfillPositions(users: TeamUser[]): TeamUser[] {
  for (const u of users) {
    if (u.positionId == null) u.positionId = u.id
    if (u.parentPositionId === undefined) u.parentPositionId = u.managerId
    if (u.vacant === undefined) u.vacant = false
    if (u.occupancyHistory === undefined) {
      u.occupancyHistory = u.vacant
        ? []
        : [
            {
              accountId: u.platformUserId || u.id,
              name: u.name,
              startedAt: u.createdAt || '2025-01-01T00:00:00.000Z',
              endedAt: null,
            },
          ]
    }
  }
  return users
}

const DEMO_ROLE_ACCOUNT_ID: Partial<Record<TeamUser['role'], string>> = {
  owner: 'u1',
  director: 'u2',
  rop: 'u3',
  marketer: 'u-marketer',
  administrator: 'u-admin',
  manager: 'lm-1',
}

function mockNormalizeAccounts(users: TeamUser[]): TeamUser[] {
  const normalized = mockBackfillPositions(users)
    .filter((u) => !(u.role === 'owner' && (u.id !== 'u1' || (u.positionId ?? u.id) !== 'pos-owner')))

  const seedById = new Map(mockSeed().map((u) => [u.id, u]))
  const existingIds = new Set(normalized.map((u) => u.id))
  for (const seeded of seedById.values()) {
    if (!existingIds.has(seeded.id)) normalized.push(seeded)
  }

  for (const u of normalized) {
    if (u.id === 'u2') {
      u.managerId = 'u1'
      u.parentPositionId = 'pos-owner'
    } else if (u.id === 'u3' || u.id === 'u-marketer' || u.id === 'u-admin') {
      u.managerId = 'u2'
      u.parentPositionId = 'pos-director'
    } else if (u.role === 'manager' && (u.positionId ?? '').startsWith('pos-mgr')) {
      u.managerId = 'u3'
      u.parentPositionId = 'pos-rop'
    }
  }

  return normalized
}

function mockRead(): TeamUser[] {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY)
    if (raw) {
      const normalized = mockNormalizeAccounts(JSON.parse(raw) as TeamUser[])
      mockWrite(normalized)
      return normalized
    }
  } catch {
    /* битый кэш — пересоздаём */
  }
  const seed = mockNormalizeAccounts(mockSeed())
  mockWrite(seed)
  return seed
}

function mockWrite(users: TeamUser[]): void {
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(users))
  } catch {
    /* localStorage недоступен — мок живёт только в памяти текущей сессии */
  }
}

function mockNewId(prefix = 'mock'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`
}

function mockEnsureSelf(): TeamUser {
  const users = mockRead()
  let selfId = ''
  let selfRole: TeamUser['role'] | undefined
  try {
    const current = JSON.parse(localStorage.getItem('agency.auth.current-user') || '{}') as {
      id?: string
      role?: TeamUser['role']
    }
    selfId =
      localStorage.getItem('userId') ||
      (JSON.parse(localStorage.getItem('user_data') || '{}') as { id?: string }).id ||
      current.id ||
      ''
    selfRole = current.role
  } catch {
    selfId = ''
  }
  if (!selfId) return users.find((u) => u.role === 'owner') ?? users[0]
  let self = users.find((u) => u.id === selfId)
  if (!self) self = users.find((u) => u.platformUserId === selfId)
  if (!self && selfRole) {
    const roleAccountId = DEMO_ROLE_ACCOUNT_ID[selfRole]
    if (roleAccountId) self = users.find((u) => u.id === roleAccountId)
  }
  if (!self && selfId.startsWith('demo-')) {
    return users.find((u) => u.role === 'owner') ?? users[0]
  }
  if (!self) {
    self = {
      id: selfId,
      platformUserId: selfId,
      teamId: MOCK_TEAM_ID,
      name: 'Вы',
      role: 'owner',
      position: 'Собственник',
      managerId: null,
      loginEmail: 'you@demo.local',
      email: 'you@demo.local',
      status: 'active',
      skills: [],
      permissionOverrides: {},
    }
    users.unshift(self)
    mockWrite(users)
  }
  return self
}

/** currentUser.positionId из AuthContext-кэша (agency.auth.current-user) — teamApi не имеет доступа к React-контексту напрямую, тот же источник, что mockEnsureSelf уже читает для userId. */
function readCurrentUserPositionId(): string | null {
  try {
    const current = JSON.parse(localStorage.getItem('agency.auth.current-user') || '{}') as { positionId?: string }
    return current.positionId ?? null
  } catch {
    return null
  }
}

function mockUploadAvatar(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
}

/** Реальный teamId — Mongo ObjectId (24 hex). Мок-идентификаторы ('default', 'c1') не проходят. */
const REAL_TEAM_ID_RE = /^[0-9a-f]{24}$/i

/** Реальная запись (позиция/команда) — id из Mongo. Решает per-call: мок или реальный API. */
const isRealId = (id?: string | null): boolean => !!id && REAL_TEAM_ID_RE.test(id)

/**
 * Демо-сессия (мок-логин из MOCK_USERS / enterAs): сессия теперь живёт в httpOnly
 * cookie (недоступна из JS), поэтому реальный логин помечает себя клиентским
 * boolean-флагом `crm_session_active` (см. AuthContext.login); мок/demo-вход его
 * удаляет. Мок-команда с вымышленными сотрудниками показывается ТОЛЬКО в
 * демо-сессиях; реальные пользователи всегда видят данные из БД (пустые слоты =
 * «не назначен»).
 */
function isDemoSession(): boolean {
  try {
    return !localStorage.getItem('crm_session_active')
  } catch {
    // Недоступный localStorage (приватный режим, заблокированные данные сайта,
    // встроенные webview) — это НЕ признак демо-сессии. Прежнее `true` означало,
    // что реальному сотруднику показали бы мок-команду с вымышленными людьми.
    // Безопасное направление ошибки здесь противоположное: считаем сессию
    // реальной и показываем настоящие данные, пусть даже пустые.
    //
    // Сейчас путь недостижим (USE_MOCK_TEAM_READ = false), но значение по
    // умолчанию должно быть верным на случай, если флаг снова включат.
    return false
  }
}

export interface EnsureTeamResult {
  teamId: string
  positions: TeamUser[]
}

export interface AssignOccupantResult {
  user: TeamUser
  /** true — привязан существующий пользователь платформы; false — создан новый (см. inviteToken). */
  linkedExisting: boolean
  /** Токен приглашения для нового пользователя; менеджер делится ссылкой вручную. */
  inviteToken: string | null
  inviteTokenExpiresAt?: string | null
}

export const teamApi = {
  async list(teamId = 'default'): Promise<TeamUser[]> {
    // USE_MOCK_TEAM_READ=false: этот блок сейчас недостижим (реальный backend
    // /team-users готов) — оставлен, не удалён, как единственный путь отката
    // на мок при необходимости (переключить константу обратно на true).
    // Реальный backend выводит organizationId из TenantContext (server-derived,
    // ADR-002), не из params.teamId — параметр ниже игнорируется реальным
    // backend, отправляется только для обратной совместимости с мок-путём.
    if (USE_MOCK_TEAM_READ && isDemoSession() && !REAL_TEAM_ID_RE.test(teamId)) {
      return mockRead().filter((u) => u.teamId === MOCK_TEAM_ID)
    }
    void teamId
    const { data } = await platformApi.get<ApiResponse<TeamUser[]>>('/api/v1/team-users')
    return data.data ?? []
  },

  /**
   * Автосоздание команды владельца: POST /team-users/ensure-team (без мока).
   * Идемпотентно; на бэке гейт по isOwner из JWT — для не-владельцев вернётся null,
   * ничего не создаётся. Безопасно звать на каждом старте сессии.
   */
  async ensureTeam(): Promise<EnsureTeamResult | null> {
    const { data } = await platformApi.post<ApiResponse<EnsureTeamResult | null>>('/api/v1/team-users/ensure-team')
    return data.data ?? null
  },

  /**
   * Возвращает null (не бросает), если backend вернул data:null —
   * TeamController.ensureSelf честно может отдать null (TenantContext
   * валиден, но позиция вызывающего не найдена в listForOrganization —
   * например, гонка между только что созданным PositionAssignment и этим
   * запросом). Раньше сигнатура лгала (Promise<TeamUser> при реально
   * возможном null) — AuthContext.login() читал .id/.role с null и падал
   * TypeError, что снаружи выглядело как "неверный логин/пароль", хотя
   * backend уже успешно аутентифицировал пользователя (см. AuthContext.tsx
   * login() комментарий на месте вызова).
   */
  async ensureSelf(): Promise<TeamUser | null> {
    // USE_MOCK_TEAM_READ=false: недостижимо сейчас (см. list() выше) — оставлен
    // как путь отката. Реальные сессии ходят на реальный /team-users/ensure-self.
    if (USE_MOCK_TEAM_READ && isDemoSession()) return mockEnsureSelf()
    const { data } = await platformApi.post<ApiResponse<TeamUser | null>>('/api/v1/team-users/ensure-self')
    return data.data ?? null
  },

  async getById(id: string): Promise<TeamUser> {
    if (USE_MOCK_TEAM && !isRealId(id)) {
      const user = mockRead().find((u) => u.id === id)
      if (!user) throw new Error('Аккаунт не найден')
      return user
    }
    const { data } = await api.get<ApiResponse<TeamUser>>(`/team-users/${id}`)
    return data.data
  },

  async create(payload: CreateTeamUserPayload): Promise<TeamUser> {
    if (USE_MOCK_TEAM_CREATE_UPDATE) {
      const users = mockRead()
      const id = mockNewId()
      const accountId = mockNewId('acc')
      const parent = payload.managerId ? users.find((u) => u.id === payload.managerId) : null
      const user: TeamUser = {
        id,
        platformUserId: accountId,
        teamId: MOCK_TEAM_ID,
        name: payload.name,
        role: payload.role,
        position: payload.position,
        managerId: payload.managerId ?? null,
        loginEmail: payload.loginEmail,
        email: payload.email ?? payload.loginEmail,
        status: 'active',
        phone: payload.phone,
        hireDate: payload.hireDate,
        birthDate: payload.birthDate,
        department: payload.department,
        city: payload.city,
        telegram: payload.telegram,
        aboutMe: payload.aboutMe,
        aboutCompany: payload.aboutCompany,
        skills: payload.skills ?? [],
        whatsapp: payload.whatsapp,
        vk: payload.vk,
        instagram: payload.instagram,
        website: payload.website,
        permissionOverrides: {},
        positionId: mockNewId('pos'),
        parentPositionId: parent ? parent.positionId ?? parent.id : payload.managerId ?? null,
        vacant: false,
        personalAccess: {},
        occupancyHistory: [{ accountId, name: payload.name, startedAt: nowIso(), endedAt: null }],
      }
      users.push(user)
      mockWrite(users)
      return user
    }
    const { data } = await api.post<ApiResponse<TeamUser>>('/team-users', payload)
    return data.data
  },

  async update(id: string, payload: UpdateTeamUserPayload): Promise<TeamUser> {
    if (USE_MOCK_TEAM_CREATE_UPDATE && !isRealId(id)) {
      const users = mockRead()
      const user = users.find((u) => u.id === id)
      if (!user) throw new Error('Аккаунт не найден')
      const { password: _password, ...fields } = payload
      void _password
      Object.assign(user, fields)
      mockWrite(users)
      return user
    }
    // Пароль на позиции не живёт (это поле платформенного пользователя — см. инвайт-флоу).
    const { password: _password, ...rest } = payload
    void _password
    const { data } = await api.patch<ApiResponse<TeamUser>>(`/team-users/positions/${id}`, rest)
    return data.data
  },

  async setStatus(id: string, status: TeamUserStatus): Promise<TeamUser> {
    if (USE_MOCK_TEAM_WRITE_BASIC && !isRealId(id)) {
      const users = mockRead()
      const user = users.find((u) => u.id === id)
      if (!user) throw new Error('Аккаунт не найден')
      user.status = status
      mockWrite(users)
      return user
    }
    const { data } = await api.patch<ApiResponse<TeamUser>>(`/team-users/positions/${id}/status`, { status })
    return data.data
  },

  async move(id: string, managerId: string | null): Promise<TeamUser> {
    if (USE_MOCK_TEAM_WRITE_BASIC && !isRealId(id)) {
      const users = mockRead()
      const user = users.find((u) => u.id === id)
      if (!user) throw new Error('Аккаунт не найден')
      user.managerId = managerId
      const parent = managerId ? users.find((u) => u.id === managerId) : null
      user.parentPositionId = parent ? parent.positionId ?? parent.id : managerId
      mockWrite(users)
      return user
    }
    const { data } = await api.patch<ApiResponse<TeamUser>>(`/team-users/positions/${id}/move`, { managerId })
    return data.data
  },

  /** Освободить позицию: текущий занимающий уходит, клиенты и доступы остаются на позиции. */
  async vacate(positionId: string): Promise<TeamUser> {
    if (USE_MOCK_TEAM_WRITE_BASIC && !isRealId(positionId)) {
      const users = mockRead()
      const pos = users.find((u) => (u.positionId ?? u.id) === positionId)
      if (!pos) throw new Error('Позиция не найдена')
      const open = (pos.occupancyHistory ?? []).find((h) => h.endedAt === null)
      if (open) open.endedAt = nowIso()
      pos.vacant = true
      pos.personalAccess = {}
      pos.name = ''
      pos.phone = undefined
      pos.telegram = undefined
      pos.loginEmail = ''
      pos.email = ''
      pos.platformUserId = ''
      pos.avatarUrl = undefined
      mockWrite(users)
      return pos
    }
    const { data } = await api.post<ApiResponse<TeamUser>>(`/team-users/positions/${positionId}/vacate`)
    return data.data
  },

  /**
   * Заполнить позицию человеком: профиль доступа и клиенты позиции достаются новому.
   * Линковка по email: существующий пользователь платформы привязывается как есть;
   * для нового создаётся запись (без пароля) и возвращается inviteToken — менеджер
   * делится ссылкой /invite/:token вручную, приглашённый сам ставит пароль.
   */
  async assignOccupant(
    positionId: string,
    occupant: { name: string; email: string; loginEmail: string; phone?: string; telegram?: string },
  ): Promise<AssignOccupantResult> {
    if (USE_MOCK_TEAM_ASSIGN && !isRealId(positionId)) {
      const users = mockRead()
      const pos = users.find((u) => (u.positionId ?? u.id) === positionId)
      if (!pos) throw new Error('Позиция не найдена')
      const open = (pos.occupancyHistory ?? []).find((h) => h.endedAt === null)
      if (open) open.endedAt = nowIso()
      const accountId = mockNewId('acc')
      pos.platformUserId = accountId
      pos.name = occupant.name
      pos.loginEmail = occupant.loginEmail
      pos.email = occupant.email
      pos.phone = occupant.phone
      pos.telegram = occupant.telegram
      pos.vacant = false
      pos.personalAccess = {}
      pos.occupancyHistory = [
        ...(pos.occupancyHistory ?? []),
        { accountId, name: occupant.name, startedAt: nowIso(), endedAt: null },
      ]
      mockWrite(users)
      return { user: pos, linkedExisting: false, inviteToken: null }
    }
    const { data } = await api.post<ApiResponse<AssignOccupantResult>>(
      `/team-users/positions/${positionId}/assign`,
      occupant,
    )
    return data.data
  },

  /** Активация приглашения (публичный эндпоинт): приглашённый ставит себе пароль. */
  async activateInvite(token: string, password: string): Promise<{ activated: boolean; email: string }> {
    const { data } = await api.post<ApiResponse<{ activated: boolean; email: string }>>(
      `/team-users/invite/${token}/activate`,
      { password },
    )
    return data.data
  },

  /** Создать пустую позицию-аккаунт без человека (только слоты менеджеров). */
  async createAccountSlot(payload: CreateTeamAccountSlotPayload): Promise<TeamUser> {
    if (USE_MOCK_TEAM && !isRealId(payload.managerId ?? undefined)) {
      const users = mockRead()
      const id = mockNewId('pos')
      const parent = payload.managerId ? users.find((u) => u.id === payload.managerId) : null
      const user: TeamUser = {
        id,
        platformUserId: '',
        teamId: MOCK_TEAM_ID,
        name: '',
        role: payload.role,
        position: payload.position,
        managerId: payload.managerId ?? null,
        loginEmail: '',
        email: '',
        status: 'active',
        skills: [],
        permissionOverrides: payload.accessProfile ?? {},
        positionId: id,
        parentPositionId: parent ? parent.positionId ?? parent.id : payload.managerId ?? null,
        vacant: true,
        accessProfile: payload.accessProfile ?? {},
        personalAccess: {},
        occupancyHistory: [],
      }
      users.push(user)
      mockWrite(users)
      return user
    }
    const { data } = await api.post<ApiResponse<TeamUser>>('/team-users/positions', payload)
    return data.data
  },

  async remove(id: string): Promise<void> {
    if (USE_MOCK_TEAM_WRITE_BASIC && !isRealId(id)) {
      mockWrite(mockRead().filter((u) => u.id !== id))
      return
    }
    await api.delete(`/team-users/positions/${id}`)
  },

  /**
   * НЕ multipart-загрузка через сервер (26.08.2026, honest gap закрыт) —
   * backend MediaModule устроен по intent-протоколу (ADR-008): (1) upload-
   * intent создаёт pending media_assets-запись + presigned URL; (2) клиент
   * грузит файл НАПРЯМУЮ в storage по этому URL, минуя API-процесс целиком;
   * (3) confirm верифицирует magic-byte MIME синхронно; (4) сервер асинхронно
   * (worker) генерирует публичные derivative-варианты, готовый avatarUrl
   * появляется не сразу на confirm, а после успешного PATCH .../avatar (тот
   * ответ уже содержит резолвленный URL, если worker успел, иначе позиция
   * подтянет его на следующем listForOrganization/ensureSelf — тот же
   * eventual-consistency паттерн, что и остальной async media-pipeline).
   * Тот же 3-шаговый протокол, что весь остальной upload в проекте, не
   * отдельный server-proxied путь только для аватара.
   */
  async uploadAvatar(file: File): Promise<string> {
    if (USE_MOCK_TEAM) return mockUploadAvatar(file)

    const positionId = readCurrentUserPositionId()
    if (!positionId) throw new Error('Не удалось определить текущую позицию для загрузки фото')

    // /media/upload-intent НЕ оборачивает ответ в {success,data} (см.
    // MediaController.createUploadIntent) — единственный endpoint этого
    // прохода без ApiResponse-обёртки, в отличие от team-users.
    const { data: intent } = await api.post<{ assetId: string; uploadUrl: string }>('/media/upload-intent', {
      declaredMimeType: file.type,
      sizeBytes: file.size,
      purpose: 'profile_avatar',
    })
    const { assetId, uploadUrl } = intent
    if (!assetId || !uploadUrl) throw new Error('Не удалось создать intent для загрузки фото')

    // Прямая загрузка в storage по presigned URL — НЕ через axios-инстанс
    // `api` (тот несёт withCredentials/baseURL этого backend'а, presigned
    // URL — отдельный домен MinIO/S3, credentials туда отправлять не нужно
    // и не следует).
    await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })

    const { data: confirmResult } = await api.post<{ status: 'verified' | 'rejected' }>(`/media/${assetId}/confirm`)
    if (confirmResult.status !== 'verified') throw new Error('Фото не прошло проверку — попробуйте другой файл')

    const { data: avatarBody } = await api.patch<ApiResponse<TeamUser>>(
      `/team-users/positions/${positionId}/avatar`,
      { assetId },
    )
    const avatarUrl = avatarBody.data?.avatarUrl
    if (!avatarUrl) {
      // verified, но worker ещё не построил derivative-варианты (async,
      // ADR-008) — не ошибка, просто URL появится на следующем обновлении
      // списка команды; клиенту возвращаем пустую строку, не бросаем.
      return ''
    }
    return avatarUrl
  },
}

export function teamUserToEmployee(user: TeamUser) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    position: user.position,
    managerId: user.managerId,
    phone: user.phone,
    email: user.email || user.loginEmail,
    hireDate: user.hireDate,
    birthDate: user.birthDate,
    department: user.department,
    city: user.city,
    telegram: user.telegram,
    aboutMe: user.aboutMe,
    skills: user.skills,
    whatsapp: user.whatsapp,
    vk: user.vk,
    instagram: user.instagram,
    website: user.website,
    avatarUrl: user.avatarUrl,
    loginEmail: user.loginEmail,
    platformUserId: user.platformUserId,
    status: user.status,
    permissionOverrides: user.permissionOverrides ?? {},
    positionId: user.positionId ?? user.id,
    parentPositionId: user.parentPositionId ?? user.managerId,
    vacant: user.vacant ?? false,
    occupancyHistory: user.occupancyHistory ?? [],
    accessProfile: user.accessProfile,
    personalAccess: user.personalAccess,
  }
}

export type TeamEmployee = ReturnType<typeof teamUserToEmployee>

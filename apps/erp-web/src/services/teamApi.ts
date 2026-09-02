import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'
import type {
  CreateTeamAccountSlotPayload,
  CreateTeamUserPayload,
  TeamUser,
  TeamUserStatus,
  UpdateTeamUserPayload,
} from '@/types/team'

/**
 * Реестр команды (TEAM-001, mock-долг закрыт 03.09.2026) ходит только на
 * Platform API — ни моков, ни localStorage как источника данных здесь больше
 * нет. `apps/api` вешает глобальный префикс `/api/v1` на все свои роуты
 * (main.api.ts: `setGlobalPrefix('api/v1', ...)`), поэтому каждый путь ниже
 * начинается с него.
 *
 * ДО этого прохода write-операции (create/update/setStatus/move/vacate/
 * assignOccupant/remove/uploadAvatar) ходили на отдельный axios-инстанс с
 * `CRM_API_BASE_URL` и БЕЗ префикса `/api/v1` — в dev это совпадало с
 * `PLATFORM_API_BASE_URL` случайно (оба указывают на localhost:3000), а в
 * production `CRM_API_BASE_URL` резолвится в `api-crm.baza.sale` — другой
 * backend, где `/team-users/...` не существует. То есть даже с
 * `USE_MOCK_TEAM_* = false` эти вызовы никогда не доходили до реального
 * TeamController в production и тихо 404'ились бы. Баг обнаружен и исправлен
 * в этом же проходе — единственный axios-инстанс `platformApi` ниже.
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

/** currentUser.positionId из AuthContext-кэша (agency.auth.current-user) — teamApi не имеет доступа к React-контексту напрямую, тот же источник, что AuthContext сам пишет при логине. */
function readCurrentUserPositionId(): string | null {
  try {
    const current = JSON.parse(localStorage.getItem('agency.auth.current-user') || '{}') as { positionId?: string }
    return current.positionId ?? null
  } catch {
    return null
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
  /** GET /api/v1/team-users — организация выводится сервером из TenantContext (ADR-002), параметров не принимает. */
  async list(): Promise<TeamUser[]> {
    const { data } = await platformApi.get<ApiResponse<TeamUser[]>>('/api/v1/team-users')
    return data.data ?? []
  },

  /**
   * Автосоздание команды владельца: POST /team-users/ensure-team.
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
    const { data } = await platformApi.post<ApiResponse<TeamUser | null>>('/api/v1/team-users/ensure-self')
    return data.data ?? null
  },

  /**
   * BLOCKER: backend не реализует `GET /team-users/:id` — TeamController
   * содержит только `list()` (всех позиций организации), отдельного
   * по-id эндпоинта нет. Вызов всегда получит 404, пока эндпоинт не появится
   * на стороне apps/api/src/modules/organizations/team.controller.ts. Не
   * подставляем мок вместо честной ошибки — единственный вызывающий код
   * (AccountSettingsPage.tsx) уже ловит отказ и остаётся на данных из
   * currentUser.
   */
  async getById(id: string): Promise<TeamUser> {
    const { data } = await platformApi.get<ApiResponse<TeamUser>>(`/api/v1/team-users/${id}`)
    return data.data
  },

  async create(payload: CreateTeamUserPayload): Promise<TeamUser> {
    const { data } = await platformApi.post<ApiResponse<TeamUser>>('/api/v1/team-users', payload)
    return data.data
  },

  async update(id: string, payload: UpdateTeamUserPayload): Promise<TeamUser> {
    // Пароль на позиции не живёт (это поле платформенного пользователя — см. инвайт-флоу).
    const { password: _password, ...rest } = payload
    void _password
    const { data } = await platformApi.patch<ApiResponse<TeamUser>>(`/api/v1/team-users/positions/${id}`, rest)
    return data.data
  },

  async setStatus(id: string, status: TeamUserStatus): Promise<TeamUser> {
    const { data } = await platformApi.patch<ApiResponse<TeamUser>>(`/api/v1/team-users/positions/${id}/status`, { status })
    return data.data
  },

  async move(id: string, managerId: string | null): Promise<TeamUser> {
    const { data } = await platformApi.patch<ApiResponse<TeamUser>>(`/api/v1/team-users/positions/${id}/move`, { managerId })
    return data.data
  },

  /** Освободить позицию: текущий занимающий уходит, клиенты и доступы остаются на позиции. */
  async vacate(positionId: string): Promise<TeamUser> {
    const { data } = await platformApi.post<ApiResponse<TeamUser>>(`/api/v1/team-users/positions/${positionId}/vacate`)
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
    const { data } = await platformApi.post<ApiResponse<AssignOccupantResult>>(
      `/api/v1/team-users/positions/${positionId}/assign`,
      occupant,
    )
    return data.data
  },

  /** Активация приглашения (публичный эндпоинт): приглашённый ставит себе пароль. */
  async activateInvite(token: string, password: string): Promise<{ activated: boolean; email: string }> {
    const { data } = await platformApi.post<ApiResponse<{ activated: boolean; email: string }>>(
      `/api/v1/team-users/invite/${token}/activate`,
      { password },
    )
    return data.data
  },

  /**
   * BLOCKER: backend не реализует `POST /team-users/positions` (пустая
   * позиция-слот без occupant'а) — TeamController.create требует полный
   * `CreateTeamUserDto` (name/loginEmail/password), то есть всегда создаёт
   * занятую позицию. Отдельного эндпоинта для «слота менеджера без человека»
   * нет. Вызов всегда получит 404, пока эндпоинт не появится на стороне
   * apps/api. Используется кнопкой «Добавить слот менеджера» в PersonnelPage —
   * там уже есть обработка ошибки (setTeamError), мок не подставляем.
   */
  async createAccountSlot(payload: CreateTeamAccountSlotPayload): Promise<TeamUser> {
    const { data } = await platformApi.post<ApiResponse<TeamUser>>('/api/v1/team-users/positions', payload)
    return data.data
  },

  async remove(id: string): Promise<void> {
    await platformApi.delete(`/api/v1/team-users/positions/${id}`)
  },

  /**
   * НЕ multipart-загрузка через сервер — backend MediaModule устроен по
   * intent-протоколу (ADR-008): (1) upload-intent создаёт pending
   * media_assets-запись + presigned URL; (2) клиент грузит файл НАПРЯМУЮ в
   * storage по этому URL, минуя API-процесс целиком; (3) confirm верифицирует
   * magic-byte MIME синхронно; (4) сервер асинхронно (worker) генерирует
   * публичные derivative-варианты, готовый avatarUrl появляется не сразу на
   * confirm, а после успешного PATCH .../avatar (тот ответ уже содержит
   * резолвленный URL, если worker успел, иначе позиция подтянет его на
   * следующем listForOrganization/ensureSelf — тот же eventual-consistency
   * паттерн, что и остальной async media-pipeline). Тот же 3-шаговый протокол,
   * что весь остальной upload в проекте, не отдельный server-proxied путь
   * только для аватара.
   */
  async uploadAvatar(file: File): Promise<string> {
    const positionId = readCurrentUserPositionId()
    if (!positionId) throw new Error('Не удалось определить текущую позицию для загрузки фото')

    // /media/upload-intent НЕ оборачивает ответ в {success,data} (см.
    // MediaController.createUploadIntent) — единственный endpoint этого
    // прохода без ApiResponse-обёртки, в отличие от team-users.
    const { data: intent } = await platformApi.post<{ assetId: string; uploadUrl: string }>(
      '/api/v1/media/upload-intent',
      {
        declaredMimeType: file.type,
        sizeBytes: file.size,
        purpose: 'profile_avatar',
      },
    )
    const { assetId, uploadUrl } = intent
    if (!assetId || !uploadUrl) throw new Error('Не удалось создать intent для загрузки фото')

    // Прямая загрузка в storage по presigned URL — НЕ через axios-инстанс
    // `platformApi` (тот несёт withCredentials/baseURL API-сервера, presigned
    // URL — отдельный домен MinIO/S3, credentials туда отправлять не нужно
    // и не следует).
    await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })

    const { data: confirmResult } = await platformApi.post<{ status: 'verified' | 'rejected' }>(
      `/api/v1/media/${assetId}/confirm`,
    )
    if (confirmResult.status !== 'verified') throw new Error('Фото не прошло проверку — попробуйте другой файл')

    const { data: avatarBody } = await platformApi.patch<ApiResponse<TeamUser>>(
      `/api/v1/team-users/positions/${positionId}/avatar`,
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

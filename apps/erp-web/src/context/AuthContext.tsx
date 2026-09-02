import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { teamApi } from '@/services/teamApi'
import { developersApi } from '@/services/developersApi'
import { platformAuthApi } from '@/services/platformAuthApi'
import type { CurrentUser } from '@/types/auth'
import type { AccountType, UserRole } from '@/types/auth'
import { ROLE_LABEL, ACCOUNT_TYPE_LABEL } from '@/lib/permissions'
import { messengerApi } from '@/services/messengerApi'
import { authenticateMessengerSocket } from '@/services/messengerSocket'

/** Mock-пользователи для демонстрации (по одному на каждую роль) */
export const MOCK_USERS: (CurrentUser & { password: string })[] = [
  {
    id: 'u1',
    name: 'Артём Власов',
    login: 'owner',
    password: '1',
    role: 'owner',
    accountType: 'agency',
    companyId: 'c1',
    companyName: 'Estate Group',
    avatarUrl: undefined,
  },
  {
    id: 'u2',
    name: 'Марина Петрова',
    login: 'director',
    password: '1',
    role: 'director',
    accountType: 'agency',
    companyId: 'c1',
    companyName: 'Estate Group',
    avatarUrl: undefined,
  },
  {
    id: 'u3',
    name: 'Дмитрий Коваль',
    login: 'rop',
    password: '1',
    role: 'rop',
    accountType: 'agency',
    companyId: 'c1',
    companyName: 'Estate Group',
    avatarUrl: undefined,
  },
  {
    id: 'lm-1',
    name: 'Анна Первичкина',
    login: 'manager',
    password: '1',
    role: 'manager',
    accountType: 'agency',
    companyId: 'c1',
    companyName: 'Estate Group',
    avatarUrl: undefined,
    mlsCircleVerified: false,
  },
  {
    id: 'lm-mls-1',
    name: 'Виктор MLS',
    login: 'mls-manager',
    password: '1',
    role: 'manager',
    accountType: 'agency',
    companyId: 'c1',
    companyName: 'Estate Group',
    avatarUrl: undefined,
    mlsCircleVerified: true,
  },
  {
    id: 'u-marketer',
    name: 'Олег Маркетов',
    login: 'marketer',
    password: '1',
    role: 'marketer',
    accountType: 'agency',
    companyId: 'c1',
    companyName: 'Estate Group',
    avatarUrl: undefined,
  },
  {
    id: 'u-admin',
    name: 'Мария Орлова',
    login: 'administrator',
    password: '1',
    role: 'administrator',
    accountType: 'agency',
    companyId: 'c1',
    companyName: 'Estate Group',
    avatarUrl: undefined,
  },
  {
    id: 'u-lawyer',
    name: 'Ирина Правова',
    login: 'lawyer',
    password: '1',
    role: 'lawyer',
    accountType: 'agency',
    companyId: 'c1',
    companyName: 'Estate Group',
    avatarUrl: undefined,
  },
  {
    id: 'u-procurement',
    name: 'Сергей Закупкин',
    login: 'procurement',
    password: '1',
    role: 'procurement_head',
    accountType: 'agency',
    companyId: 'c1',
    companyName: 'Estate Group',
    avatarUrl: undefined,
  },
  {
    id: 'u-trainee',
    name: 'Илья Стажеров',
    login: 'trainee',
    password: '1',
    role: 'trainee',
    accountType: 'agency',
    companyId: 'c1',
    companyName: 'Estate Group',
    avatarUrl: undefined,
  },
  {
    id: 'u-finance',
    name: 'Елена Балансова',
    login: 'finance',
    password: '1',
    role: 'finance',
    accountType: 'agency',
    companyId: 'c1',
    companyName: 'Estate Group',
    avatarUrl: undefined,
  },
  {
    id: 'u-developer',
    name: 'Никита Девелопер',
    login: 'developer',
    password: '1',
    role: 'developer',
    accountType: 'developer',
    companyId: 'dev-1',
    companyName: 'Development Group',
    avatarUrl: undefined,
  },
]

export type LoginResult = 'ok' | 'blocked' | 'invalid'

interface AuthContextValue {
  currentUser: CurrentUser | null
  login: (login: string, password: string) => Promise<LoginResult>
  /** Войти в кабинет как выбранный тип и роль (демо, без пароля) */
  enterAs: (accountType: AccountType, role: UserRole) => void
  logout: () => void
  toggleBlockUser: (userId: string) => void
  isUserBlocked: (userId: string) => boolean
  /** Частичное обновление профиля текущего пользователя (имя, аватар и т.д.) */
  updateProfile: (patch: Partial<CurrentUser>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const AUTH_STORAGE_KEY = 'agency.auth.current-user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
      return raw ? (JSON.parse(raw) as CurrentUser) : null
    } catch {
      return null
    }
  })
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      if (currentUser) {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser))
      } else {
        window.localStorage.removeItem(AUTH_STORAGE_KEY)
      }
    } catch {
      // Ошибки записи в хранилище игнорируем — состояние входа остаётся в памяти.
    }
  }, [currentUser])

  useEffect(() => {
    if (!currentUser?.companyId || currentUser.login === 'demo') return
    const msgrToken = localStorage.getItem('msgr_jwt_token')
    if (!msgrToken) return

      void messengerApi.syncTeam(currentUser.companyId).then((res) => {
      if (res.token) localStorage.setItem('msgr_jwt_token', res.token)
      if (res.refreshToken) localStorage.setItem('msgr_refresh_token', res.refreshToken)
      authenticateMessengerSocket()
    }).catch((error) => {
      console.warn('[Auth] Messenger team sync skipped:', error)
    })
  }, [currentUser?.companyId, currentUser?.login])

  /** После перезагрузки подтягиваем роль и профиль из team-users (актуально после link / смены прав). */
  useEffect(() => {
    // Сессия теперь живёт в httpOnly cookie, а не в localStorage — её не проверить
    // из JS. Если сессии нет, ensureSelf() сам получит 401 и отвалится в catch ниже.
    if (!currentUser?.id || currentUser.login === 'demo') return
    if (MOCK_USERS.some((u) => u.id === currentUser.id)) return

    let cancelled = false
    void teamApi
      .ensureSelf()
      .then((user) => {
        if (cancelled) return
        // null — валидный ответ (позиция ещё не назначена/ensure-team не успел,
        // см. teamApi.ensureSelf() докстринг), не ошибка — оставляем currentUser
        // как есть, тот же принцип, что .catch() ниже уже применяет к реальным
        // сбоям сети.
        if (!user) return
        // TeamUserRole (team.ts) исторически не включает 'developer' — тип
        // писался до ADR-016, backend (FixedRole) реально может отдать это
        // значение в рантайме для owner-позиции developer-организации, тип
        // здесь лжёт. Явный cast к UserRole (который 'developer' знает) для
        // сравнения ниже — не полагаемся на TS literal narrowing, который
        // всегда ложно посчитает user.role==='developer' недостижимым.
        const teamUserRole = user.role as unknown as UserRole
        // Роль developer не входит в оргструктуру команды (team-users) и приходит
        // только из реального логина. Не даём team-users (в т.ч. мок-данным при
        // USE_MOCK_TEAM) перезаписать developer другой ролью — иначе теряется
        // доступ к разделу «Девелопмент».
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                id: user.id,
                name: user.name ?? prev.name,
                role: prev.role === 'developer' ? 'developer' : (teamUserRole ?? prev.role),
                accountType: teamUserRole === 'developer' ? 'developer' : prev.accountType,
                // null (позиция ещё не занята / ensure-team не успел) не затирает
                // уже известную team-роль — например, засеянный owner.
                teamRole: (user.teamRole as UserRole | undefined) ?? prev.teamRole,
                positionId: user.positionId ?? prev.positionId,
                position: user.position ?? prev.position,
                phone: user.phone ?? prev.phone,
                telegram: user.telegram ?? prev.telegram,
                whatsapp: user.whatsapp ?? prev.whatsapp,
                aboutMe: user.aboutMe ?? prev.aboutMe,
                aboutCompany: user.aboutCompany ?? prev.aboutCompany,
                skills: user.skills ?? prev.skills,
                city: user.city ?? prev.city,
                birthDate: user.birthDate ?? prev.birthDate,
                department: user.department ?? prev.department,
                vk: user.vk ?? prev.vk,
                instagram: user.instagram ?? prev.instagram,
                website: user.website ?? prev.website,
                avatarUrl: user.avatarUrl ?? prev.avatarUrl,
                permissionOverrides: user.permissionOverrides ?? prev.permissionOverrides,
              }
            : prev,
        )
      })
      .catch(() => {
        /* team-users недоступен или id не team_user — оставляем кэш сессии */
      })

    // Автопровижининг команды владельца: create-or-return команды с дефолтной
    // оргструктурой. Гейт по isOwner из JWT на бэке — для не-владельцев вернётся
    // null, ничего не создаётся. Реальный teamId уходит в companyId, откуда его
    // берёт teamApi.list() (см. docs/tracking/teams-tracker.md §5).
    void teamApi
      .ensureTeam()
      .then((team) => {
        if (cancelled || !team?.teamId) return
        setCurrentUser((prev) => (prev ? { ...prev, companyId: team.teamId } : prev))
      })
      .catch(() => {
        /* эндпоинт ещё не задеплоен или недоступен — оставляем companyId из кэша */
      })

    // Реальный API застройщиков: create-or-return записи текущего пользователя.
    // Для ролей ≠ developer без записи вернётся null — безопасно звать всегда.
    void developersApi
      .ensureSelf()
      .then((profile) => {
        if (cancelled || !profile) return
        setCurrentUser((prev) =>
          prev ? { ...prev, companyName: profile.title || prev.companyName } : prev,
        )
      })
      .catch(() => {
        /* API застройщиков недоступен — оставляем companyName из кэша сессии */
      })

    return () => {
      cancelled = true
    }
  }, [currentUser?.id, currentUser?.login])

  async function login(login: string, password: string): Promise<LoginResult> {
    const normalizedLogin = login.trim().toLowerCase()
    
    // 1. Моковый логин
    const mockFound = MOCK_USERS.find(
      (u) => u.login.toLowerCase() === normalizedLogin && u.password === password,
    )
    
    if (mockFound) {
      if (blockedUserIds.has(mockFound.id)) return 'blocked'
      
      // Очищаем реальные токены при входе под моком
      localStorage.removeItem('jwt_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('msgr_jwt_token')
      localStorage.removeItem('msgr_refresh_token')
      localStorage.removeItem('userId')
      localStorage.removeItem('user_data')
      localStorage.removeItem('crm_session_active')
      
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _pw, ...user } = mockFound

      try {
        const msgrRes = await messengerApi.login(`${normalizedLogin}@demo.local`, password, {
          demoUserId: mockFound.id,
          teamId: mockFound.companyId,
          role: mockFound.role,
        });
        if (msgrRes.token) localStorage.setItem('msgr_jwt_token', msgrRes.token);
        if (msgrRes.refreshToken) localStorage.setItem('msgr_refresh_token', msgrRes.refreshToken);
        authenticateMessengerSocket();
      } catch (e) {
        console.warn('[Auth] Messenger login skipped for mock user', e);
      }

      setCurrentUser(user)
      return 'ok'
    }

    // 2. Реальный логин — через новый Platform API. Backend (ADR-004) ставит httpOnly cookie
    // с сессией — JS её не читает и не хранит; браузер сам прикладывает cookie к
    // последующим запросам (withCredentials: true на каждом axios-клиенте).
    try {
      const { identityId, requires2fa } = await platformAuthApi.login({ login: login.trim(), password })

      if (requires2fa) {
        // 2FA ещё не реализована на бэке — но раз пришёл этот флаг, вход не завершён.
        // Не притворяемся успешным логином.
        return 'invalid'
      }

      if (identityId) {
        // Флаг "это не demo/mock-сессия" для teamApi.ts (isDemoSession): сам логин
        // больше не оставляет JWT в localStorage (сессия — в httpOnly cookie), но
        // teamApi нужен синхронный клиентский признак, чтобы не подмешивать мок-команду
        // реальному пользователю. Не токен и не секрет — просто boolean-маркер.
        localStorage.setItem('crm_session_active', '1')

        // Параллельный логин в мессенджеры
        try {
          const msgrRes = await messengerApi.login(login.trim(), password);
          if (msgrRes.token) {
            localStorage.setItem('msgr_jwt_token', msgrRes.token);
          }
          if (msgrRes.refreshToken) {
            localStorage.setItem('msgr_refresh_token', msgrRes.refreshToken);
          }
          authenticateMessengerSocket();
        } catch (error) {
          console.error('[Auth] Messenger login failed:', error);
        }

        // /auth/login отдаёт только identityId — без role/companyId/имени. Дёргаем
        // тот же self-profile эндпоинт, что и useEffect ниже (teamApi.ensureSelf()),
        // сразу здесь, а не откладываем на следующий рендер: иначе currentUser с
        // одним id ушёл бы в setCurrentUser без role/companyId, и весь UI, завязанный
        // на роль (меню, доступы), на секунду отрисовался бы в невалидном состоянии.
        //
        // ИСПРАВЛЕНО (27.08.2026): ensureSelf() теперь в СВОЁМ отдельном try/catch,
        // не в общем catch этой функции — backend УЖЕ поставил session cookie на
        // предыдущем шаге (/auth/login успешен), сетевой сбой или null-ответ здесь
        // не должен превращать успешный логин в 'invalid'. Раньше (пока
        // USE_MOCK_TEAM_READ=true делал ensureSelf() чисто моковым, не бросающим)
        // это было безопасно случайно — сейчас USE_MOCK_TEAM_READ=false и
        // ensureSelf() делает реальный HTTP-запрос, который может упасть или
        // вернуть null (TeamController.ensureSelf честно может отдать null).
        let teamUser: Awaited<ReturnType<typeof teamApi.ensureSelf>> = null
        try {
          teamUser = await teamApi.ensureSelf()
        } catch (error) {
          console.error('[Auth] ensureSelf failed after successful login — proceeding with minimal profile:', error)
        }

        // null — валидная, не error-сессия (см. ensureSelf() докстринг): собираем
        // минимальный профиль из identityId, а не тихо репортим 'invalid' —
        // AuthContext useEffect ниже подтянет полный профиль на следующем рендере,
        // как только backend-состояние (PositionAssignment) станет согласованным.
        // TeamUserRole (team.ts) не включает 'developer' в типах (тип писался до
        // ADR-016) — backend реально может вернуть его в рантайме, cast явный.
        const teamUserRole = teamUser?.role as unknown as UserRole | undefined
        const accountType: AccountType = teamUserRole === 'developer' ? 'developer' : 'agency'
        const mappedUser: CurrentUser = {
          id: teamUser?.id ?? identityId,
          name: teamUser?.name || identityId,
          login: login.trim(),
          role: teamUserRole ?? 'manager',
          accountType,
          teamRole: teamUser?.teamRole as UserRole | undefined,
          positionId: teamUser?.positionId,
          companyId: teamUser?.teamId || 'c1',
          companyName: teamUser?.name || identityId,
          avatarUrl: teamUser?.avatarUrl,
          position: teamUser?.position,
          phone: teamUser?.phone,
          telegram: teamUser?.telegram,
          whatsapp: teamUser?.whatsapp,
          aboutMe: teamUser?.aboutMe,
          aboutCompany: teamUser?.aboutCompany,
          skills: teamUser?.skills ?? [],
          city: teamUser?.city,
          birthDate: teamUser?.birthDate,
          department: teamUser?.department,
          vk: teamUser?.vk,
          instagram: teamUser?.instagram,
          website: teamUser?.website,
          permissionOverrides: teamUser?.permissionOverrides ?? {},
        }

        setCurrentUser(mappedUser)
        return 'ok'
      }
    } catch (error) {
      console.error('[Auth] Real login failed:', error)
      return 'invalid'
    }

    return 'invalid'
  }

  function toggleBlockUser(userId: string) {
    setBlockedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  function isUserBlocked(userId: string): boolean {
    return blockedUserIds.has(userId)
  }

  function enterAs(accountType: AccountType, role: UserRole) {
    const companyName =
      accountType === 'internal' ? 'Платформа' : accountType === 'developer' ? 'Застройщик' : 'Estate Group'
      
    let id = `demo-${accountType}-${role}`
    let name = `${ROLE_LABEL[role]} · ${ACCOUNT_TYPE_LABEL[accountType]}`
    
    // Демо-менеджер агентства жёстко привязан к мок-пользователю для истории в CRM
    if (accountType === 'agency' && role === 'manager') {
      id = 'lm-1'
      name = 'Анна Первичкина'
    } else if (accountType === 'developer' && role === 'developer') {
      id = 'u-developer'
      name = 'Никита Девелопер'
    }

    // Очищаем реальные токены при демо-входе
    localStorage.removeItem('jwt_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('msgr_jwt_token')
    localStorage.removeItem('msgr_refresh_token')
    localStorage.removeItem('userId')
    localStorage.removeItem('user_data')
    localStorage.removeItem('crm_credentials')
    localStorage.removeItem('crm_session_active')

    setCurrentUser({
      id,
      name,
      login: 'demo',
      role,
      accountType,
      companyId: accountType === 'internal' ? 'platform' : accountType === 'developer' ? 'dev-1' : 'c1',
      companyName,
      avatarUrl: undefined,
    })
  }

  function logout() {
    // Серверный logout идемпотентен: UI очищается сразу, а cookie-сессия
    // отзывается в фоне. Ошибка сети не должна оставлять локальный экран
    // авторизованным и не раскрывает, была ли сессия валидна.
    void platformAuthApi.logout().catch((error: unknown) => {
      console.warn('[Auth] Platform logout request failed:', error)
    })
    localStorage.removeItem('jwt_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('msgr_jwt_token')
    localStorage.removeItem('msgr_refresh_token')
    localStorage.removeItem('userId')
    localStorage.removeItem('user_data')
    localStorage.removeItem('crm_credentials')
    localStorage.removeItem('crm_session_active')
    setCurrentUser(null)
  }

  function updateProfile(patch: Partial<CurrentUser>) {
    setCurrentUser((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  return (
    <AuthContext.Provider value={{ currentUser, login, enterAs, logout, toggleBlockUser, isUserBlocked, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

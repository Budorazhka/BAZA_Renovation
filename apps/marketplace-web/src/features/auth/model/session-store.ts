import { authApi } from '../api/auth-api'

export interface SessionState {
  isAuthenticated: boolean
  isChecking: boolean
  error: string | null
}

/**
 * Одно состояние сессии на всё приложение.
 *
 * Раньше `useAuthSession` держал состояние внутри себя, и каждый вызывающий
 * получал своё: `AuthPage`, `RequireAuth` и мастер публикации спрашивали сервер
 * по отдельности и приходили к разным выводам. Это не теория — на этом ловился
 * реальный отказ: после входа `AuthPage` уводил в кабинет, а `RequireAuth` со
 * своей проверкой тут же возвращал на форму, и человек видел мигание вместо
 * входа.
 *
 * Причина мигания была двойная, и вторую половину чинит `signIn` ниже: прежний
 * `login` ставил `isAuthenticated = true` по ответу входа, ничего не проверяя.
 * Ответ 200 на `POST /auth/login` означает «пароль верный», а не «сессия
 * работает» — между ними стоит cookie, которую браузер может и не принять.
 * Ровно так и было при отказе `GET /auth/session`: вход отвечал успехом,
 * сессии не возникало, а интерфейс уже считал человека вошедшим.
 *
 * Модульное состояние, а не React-контекст, — сознательно и по той же причине,
 * что в `favorites-store.ts`: хук вызывается из мест, у которых нет общего
 * предка (страница входа, гейт маршрута, мастер публикации), и оборачивать
 * каждое провайдером значило бы чинить одну проблему ценой правки всех
 * вызывающих.
 */
let state: SessionState = { isAuthenticated: false, isChecking: true, error: null }
const subscribers = new Set<(next: SessionState) => void>()
let inFlight: Promise<void> | null = null

function publish(next: SessionState) {
  state = next
  for (const notify of subscribers) notify(state)
}

export function getSessionState(): SessionState {
  return state
}

export function subscribeToSession(listener: (next: SessionState) => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

/**
 * Спрашивает сервер, жива ли сессия. Параллельные вызовы делят один запрос:
 * три хука, смонтированных одновременно, дают одну сетевую операцию.
 */
export function refreshSession(force = false): Promise<void> {
  if (inFlight && !force) return inFlight

  publish({ ...state, isChecking: true, error: null })
  inFlight = (async () => {
    try {
      const authenticated = await authApi.checkSession()
      publish({ isAuthenticated: authenticated, isChecking: false, error: null })
    } catch (err) {
      // `checkSession` сам гасит ошибки и отдаёт false, поэтому сюда попадают
      // только неожиданные сбои. Считать их «гостем» правильно: не пускать
      // безопаснее, чем пустить по неизвестному состоянию.
      publish({
        isAuthenticated: false,
        isChecking: false,
        error: err instanceof Error ? err.message : 'Ошибка проверки сессии',
      })
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/**
 * Вход с проверкой результата.
 *
 * После успешного ответа сессия перечитывается с сервера, а не считается
 * состоявшейся: только так «вошёл» в интерфейсе означает «сервер меня узнаёт».
 */
export async function signIn(login: string, password: string) {
  publish({ ...state, error: null })
  try {
    const result = await authApi.login(login, password)
    await refreshSession(true)
    return result
  } catch (err) {
    publish({
      ...state,
      isAuthenticated: false,
      isChecking: false,
      error: err instanceof Error ? err.message : 'Не удалось войти в аккаунт',
    })
    throw err
  }
}

/** Регистрация и сразу вход: `POST /auth/register` сессии не создаёт. */
export async function signUpAndSignIn(login: string, password: string) {
  publish({ ...state, error: null })
  try {
    await authApi.register(login, password)
  } catch (err) {
    publish({
      ...state,
      isChecking: false,
      error: err instanceof Error ? err.message : 'Не удалось создать аккаунт',
    })
    throw err
  }
  return signIn(login, password)
}

/**
 * Выход. Локально считаем сессию завершённой в любом случае: эндпоинт
 * идемпотентен и чистит cookie даже для протухшего токена, а оставить человека
 * «вошедшим» после нажатия «Выйти» хуже, чем показать ошибку сети.
 */
export async function signOut() {
  try {
    await authApi.logout()
    publish({ isAuthenticated: false, isChecking: false, error: null })
  } catch (err) {
    publish({
      isAuthenticated: false,
      isChecking: false,
      error: err instanceof Error ? err.message : 'Не удалось завершить сессию на сервере',
    })
  }
}

/** Только для тестов: вернуть состояние в исходное между прогонами. */
export function resetSessionStoreForTests() {
  state = { isAuthenticated: false, isChecking: true, error: null }
  inFlight = null
  subscribers.clear()
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getSessionState,
  refreshSession,
  signIn,
  signOut,
  signUpAndSignIn,
  subscribeToSession,
} from './session-store'

/**
 * Сессия текущего пользователя.
 *
 * Состояние общее на приложение (см. `session-store.ts`). Поверхность хука
 * сохранена прежней, чтобы вызывающие не менялись: `AuthPage`, `RequireAuth` и
 * мастер публикации продолжают работать как работали, но теперь видят одно и то
 * же состояние и делят один запрос к серверу вместо трёх.
 */
export function useAuthSession() {
  const [state, setState] = useState(getSessionState)

  useEffect(() => {
    const unsubscribe = subscribeToSession(setState)
    void refreshSession()
    return unsubscribe
  }, [])

  const checkStatus = useCallback(() => refreshSession(true), [])

  return useMemo(
    () => ({
      isAuthenticated: state.isAuthenticated,
      isChecking: state.isChecking,
      error: state.error,
      login: signIn,
      registerAndLogin: signUpAndSignIn,
      logout: signOut,
      checkStatus,
    }),
    [state.isAuthenticated, state.isChecking, state.error, checkStatus],
  )
}

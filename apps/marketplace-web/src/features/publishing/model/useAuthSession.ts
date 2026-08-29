import { useState, useEffect, useCallback } from 'react'
import { authApi } from '../api/auth-api'

export function useAuthSession() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const checkStatus = useCallback(async () => {
    setIsChecking(true)
    setError(null)
    try {
      const active = await authApi.checkSession()
      setIsAuthenticated(active)
    } catch (err: any) {
      setIsAuthenticated(false)
      setError(err.message || 'Ошибка проверки сессии')
    } finally {
      setIsChecking(false)
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  const login = useCallback(async (loginStr: string, passwordStr: string) => {
    setError(null)
    try {
      const result = await authApi.login(loginStr, passwordStr)
      setIsAuthenticated(true)
      return result
    } catch (err: any) {
      setError(err.message || 'Не удалось войти в аккаунт')
      throw err
    }
  }, [])

  const registerAndLogin = useCallback(async (loginStr: string, passwordStr: string) => {
    setError(null)
    try {
      // Step 1: Register identity
      await authApi.register(loginStr, passwordStr)
      // Step 2: Immediate login to set httpOnly session cookie
      const loginResult = await authApi.login(loginStr, passwordStr)
      setIsAuthenticated(true)
      return loginResult
    } catch (err: any) {
      setError(err.message || 'Не удалось создать аккаунт')
      throw err
    }
  }, [])

  const logout = useCallback(async () => {
    setError(null)
    try {
      await authApi.logout()
    } catch (err: any) {
      // The local session is still considered logged out if the network call
      // fails; the next server request will re-check the cookie honestly.
      setError(err.message || 'Не удалось завершить сессию на сервере')
    } finally {
      // Logout is intentionally best-effort in the UI. The server endpoint is
      // idempotent and clears the cookie even when the session is stale.
      setIsAuthenticated(false)
    }
  }, [])

  return {
    isAuthenticated: Boolean(isAuthenticated),
    isChecking,
    error,
    login,
    registerAndLogin,
    logout,
    checkStatus,
  }
}

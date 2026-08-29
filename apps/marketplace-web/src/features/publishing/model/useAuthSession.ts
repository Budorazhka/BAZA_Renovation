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
    const result = await authApi.login(loginStr, passwordStr)
    setIsAuthenticated(true)
    return result
  }, [])

  const registerAndLogin = useCallback(async (loginStr: string, passwordStr: string) => {
    setError(null)
    // Step 1: Register identity
    await authApi.register(loginStr, passwordStr)
    // Step 2: Immediate login to set httpOnly session cookie
    const loginResult = await authApi.login(loginStr, passwordStr)
    setIsAuthenticated(true)
    return loginResult
  }, [])

  const logout = useCallback(async () => {
    setError(null)
    await authApi.logout()
    setIsAuthenticated(false)
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

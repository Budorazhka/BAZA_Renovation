import { useEffect, useState } from 'react'
import { CRM_API_BASE_URL } from '@/config/backend'

let cachedStatus: boolean | null = null
let checkPromise: Promise<boolean> | null = null

function pingBackend(): Promise<boolean> {
  if (checkPromise) return checkPromise
  checkPromise = fetch(`${CRM_API_BASE_URL}/api/community/sections`, {
    method: 'HEAD',
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => r.ok)
    .catch(() => false)
    .then((ok) => {
      cachedStatus = ok
      return ok
    })
  return checkPromise
}

/**
 * Проверяет доступность CRM API при монтировании.
 * Результат кешируется — повторные вызовы не пингуют сервер.
 *
 * Возвращает:
 * - `null` — ещё не проверено
 * - `true` — бэкенд доступен (онлайн)
 * - `false` — бэкенд недоступен (оффлайн / моки)
 */
export function useBackendStatus(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(cachedStatus)

  useEffect(() => {
    if (cachedStatus !== null) {
      setOnline(cachedStatus)
      return
    }
    let alive = true
    pingBackend().then((ok) => {
      if (alive) setOnline(ok)
    })
    return () => { alive = false }
  }, [])

  return online
}

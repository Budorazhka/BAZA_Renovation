import { useEffect, useState } from 'react'
import {
  getProgressVersion,
  subscribeProgress,
  hydrateProgressFromServer,
} from './progress'

/**
 * Подписка на прогресс обучения + фоновая гидрация с сервера.
 *
 * Возвращает «версию», которая меняется при любом изменении прогресса
 * (локальном или после загрузки с сервера). Достаточно положить её в
 * зависимости useMemo, чтобы производные значения пересчитывались.
 */
export function useLmsProgress(): number {
  const [version, setVersion] = useState(getProgressVersion)

  useEffect(() => {
    const unsub = subscribeProgress(() => setVersion(getProgressVersion()))
    void hydrateProgressFromServer()
    return unsub
  }, [])

  return version
}

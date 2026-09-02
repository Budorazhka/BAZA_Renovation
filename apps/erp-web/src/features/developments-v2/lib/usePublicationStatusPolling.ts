import { useEffect } from 'react'
import { developmentsApiV2, type PublicationStatusResult } from '@/services/developmentsApiV2'

interface UsePublicationStatusPollingOptions {
  developmentId: string | null | undefined
  /** true только когда локальный статус === 'publication_pending' — родитель решает, когда стартовать. */
  enabled: boolean
  intervalMs?: number
  onStatusChange: (result: PublicationStatusResult) => void
}

const DEFAULT_INTERVAL_MS = 3000

/**
 * P1-фикс (StrictMode): module-level dedup, тот же приём, что в
 * DevelopmentManagementV2Page.tsx для initial-fetch. React 18 StrictMode
 * монтирует эффект дважды подряд (mount→cleanup→mount) синхронно — первый
 * void tick() успевает реально уйти в developmentsApiV2.getPublicationStatus
 * ДО того, как его cleanup выставит cancelled=true (cancelled проверяется
 * только после await, не блокирует сам факт вызова), так что без dedup
 * второе монтирование стартует ВТОРОЙ параллельный HTTP-запрос. Запись из
 * Map удаляется сразу после разрешения — следующий self-rescheduled тик
 * (уже после успешного первого монтирования, никакого StrictMode-повтора)
 * должен слать новый независимый запрос как обычно, не залипать на дедупе.
 */
const pollingTickInFlight = new Map<string, Promise<PublicationStatusResult>>()

function fetchStatusDedupedForTick(developmentId: string): Promise<PublicationStatusResult> {
  const existing = pollingTickInFlight.get(developmentId)
  if (existing) return existing
  const promise = developmentsApiV2.getPublicationStatus(developmentId).finally(() => {
    pollingTickInFlight.delete(developmentId)
  })
  pollingTickInFlight.set(developmentId, promise)
  return promise
}

/** Только для тестов — сбрасывает module-level dedup-кэш между тестовыми прогонами. */
export function __resetPollingDedupCacheForTests(): void {
  pollingTickInFlight.clear()
}

/**
 * D-03: узкий хук "опрашивать пока не терминальный статус, потом
 * остановиться" — НЕ то же самое, что бессрочный auto-refresh (см.
 * features/crm/hooks/useAutoRefresh.ts, рассчитан на другую задачу).
 * setTimeout self-rescheduling (не setInterval) — следующий тик планируется
 * только ПОСЛЕ завершения текущего запроса, защита от наложения без
 * отдельного guard-флага.
 */
export function usePublicationStatusPolling({
  developmentId,
  enabled,
  intervalMs = DEFAULT_INTERVAL_MS,
  onStatusChange,
}: UsePublicationStatusPollingOptions): void {
  useEffect(() => {
    if (!enabled || !developmentId) return

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    async function tick() {
      try {
        const result = await fetchStatusDedupedForTick(developmentId!)
        if (cancelled) return
        onStatusChange(result)
        // Терминальные статусы останавливают polling — не планируем следующий tick.
        if (result.status === 'published' || result.status === 'build_failed' || result.status === 'unpublished') {
          return
        }
        timeoutId = setTimeout(() => void tick(), intervalMs)
      } catch {
        // Сетевая ошибка САМОГО polling-запроса (не ошибка publish) — НЕ
        // останавливает polling: временный сбой сети/backend не должен
        // навсегда заморозить UI в publication_pending без дальнейших
        // попыток. Без exponential backoff — интервал уже достаточно
        // редкий, MVP-масштаб.
        if (!cancelled) {
          timeoutId = setTimeout(() => void tick(), intervalMs)
        }
      }
    }

    void tick() // первый запрос сразу, не ждать intervalMs

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [enabled, developmentId, intervalMs, onStatusChange])
}

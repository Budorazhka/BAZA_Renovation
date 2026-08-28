import { useCallback, useEffect, useState } from 'react'
import { MarketplaceApiError, marketplaceApi } from '../api/marketplace-api'
import type { PublicDevelopmentCard } from '../types/marketplace'

export type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; item: PublicDevelopmentCard }
  | { status: 'not-found' }
  | { status: 'error'; message: string; retry: () => void }

/**
 * D-04A: логика из DetailPage поднята сюда без изменения поведения.
 * 'not-found' покрывает и "никогда не существовал", и "publication_pending/
 * build_failed" — backend отдаёт identical 404 PUBLICATION_NOT_FOUND для
 * всех трёх (подтверждено интеграционными тестами D-03:
 * 'publication_pending НЕ виден...', 'build_failed НЕ виден...', оба 404).
 * Нет отдельного сигнала "существует, но ещё не готов" — намеренно не
 * выдумываю 'not-ready' вариант, который backend не может населить.
 */
export function useDevelopmentDetail(slug: string | undefined): DetailState {
  const [state, setState] = useState<DetailState>({ status: 'loading' })

  useEffect(() => {
    if (!slug) return
    // active-guard закрывает race при быстрой смене slug между рендерами:
    // React вызывает cleanup предыдущего эффекта ДО старта нового, но
    // fetch-промис предыдущего slug может резолвиться ПОЗЖЕ, чем уже
    // стартовавший запрос нового — без guard устаревший ответ перезаписал
    // бы state, актуальный для уже сменившегося slug.
    let active = true

    async function load() {
      setState({ status: 'loading' })
      try {
        const item = await marketplaceApi.getDevelopment(slug!)
        if (!active) return
        setState({ status: 'ready', item })
      } catch (cause) {
        if (!active) return
        if (cause instanceof MarketplaceApiError && cause.status === 404) {
          setState({ status: 'not-found' })
          return
        }
        const message = cause instanceof Error ? cause.message : 'Не удалось загрузить объект.'
        setState({ status: 'error', message, retry: () => void load() })
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [slug])

  return state
}

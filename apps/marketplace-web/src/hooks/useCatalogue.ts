import { useCallback, useEffect, useRef, useState } from 'react'
import { marketplaceApi } from '../api/marketplace-api'
import type { BoundingBox, PublicDevelopmentCard } from '../types/marketplace'

export type CatalogueState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; items: PublicDevelopmentCard[]; nextCursor: string | null; loadingMore: boolean }
  | { status: 'error'; message: string; retry: () => void }

export interface UseCatalogueQuery {
  city?: string
  bbox?: BoundingBox
}

/**
 * D-04A: логика из CataloguePage поднята сюда без изменения поведения —
 * discriminated union делает 'empty' (успешный fetch, 0 items) отдельным,
 * тестируемым вариантом вместо вложенного JSX-if внутри 'ready'. 400
 * (невалидный фильтр) и network failure (fetcher reject) оба попадают в
 * 'error' — на уровне hook'а это одинаково "запрос не удался", различение
 * не требуется как отдельный state (см. plan §6).
 */
export function useCatalogue(query: UseCatalogueQuery): { state: CatalogueState; loadMore: () => void } {
  const [state, setState] = useState<CatalogueState>({ status: 'loading' })
  // nextCursor читается из loadMore, который не должен пересоздаваться при
  // каждом изменении state — ref избегает лишней зависимости в useCallback.
  const nextCursorRef = useRef<string | null>(null)
  // Monotonic id текущего "актуального" запроса первой страницы — при
  // быстрой смене city/bbox между рендерами предыдущий fetch может
  // резолвиться ПОЗЖЕ уже стартовавшего нового; без guard устаревший ответ
  // перезаписал бы state, актуальный уже для другого фильтра.
  const requestIdRef = useRef(0)
  const { city, bbox } = query
  // Стабилизирует bbox для useCallback-зависимостей по значению, не по
  // ссылке — вызывающий код (CataloguePage) сегодня не передаёт bbox
  // вообще, но объект-литерал {minLng,...}, создаваемый заново на каждый
  // рендер без useMemo на вызывающей стороне, иначе пересоздавал бы
  // loadFirstPage/useEffect на каждый рендер — бесконечный цикл fetch→
  // setState→render→новый bbox-объект→новый fetch. bboxKey — примитив,
  // стабилен между рендерами при тех же значениях координат.
  const bboxKey = bbox ? `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}` : ''

  const loadFirstPage = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setState({ status: 'loading' })
    try {
      const response = await marketplaceApi.listDevelopments({ city: city || undefined, bbox, limit: 12 })
      if (requestIdRef.current !== requestId) return
      nextCursorRef.current = response.nextCursor
      if (response.items.length === 0) {
        setState({ status: 'empty' })
      } else {
        setState({ status: 'ready', items: response.items, nextCursor: response.nextCursor, loadingMore: false })
      }
    } catch (cause) {
      if (requestIdRef.current !== requestId) return
      nextCursorRef.current = null
      const message = cause instanceof Error ? cause.message : 'Не удалось загрузить каталог.'
      setState({ status: 'error', message, retry: () => void loadFirstPage() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, bboxKey])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  const loadMore = useCallback(() => {
    const cursor = nextCursorRef.current
    if (!cursor) return
    const requestId = requestIdRef.current
    setState((current) => (current.status === 'ready' ? { ...current, loadingMore: true } : current))
    void marketplaceApi.listDevelopments({ city: city || undefined, bbox, cursor, limit: 12 }).then(
      (response) => {
        if (requestIdRef.current !== requestId) return
        nextCursorRef.current = response.nextCursor
        setState((current) =>
          current.status === 'ready'
            ? { status: 'ready', items: [...current.items, ...response.items], nextCursor: response.nextCursor, loadingMore: false }
            : current,
        )
      },
      (cause: unknown) => {
        if (requestIdRef.current !== requestId) return
        const message = cause instanceof Error ? cause.message : 'Не удалось загрузить следующую страницу.'
        setState({ status: 'error', message, retry: () => void loadFirstPage() })
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, bboxKey, loadFirstPage])

  return { state, loadMore }
}

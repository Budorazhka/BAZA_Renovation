import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

interface Options {
  storageKey?: string
  initial?: number
  min?: number
  max?: number
  /** `x` — только по ширине (высота сетки не растёт, меньше лишней вертикальной прокрутки). `xy` — равномерный масштаб. */
  axes?: 'xy' | 'x'
  /**
   * Шахматка: при 100% контент на всю ширину скролл-контейнера (`1fr` по стоякам).
   * При зуме ≠ 1 ширина «базы» фиксируется в px и масштабируется.
   */
  layoutStretch?: boolean
}

/**
 * Управляет зумом блока контента так, чтобы внешний скролл-контейнер корректно
 * показывал горизонтальную/вертикальную прокрутку при увеличении.
 *
 * Реализация: `transform: scale()` или `scaleX()` + spacer-обёртка под ползунок скролла.
 * В режиме только по X высота спейсера совпадает с натуральной (нет роста высоты при зуме).
 * Натуральный размер измеряется `ResizeObserver`-ом (transform не меняет offsetWidth/Height).
 *
 *  <div className="overflow-auto">                ← scroll container
 *    <div style={wrapperStyle}>                   ← spacer (создаёт overflow)
 *      <div ref={innerRef} style={innerStyle}>    ← реально отрисованный контент
 *        ...
 *      </div>
 *    </div>
 *  </div>
 */
export function useZoomScale({
  storageKey,
  initial = 1,
  min = 0.5,
  max = 2,
  axes = 'xy',
  layoutStretch = false,
}: Options = {}) {
  const [zoom, setZoomState] = useState<number>(() => {
    if (typeof window === 'undefined') return initial
    if (!storageKey) return initial
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? Number.parseFloat(raw) : NaN
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : initial
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return
    window.localStorage.setItem(storageKey, String(zoom))
  }, [zoom, storageKey])

  const clamp = useCallback(
    (v: number) => {
      const r = Math.round(v * 100) / 100
      if (r < min) return min
      if (r > max) return max
      return r
    },
    [min, max],
  )

  const setZoom = useCallback((next: number) => setZoomState(clamp(next)), [clamp])
  const adjustZoom = useCallback((delta: number) => setZoomState((z) => clamp(z + delta)), [clamp])
  const resetZoom = useCallback(() => setZoomState(1), [])

  const innerRef = useRef<HTMLDivElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const measure = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      setNaturalSize((prev) => {
        if (prev && prev.w === w && prev.h === h) return prev
        return { w, h }
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const horizontalOnly = axes === 'x'

  const wrapperStyle: CSSProperties | undefined =
    naturalSize && zoom !== 1
      ? horizontalOnly
        ? { width: naturalSize.w * zoom, height: naturalSize.h }
        : { width: naturalSize.w * zoom, height: naturalSize.h * zoom }
      : undefined

  const innerStyle: CSSProperties = (() => {
    if (layoutStretch) {
      if (zoom === 1) {
        return { width: '100%', minWidth: 0, boxSizing: 'border-box' }
      }
      if (!naturalSize) {
        return { width: '100%', minWidth: 0, boxSizing: 'border-box' }
      }
      if (horizontalOnly) {
        return {
          width: `${naturalSize.w}px`,
          minWidth: 0,
          boxSizing: 'border-box',
          transform: `scaleX(${zoom})`,
          transformOrigin: 'top left',
        }
      }
      return {
        width: `${naturalSize.w}px`,
        height: `${naturalSize.h}px`,
        minWidth: 0,
        boxSizing: 'border-box',
        transform: `scale(${zoom})`,
        transformOrigin: 'top left',
      }
    }

    return zoom !== 1
      ? horizontalOnly
        ? {
            transform: `scaleX(${zoom})`,
            transformOrigin: 'top left',
            width: 'max-content',
          }
        : {
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            width: 'max-content',
          }
      : { width: 'max-content' }
  })()

  return { zoom, setZoom, adjustZoom, resetZoom, innerRef, wrapperStyle, innerStyle, min, max }
}

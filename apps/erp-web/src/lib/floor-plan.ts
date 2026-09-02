import type { UnitPolygon } from '@/store/useCoreStore'

export interface PlanContentBounds {
  left: number
  top: number
  width: number
  height: number
}

const CONTENT_BOUNDS_EPSILON = 1e-6
const contentBoundsCache = new Map<string, Promise<PlanContentBounds | null>>()

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function hasUsableBounds(bounds: PlanContentBounds | null | undefined): bounds is PlanContentBounds {
  return Boolean(bounds && bounds.width > CONTENT_BOUNDS_EPSILON && bounds.height > CONTENT_BOUNDS_EPSILON)
}

function createImageLoader(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load floor plan image: ${src}`))
    image.src = src
  })
}

export function remapPolygonToBounds(
  points: [number, number][],
  sourceBounds: PlanContentBounds | null | undefined,
  targetBounds: PlanContentBounds | null | undefined,
): [number, number][] {
  if (!hasUsableBounds(sourceBounds) || !hasUsableBounds(targetBounds)) {
    return points.map(([x, y]) => [x, y] as [number, number])
  }

  return points.map(([x, y]) => {
    const normalizedX = (x - sourceBounds.left) / sourceBounds.width
    const normalizedY = (y - sourceBounds.top) / sourceBounds.height
    return [
      clamp01(targetBounds.left + normalizedX * targetBounds.width),
      clamp01(targetBounds.top + normalizedY * targetBounds.height),
    ] as [number, number]
  })
}

export async function detectImageContentBounds(imageSrc: string): Promise<PlanContentBounds | null> {
  if (!imageSrc || typeof Image === 'undefined' || typeof document === 'undefined') return null

  const cached = contentBoundsCache.get(imageSrc)
  if (cached) return cached

  const pending = (async () => {
    const image = await createImageLoader(imageSrc)
    const naturalWidth = Math.max(1, image.naturalWidth || image.width || 1)
    const naturalHeight = Math.max(1, image.naturalHeight || image.height || 1)
    const scale = Math.min(1, 1600 / Math.max(naturalWidth, naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(naturalHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)

    let minX = canvas.width
    let minY = canvas.height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const index = (y * canvas.width + x) * 4
        const alpha = data[index + 3]
        if (alpha < 16) continue

        const red = data[index]
        const green = data[index + 1]
        const blue = data[index + 2]
        if (red > 248 && green > 248 && blue > 248) continue

        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }

    if (maxX < minX || maxY < minY) return null

    return {
      left: minX / canvas.width,
      top: minY / canvas.height,
      width: (maxX - minX + 1) / canvas.width,
      height: (maxY - minY + 1) / canvas.height,
    }
  })().catch(() => null)

  contentBoundsCache.set(imageSrc, pending)
  return pending
}

/**
 * Мержит контуры при копировании этажа: юниты из sourcePolygons добавляются/обновляются
 * по unitId, а остальные контуры targetPolygons сохраняются как есть.
 * Регрессия на инцидент 2026-07-01: раньше «Дублировать» заменял весь массив
 * полигонов этажа, стирая контуры, обрисованные вручную на других этажах.
 */
export function mergeCopiedPolygons(
  targetPolygons: UnitPolygon[],
  sourcePolygons: UnitPolygon[],
): UnitPolygon[] {
  const sourceUnitIds = new Set(sourcePolygons.map((p) => p.unitId))
  const preserved = targetPolygons.filter((p) => !sourceUnitIds.has(p.unitId))
  return [...preserved, ...sourcePolygons.map((p) => ({ ...p }))]
}

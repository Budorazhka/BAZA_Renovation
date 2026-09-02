import { describe, expect, it } from 'vitest'

import { mergeCopiedPolygons, remapPolygonToBounds } from '@/lib/floor-plan'

describe('mergeCopiedPolygons', () => {
  it('не стирает контуры юнитов, которых нет на исходном этаже', () => {
    const target = [
      { unitId: 'u-N025', points: [[0, 0]] as [number, number][] },
      { unitId: 'u-N026', points: [[1, 1]] as [number, number][] },
    ]
    const source = [{ unitId: 'u-N001', points: [[2, 2]] as [number, number][] }]

    const result = mergeCopiedPolygons(target, source)

    expect(result).toHaveLength(3)
    expect(result.find((p) => p.unitId === 'u-N025')).toEqual(target[0])
    expect(result.find((p) => p.unitId === 'u-N026')).toEqual(target[1])
    expect(result.find((p) => p.unitId === 'u-N001')).toEqual(source[0])
  })

  it('обновляет контур юнита, если он уже был на целевом этаже', () => {
    const target = [{ unitId: 'u-N001', points: [[0, 0]] as [number, number][] }]
    const source = [{ unitId: 'u-N001', points: [[9, 9]] as [number, number][] }]

    const result = mergeCopiedPolygons(target, source)

    expect(result).toEqual([{ unitId: 'u-N001', points: [[9, 9]] }])
  })

  it('пустой целевой этаж просто получает контуры источника', () => {
    const source = [{ unitId: 'u-N001', points: [[2, 2]] as [number, number][] }]

    expect(mergeCopiedPolygons([], source)).toEqual(source)
  })
})

describe('remapPolygonToBounds', () => {
  it('пересчитывает точки из рамки исходного плана в рамку целевого', () => {
    const points: [number, number][] = [
      [0.2, 0.25],
      [0.5, 0.55],
      [0.35, 0.4],
    ]

    const result = remapPolygonToBounds(
      points,
      { left: 0.1, top: 0.2, width: 0.5, height: 0.5 },
      { left: 0.2, top: 0.1, width: 0.25, height: 0.4 },
    )

    expect(result).toEqual([
      [0.25, 0.14],
      [0.4, 0.38],
      [0.325, 0.26],
    ])
  })

  it('без валидных рамок возвращает исходные точки', () => {
    const points: [number, number][] = [
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ]

    expect(remapPolygonToBounds(points, null, { left: 0.1, top: 0.1, width: 0.8, height: 0.8 })).toEqual(points)
    expect(remapPolygonToBounds(points, { left: 0.1, top: 0.1, width: 0.8, height: 0.8 }, null)).toEqual(points)
  })
})

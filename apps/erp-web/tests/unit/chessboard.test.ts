import { describe, expect, it } from 'vitest'

import type { IUnit } from '@/types/core'
import {
  buildChessboardSummary,
  buildUnitNumber,
  buildingNamePrefix,
  compactRoomsLabel,
  computeUnitTotalPrice,
  nextAutoNumber,
  roundArea,
} from '@/lib/chessboard'
import { normalizeRooms, normalizeViewType } from '@/lib/project-options'

// Минимальная фабрика лота — заполняем только поля, нужные для расчёта цены/сводки.
function unit(partial: Partial<IUnit>): IUnit {
  return {
    _id: 'u1',
    building: 'b1',
    number: 'A-0101',
    floor: 1,
    positionInFloor: 1,
    rooms: '1+1',
    area: 50,
    price: 0,
    pricePerSqm: 0,
    status: 'free',
    ...partial,
  } as IUnit
}

describe('roundArea', () => {
  it('убирает шум плавающей точки до 0.01', () => {
    expect(roundArea(51.099999999999994)).toBe(51.1)
    expect(roundArea(46.7)).toBe(46.7)
    expect(roundArea(55.555)).toBe(55.56)
  })

  it('возвращает undefined для не-чисел', () => {
    expect(roundArea(undefined)).toBeUndefined()
    expect(roundArea(null)).toBeUndefined()
    expect(roundArea(Number.NaN)).toBeUndefined()
  })
})

describe('normalizeRooms', () => {
  it('переводит лейблы мастера в канонические значения API', () => {
    expect(normalizeRooms('Студия')).toBe('studio')
    expect(normalizeRooms('1+1')).toBe('1+1')
    expect(normalizeRooms('2+1')).toBe('2+1')
    expect(normalizeRooms('3+1')).toBe('3+1')
    expect(normalizeRooms('4+1')).toBe('4+')
    expect(normalizeRooms('4+')).toBe('4+')
  })

  it('пустое значение → пустая строка, неизвестное — без изменений', () => {
    expect(normalizeRooms(undefined)).toBe('')
    expect(normalizeRooms('')).toBe('')
    expect(normalizeRooms('нечто')).toBe('нечто')
  })
})

describe('normalizeViewType', () => {
  it('переводит вид из окна в каноническое значение API', () => {
    expect(normalizeViewType('На двор')).toBe('yard')
    expect(normalizeViewType('На море')).toBe('sea')
    expect(normalizeViewType('На горы')).toBe('mountain')
    expect(normalizeViewType('На город')).toBe('city')
  })

  it('пусто или «—» → пустая строка', () => {
    expect(normalizeViewType(undefined)).toBe('')
    expect(normalizeViewType('—')).toBe('')
  })
})

describe('compactRoomsLabel', () => {
  // compactRoomsLabel возвращает каноническое значение ('studio', '1+1', …),
  // не переведённый лейбл — перевод для отображения делает вызывающая
  // сторона через optionLabel(t, 'rooms', …), см. docstring в lib/chessboard.ts.
  it('нормализует разные написания комнатности к каноническому виду', () => {
    expect(compactRoomsLabel('Студия')).toBe('studio')
    expect(compactRoomsLabel('studio')).toBe('studio')
    expect(compactRoomsLabel('1 + 1')).toBe('1+1')
    expect(compactRoomsLabel('2-комнатная')).toBe('2+1')
    expect(compactRoomsLabel('')).toBe('')
    expect(compactRoomsLabel(undefined)).toBe('')
  })
})

describe('computeUnitTotalPrice', () => {
  it('берёт price напрямую, когда нет finishPrices', () => {
    expect(computeUnitTotalPrice(unit({ price: 1000, area: 50, pricePerSqm: 20 }))).toBe(1000)
  })
})

describe('buildChessboardSummary', () => {
  it('считает статусы и выручку по броням', () => {
    const units = [
      unit({ _id: '1', status: 'free' }),
      unit({ _id: '2', status: 'booked', price: 100_000, pricePerSqm: 2000, area: 50 }),
      unit({ _id: '3', status: 'booked', price: 200_000, pricePerSqm: 2000, area: 100 }),
      unit({ _id: '4', status: 'sold' }),
      unit({ _id: '5', status: 'withdrawn' }),
    ]
    const s = buildChessboardSummary(units)
    expect(s.total).toBe(5)
    expect(s.free).toBe(1)
    expect(s.booked).toBe(2)
    expect(s.sold).toBe(1)
    expect(s.withdrawn).toBe(1)
    expect(s.bookedRevenue).toBe(300_000)
  })

  it('пустой список даёт нули', () => {
    expect(buildChessboardSummary([])).toEqual({
      total: 0,
      free: 0,
      booked: 0,
      sold: 0,
      withdrawn: 0,
      bookedRevenue: 0,
    })
  })
})

describe('buildUnitNumber / buildingNamePrefix / nextAutoNumber', () => {
  it('формирует номер лота с паддингом', () => {
    expect(buildUnitNumber('A', 3, 12)).toBe('A-0312')
    expect(buildUnitNumber('B', 1, 1)).toBe('B-0101')
  })

  it('извлекает префикс из названия корпуса', () => {
    expect(buildingNamePrefix('Block A')).toBe('A')
    expect(buildingNamePrefix('Корпус 3')).toBe('3')
    expect(buildingNamePrefix(undefined)).toBe('X')
  })

  it('подбирает первый свободный номер на этаже', () => {
    const existing = ['A-0101', 'A-0102']
    expect(nextAutoNumber('A', 1, existing)).toBe('A-0103')
    expect(nextAutoNumber('A', 2, existing)).toBe('A-0201')
  })
})

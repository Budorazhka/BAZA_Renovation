/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DevelopmentChessboardV2 } from '@/features/developments-v2/components/DevelopmentChessboardV2'
import type { FloorV2, UnitV2 } from '@/services/developmentsApiV2'

/**
 * D-02 COMPLETE: доказывает, что V2-шахматка рендерит этажи строками и
 * units клетками, порядок этажей меняется по возрастанию/убыванию, parking
 * рендерится обычной клеткой той же модели, цвет/label меняются по
 * статусу, фильтры kind/status client-side, пустой этаж показывает empty
 * state, компонент не читает useCoreStore/IProject/IUnit (нет
 * соответствующего мока в этом файле — реальное обращение к ним упало бы),
 * и не подмешивает никаких units сверх переданных пропсами.
 */

const floors: FloorV2[] = [
  { _id: 'f-1', buildingId: 'b-1', organizationId: 'org-1', floorNumber: 1, createdAt: '2026-08-27T00:00:00.000Z' },
  { _id: 'f-2', buildingId: 'b-1', organizationId: 'org-1', floorNumber: 2, createdAt: '2026-08-27T00:00:00.000Z' },
  { _id: 'f-3', buildingId: 'b-1', organizationId: 'org-1', floorNumber: 3, createdAt: '2026-08-27T00:00:00.000Z' },
]

function makeUnit(overrides: Partial<UnitV2>): UnitV2 {
  return {
    _id: 'u-default',
    buildingId: 'b-1',
    floorId: 'f-1',
    organizationId: 'org-1',
    number: '1',
    kind: 'apartment',
    area: 45,
    price: { amountMinorUnits: 10000000, currency: 'USD' },
    status: 'available',
    priceHistory: [],
    version: 0,
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  }
}

describe('DevelopmentChessboardV2', () => {
  afterEach(() => {
    cleanup()
  })

  it('рендерит этажи строками, units клетками', () => {
    const units = [
      makeUnit({ _id: 'u-1', floorId: 'f-1', number: '101' }),
      makeUnit({ _id: 'u-2', floorId: 'f-2', number: '201' }),
    ]

    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors, units, loading: false, error: null, onRetry: vi.fn(),
    }))

    expect(screen.getByTestId('chessboard-cell-u-1')).toBeDefined()
    expect(screen.getByTestId('chessboard-cell-u-2')).toBeDefined()
    expect(screen.getByText('Этаж 1')).toBeDefined()
    expect(screen.getByText('Этаж 2')).toBeDefined()
    expect(screen.getByText('Этаж 3')).toBeDefined()
  })

  it('порядок этажей меняется по возрастанию/убыванию', async () => {
    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors, units: [], loading: false, error: null, onRetry: vi.fn(),
    }))

    const floorLabels = () => screen.getAllByText(/^Этаж \d$/).map((el) => el.textContent)

    // Дефолт desc — верхний этаж (3) сверху.
    expect(floorLabels()).toEqual(['Этаж 3', 'Этаж 2', 'Этаж 1'])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Снизу вверх|Сверху вниз/i }))
    })

    expect(floorLabels()).toEqual(['Этаж 1', 'Этаж 2', 'Этаж 3'])
  })

  it('kind:parking рендерится как обычная клетка той же модели Unit', () => {
    const units = [makeUnit({ _id: 'u-parking', floorId: 'f-1', number: 'P-1', kind: 'parking' })]

    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors, units, loading: false, error: null, onRetry: vi.fn(),
    }))

    const cell = screen.getByTestId('chessboard-cell-u-parking')
    expect(cell).toBeDefined()
    expect(cell.getAttribute('data-unit-kind')).toBe('parking')
    expect(cell.textContent).toBe('P-1')
  })

  it('цвет/label меняются по статусу available/reserved/sold/hidden', () => {
    const units = [
      makeUnit({ _id: 'u-avail', floorId: 'f-1', number: '1', status: 'available' }),
      makeUnit({ _id: 'u-res', floorId: 'f-1', number: '2', status: 'reserved' }),
      makeUnit({ _id: 'u-sold', floorId: 'f-1', number: '3', status: 'sold' }),
      makeUnit({ _id: 'u-hidden', floorId: 'f-1', number: '4', status: 'hidden' }),
    ]

    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors, units, loading: false, error: null, onRetry: vi.fn(),
    }))

    expect(screen.getByTestId('chessboard-cell-u-avail').getAttribute('data-unit-status')).toBe('available')
    expect(screen.getByTestId('chessboard-cell-u-res').getAttribute('data-unit-status')).toBe('reserved')
    expect(screen.getByTestId('chessboard-cell-u-sold').getAttribute('data-unit-status')).toBe('sold')
    expect(screen.getByTestId('chessboard-cell-u-hidden').getAttribute('data-unit-status')).toBe('hidden')

    // Разные статусы получают разные классы фона (проверяем, что хотя бы
    // available и sold визуально различны — не один и тот же className).
    const availClass = screen.getByTestId('chessboard-cell-u-avail').className
    const soldClass = screen.getByTestId('chessboard-cell-u-sold').className
    expect(availClass).not.toBe(soldClass)
  })

  it('фильтр kind скрывает units другого типа (client-side)', async () => {
    const units = [
      makeUnit({ _id: 'u-apt', floorId: 'f-1', number: '1', kind: 'apartment' }),
      makeUnit({ _id: 'u-office', floorId: 'f-1', number: '2', kind: 'office' }),
    ]

    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors, units, loading: false, error: null, onRetry: vi.fn(),
    }))

    expect(screen.getByTestId('chessboard-cell-u-apt')).toBeDefined()
    expect(screen.getByTestId('chessboard-cell-u-office')).toBeDefined()

    const kindSelect = screen.getByDisplayValue('Все типы')
    await act(async () => {
      fireEvent.change(kindSelect, { target: { value: 'apartment' } })
    })

    expect(screen.getByTestId('chessboard-cell-u-apt')).toBeDefined()
    expect(screen.queryByTestId('chessboard-cell-u-office')).toBe(null)
  })

  it('фильтр status скрывает units другого статуса (client-side)', async () => {
    const units = [
      makeUnit({ _id: 'u-avail', floorId: 'f-1', number: '1', status: 'available' }),
      makeUnit({ _id: 'u-sold', floorId: 'f-1', number: '2', status: 'sold' }),
    ]

    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors, units, loading: false, error: null, onRetry: vi.fn(),
    }))

    const statusSelect = screen.getByDisplayValue('Все статусы')
    await act(async () => {
      fireEvent.change(statusSelect, { target: { value: 'sold' } })
    })

    expect(screen.queryByTestId('chessboard-cell-u-avail')).toBe(null)
    expect(screen.getByTestId('chessboard-cell-u-sold')).toBeDefined()
  })

  it('пустой floor показывает empty state', () => {
    const units = [makeUnit({ _id: 'u-1', floorId: 'f-1', number: '1' })]

    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors, units, loading: false, error: null, onRetry: vi.fn(),
    }))

    // f-2 и f-3 не имеют units в переданном массиве.
    expect(screen.getByTestId('chessboard-floor-empty-f-2')).toBeDefined()
    expect(screen.getByTestId('chessboard-floor-empty-f-3')).toBeDefined()
    expect(screen.queryByTestId('chessboard-floor-empty-f-1')).toBe(null)
  })

  it('нет этажей вообще → отдельный empty state для всей шахматки', () => {
    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors: [], units: [], loading: false, error: null, onRetry: vi.fn(),
    }))

    expect(screen.getByTestId('chessboard-empty')).toBeDefined()
    expect(screen.getByText('Нет этажей в этом корпусе')).toBeDefined()
  })

  it('loading состояние', () => {
    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors: [], units: [], loading: true, error: null, onRetry: vi.fn(),
    }))

    expect(screen.getByTestId('chessboard-loading')).toBeDefined()
  })

  it('error состояние с retry', async () => {
    const onRetry = vi.fn()
    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors: [], units: [], loading: false, error: 'Ошибка сети', onRetry,
    }))

    expect(screen.getByTestId('chessboard-error')).toBeDefined()
    expect(screen.getByText('Ошибка сети')).toBeDefined()

    await act(async () => {
      fireEvent.click(screen.getByText('Повторить'))
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('рендерит ровно переданные units, ни одного лишнего — никаких mock-подмешиваний', () => {
    const units = [makeUnit({ _id: 'u-only', floorId: 'f-1', number: '1' })]

    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors, units, loading: false, error: null, onRetry: vi.fn(),
    }))

    const allCells = screen.getAllByRole('button').filter((el) => el.getAttribute('data-testid')?.startsWith('chessboard-cell-'))
    expect(allCells).toHaveLength(1)
    expect(allCells[0]!.getAttribute('data-testid')).toBe('chessboard-cell-u-only')
  })

  it('клик по клетке вызывает onUnitClick с этим unit', async () => {
    const onUnitClick = vi.fn()
    const units = [makeUnit({ _id: 'u-1', floorId: 'f-1', number: '101' })]

    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors, units, loading: false, error: null, onRetry: vi.fn(), onUnitClick,
    }))

    await act(async () => {
      fireEvent.click(screen.getByTestId('chessboard-cell-u-1'))
    })

    expect(onUnitClick).toHaveBeenCalledWith(units[0])
  })

  it('без onUnitClick клик по клетке не падает', async () => {
    const units = [makeUnit({ _id: 'u-1', floorId: 'f-1', number: '101' })]

    render(createElement(DevelopmentChessboardV2, {
      buildingId: 'b-1', floors, units, loading: false, error: null, onRetry: vi.fn(),
    }))

    await act(async () => {
      fireEvent.click(screen.getByTestId('chessboard-cell-u-1'))
    })
    // Не выбросило исключение — тест проходит самим фактом завершения.
  })
})

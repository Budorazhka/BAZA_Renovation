/**
 * getBuildings возвращала `{ success: true, data: [] }` в catch — то есть
 * выдавала сбой за успешный ответ «зданий нет».
 *
 * Цена ошибки конкретная: useCoreStore на `success` пишет результат в стор,
 * поэтому обрыв сети превращал ЖК со зданиями в ЖК без зданий, ничем не
 * показав ошибку. Пользователь видел пустой корпусной список и мог принять
 * его за правду.
 *
 * Тест закрепляет границу: 404 на шахматке — это законное «шахматки ещё нет»
 * (ЖК просто не открывали в редакторе), а вот отказ сервера или сети обязан
 * вернуться как success:false, чтобы вызывающий сохранил ранее загруженные
 * данные вместо пустых.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()

vi.mock('axios', () => ({
  default: {
    create: () => ({ get: getMock, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }),
  },
}))

/** Ошибка в форме axios: статус лежит в response.status. */
function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } })
}

describe('developmentApi.getBuildings — сбой не выдаётся за пустой результат', () => {
  beforeEach(() => {
    getMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  for (const status of [500, 502, 403]) {
    it(`при ${status} возвращает success:false, а не пустой успех`, async () => {
      getMock.mockRejectedValue(httpError(status))

      const { developmentApi } = await import('@/services/developmentApi')
      const resp = await developmentApi.getBuildings('68b0000000000000000000aa')

      expect(resp.success).toBe(false)
    })
  }

  it('при сетевом сбое без HTTP-статуса тоже возвращает success:false', async () => {
    getMock.mockRejectedValue(new Error('Network Error'))

    const { developmentApi } = await import('@/services/developmentApi')
    const resp = await developmentApi.getBuildings('68b0000000000000000000aa')

    expect(resp.success).toBe(false)
  })
})

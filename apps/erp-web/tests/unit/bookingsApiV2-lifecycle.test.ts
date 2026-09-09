import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const postMock = vi.fn()
const getMock = vi.fn()

vi.mock('axios', () => ({
  default: {
    create: () => ({ post: postMock, get: getMock }),
  },
}))

describe('bookingsApiV2 — lifecycle operations', () => {
  beforeEach(() => {
    postMock.mockReset()
    getMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('create отправляет POST /api/v1/bookings с переданным или сгенерированным Idempotency-Key', async () => {
    const mockBooking = {
      id: 'book-1',
      unitId: 'unit-1',
      organizationId: 'org-1',
      leadId: 'lead-1',
      dateRange: { startsAt: '2026-09-07T00:00:00Z', expiresAt: '2026-09-14T00:00:00Z' },
      status: 'pending',
      manager: 'pos-1',
      createdAt: '2026-09-07T00:00:00Z',
    }
    postMock.mockResolvedValue({ data: mockBooking })
    const { bookingsApiV2 } = await import('@/services/bookingsApiV2')

    const payload = {
      unitId: 'unit-1',
      leadId: 'lead-1',
      startsAt: '2026-09-07T00:00:00Z',
      expiresAt: '2026-09-14T00:00:00Z',
    }
    const result = await bookingsApiV2.create(payload, 'idem-create-book')

    expect(result).toEqual(mockBooking)
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]!
    expect(url).toBe('/api/v1/bookings')
    expect(body).toEqual(payload)
    expect(config?.headers?.['Idempotency-Key']).toBe('idem-create-book')
  })

  it('getById отправляет GET /api/v1/bookings/:id', async () => {
    const mockBooking = { id: 'book-1', unitId: 'unit-1', status: 'booked' }
    getMock.mockResolvedValue({ data: mockBooking })
    const { bookingsApiV2 } = await import('@/services/bookingsApiV2')

    const result = await bookingsApiV2.getById('book-1')

    expect(result).toEqual(mockBooking)
    expect(getMock).toHaveBeenCalledWith('/api/v1/bookings/book-1')
  })

  it('convertToDeal отправляет POST /api/v1/bookings/:id/convert-to-deal с Idempotency-Key', async () => {
    const mockResult = {
      dealId: 'deal-1',
      bookingId: 'book-1',
      unitId: 'unit-1',
      status: 'converted',
    }
    postMock.mockResolvedValue({ data: mockResult })
    const { bookingsApiV2 } = await import('@/services/bookingsApiV2')

    const payload = {
      title: 'Сделка по квартире 101',
      dealType: 'primary' as const,
      expectedCommission: { amountMinorUnits: 150000, currency: 'USD' },
    }
    const result = await bookingsApiV2.convertToDeal('book-1', payload, 'idem-convert-1')

    expect(result).toEqual(mockResult)
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]!
    expect(url).toBe('/api/v1/bookings/book-1/convert-to-deal')
    expect(body).toEqual(payload)
    expect(config?.headers?.['Idempotency-Key']).toBe('idem-convert-1')
  })

  it('extend отправляет POST /api/v1/bookings/:id/extend с Idempotency-Key', async () => {
    const mockBooking = { id: 'book-1', unitId: 'unit-1', status: 'booked' }
    postMock.mockResolvedValue({ data: mockBooking })
    const { bookingsApiV2 } = await import('@/services/bookingsApiV2')

    const payload = {
      newExpiresAt: '2026-09-21T00:00:00Z',
      reason: 'Клиент оформляет ипотеку',
    }
    const result = await bookingsApiV2.extend('book-1', payload, 'idem-extend-1')

    expect(result).toEqual(mockBooking)
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]!
    expect(url).toBe('/api/v1/bookings/book-1/extend')
    expect(body).toEqual(payload)
    expect(config?.headers?.['Idempotency-Key']).toBe('idem-extend-1')
  })
})

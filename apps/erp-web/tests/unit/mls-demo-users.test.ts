import { describe, expect, it } from 'vitest'
import { MOCK_USERS } from '@/context/AuthContext'

describe('MLS demo users', () => {
  it('provides matching realtor accounts with and without MLS verification', () => {
    const regular = MOCK_USERS.find((user) => user.login === 'manager')
    const mls = MOCK_USERS.find((user) => user.login === 'mls-manager')

    expect(regular).toMatchObject({
      role: 'manager',
      accountType: 'agency',
      mlsCircleVerified: false,
    })
    expect(mls).toMatchObject({
      role: 'manager',
      accountType: 'agency',
      mlsCircleVerified: true,
    })
    expect(mls?.companyId).toBe(regular?.companyId)
    expect(mls?.companyName).toBe(regular?.companyName)
  })
})

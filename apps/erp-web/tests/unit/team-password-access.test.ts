import { describe, expect, it } from 'vitest'
import { canManageTeamPasswords } from '../../src/lib/team-password-access'

describe('canManageTeamPasswords', () => {
  it('allows only the agency owner and the developer account owner', () => {
    expect(canManageTeamPasswords({ role: 'owner', accountType: 'agency' })).toBe(true)
    expect(canManageTeamPasswords({ role: 'developer', accountType: 'developer' })).toBe(true)
  })

  it('denies directors and every mismatched role or account type', () => {
    expect(canManageTeamPasswords({ role: 'director', accountType: 'agency' })).toBe(false)
    expect(canManageTeamPasswords({ role: 'owner', accountType: 'developer' })).toBe(false)
    expect(canManageTeamPasswords({ role: 'developer', accountType: 'agency' })).toBe(false)
    expect(canManageTeamPasswords({ role: 'rop', accountType: 'agency' })).toBe(false)
    expect(canManageTeamPasswords(null)).toBe(false)
  })
})

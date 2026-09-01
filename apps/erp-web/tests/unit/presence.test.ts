import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRESENCE_STATUS,
  getPresenceStorageKey,
  parsePresenceStatus,
  readPresenceStatus,
  writePresenceStatus,
} from '@/lib/presence'

describe('presence status', () => {
  it('accepts only the supported Outlook-style statuses', () => {
    expect(parsePresenceStatus('online')).toBe('online')
    expect(parsePresenceStatus('away')).toBe('away')
    expect(parsePresenceStatus('offline')).toBe('offline')
    expect(parsePresenceStatus('busy')).toBe(DEFAULT_PRESENCE_STATUS)
    expect(parsePresenceStatus(null)).toBe(DEFAULT_PRESENCE_STATUS)
  })

  it('stores and reads a status per user', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    writePresenceStatus(storage, 'user-1', 'away')

    expect(getPresenceStorageKey('user-1')).toBe('agency.presence.status.user-1')
    expect(readPresenceStatus(storage, 'user-1')).toBe('away')
    expect(readPresenceStatus(storage, 'user-2')).toBe(DEFAULT_PRESENCE_STATUS)
  })
})

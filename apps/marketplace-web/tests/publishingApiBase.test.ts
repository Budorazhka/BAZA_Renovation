import { describe, expect, it } from 'vitest'
import { resolveApiBaseUrl } from '../src/features/publishing/api/api-base'

describe('publishing API base URL', () => {
  it('uses the repository default prefix when Vite did not provide a value', () => {
    expect(resolveApiBaseUrl()).toBe('/api/v1')
    expect(resolveApiBaseUrl('')).toBe('/api/v1')
  })

  it('does not duplicate /api/v1 when the reverse proxy path is configured', () => {
    expect(resolveApiBaseUrl('/api/v1')).toBe('/api/v1')
    expect(resolveApiBaseUrl('/api/v1/')).toBe('/api/v1')
    expect(resolveApiBaseUrl('https://api.example.test/api/v1/')).toBe('https://api.example.test/api/v1')
  })

  it('adds the versioned path to an origin-only API URL', () => {
    expect(resolveApiBaseUrl('https://api.example.test')).toBe('https://api.example.test/api/v1')
  })
})

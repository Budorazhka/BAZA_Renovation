import { describe, expect, it } from 'vitest'
import { resolveMapStyleUrl } from '../src/lib/map-config'

describe('resolveMapStyleUrl', () => {
  it('treats missing and whitespace-only values as unconfigured', () => {
    expect(resolveMapStyleUrl(undefined)).toBeUndefined()
    expect(resolveMapStyleUrl('   ')).toBeUndefined()
  })

  it('treats the committed environment placeholder as unconfigured', () => {
    expect(resolveMapStyleUrl('REPLACE_ME_OSM_COMPATIBLE_STYLE_URL')).toBeUndefined()
  })

  it('trims and preserves a configured provider style URL', () => {
    expect(resolveMapStyleUrl('  https://maps.example/style.json  ')).toBe('https://maps.example/style.json')
    expect(resolveMapStyleUrl('inline-test-style')).toBe('inline-test-style')
  })
})

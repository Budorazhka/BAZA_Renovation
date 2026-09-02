import { describe, expect, it } from 'vitest'

import { en } from '@/i18n/dictionaries/en'
import { es } from '@/i18n/dictionaries/es'
import { ka } from '@/i18n/dictionaries/ka'
import { ru } from '@/i18n/dictionaries/ru'
import { tr } from '@/i18n/dictionaries/tr'

function leafKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('developer analytics translations', () => {
  it('keeps complete non-empty copy in all supported languages', () => {
    const dictionaries = { ru, en, ka, es, tr }
    const requiredKeys = leafKeys(ru.developerAnalytics)

    for (const [language, dictionary] of Object.entries(dictionaries)) {
      for (const key of requiredKeys) {
        const value = key.split('.').reduce<unknown>((current, part) => {
          if (!current || typeof current !== 'object') return undefined
          return (current as Record<string, unknown>)[part]
        }, dictionary.developerAnalytics)

        expect(value, `Missing developerAnalytics.${key} in ${language}`).toEqual(expect.any(String))
        expect((value as string).trim(), `Empty developerAnalytics.${key} in ${language}`).not.toBe('')
      }
    }
  })
})

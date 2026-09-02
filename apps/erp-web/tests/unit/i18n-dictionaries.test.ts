import { describe, expect, it } from 'vitest'

import { ru } from '@/i18n/dictionaries/ru'
import { en } from '@/i18n/dictionaries/en'
import { ka } from '@/i18n/dictionaries/ka'

/** Рекурсивно собирает все «листовые» ключи объекта в путях через точку. */
function collectLeafKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix]
  if (Array.isArray(value)) return [prefix]

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return [prefix]

  return entries.flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return collectLeafKeys(child, path)
  })
}

describe('i18n dictionaries', () => {
  it('оба словаря содержат одинаковый набор ключей', () => {
    const ruKeys = new Set(collectLeafKeys(ru))
    const dictionaries = { en, ka }

    for (const [lang, dict] of Object.entries(dictionaries)) {
      const keys = new Set(collectLeafKeys(dict))
      const onlyInRu = [...ruKeys].filter((key) => !keys.has(key))
      const onlyInLang = [...keys].filter((key) => !ruKeys.has(key))
      expect(onlyInRu, `Missing in ${lang}`).toEqual([])
      expect(onlyInLang, `Extra in ${lang}`).toEqual([])
    }
  })

  it('ни один перевод не содержит пустую строку', () => {
    const emptyRu = collectLeafKeys(ru).filter((key) => {
      const val = key.split('.').reduce<any>((acc, part) => acc?.[part], ru)
      return typeof val === 'string' && val.trim() === ''
    })
    expect(emptyRu).toEqual([])

    const dictionaries = { en, ka }
    for (const [lang, dict] of Object.entries(dictionaries)) {
      const emptyKeys = collectLeafKeys(dict).filter((key) => {
        const val = key.split('.').reduce<any>((acc, part) => acc?.[part], dict)
        return typeof val === 'string' && val.trim() === ''
      })
      expect(emptyKeys, `Empty strings in ${lang}`).toEqual([])
    }
  })
})

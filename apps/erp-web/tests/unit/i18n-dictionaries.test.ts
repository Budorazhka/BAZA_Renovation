import { describe, expect, it } from 'vitest'

import { ru } from '@/i18n/dictionaries/ru'
import { en } from '@/i18n/dictionaries/en'
import { ka } from '@/i18n/dictionaries/ka'
import { es } from '@/i18n/dictionaries/es'
import { tr } from '@/i18n/dictionaries/tr'

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

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{(\w+)\}/g) || []
  return matches.map((m) => m.replace(/[{}]/g, '')).sort()
}

describe('i18n dictionaries', () => {
  const allDicts = { en, ka, es, tr }

  it('все 5 словарей (ru, en, ka, es, tr) содержат одинаковый набор ключей', () => {
    const ruKeys = new Set(collectLeafKeys(ru))

    for (const [lang, dict] of Object.entries(allDicts)) {
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

    for (const [lang, dict] of Object.entries(allDicts)) {
      const emptyKeys = collectLeafKeys(dict).filter((key) => {
        const val = key.split('.').reduce<any>((acc, part) => acc?.[part], dict)
        return typeof val === 'string' && val.trim() === ''
      })
      expect(emptyKeys, `Empty strings in ${lang}`).toEqual([])
    }
  })

  it('плейсхолдеры {name} согласованы между ru и остальными словарями', () => {
    const ruKeys = collectLeafKeys(ru)
    const mismatches: Array<{ key: string; lang: string; expected: string[]; actual: string[] }> = []

    for (const key of ruKeys) {
      const ruVal = key.split('.').reduce<any>((acc, part) => acc?.[part], ru)
      if (typeof ruVal !== 'string') continue
      const ruPlaceholders = extractPlaceholders(ruVal)
      if (ruPlaceholders.length === 0) continue

      for (const [lang, dict] of Object.entries(allDicts)) {
        const langVal = key.split('.').reduce<any>((acc, part) => acc?.[part], dict)
        if (typeof langVal === 'string') {
          const langPlaceholders = extractPlaceholders(langVal)
          if (JSON.stringify(langPlaceholders) !== JSON.stringify(ruPlaceholders)) {
            mismatches.push({
              key,
              lang,
              expected: ruPlaceholders,
              actual: langPlaceholders,
            })
          }
        }
      }
    }

    expect(mismatches).toEqual([])
  })
})

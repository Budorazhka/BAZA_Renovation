import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { en } from './locales/en'
import { ka } from './locales/ka'
import { ru } from './locales/ru'
import type { FormatDate, FormatNumber, Language, Translate, TranslationTree } from './types'

export const LANGUAGE_STORAGE_KEY = 'baza:marketplace:lang'

const dictionaries: Record<Language, TranslationTree> = {
  ru,
  en,
  ka,
}

export type I18nContextValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: Translate
  formatDate: FormatDate
  formatNumber: FormatNumber
}

const I18nContext = createContext<I18nContextValue | null>(null)

function isLanguage(value: string | null): value is Language {
  return value === 'ru' || value === 'en' || value === 'ka'
}

function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'ru'
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return isLanguage(stored) ? stored : 'ru'
}

function resolveTranslation(dictionary: TranslationTree, key: string): string | undefined {
  const value = key.split('.').reduce<string | TranslationTree | undefined>((current, part) => {
    if (!current || typeof current === 'string') return undefined
    return current[part]
  }, dictionary)

  return typeof value === 'string' ? value : undefined
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match
  })
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getStoredLanguage)

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    }
  }, [language])

  const t: Translate = useCallback(
    (key, paramsOrFallback) => {
      let params: Record<string, string | number> | undefined
      let fallbackOverride: string | undefined

      if (typeof paramsOrFallback === 'string') {
        fallbackOverride = paramsOrFallback
      } else {
        params = paramsOrFallback
      }

      const translation = resolveTranslation(dictionaries[language], key)
      if (translation !== undefined) return interpolate(translation, params)

      const fallback = resolveTranslation(dictionaries['ru'], key)
      if (fallback !== undefined) return interpolate(fallback, params)

      return interpolate(fallbackOverride ?? key, params)
    },
    [language],
  )

  const formatDate: FormatDate = useCallback(
    (date, options) => {
      try {
        return new Intl.DateTimeFormat(language === 'ka' ? 'ka-GE' : language === 'en' ? 'en-US' : 'ru-RU', options).format(new Date(date))
      } catch {
        return String(date)
      }
    },
    [language],
  )

  const formatNumber: FormatNumber = useCallback(
    (value, options) => {
      try {
        return new Intl.NumberFormat(language === 'ka' ? 'ka-GE' : language === 'en' ? 'en-US' : 'ru-RU', options).format(value)
      } catch {
        return String(value)
      }
    },
    [language],
  )

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      formatDate,
      formatNumber,
    }),
    [language, setLanguage, t, formatDate, formatNumber],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}

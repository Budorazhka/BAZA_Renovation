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

/**
 * Читает выбранный язык вне React-дерева — нужно плоским утилитам вроде
 * useSeoMetadata, которые выставляют `document.title` ещё до первого рендера
 * компонента и не могут дождаться `useI18n`.
 */
export function getStoredLanguage(): Language {
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

function localeOf(language: Language): string {
  return language === 'ka' ? 'ka-GE' : language === 'en' ? 'en-US' : 'ru-RU'
}

function translate(language: Language, key: string, paramsOrFallback?: Record<string, string | number> | string): string {
  let params: Record<string, string | number> | undefined
  let fallbackOverride: string | undefined

  if (typeof paramsOrFallback === 'string') {
    fallbackOverride = paramsOrFallback
  } else {
    params = paramsOrFallback
  }

  const translation = resolveTranslation(dictionaries[language], key)
  if (translation !== undefined) return interpolate(translation, params)

  const fallback = resolveTranslation(dictionaries.ru, key)
  if (fallback !== undefined) return interpolate(fallback, params)

  return interpolate(fallbackOverride ?? key, params)
}

/**
 * Значение вне провайдера: язык по умолчанию «ru», переключение недоступно.
 * Нужно юнит-тестам, которые рендерят один компонент или хук без всего
 * дерева приложения, — бросать здесь было бы неверно: тест не про перевод,
 * а `useI18n` вызывается транзитивно из десятков мест.
 *
 * Один и тот же объект на все вызовы, а не новый при каждом рендере: `t` и
 * остальные поля стоят в зависимостях чужих `useCallback`/`useEffect`
 * (например, автозагрузки каталога), и новая ссылка на каждый рендер
 * запускала бы их заново по кругу.
 */
const FALLBACK_LANGUAGE: Language = 'ru'
const FALLBACK_VALUE: I18nContextValue = {
  language: FALLBACK_LANGUAGE,
  setLanguage: () => {},
  t: (key, paramsOrFallback) => translate(FALLBACK_LANGUAGE, key, paramsOrFallback),
  formatDate: (date, options) => {
    try {
      return new Intl.DateTimeFormat(localeOf(FALLBACK_LANGUAGE), options).format(new Date(date))
    } catch {
      return String(date)
    }
  },
  formatNumber: (value, options) => {
    try {
      return new Intl.NumberFormat(localeOf(FALLBACK_LANGUAGE), options).format(value)
    } catch {
      return String(value)
    }
  },
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
    (key, paramsOrFallback) => translate(language, key, paramsOrFallback),
    [language],
  )

  const formatDate: FormatDate = useCallback(
    (date, options) => {
      try {
        return new Intl.DateTimeFormat(localeOf(language), options).format(new Date(date))
      } catch {
        return String(date)
      }
    },
    [language],
  )

  const formatNumber: FormatNumber = useCallback(
    (value, options) => {
      try {
        return new Intl.NumberFormat(localeOf(language), options).format(value)
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

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  return context ?? FALLBACK_VALUE
}

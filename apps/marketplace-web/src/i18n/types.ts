export type Language = 'ru' | 'en' | 'ka'

export type TranslationTree = {
  readonly [key: string]: string | TranslationTree
}

export type Translate = (
  key: string,
  paramsOrFallback?: Record<string, string | number> | string,
) => string

export type FormatDate = (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string
export type FormatNumber = (value: number, options?: Intl.NumberFormatOptions) => string

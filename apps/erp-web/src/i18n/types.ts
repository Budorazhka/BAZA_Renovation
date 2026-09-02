import { ru } from './dictionaries/ru'

export type Language = 'ru' | 'en' | 'ka' | 'es' | 'tr'

export type TranslationTree = {
  readonly [key: string]: string | TranslationTree
}

export type TranslationSchema<T> = {
  readonly [K in keyof T]?: T[K] extends string ? string : TranslationSchema<T[K]>
}

type Join<K, P> = K extends string | number ? P extends string | number ? `${K}${"" extends P ? "" : "."}${P}` : never : never;
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...0[]]

export type Paths<T, D extends number = 10> = [D] extends [never] ? never : T extends object ?
    { [K in keyof T]-?: K extends string | number ?
        `${K}` | Join<K, Paths<T[K], Prev[D]>>
        : never
    }[keyof T] : "";

export type TranslationKey = Paths<typeof ru>

export type Translate = (key: TranslationKey | (string & {}), paramsOrFallback?: Record<string, string | number> | string) => string

export type FormatDate = (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string
export type FormatNumber = (value: number, options?: Intl.NumberFormatOptions) => string

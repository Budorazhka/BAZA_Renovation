/**
 * Единое отображение денежных сумм в USD (интерфейс).
 * Числа в моках трактуются как суммы в долларах.
 * Разделитель тысяч — обычный пробел ($26 613), не запятая.
 */

const NBSP = / | /g
const stripNbsp = (s: string) => s.replace(NBSP, ' ')

const RU_USD = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** Public API: `.format(n) → "$26 613"` */
export const FMT_USD = {
  format(value: number): string {
    const raw = stripNbsp(RU_USD.format(value))
    // ru-RU выводит "26 613,00 $" — приводим к "$26 613"
    const num = raw.replace(/\s?\$\s?/, '').trim()
    return `$${num}`
  },
}

export type CurrencyCode = 'USD' | 'EUR' | 'GEL' | 'RUB' | string

export function getCurrencySymbol(currency?: string): string {
  switch (currency?.toUpperCase()) {
    case 'EUR':
      return '€'
    case 'GEL':
      return '₾'
    case 'RUB':
      return '₽'
    case 'USD':
    default:
      return '$'
  }
}

/**
 * Универсальное форматирование сумм с учётом валюты ($26 613, €26 613, 26 613 ₾, 26 613 ₽).
 */
export function formatCurrency(value: number | undefined | null, currency: CurrencyCode = 'USD'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const curr = (currency || 'USD').toUpperCase()
  const sym = getCurrencySymbol(curr)
  const num = Math.round(value).toLocaleString('ru-RU', { maximumFractionDigits: 0 }).replace(/ /g, ' ')
  if (curr === 'GEL') return `${num} ₾`
  if (curr === 'RUB') return `${num} ₽`
  return `${sym}${num}`
}

/** Цена за м² с валютой */
export function formatCurrencyPerSqm(value: number | undefined | null, currency: CurrencyCode = 'USD'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${formatCurrency(value, currency)}/м²`
}

/** Крупные суммы: $12.8M, €12.8M */
export function formatCurrencyMillions(value: number, currency: CurrencyCode = 'USD', fractionDigits = 1): string {
  const sym = getCurrencySymbol(currency)
  return `${sym}${(value / 1_000_000).toFixed(fractionDigits)}M`
}

/** Тысячи: $256K, €256K */
export function formatCurrencyThousands(value: number, currency: CurrencyCode = 'USD'): string {
  const sym = getCurrencySymbol(currency)
  return `${sym}${Math.round(value / 1_000)}K`
}

/** Компактно по величине */
export function formatCurrencyCompact(value: number, currency: CurrencyCode = 'USD'): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    const fd = abs % 1_000_000 < 1 ? 0 : 1
    return formatCurrencyMillions(value, currency, fd)
  }
  if (abs >= 1_000) return formatCurrencyThousands(value, currency)
  return formatCurrency(value, currency)
}

/** Крупные суммы: $12.8M */
export function formatUsdMillions(value: number, fractionDigits = 1): string {
  return formatCurrencyMillions(value, 'USD', fractionDigits)
}

/** Тысячи: $256K */
export function formatUsdThousands(value: number): string {
  return formatCurrencyThousands(value, 'USD')
}

/** Компактно по величине в USD */
export function formatUsdCompact(value: number): string {
  return formatCurrencyCompact(value, 'USD')
}

import type { PublicDeveloperProfile, PublicUnitLanding } from '@/services/developmentApi'
import type { SelectionLanguage } from '@/lib/selection-display'
import { t } from '@/lib/selection-display'
import { normalizeOptionValue, optionLabelRu, type OptionGroup } from '@/lib/project-options'

/**
 * Подпись для канонического значения опции проекта (coastline, города, …).
 * ru — русская подпись; остальные языки — канонический слаг.
 */
function optText(language: SelectionLanguage, group: OptionGroup, value: string | undefined | null): string {
  const canonical = normalizeOptionValue(group, value)
  if (!canonical) return ''
  return language === 'ru' ? optionLabelRu(group, canonical) : canonical
}

export interface VisitLocationContent {
  intro: string
  bullets: string[]
}

export interface VisitDeveloperInfo {
  name: string
  description: string
  image?: string
  website?: string
  placeholders: string[]
  apiFields: string[]
}

export interface VisitLocationResolved {
  content: VisitLocationContent
  /** Поля API, попавшие в текст блока */
  apiFields: string[]
  /** Что не нашли в API и заменили заглушкой */
  placeholders: string[]
}

type VisitComplexContext = Pick<
  PublicUnitLanding['complex'],
  | 'country'
  | 'city'
  | 'address'
  | 'coastline'
  | 'developer'
  | 'developerProfile'
  | 'descriptionWhy'
  | 'infrastructureLocation'
  | 'infrastructureExternal'
>

function splitMarketingText(text: string): VisitLocationContent {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return { intro: '', bullets: [] }
  if (lines.length === 1) return { intro: lines[0], bullets: [] }
  return { intro: lines[0], bullets: lines.slice(1) }
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const value = item.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function cityFallbackIntro(language: SelectionLanguage, city: string, country?: string): string {
  const place = country ? `${city}, ${country}` : city
  if (language === 'en') {
    return `${place} is an attractive location for buyers looking for lifestyle, rental income, or long-term capital growth.`
  }
  if (language === 'ka') {
    return `${place} — მიმზიდველი ლოკაცია მყიდველებისთვის, ვინც ეძებს კომფორტს, არენდას ან გრძელვადიან ზრდას.`
  }
  return `${place} — привлекательная локация для покупателей, которым важны комфорт, аренда или долгосрочный рост капитала.`
}

function cityFallbackBullets(language: SelectionLanguage, city: string): string[] {
  if (language === 'en') {
    return [
      `Active primary housing market in ${city}`,
      'Infrastructure and services for residents',
      'Demand from local and international buyers',
    ]
  }
  if (language === 'ka') {
    return [
      `აქტიური პირველადი ბაზარი — ${city}`,
      'ინფრასტრუქტურა და სერვისები მაცხოვრებლებისთვის',
      'მოთხოვნა ადგილობრივი და საერთაშორისო მყიდველებისგან',
    ]
  }
  return [
    `Активный рынок первичного жилья в ${city}`,
    'Инфраструктура и сервисы для жителей',
    'Спрос со стороны местных и иностранных покупателей',
  ]
}

function countryFallbackIntro(language: SelectionLanguage, country: string): string {
  if (language === 'en') {
    return `${country} offers opportunities for real estate investment, rental income, and comfortable living.`
  }
  if (language === 'ka') {
    return `${country} — შესაძლებობები უძრავი ქონების ინვესტიციისთვის, არენდისთვის და კომფორტული საცხოვრებლისთვის.`
  }
  return `${country} — возможности для инвестиций в недвижимость, аренды и комфортного проживания.`
}

function countryFallbackBullets(language: SelectionLanguage): string[] {
  if (language === 'en') {
    return [
      'Growing demand for quality housing',
      'Modern residential projects from developers',
      'Suitable for living, rental, and investment',
    ]
  }
  if (language === 'ka') {
    return [
      'მზარდი მოთხოვნა ხარისხიან ბინებზე',
      'თანამედროვე საცხოვრებელი პროექტები',
      'შესაფერისია საცხოვრებლისთვის, არენდასა და ინვესტიციისთვის',
    ]
  }
  return [
    'Растущий спрос на качественное жильё',
    'Современные жилые проекты от застройщиков',
    'Подходит для собственного проживания и инвестиций',
  ]
}

function developerFallbackDescription(language: SelectionLanguage, name: string): string {
  if (language === 'en') {
    return `${name} develops residential projects in this region. Detailed company description will be added to the developer profile.`
  }
  if (language === 'ka') {
    return `${name} — დეველოპერი ამ რეგიონში. კომპანიის სრული აღწერა მალე დაემატება.`
  }
  return `${name} — застройщик проектов в этом регионе. Подробное описание компании будет добавлено в профиль застройщика.`
}

/**
 * Инвестиционные преимущества.
 * API: `complex.descriptionWhy` (`estates.description_why`).
 * Нет в API: отдельного текста по стране — заглушка по `complex.country`.
 */
export function resolveVisitCountryContent(
  complex: VisitComplexContext,
  language: SelectionLanguage,
): VisitLocationResolved {
  const apiFields: string[] = []
  const placeholders: string[] = []

  const why = complex.descriptionWhy?.trim()
  if (why) {
    apiFields.push('descriptionWhy')
    const parsed = splitMarketingText(why)
    return { content: parsed, apiFields, placeholders }
  }

  const country = optText(language, 'countries', complex.country)
  if (country) apiFields.push('country')
  else placeholders.push('country (нет в API)')

  return {
    content: {
      intro: country
        ? countryFallbackIntro(language, country)
        : t(language, 'blockNotFilled'),
      bullets: country ? countryFallbackBullets(language) : [],
    },
    apiFields,
    placeholders: [
      ...placeholders,
      'descriptionWhy (нет в API — нет estates.description_why)',
      ...(country ? ['текст преимуществ (заглушка)'] : []),
    ],
  }
}

/**
 * Обзор города.
 * API: `city`, `country`, `address`, `coastline`, `infrastructureLocation`, `infrastructureExternal`.
 * Нет в API: отдельного `cityDescription` / CMS по городам — заглушка intro/bullets.
 */
export function resolveVisitCityContent(
  complex: VisitComplexContext,
  language: SelectionLanguage,
): VisitLocationResolved {
  const apiFields: string[] = []
  const placeholders: string[] = []

  const city = optText(language, 'cities', complex.city)
  const country = optText(language, 'countries', complex.country)
  const address = complex.address?.trim()
  const coastline = optText(language, 'coastline', complex.coastline)

  if (city) apiFields.push('city')
  else placeholders.push('city (нет в API / каталоге)')

  if (country) apiFields.push('country')
  if (address) apiFields.push('address')
  if (coastline) apiFields.push('coastline')

  const locationLine = [city, country].filter(Boolean).join(', ')
  let intro = locationLine
  if (address) {
    intro = intro ? `${intro}. ${address}` : address
  }

  const bullets = uniqueStrings([
    ...(coastline ? [`${t(language, 'coastline')}: ${coastline}`] : []),
    ...(complex.infrastructureLocation ?? []).map((v) => optText(language, 'infraLocation', v)),
    ...(complex.infrastructureExternal ?? []).map((v) => optText(language, 'infraExternal', v)),
  ])

  if ((complex.infrastructureLocation?.length ?? 0) > 0) {
    apiFields.push('infrastructureLocation')
  }
  if ((complex.infrastructureExternal?.length ?? 0) > 0) {
    apiFields.push('infrastructureExternal')
  }

  if (!intro && bullets.length === 0) {
    return {
      content: { intro: t(language, 'blockNotFilled'), bullets: [] },
      apiFields,
      placeholders: [
        ...placeholders,
        'cityDescription (нет в API)',
        'infrastructureLocation',
        'infrastructureExternal',
      ],
    }
  }

  const usedApiIntro = Boolean(locationLine || address)
  const usedApiBullets = bullets.length > 0

  if (!usedApiIntro && city) {
    intro = cityFallbackIntro(language, city, country)
    placeholders.push('текст обзора города (заглушка — нет city/address в ответе)')
  } else if (!usedApiIntro) {
    intro = t(language, 'blockNotFilled')
    placeholders.push('текст обзора города (заглушка)')
  }

  let finalBullets = bullets
  if (!usedApiBullets) {
    if (city) {
      finalBullets = cityFallbackBullets(language, city)
      placeholders.push(
        'infrastructureLocation (нет в API)',
        'infrastructureExternal (нет в API)',
        'пункты обзора города (заглушка)',
      )
    } else {
      placeholders.push('infrastructureLocation (нет в API)', 'infrastructureExternal (нет в API)')
    }
  }

  return {
    content: { intro, bullets: finalBullets },
    apiFields,
    placeholders,
  }
}

/**
 * Застройщик.
 * API: `developer` / `developerProfile` (`developers.title`, `description`, `image`).
 */
export function resolveVisitDeveloperInfo(
  complex: VisitComplexContext,
  language: SelectionLanguage,
): VisitDeveloperInfo | null {
  const apiFields: string[] = []
  const placeholders: string[] = []

  const profile: PublicDeveloperProfile | undefined = complex.developerProfile
  const name = profile?.name?.trim() || complex.developer?.trim()
  const description = profile?.description?.trim()

  if (!name && !description) return null

  if (profile?.name || complex.developer) apiFields.push('developer')
  if (description) {
    apiFields.push('developerProfile.description')
  } else if (name) {
    placeholders.push('developerProfile.description (нет в API — коллекция developers)')
  }
  if (profile?.image) apiFields.push('developerProfile.image')

  return {
    name: name ?? '',
    description: description ?? (name ? developerFallbackDescription(language, name) : ''),
    image: profile?.image,
    website: profile?.website,
    apiFields,
    placeholders,
  }
}

/** Dev: логирует, какие поля API не пришли и где стоят заглушки. */
export function logVisitLocationResolution(
  block: string,
  resolved: { apiFields: string[]; placeholders: string[] },
): void {
  if (!import.meta.env.DEV || resolved.placeholders.length === 0) return
  console.info(`[ClientUnitPage] ${block}`, {
    apiFields: resolved.apiFields,
    placeholders: resolved.placeholders,
  })
}

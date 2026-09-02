import {
  applyUnitSharePreset,
  getDefaultUnitShareCustomization,
  resolveUnitShareCustomization,
  type BrandingMode,
  type DevSelectionCustomization,
} from '@/config/dev-selection-customization'
import type { SelectionCurrency, SelectionLanguage } from '@/lib/selection-display'
import { UNIT_VISIT_BLOCK_ORDER, type UnitShareVisitBlockKey } from '@/lib/unit-visit-block-labels'
import { encodeUnitVisitTheme, parseUnitVisitTheme } from '@/lib/unit-visit-theme'

const STORAGE_PREFIX = 'bz26_unit_share_custom_'

/** Порядок блоков в URL (битовая маска) — совпадает с «Поделиться». */
export const UNIT_SHARE_BLOCK_ORDER: UnitShareVisitBlockKey[] = UNIT_VISIT_BLOCK_ORDER

const LEGACY_UNIT_SHARE_BLOCK_ORDER = [
  'bazasaleLogo',
  'agentContacts',
  'projectDescription',
  'amenities',
  'realtorLogo',
  'unitPlan',
  'paymentPlans',
  'locationMap',
  'countryInfo',
  'projectGallery',
  'cityInfo',
  'constructionProgress',
] as const

function applyLegacyMask(customization: DevSelectionCustomization, mask: number): DevSelectionCustomization {
  const legacyFlags = LEGACY_UNIT_SHARE_BLOCK_ORDER.reduce(
    (acc, key, index) => {
      acc[key] = Boolean(mask & (1 << index))
      return acc
    },
    {} as Record<(typeof LEGACY_UNIT_SHARE_BLOCK_ORDER)[number], boolean>,
  )

  return resolveUnitShareCustomization({
    ...applyUnitSharePreset('standard', customization),
    blocks: {
      ...customization.blocks,
      ...legacyFlags,
    },
  })
}

export function loadUnitShareCustomization(unitId: string): DevSelectionCustomization | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${unitId}`)
    if (!raw) return null
    return resolveUnitShareCustomization(JSON.parse(raw) as Partial<DevSelectionCustomization>)
  } catch {
    return null
  }
}

export function saveUnitShareCustomization(unitId: string, customization: DevSelectionCustomization): void {
  localStorage.setItem(`${STORAGE_PREFIX}${unitId}`, JSON.stringify(customization))
}

const BRANDING_MODE_MAP: Record<BrandingMode, string> = { baza: 'b', agent: 'a' }
const BRANDING_MODE_REVERSE: Record<string, BrandingMode> = { b: 'baza', a: 'agent', c: 'agent' }

/** Безопасный разбор base36-маски (строки вида `1n…` ломают `BigInt(str, 36)`). */
function parseShareBlockMaskBigInt(blk: string): bigint | null {
  const num = Number.parseInt(blk, 36)
  if (!Number.isFinite(num)) return null
  if (num < 0) return BigInt(num >>> 0)
  return BigInt(num)
}

function encodeShareBlockMask(customization: DevSelectionCustomization): string {
  const blocks = customization.blocks as Partial<Record<UnitShareVisitBlockKey, boolean>>
  let mask = 0n
  UNIT_SHARE_BLOCK_ORDER.forEach((key, index) => {
    if (blocks[key]) mask |= 1n << BigInt(index)
  })
  return mask.toString(36)
}

function decodeShareBlockMask(maskValue: bigint): Partial<Record<UnitShareVisitBlockKey, boolean>> {
  const blocks: Partial<Record<UnitShareVisitBlockKey, boolean>> = {}
  UNIT_SHARE_BLOCK_ORDER.forEach((key, index) => {
    blocks[key] = Boolean(maskValue & (1n << BigInt(index)))
  })
  return blocks
}

export function encodeUnitShareCustomization(customization: DevSelectionCustomization): {
  lang: SelectionLanguage
  cur: SelectionCurrency
  thm: string
  blk: string
  bm: string
} {
  const normalized = resolveUnitShareCustomization(customization)
  return {
    lang: normalized.language,
    cur: normalized.currency,
    thm: encodeUnitVisitTheme(normalized.theme),
    blk: encodeShareBlockMask(normalized),
    bm: BRANDING_MODE_MAP[normalized.brandingMode ?? 'agent'],
  }
}

/** Читает кастомизацию из query (?lang=&cur=&blk=&bm=). */
export function parseUnitShareCustomization(search: string): DevSelectionCustomization | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const lang = params.get('lang')
  const cur = params.get('cur')
  const thm = params.get('thm')
  const blk = params.get('blk')
  const bm = params.get('bm')

  if (!lang && !cur && !thm && !blk && !bm) return null

  const customization = getDefaultUnitShareCustomization()

  if (lang === 'ru' || lang === 'en' || lang === 'ka') customization.language = lang
  if (cur === 'USD' || cur === 'EUR' || cur === 'GEL') customization.currency = cur
  const parsedTheme = parseUnitVisitTheme(thm)
  if (parsedTheme) customization.theme = parsedTheme
  if (bm && bm in BRANDING_MODE_REVERSE) customization.brandingMode = BRANDING_MODE_REVERSE[bm]

  if (blk) {
    const legacyNum = Number.parseInt(blk, 36)
    const hasModernParams = Boolean(lang || cur || thm || bm)
    // Старые ссылки: только `blk` без lang/cur/thm/bm и 12-битная маска.
    if (
      !hasModernParams &&
      Number.isFinite(legacyNum) &&
      legacyNum >= 0 &&
      legacyNum <= 0xfff
    ) {
      return applyLegacyMask(customization, legacyNum)
    }

    const mask = parseShareBlockMaskBigInt(blk)
    if (mask != null) {
      return resolveUnitShareCustomization({
        language: customization.language,
        currency: customization.currency,
        theme: customization.theme,
        brandingMode: customization.brandingMode,
        blocks: decodeShareBlockMask(mask),
      })
    }
  }

  return resolveUnitShareCustomization(customization)
}

/**
 * Конфигурация серверной share-ссылки (`GET /api/share/unit-links/:token`) →
 * кастомизация визитки. Значения валидируются как в parseUnitShareCustomization;
 * блоки, не присланные бэком, добираются клиентскими дефолтами.
 */
export function shareLinkCustomizationToCustomization(dto: {
  language?: string
  currency?: string
  theme?: string
  brandingMode?: string
  blocks?: Record<string, boolean>
} | null | undefined): DevSelectionCustomization | null {
  if (!dto) return null

  const base = getDefaultUnitShareCustomization()
  if (dto.language === 'ru' || dto.language === 'en' || dto.language === 'ka') base.language = dto.language
  if (dto.currency === 'USD' || dto.currency === 'EUR' || dto.currency === 'GEL') base.currency = dto.currency
  const theme = parseUnitVisitTheme(dto.theme)
  if (theme) base.theme = theme
  if (dto.brandingMode === 'agent' || dto.brandingMode === 'baza') base.brandingMode = dto.brandingMode

  const blocks: Partial<Record<UnitShareVisitBlockKey, boolean>> = {}
  if (dto.blocks) {
    for (const key of UNIT_SHARE_BLOCK_ORDER) {
      const value = dto.blocks[key]
      if (typeof value === 'boolean') blocks[key] = value
    }
  }

  return resolveUnitShareCustomization({
    language: base.language,
    currency: base.currency,
    theme: base.theme,
    brandingMode: base.brandingMode,
    blocks: Object.keys(blocks).length > 0 ? blocks : undefined,
  })
}

export function customizationEquals(
  a: DevSelectionCustomization,
  b: DevSelectionCustomization | null | undefined,
): boolean {
  if (!b) return false
  if (a.language !== b.language || a.currency !== b.currency || a.theme !== b.theme) return false
  if ((a.brandingMode ?? 'agent') !== (b.brandingMode ?? 'agent')) return false
  return UNIT_SHARE_BLOCK_ORDER.every((key) => a.blocks[key] === b.blocks[key])
}

export function isDefaultShareCustomization(c: DevSelectionCustomization): boolean {
  return customizationEquals(c, getDefaultUnitShareCustomization())
}

// Преобразование активных платных услуг продвижения (API) в визуальные бейджи
// карточки ЖК (ComplexCard). Используется на страницах «Новостройки» и «Объекты (ЖК)».

import type { ComplexCardPromo } from '@/components/ui/ComplexCard'
import type { PromotionActivation } from '@/services/developmentApi'

// Визуальное правило карточки: поверх фото показываем максимум ДВА бейджа —
//   1) «ТОП» (услуга boost),
//   2) цветная метка «Супер цена»/др. (услуга object_mark, текст из config).
// Все остальные услуги (top4_main, main_banner, section_*, map_marker, бренд-услуги)
// влияют на размещение вне карточки и бейджем здесь НЕ выводятся.
// custom_text — отдельная крупная надпись справа (см. getPromotionText), не бейдж.
const PROMO_BADGE_MAP: Record<string, { kind: ComplexCardPromo['kind']; label?: string }> = {
  boost: { kind: 'top' },
  object_mark: { kind: 'hot' },
}

/** Максимум бейджей поверх фото карточки. */
export const MAX_CARD_BADGES = 2

/** Активные (не истёкшие) промо-услуги → бейджи карточки, без дубликатов, не более MAX_CARD_BADGES. */
export function promotionsToBadges(promotions?: PromotionActivation[] | null): ComplexCardPromo[] {
  if (!promotions?.length) return []
  const now = Date.now()
  const badges: ComplexCardPromo[] = []
  const seen = new Set<string>()
  for (const p of promotions) {
    if (new Date(p.expiresAt).getTime() <= now) continue
    const mapping = PROMO_BADGE_MAP[p.serviceId]
    if (!mapping) continue
    // Для услуг с произвольным текстом (метка) берём config как подпись.
    const text = mapping.label ?? (p.config?.trim() || undefined)
    const key = `${mapping.kind}|${text ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    badges.push({ kind: mapping.kind, ...(text ? { text } : {}) })
    if (badges.length >= MAX_CARD_BADGES) break
  }
  return badges
}

/** Текст услуги «Надпись на карточке» (custom_text), если она активна. */
export function getPromotionText(promotions?: PromotionActivation[] | null): string | undefined {
  if (!promotions?.length) return undefined
  const now = Date.now()
  for (const p of promotions) {
    if (p.serviceId !== 'custom_text') continue
    if (new Date(p.expiresAt).getTime() <= now) continue
    const text = p.config?.trim()
    if (text) return text
  }
  return undefined
}

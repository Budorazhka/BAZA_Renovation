import { useState } from 'react'
import { Link } from 'react-router-dom'
import { listingAddress, listingPrice, listingTitle } from '../lib/format'
import { useI18n } from '../i18n'
import type { PublicListingCard } from '../types/marketplace'

export interface ListingCardCompactProps {
  item: PublicListingCard
}

const AREA_FORMAT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

/**
 * Компактная карточка объявления по узлу `card-item_small` (`70:2699`,
 * 355x137) из мобильного фрейма главной `mob_home` (`1035:18101`).
 *
 * Состав по макету: слева фото 100x100 с радиусом 10, справа колонка
 * шириной 189 с шагом 5 — цена, характеристики, город, ещё строка
 * характеристик. Карточка горизонтальная, отступ 14, тень мягкая.
 */
export function ListingCardCompact({ item }: ListingCardCompactProps) {
  // Битая ссылка на фотографию не должна оставлять в карточке значок
  // сломанного изображения: показываем ту же заглушку, что и без фото.
  const [imgError, setImgError] = useState(false)
  const { t } = useI18n()
  const slug = item.slug
  const source = item.media?.find((m) => m.role === 'cover')?.url ?? item.media?.[0]?.url ?? null
  const cover = imgError ? null : source
  const { rooms, floor, totalFloors, area } = item.characteristics ?? {}
  const href = slug ? `/listings/${slug}` : '#'

  return (
    <Link to={href} className="compact-card">
      <span className="compact-card__photo">
        {cover ? (
          <img src={cover} alt="" loading="lazy" onError={() => setImgError(true)} />
        ) : (
          <span className="compact-card__photo-empty" />
        )}
      </span>
      <span className="compact-card__body">
        <span className="compact-card__price">{listingPrice(item, t)}</span>
        <span className="compact-card__title">{listingTitle(item, t)}</span>
        <span className="compact-card__address">{listingAddress(item, t)}</span>
        <span className="compact-card__facts">
          {typeof rooms === 'number' ? <span>{t('card.rooms', { count: rooms })}</span> : null}
          {typeof floor === 'number' ? (
            <span>
              {typeof totalFloors === 'number'
                ? t('card.floorOfTotal', { floor, total: totalFloors })
                : t('card.floor', { floor })}
            </span>
          ) : null}
          {typeof area === 'number' ? <span>{t('card.area', { area: AREA_FORMAT.format(area) })}</span> : null}
        </span>
      </span>
    </Link>
  )
}

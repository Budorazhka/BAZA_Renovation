import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFavorites } from '../features/favorites/useFavorites'
import { listingAddress, listingPrice, listingTitle } from '../lib/format'
import type { PublicListingCard } from '../types/marketplace'
import { BuildingPlaceholder } from './DevelopmentCard'

export interface ListingCardProps {
  item: PublicListingCard
  size?: 'default' | 'small'
  className?: string
}

const MONEY_FORMAT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const AREA_FORMAT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
const CURRENCY_SIGN: Record<string, string> = { USD: '$', GEL: '₾', RUB: '₽' }

/**
 * Карточка объявления по узлу `card/квартира во вторичке` (`3428:55856`,
 * 424x663) фрейма главной.
 *
 * Состав по макету: обложка 424x281 (radius 8), цена 28px и цена за м²
 * рядом с парой круглых кнопок, название 24px в две строки, адрес,
 * город, разделитель, три характеристики (комнаты, этаж, площадь),
 * разделитель, кнопки «Позвонить» и «Написать».
 *
 * Значка «Premium» из макета нет: в проекции публикации нет признака
 * платного размещения. Бейдж срочной продажи показывается по реальному
 * полю, а не рисуется всегда.
 */
export function ListingCard({ item, size = 'default', className = '' }: ListingCardProps) {
  const navigate = useNavigate()
  const favorites = useFavorites()
  const [imgError, setImgError] = useState(false)
  const [copied, setCopied] = useState(false)

  const slug = item.slug
  const title = listingTitle(item)
  const address = listingAddress(item)
  const coverItem = item.media?.find((m) => m.role === 'cover') ?? item.media?.[0]
  const cover = coverItem && !imgError ? coverItem.url : null

  const characteristics = item.characteristics ?? {}
  const { rooms, floor, totalFloors, area } = characteristics

  const price = item.price
  const priceText = listingPrice(item)
  // Цена и валюта в проекции необязательны, поэтому цена за метр считается
  // только когда есть оба поля и площадь.
  const pricePerSqm =
    typeof price?.amountMinorUnits === 'number' && price.currency && typeof area === 'number' && area > 0
      ? `${CURRENCY_SIGN[price.currency] ?? price.currency}${MONEY_FORMAT.format(
          Math.round(price.amountMinorUnits / 100 / area),
        )} за m²`
      : null

  const isFavorite = slug ? favorites.isFavorite({ targetType: 'listing', slug }) : false
  const detailHref = slug ? `/listings/${slug}` : undefined

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = slug ? `${window.location.origin}/listings/${slug}` : window.location.href
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(url).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!slug) return
    const result = await favorites.toggle({ targetType: 'listing', slug })
    if (result.requiresAuth) {
      navigate(`/auth/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    }
  }

  return (
    <article className={`listing-card listing-card--${size} ${className}`.trim()} aria-label={title}>
      {/* обложка `3428:55857` 424x281, radius 8 */}
      <div className="listing-card__cover">
        {detailHref ? (
          <Link to={detailHref} className="listing-card__cover-link" tabIndex={-1} aria-hidden="true">
            {cover ? (
              <img src={cover} alt="" loading="lazy" onError={() => setImgError(true)} />
            ) : (
              <BuildingPlaceholder />
            )}
          </Link>
        ) : cover ? (
          <img src={cover} alt="" loading="lazy" onError={() => setImgError(true)} />
        ) : (
          <BuildingPlaceholder />
        )}

        {item.isMls ? <span className="listing-card__pill" data-testid="badge-mls">MLS</span> : null}
        {item.isVerified ? <span className="listing-card__verified">Проверено</span> : null}
      </div>

      {/* сведения `3428:55861`: padding 10, gap 20 */}
      <div className="listing-card__body">
        <div className="listing-card__head">
          <p className="listing-card__price">
            <span className="listing-card__price-main">{priceText}</span>
            {pricePerSqm ? <span className="listing-card__price-sqm">{pricePerSqm}</span> : null}
          </p>
          <div className="listing-card__head-actions">
            <button
              type="button"
              className="listing-card__icon-btn"
              onClick={handleShare}
              aria-label={copied ? 'Ссылка скопирована' : 'Поделиться'}
              title={copied ? 'Ссылка скопирована' : 'Поделиться'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
            <button
              type="button"
              className={`listing-card__icon-btn${isFavorite ? ' is-active' : ''}`}
              onClick={(event) => void handleFavorite(event)}
              aria-label={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
              aria-pressed={isFavorite}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>
        </div>

        {/* название `3428:55881`: Plus Jakarta Sans Bold 24, две строки */}
        <h2 className="listing-card__title">
          {detailHref ? <Link to={detailHref}>{title}</Link> : title}
        </h2>

        <p className="listing-card__address">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{address}</span>
        </p>

        {item.publisher ? (
          <p className="listing-card__publisher">
            <Link to={`/secondary?publisher=${encodeURIComponent(item.publisher.id)}`}>
              {item.publisher.name}
            </Link>
          </p>
        ) : null}

        {/* характеристики `3428:55889`: комнаты, этаж, площадь, Comfortaa Bold 18 */}
        <div className="listing-card__facts">
          {typeof rooms === 'number' ? (
            <span className="listing-card__fact">
              <span className="listing-card__fact-icon listing-card__fact-icon--rooms" aria-hidden="true" />
              {rooms}
            </span>
          ) : null}
          {typeof floor === 'number' ? (
            <span className="listing-card__fact">
              <span className="listing-card__fact-icon listing-card__fact-icon--floor" aria-hidden="true" />
              {typeof totalFloors === 'number' ? `${floor} из ${totalFloors}` : `${floor} этаж`}
            </span>
          ) : null}
          {typeof area === 'number' ? (
            <span className="listing-card__fact">
              <span className="listing-card__fact-icon listing-card__fact-icon--area" aria-hidden="true" />
              {AREA_FORMAT.format(area)} m²
            </span>
          ) : null}
        </div>

        {/* кнопки `3428:55907` / `3428:55908` */}
        <div className="listing-card__actions">
          {detailHref ? (
            <Link to={`${detailHref}#contact`} className="listing-card__btn listing-card__btn--call">
              Позвонить
            </Link>
          ) : (
            <button type="button" className="listing-card__btn listing-card__btn--call" disabled>
              Позвонить
            </button>
          )}
          {detailHref ? (
            <Link to={detailHref} className="listing-card__btn listing-card__btn--outline">
              Подробнее
            </Link>
          ) : (
            <button type="button" className="listing-card__btn listing-card__btn--outline" disabled>
              Подробнее
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

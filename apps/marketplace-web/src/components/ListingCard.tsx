import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listingAddress,
  listingDealTypeLabel,
  listingPrice,
  listingPropertyTypeLabel,
  listingTitle,
} from '../lib/format'
import type { PublicListingCard } from '../types/marketplace'
import { BuildingPlaceholder } from './DevelopmentCard'

export interface ListingCardProps {
  item: PublicListingCard
  size?: 'default' | 'small'
  className?: string
}

/**
 * ListingCard Component (Figma: card квартира вторичка 4934:69469 & Квартира аренда 4942:79685)
 * Implements Figma variants:
 * - standard (4934:69468)
 * - discount / urgent sale (4934:69467)
 * - small (4934:69466 / 4942:79829)
 * - rent long / rent short (4942:79684, 4942:79683)
 */
export function ListingCard({
  item,
  size = 'default',
  className = '',
}: ListingCardProps) {
  const slug = item.slug
  const title = listingTitle(item)
  const address = listingAddress(item)
  const coverItem = item.media?.find((m) => m.role === 'cover') || item.media?.[0]
  const [imgError, setImgError] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [copied, setCopied] = useState(false)

  const isRent = item.dealType === 'rent_long' || item.dealType === 'rent_short'
  const isDaily = item.dealType === 'rent_short'

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = slug ? `${window.location.origin}/listings/${slug}` : window.location.href
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsFavorite((prev) => !prev)
  }

  const cardContent = (
    <>
      {/* Media Box with Badges & Actions */}
      <div className="figma-listing-card__media">
        {coverItem && !imgError ? (
          <img
            src={coverItem.url}
            alt={coverItem.alt || title}
            className="figma-listing-card__img"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <BuildingPlaceholder />
        )}

        {/* Top Badges */}
        <div className="figma-listing-card__badges-top">
          {item.dealType === 'sale' ? (
            <span className="figma-listing-card__badge figma-listing-card__badge--urgent">
              <span aria-hidden="true">🔥</span> Срочно
            </span>
          ) : isDaily ? (
            <span className="figma-listing-card__badge figma-listing-card__badge--deal">
              Посуточно
            </span>
          ) : (
            <span className="figma-listing-card__badge figma-listing-card__badge--deal">
              Долгосрок
            </span>
          )}

          {item.isVerified ? (
            <span className="figma-listing-card__badge figma-listing-card__badge--verified">
              <span aria-hidden="true">✓</span> Проверено
            </span>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="figma-listing-card__actions">
          <button
            type="button"
            className="figma-listing-card__action-btn"
            onClick={handleShare}
            aria-label={copied ? 'Ссылка скопирована' : 'Поделиться объявлением'}
            title={copied ? 'Скопировано!' : 'Поделиться'}
          >
            {copied ? '✓' : '↗'}
          </button>
          <button
            type="button"
            className="figma-listing-card__action-btn"
            onClick={handleFavorite}
            aria-label={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
            style={{ color: isFavorite ? '#E53935' : undefined }}
          >
            {isFavorite ? '♥' : '♡'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="figma-listing-card__body">
        {/* Pricing */}
        <div className="figma-listing-card__price-row">
          <div className="figma-listing-card__price-main">
            {listingPrice(item)}
            {isRent ? (
              <span className="figma-listing-card__price-period">
                {isDaily ? ' / сутки' : ' / мес'}
              </span>
            ) : null}
          </div>
        </div>

        {/* Title */}
        <h2 className="figma-listing-card__title">{title}</h2>

        {/* Address */}
        <p className="figma-listing-card__address">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{address}</span>
        </p>

        {/* Parameter Chips */}
        <div className="figma-listing-card__chips" aria-label="Параметры объекта">
          {item.characteristics?.rooms ? (
            <span className="listing-chip figma-listing-card__chip">
              <span aria-hidden="true">🛏</span> {item.characteristics.rooms} комн.
            </span>
          ) : null}
          {item.characteristics?.area ? (
            <span className="listing-chip figma-listing-card__chip">
              <span aria-hidden="true">📐</span> {item.characteristics.area} м²
            </span>
          ) : null}
          {item.characteristics?.floor ? (
            <span className="listing-chip figma-listing-card__chip">
              <span aria-hidden="true">🏢</span> {item.characteristics.floor}
              {item.characteristics.totalFloors ? `/${item.characteristics.totalFloors}` : ''} эт.
            </span>
          ) : null}
        </div>

        {/* Action buttons preview */}
        <div className="figma-listing-card__contact-row">
          <span className="figma-listing-card__btn-call">Подробнее</span>
          <span className="figma-listing-card__btn-chat">Контакты</span>
        </div>

        {/* Footer */}
        <div className="figma-listing-card__footer">
          <span>{listingPropertyTypeLabel(item.propertyType, item.commercialSubtype)}</span>
          <span className="figma-listing-card__arrow" aria-hidden="true">→</span>
        </div>
      </div>
    </>
  )

  const cardClasses = [
    'figma-listing-card',
    'listing-card',
    size === 'small' ? 'figma-listing-card--small' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return slug ? (
    <Link
      className={cardClasses}
      to={`/listings/${slug}`}
      aria-label={`Объявление: ${title}`}
    >
      {cardContent}
    </Link>
  ) : (
    <article className={cardClasses}>{cardContent}</article>
  )
}

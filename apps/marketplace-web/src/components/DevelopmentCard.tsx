import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFavorites } from '../features/favorites/useFavorites'
import { completionLabel, developmentAddress, developmentTitle } from '../lib/format'
import type { PublicDevelopmentCard } from '../types/marketplace'

export interface DevelopmentCardProps {
  item: PublicDevelopmentCard
  size?: 'default' | 'small' | 'wide'
  onQuickView?: (slug: string) => void
  className?: string
}

/**
 * Building Placeholder SVG matching Figma card illustration
 */
export function BuildingPlaceholder() {
  return (
    <div className="building-placeholder" aria-hidden="true">
      <span className="building-placeholder__sun" />
      <span className="building-placeholder__tower building-placeholder__tower--left" />
      <span className="building-placeholder__tower building-placeholder__tower--right" />
      <span className="building-placeholder__ground" />
    </div>
  )
}

/**
 * DevelopmentCard Component (Figma: card ЖК 4747:74437 / big card 3314:196474 / mob_card 141:7326)
 * Implements 6 Figma variants:
 * - variant=стройка (4747:74436)
 * - variant=сдан (4747:74434)
 * - variant=discont (4747:74435)
 * - small variants (4747:78620..78642)
 */
export function DevelopmentCard({
  item,
  size = 'default',
  onQuickView,
  className = '',
}: DevelopmentCardProps) {
  const navigate = useNavigate()
  // Избранное хранится на сервере: до 04.09.2026 здесь стоял useState(false),
  // который сбрасывался при переходе на другую страницу и ничего не сохранял.
  const favorites = useFavorites()
  const [copied, setCopied] = useState(false)

  const slug = item.slug
  const title = developmentTitle(item)
  const address = developmentAddress(item)
  const completionText = completionLabel(item.completionDate) ?? 'Срок сдачи уточняется'

  // Determine construction status
  const isCompleted = item.completionDate
    ? new Date(item.completionDate).getTime() < Date.now()
    : false

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = slug ? `${window.location.origin}/developments/${slug}` : window.location.href
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  const isFavorite = slug ? favorites.isFavorite({ targetType: 'development', slug }) : false

  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!slug) return
    const result = await favorites.toggle({ targetType: 'development', slug })
    // Гостю нечего показывать «сохранено»: сервер требует сессию. Ведём на вход
    // и возвращаем обратно, а не оставляем кнопку молча неработающей.
    if (result.requiresAuth) {
      navigate(`/auth/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    }
  }

  const handleQuickViewClick = (e: React.MouseEvent) => {
    if (onQuickView && slug) {
      e.preventDefault()
      e.stopPropagation()
      onQuickView(slug)
    }
  }

  return (
    <article
      className={`development-card figma-card-jk figma-card-jk--${size} ${className}`.trim()}
      aria-label={`Жилой комплекс ${title}`}
    >
      {/* Cover / Image Area (Figma 4747:74153) */}
      <div className="figma-card-jk__cover">
        {slug ? (
          <Link to={`/developments/${slug}`} className="figma-card-jk__cover-link" tabIndex={-1} aria-hidden="true">
            <BuildingPlaceholder />
          </Link>
        ) : (
          <BuildingPlaceholder />
        )}

        {/* Badges Overlay (Figma 4747:74158, 4747:74161) */}
        <div className="figma-card-jk__badges">
          {isCompleted ? (
            <span className="figma-badge figma-badge--completed">Сдан</span>
          ) : (
            <span className="figma-badge figma-badge--construction">Строится</span>
          )}

          {item.classType ? (
            <span className="figma-badge figma-badge--class">{item.classType}</span>
          ) : null}
        </div>

        {/* Quick Action Overlay (Share & Favorite, Figma 4747:74083, 4747:74092) */}
        <div className="figma-card-jk__actions-overlay">
          <button
            type="button"
            className="figma-card-jk__action-btn"
            onClick={handleShare}
            aria-label={copied ? 'Ссылка скопирована' : 'Поделиться ЖК'}
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
            className={`figma-card-jk__action-btn ${isFavorite ? 'is-active' : ''}`}
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

      {/* Details Body (Figma detales 4747:74072) */}
      <div className="development-card__body figma-card-jk__body">
        {/* Title */}
        <h2 className="figma-card-jk__title">
          {slug ? (
            <Link to={`/developments/${slug}`} className="figma-card-jk__title-link">
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>

        {/* Address */}
        <p className="address figma-card-jk__address">
          <svg className="figma-card-jk__address-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{address}</span>
        </p>

        {/*
          Застройщик кликабелен и ведёт в каталог, отфильтрованный по нему.
          Отдельной страницы компании нет намеренно (решение владельца от
          04.09.2026, как на действующем baza.sale). У объектов частных
          собственников публикатора нет, и блок не рендерится.
        */}
        {item.publisher ? (
          <p className="figma-card-jk__publisher">
            <Link to={`/newconstructions?publisher=${encodeURIComponent(item.publisher.id)}`}>
              {item.publisher.name}
            </Link>
          </p>
        ) : null}

        {/* Facilities Chips (Figma Facilities 4747:74174) */}
        <div className="figma-card-jk__facilities" aria-label="Характеристики комплекса">
          <span className="figma-facility-pill">
            <span className="figma-facility-pill__icon" aria-hidden="true">🏢</span>
            <span>{completionText}</span>
          </span>
          <span className="figma-facility-pill">
            <span className="figma-facility-pill__icon" aria-hidden="true">📐</span>
            <span>от 32 м²</span>
          </span>
        </div>

        {/* Action Buttons Row (Figma 4747:74118) */}
        <div className="card-footer figma-card-jk__footer">
          {slug ? (
            <Link
              to={`/developments/${slug}`}
              className="figma-card-jk__btn figma-card-jk__btn--primary"
            >
              Подробнее
            </Link>
          ) : (
            <button type="button" className="figma-card-jk__btn figma-card-jk__btn--primary" disabled>
              Подробнее
            </button>
          )}

          {slug ? (
            <Link
              to={`/developments/${slug}#units`}
              className="figma-card-jk__btn figma-card-jk__btn--outline"
              onClick={handleQuickViewClick}
            >
              Планировки
            </Link>
          ) : (
            <button
              type="button"
              className="figma-card-jk__btn figma-card-jk__btn--outline"
              onClick={handleQuickViewClick}
            >
              Планировки
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

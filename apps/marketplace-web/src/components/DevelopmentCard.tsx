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

/** Обложка без фотографии: у публичной карточки ЖК поля media нет вовсе. */
export function BuildingPlaceholder() {
  return <div className="building-placeholder" aria-hidden="true" />
}

const MONEY_FORMAT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const AREA_FORMAT = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

const CURRENCY_SIGN: Record<string, string> = { USD: '$', GEL: '₾', RUB: '₽' }

function money(amountMinorUnits: number, currency: string): string {
  const sign = CURRENCY_SIGN[currency] ?? currency
  return `${sign}${MONEY_FORMAT.format(Math.round(amountMinorUnits / 100))}`
}

/**
 * Карточка ЖК по узлу `card/ЖК` (`3428:55616`, 424x626) фрейма главной.
 *
 * Состав по макету: обложка 424x300 с пилюлей-бейджем, блок сведений с
 * названием 24px и парой круглых кнопок, цена 28px и цена за м², адрес,
 * город, разделитель, три характеристики (срок сдачи — в оранжевой
 * плашке), разделитель, кнопки «Позвонить» и «Написать».
 *
 * Чего в данных нет и что поэтому не рисуется: «Комиссия 10%», «Скидка
 * 25%» и значок «Premium» из макета — в проекции публикации нет ни
 * комиссии, ни скидки, ни признака платного размещения. Вместо бейджа
 * комиссии в том же месте и том же стиле показан статус стройки, который
 * в данных есть. Фотографий у ЖК в публичном ответе тоже нет.
 */
export function DevelopmentCard({
  item,
  size = 'default',
  onQuickView,
  className = '',
}: DevelopmentCardProps) {
  const navigate = useNavigate()
  const favorites = useFavorites()
  const [copied, setCopied] = useState(false)

  const slug = item.slug
  const title = developmentTitle(item)
  const address = developmentAddress(item)
  const completionText = completionLabel(item.completionDate) ?? 'Срок сдачи уточняется'
  const isCompleted = item.completionDate
    ? new Date(item.completionDate).getTime() < Date.now()
    : false

  const units = item.units ?? []
  const areas = units.map((u) => u.area).filter((a): a is number => typeof a === 'number' && a > 0)
  const floors = units.map((u) => u.floor).filter((f): f is number => typeof f === 'number')
  const maxFloor = floors.length > 0 ? Math.max(...floors) : null

  // Цена за квадрат считается по тому же юниту, что дал цену «от», иначе
  // получится смесь цены одной квартиры с площадью другой.
  const cheapest = units
    .filter((u) => u.price && typeof u.area === 'number' && u.area > 0)
    .sort((a, b) => (a.price?.amountMinorUnits ?? 0) - (b.price?.amountMinorUnits ?? 0))[0]
  const pricePerSqm =
    cheapest?.price && cheapest.area
      ? money(Math.round(cheapest.price.amountMinorUnits / cheapest.area), cheapest.price.currency)
      : null

  const areaRange =
    areas.length > 0
      ? areas.length === 1 || Math.min(...areas) === Math.max(...areas)
        ? `${AREA_FORMAT.format(areas[0]!)} m²`
        : `от ${AREA_FORMAT.format(Math.min(...areas))} до ${AREA_FORMAT.format(Math.max(...areas))} m²`
      : null

  const isFavorite = slug ? favorites.isFavorite({ targetType: 'development', slug }) : false

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const url = slug ? `${window.location.origin}/developments/${slug}` : window.location.href
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
    const result = await favorites.toggle({ targetType: 'development', slug })
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

  const detailHref = slug ? `/developments/${slug}` : undefined

  return (
    <article className={`dev-card dev-card--${size} ${className}`.trim()} aria-label={`Жилой комплекс ${title}`}>
      {/* обложка `3428:55617` 424x300, radius 8 */}
      <div className="dev-card__cover">
        {detailHref ? (
          <Link to={detailHref} className="dev-card__cover-link" tabIndex={-1} aria-hidden="true">
            <BuildingPlaceholder />
          </Link>
        ) : (
          <BuildingPlaceholder />
        )}

        {/* пилюля `3428:55622`: зелёная, radius 100, Comfortaa 13, со значком */}
        <span className="dev-card__pill">
          <span className="dev-card__pill-icon" aria-hidden="true" />
          {isCompleted ? 'Дом сдан' : 'Строится'}
        </span>

        {item.classType ? <span className="dev-card__class">{item.classType}</span> : null}
      </div>

      {/* сведения `3428:55626`: VERTICAL gap 20, padding 10 */}
      <div className="dev-card__body">
        <div className="dev-card__head">
          <h2 className="dev-card__title">
            {detailHref ? <Link to={detailHref}>{title}</Link> : title}
          </h2>
          <div className="dev-card__head-actions">
            <button
              type="button"
              className="dev-card__icon-btn"
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
              className={`dev-card__icon-btn${isFavorite ? ' is-active' : ''}`}
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

        {/* цена `3428:55645` 28px зелёная + за м² `3428:55646` 16px */}
        {item.priceFrom ? (
          <p className="dev-card__price">
            <span className="dev-card__price-main">
              от {money(item.priceFrom.amountMinorUnits, item.priceFrom.currency)}
            </span>
            {pricePerSqm ? <span className="dev-card__price-sqm">{pricePerSqm} за m²</span> : null}
          </p>
        ) : null}

        {/* адрес `3428:55651`: Comfortaa Bold 16 со значком-булавкой */}
        <p className="dev-card__address">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{address}</span>
        </p>

        {item.publisher ? (
          <p className="dev-card__publisher">
            <Link to={`/newconstructions?publisher=${encodeURIComponent(item.publisher.id)}`}>
              {item.publisher.name}
            </Link>
          </p>
        ) : null}

        {/* характеристики `3428:55654`: срок сдачи в плашке, этажность, площади */}
        <div className="dev-card__facts">
          <span className="dev-card__fact dev-card__fact--term">{completionText}</span>
          {maxFloor !== null ? (
            <span className="dev-card__fact">
              <span className="dev-card__fact-icon dev-card__fact-icon--floors" aria-hidden="true" />
              {maxFloor} этажей
            </span>
          ) : null}
          {areaRange ? (
            <span className="dev-card__fact">
              <span className="dev-card__fact-icon dev-card__fact-icon--area" aria-hidden="true" />
              {areaRange}
            </span>
          ) : null}
        </div>

        {/* кнопки `3428:55670` «Позвонить» и `3428:55671` «Написать», пилюли 177x42 */}
        <div className="dev-card__actions">
          {detailHref ? (
            <Link to={`${detailHref}#contact`} className="dev-card__btn dev-card__btn--call">
              Позвонить
            </Link>
          ) : (
            <button type="button" className="dev-card__btn dev-card__btn--call" disabled>
              Позвонить
            </button>
          )}
          {detailHref ? (
            <Link
              to={`${detailHref}#units`}
              className="dev-card__btn dev-card__btn--outline"
              onClick={handleQuickViewClick}
            >
              Планировки
            </Link>
          ) : (
            <button type="button" className="dev-card__btn dev-card__btn--outline" onClick={handleQuickViewClick}>
              Планировки
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

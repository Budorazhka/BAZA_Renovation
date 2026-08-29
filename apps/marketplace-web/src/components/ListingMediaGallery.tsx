import { useState, useEffect, KeyboardEvent } from 'react'
import type { PublicMediaItem } from '../types/marketplace'

interface ListingMediaGalleryProps {
  media?: PublicMediaItem[]
  title: string
}

export function ListingMediaGallery({ media, title }: ListingMediaGalleryProps) {
  const items = media ?? []
  const [activeIndex, setActiveIndex] = useState(0)
  const [loadedMap, setLoadedMap] = useState<Record<number, boolean>>({})
  const [errorMap, setErrorMap] = useState<Record<number, boolean>>({})

  // Reset index if media changes
  useEffect(() => {
    setActiveIndex(0)
  }, [items.length])

  if (items.length === 0) {
    return (
      <div className="listing-gallery listing-gallery--empty" data-testid="listing-gallery-empty">
        <div className="listing-gallery__empty-box">
          <svg className="listing-gallery__empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <p>Фотографии объекта не загружены</p>
        </div>
      </div>
    )
  }

  const currentItem = items[activeIndex] || items[0]!
  const isLoaded = loadedMap[activeIndex] ?? false
  const hasError = errorMap[activeIndex] ?? false

  function handlePrev() {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1))
  }

  function handleNext() {
    setActiveIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      handlePrev()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      handleNext()
    }
  }

  const altText = currentItem.alt || `${title} — фото ${activeIndex + 1}`

  return (
    <div
      className="listing-gallery"
      data-testid="listing-gallery"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Галерея фотографий объекта"
    >
      <div className="listing-gallery__main">
        {!isLoaded && !hasError && (
          <div className="listing-gallery__skeleton" data-testid="gallery-skeleton" />
        )}

        {hasError ? (
          <div className="listing-gallery__broken" data-testid="gallery-broken">
            <svg className="listing-gallery__empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15l-5-5L5 21" />
              <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" />
            </svg>
            <p>Не удалось загрузить изображение</p>
          </div>
        ) : (
          <img
            key={currentItem.url}
            src={currentItem.url}
            alt={altText}
            className={`listing-gallery__image${isLoaded ? ' is-loaded' : ''}`}
            data-testid="gallery-active-image"
            onLoad={() => setLoadedMap((prev) => ({ ...prev, [activeIndex]: true }))}
            onError={() => setErrorMap((prev) => ({ ...prev, [activeIndex]: true }))}
          />
        )}

        {items.length > 1 && (
          <>
            <button
              type="button"
              className="listing-gallery__nav listing-gallery__nav--prev"
              onClick={handlePrev}
              aria-label="Предыдущее фото"
              data-testid="gallery-prev-btn"
            >
              ‹
            </button>
            <button
              type="button"
              className="listing-gallery__nav listing-gallery__nav--next"
              onClick={handleNext}
              aria-label="Следующее фото"
              data-testid="gallery-next-btn"
            >
              ›
            </button>
            <div className="listing-gallery__counter" data-testid="gallery-counter">
              {activeIndex + 1} / {items.length}
            </div>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div className="listing-gallery__thumbs" role="tablist" aria-label="Миниатюры фотографий">
          {items.map((item, idx) => (
            <button
              key={item.url || idx}
              type="button"
              role="tab"
              aria-selected={idx === activeIndex}
              aria-label={`Перейти к фото ${idx + 1}`}
              className={`listing-gallery__thumb${idx === activeIndex ? ' is-active' : ''}`}
              data-testid={`gallery-thumb-${idx}`}
              onClick={() => setActiveIndex(idx)}
            >
              <img
                src={item.url}
                alt={item.alt || `Миниатюра ${idx + 1}`}
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none'
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

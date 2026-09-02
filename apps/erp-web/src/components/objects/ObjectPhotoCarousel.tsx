import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import './objects-gallery.css'
import { useI18n } from "@/i18n";

const SWIPE_PX = 40

/**
 * Галерея фото объекта с перелистыванием (стрелки, точки, свайп).
 * `className` задаёт размер/скругление рамки (`object-media` в списке, `oc-photo` в карточке).
 * Бейджи (статус, MLS, «развернуть») передаются через `overlay` и остаются прямыми
 * детьми корня, чтобы их абсолютное позиционирование работало как раньше.
 */
export function ObjectPhotoCarousel({
  images,
  alt,
  onOpen,
  openLabel,
  overlay,
  className = '',
  placeholder,
}: {
  images: string[]
  alt: string
  onOpen?: () => void
  openLabel?: string
  overlay?: ReactNode
  className?: string
  placeholder?: ReactNode
}) {
    const { t } = useI18n();
  const slides = images.filter(Boolean)
  const [active, setActive] = useState(0)
  const startX = useRef<number | null>(null)
  const current = slides.length ? active % slides.length : 0

  const go = useCallback(
    (delta: number) => {
      if (slides.length <= 1) return
      setActive((index) => (index + delta + slides.length) % slides.length)
    },
    [slides.length],
  )

  const stageContent = slides.map((url, index) => (
    <img
      key={`${url}-${index}`}
      src={url}
      alt={index === current ? alt : ''}
      className={`obj-gallery-img${index === current ? ' is-active' : ''}`}
      loading={index === 0 ? 'eager' : 'lazy'}
      draggable={false}
    />
  ))

  return (
    <div
      className={`obj-gallery ${className}`.trim()}
      onTouchStart={(event) => {
        startX.current = event.changedTouches[0]?.clientX ?? null
      }}
      onTouchEnd={(event) => {
        if (startX.current == null) return
        const delta = event.changedTouches[0].clientX - startX.current
        startX.current = null
        if (Math.abs(delta) >= SWIPE_PX) go(delta > 0 ? -1 : 1)
      }}
    >
      {slides.length === 0 ? (
        placeholder
      ) : onOpen ? (
        <button type="button" className="obj-gallery-stage" onClick={onOpen} aria-label={openLabel}>
          {stageContent}
        </button>
      ) : (
        <div className="obj-gallery-stage obj-gallery-stage-static">{stageContent}</div>
      )}

      {slides.length > 1 && (
        <>
          <button
            type="button"
            className="obj-gallery-arrow obj-gallery-prev"
            onClick={() => go(-1)}
            aria-label={t('objects.objectPhotoCarousel.предыдущее_фото')}
          >
            <ChevronLeft aria-hidden />
          </button>
          <button
            type="button"
            className="obj-gallery-arrow obj-gallery-next"
            onClick={() => go(1)}
            aria-label={t('objects.objectPhotoCarousel.следующее_фото')}
          >
            <ChevronRight aria-hidden />
          </button>
          <div className="obj-gallery-dots">
            {slides.map((url, index) => (
              <button
                key={`${url}-dot-${index}`}
                type="button"
                className={`obj-gallery-dot${index === current ? ' is-active' : ''}`}
                onClick={() => setActive(index)}
                aria-label={`Фото ${index + 1}`}
                aria-current={index === current ? 'true' : undefined}
              />
            ))}
          </div>
        </>
      )}

      {overlay}
    </div>
  )
}

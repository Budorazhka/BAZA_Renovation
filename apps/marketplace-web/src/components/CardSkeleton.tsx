import { useI18n } from '../i18n'

export interface CardSkeletonProps {
  count?: number
  className?: string
}

/**
 * CardSkeleton Component (MKT-SYS-001)
 * Reusable loading placeholder matching exact geometry of Figma card ЖК (4747:74437).
 */
export function CardSkeleton({ count = 1, className = '' }: CardSkeletonProps) {
  const items = Array.from({ length: count }, (_, idx) => idx)
  const { t } = useI18n()

  return (
    <>
      {items.map(idx => (
        <div
          key={idx}
          className={`figma-card-skeleton ${className}`.trim()}
          role="status"
          aria-label={t('common.loadingCard')}
        >
          {/* Shimmer cover */}
          <div className="figma-card-skeleton__cover figma-skeleton" />

          {/* Shimmer body */}
          <div className="figma-card-skeleton__body">
            {/* Price bar */}
            <div className="figma-card-skeleton__line figma-card-skeleton__line--short figma-skeleton" />

            {/* Title bar */}
            <div className="figma-card-skeleton__line figma-card-skeleton__line--title figma-skeleton" />

            {/* Address bar */}
            <div className="figma-card-skeleton__line figma-card-skeleton__line--address figma-skeleton" />

            {/* Facilities box */}
            <div className="figma-card-skeleton__facilities figma-skeleton" />

            {/* Action buttons */}
            <div className="figma-card-skeleton__buttons">
              <div className="figma-card-skeleton__btn figma-skeleton" />
              <div className="figma-card-skeleton__btn figma-skeleton" />
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

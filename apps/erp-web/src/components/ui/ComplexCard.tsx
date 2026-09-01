import { useEffect, useState } from 'react'
import { Building2, ChevronLeft, ChevronRight, Crown, Flame, Grid3X3, Info, LayoutPanelTop, Layers, Pencil, Rocket, Settings2, Sparkles, Tag, Trash2, X } from 'lucide-react'
import { useI18n } from '@/i18n'

// Стиль платной надписи «Надпись на карточке» (услуга custom_text) — управляется здесь.
const PROMO_TEXT_COLOR = '#5ee0d0' // цвет текста (сине-зелёный)
const PROMO_TEXT_ANGLE = -30 // угол наклона в градусах (0 — без наклона)

export interface ComplexCardPromo {
  /**
   * top     — закреплён в ТОПе выдачи
   * premium — премиум-карточка
   * banner  — акция / скидка (текст)
   * hot     — горячий лот / витрина
   */
  kind: 'top' | 'premium' | 'banner' | 'hot'
  text?: string
  color?: string
}

export interface ComplexCardData {
  id: string
  name: string
  developer: string
  city?: string
  country?: string
  address?: string
  images?: string[]
  delivery?: string
  priceFrom?: string
  priceTo?: string
  totalUnits?: number
  freeUnits?: number
  soldUnits?: number
  floorsFrom?: number
  floorsTo?: number
  apartments?: number
  areaFrom?: number
  areaTo?: number
  promos?: ComplexCardPromo[]
  /** Платная «Надпись на карточке» (услуга custom_text) — крупный текст справа. */
  promoText?: string
}

export interface ComplexCardProps {
  complex: ComplexCardData
  onAboutClick?: () => void
  onChessboardClick?: () => void
  onLayoutsClick?: () => void
  onManagementClick?: () => void
  onPromotionClick?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

const CITY_COUNTRY: Record<string, { country: string; flag: string }> = {
  'Батуми':   { country: 'Грузия',   flag: '🇬🇪' },
  'Тбилиси':  { country: 'Грузия',   flag: '🇬🇪' },
  'Кутаиси':  { country: 'Грузия',   flag: '🇬🇪' },
  'Боржоми':  { country: 'Грузия',   flag: '🇬🇪' },
  'Москва':   { country: 'Россия',   flag: '🇷🇺' },
  'Санкт-Петербург': { country: 'Россия', flag: '🇷🇺' },
}

function deriveExtras(c: ComplexCardData) {
  // Нет данных (квартиры/корпуса ещё не привязаны) → честные нули, не мок.
  const floorsTo = c.floorsTo ?? 0
  const floorsFrom = c.floorsFrom ?? 0
  const apartments = c.apartments ?? c.totalUnits ?? 0
  const areaFrom = c.areaFrom ?? 0
  const areaTo = c.areaTo ?? 0
  const country = c.country ?? (c.city ? CITY_COUNTRY[c.city]?.country ?? '' : '')
  const address = c.address
  return { country, address, floorsFrom, floorsTo, apartments, areaFrom, areaTo }
}

function cityFlag(city?: string): string {
  if (!city) return ''
  return CITY_COUNTRY[city]?.flag ?? ''
}

function formatDeliveryLabel(delivery?: string, language?: string): string {
  if (!delivery) return ''
  const match = delivery.trim().match(/^Q([1-4])\s+(\d{4})$/i)
  if (!match) return delivery
  if (language === 'en') return delivery.trim()
  return `${match[1]} кв. ${match[2]}`
}

function PromoBadge({ promo }: { promo: ComplexCardPromo }) {
  const { t } = useI18n()
  const cfg = (() => {
    switch (promo.kind) {
      case 'top':
        return {
          icon: <Crown size={12} />,
          label: t('complexCard.promoTop'),
          bg: 'linear-gradient(135deg, rgba(230,195,100,0.95), rgba(208,168,76,0.95))',
          color: '#1a1a1a',
          border: 'rgba(255,255,255,0.25)',
        }
      case 'premium':
        return {
          icon: <Sparkles size={12} />,
          label: t('complexCard.promoPremium'),
          bg: 'linear-gradient(135deg, rgba(208,232,223,0.92), rgba(176,210,200,0.92))',
          color: '#0b2a22',
          border: 'rgba(255,255,255,0.25)',
        }
      case 'hot':
        return {
          icon: <Flame size={12} />,
          label: promo.text ?? t('complexCard.promoHot'),
          bg: 'rgba(255,135,84,0.92)',
          color: '#1a1a1a',
          border: 'rgba(255,255,255,0.25)',
        }
      case 'banner':
        return {
          icon: <Tag size={12} />,
          label: promo.text ?? t('complexCard.promoBanner'),
          bg: 'rgba(0,0,0,0.65)',
          color: 'rgba(255,255,255,0.95)',
          border: 'rgba(230,195,100,0.55)',
        }
    }
  })()
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 9px',
      borderRadius: 3,
      background: cfg.bg,
      backdropFilter: 'blur(4px)',
      border: `1px solid ${cfg.border}`,
      color: cfg.color,
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      fontFamily: "'Montserrat', sans-serif",
      whiteSpace: 'nowrap',
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    }}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function PromoBadges({ promos }: { promos: ComplexCardPromo[] }) {
  if (!promos.length) return null
  return (
    <div style={{
      position: 'absolute', top: 12, left: 12,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
      maxWidth: 'calc(100% - 90px)',
      zIndex: 2,
    }}>
      {promos.map((p, i) => <PromoBadge key={i} promo={p} />)}
    </div>
  )
}

function PhotoLightbox({
  images,
  alt,
  index,
  onIndexChange,
  onClose,
}: {
  images: string[]
  alt: string
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const total = images.length
  const go = (delta: number) => onIndexChange((index + delta + total) % total)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onIndexChange((index - 1 + total) % total)
      if (e.key === 'ArrowRight') onIndexChange((index + 1) % total)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [index, total, onClose, onIndexChange])

  const arrowStyle: React.CSSProperties = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    width: 52, height: 52, borderRadius: 6,
    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
    border: '1px solid rgba(255,255,255,0.2)', // design-ok: рамка кнопки, не текст
    color: 'rgba(255,255,255,0.9)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(8,12,10,0.95)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label={t('complexCard.close')}
        style={{
          position: 'absolute', top: 20, right: 24,
          width: 44, height: 44, borderRadius: 6,
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', // design-ok: рамка кнопки, не текст
          color: 'rgba(255,255,255,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <X size={22} />
      </button>

      <img
        src={images[index]}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 6 }}
      />

      {total > 1 && (
        <>
          <button type="button" aria-label={t('complexCard.prevPhoto')} onClick={(e) => { e.stopPropagation(); go(-1) }} style={{ ...arrowStyle, left: 24 }}>
            <ChevronLeft size={26} />
          </button>
          <button type="button" aria-label={t('complexCard.nextPhoto')} onClick={(e) => { e.stopPropagation(); go(1) }} style={{ ...arrowStyle, right: 24 }}>
            <ChevronRight size={26} />
          </button>
          <span style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.9)',
            padding: '6px 14px', borderRadius: 6, fontSize: 15,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em',
          }}>
            {index + 1} / {total}
          </span>
        </>
      )}
    </div>
  )
}

function PhotoCarousel({ images, alt, promos }: { images: string[]; alt: string; promos?: ComplexCardPromo[] }) {
  const { t } = useI18n()
  const [idx, setIdx] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [errored, setErrored] = useState<Record<number, boolean>>({})
  const [fullscreen, setFullscreen] = useState(false)

  const total = images.length
  const prev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIdx(i => (i - 1 + total) % total)
  }
  const next = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIdx(i => (i + 1) % total)
  }

  const allErrored = total === 0 || images.every((_, i) => errored[i])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => { e.stopPropagation(); if (!allErrored) setFullscreen(true) }}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 200,
        background: 'var(--cc-photo-bg)',
        overflow: 'hidden',
        flexShrink: 0,
        cursor: allErrored ? 'default' : 'zoom-in',
      }}
    >
      {fullscreen && (
        <PhotoLightbox
          images={images}
          alt={alt}
          index={idx}
          onIndexChange={setIdx}
          onClose={() => setFullscreen(false)}
        />
      )}
      {!allErrored ? (
        images.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={alt}
            onError={() => setErrored(prev => ({ ...prev, [i]: true }))}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              opacity: i === idx ? (errored[i] ? 0 : 0.92) : 0,
              transition: 'opacity 0.35s ease',
            }}
          />
        ))
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Building2 size={40} color="var(--theme-accent-heading)" style={{ opacity: 0.25 }} />
        </div>
      )}

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label={t('complexCard.prevPhoto')}
            style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              width: 32, height: 32, borderRadius: 4,
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.2s',
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label={t('complexCard.nextPhoto')}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              width: 32, height: 32, borderRadius: 4,
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              opacity: hovered ? 1 : 0,
              transition: 'opacity 0.2s',
            }}
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {total > 1 && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 6,
          padding: '5px 9px',
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)',
          borderRadius: 6,
        }}>
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); setIdx(i) }}
              aria-label={t('complexCard.photoOf').replace('{n}', String(i + 1))}
              style={{
                width: i === idx ? 18 : 6, height: 6, borderRadius: 3,
                background: i === idx ? 'var(--gold)' : 'rgba(255,255,255,0.45)',
                border: 'none', padding: 0,
                cursor: 'pointer',
                transition: 'width 0.2s, background 0.2s',
              }}
            />
          ))}
        </div>
      )}

      {promos && promos.length > 0 && <PromoBadges promos={promos} />}

      {total > 1 && (
        <span style={{
          position: 'absolute', top: 12, right: 12,
          fontSize: 12, letterSpacing: '0.06em',
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          color: 'rgba(255,255,255,0.85)', padding: '4px 10px', borderRadius: 6,
          fontFamily: "'Montserrat', sans-serif",
          fontVariantNumeric: 'tabular-nums',
        }}>
          {idx + 1} / {total}
        </span>
      )}
    </div>
  )
}

function TooltipStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 16, fontWeight: 400,
        color: accent ? 'var(--theme-accent-heading)' : 'var(--workspace-text)',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--workspace-text-muted)', marginTop: 5, letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

function UnitsBar({
  total,
  free,
  sold,
  soldPercent,
}: {
  total: number
  free: number
  sold: number
  soldPercent: number
}) {
  const { t } = useI18n()
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{ position: 'relative', paddingTop: 2, paddingBottom: 2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        background: 'var(--cc-units-track)',
        transition: 'height 0.15s',
        cursor: 'default',
      }}>
        <div style={{
          width: `${soldPercent}%`,
          height: '100%',
          background: 'var(--gold)',
          transition: 'width 0.3s',
        }} />
      </div>

      {hovered && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--cc-tooltip-bg)',
          border: '1px solid var(--cc-tooltip-border)',
          borderRadius: 6,
          padding: '10px 14px',
          display: 'flex', gap: 18,
          whiteSpace: 'nowrap',
          boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
          zIndex: 5,
          pointerEvents: 'none',
          fontFamily: "'Montserrat', sans-serif",
        }}>
          <TooltipStat label={t('complexCard.total')} value={total} />
          <TooltipStat label={t('complexCard.free')} value={free} />
          <TooltipStat label={t('complexCard.sold')} value={sold} accent />
        </div>
      )}
    </div>
  )
}

function InfoChip({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 14px',
      background: 'var(--cc-infochip-bg)',
      border: '1px solid var(--hub-card-border)',
      borderRadius: 4,
      fontSize: 16,
      color: 'var(--workspace-text)',
      fontFamily: "'Montserrat', sans-serif",
      whiteSpace: 'nowrap',
    }}>
      <span style={{ color: 'var(--theme-accent-heading)', display: 'flex' }}>{icon}</span>
      {value}
    </span>
  )
}

function ComplexActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cc-action-btn"
      style={{
        flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '9px 16px',
        borderRadius: 4,
        border: '1px solid color-mix(in srgb, var(--gold) 55%, transparent)',
        background: 'color-mix(in srgb, var(--gold) 10%, transparent)',
        color: 'var(--theme-accent-heading)',
        fontSize: 14, fontWeight: 400, letterSpacing: '0.03em',
        cursor: 'pointer',
        fontFamily: "'Montserrat', sans-serif",
        whiteSpace: 'nowrap',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'color-mix(in srgb, var(--gold) 20%, transparent)'
        e.currentTarget.style.borderColor = 'var(--gold)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'color-mix(in srgb, var(--gold) 10%, transparent)'
        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--gold) 55%, transparent)'
      }}
    >
      {icon}
      {label}
    </button>
  )
}

export function ComplexCard({ complex, onAboutClick, onChessboardClick, onLayoutsClick, onManagementClick, onPromotionClick, onEdit, onDelete }: ComplexCardProps) {
  const { t, language } = useI18n()
  const total = complex.totalUnits ?? 0
  const free = complex.freeUnits ?? 0
  const sold = complex.soldUnits ?? Math.max(0, total - free)
  const soldPercent = total > 0 ? Math.round((sold / total) * 100) : 0
  const images = complex.images ?? []
  const promos = complex.promos ?? []
  const deliveryLabel = formatDeliveryLabel(complex.delivery, language)

  return (
    <div
      style={{
        background: 'var(--hub-card-bg)',
        border: '1px solid var(--hub-card-border)',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'row',
        minHeight: 200,
        fontFamily: "'Montserrat', sans-serif",
        transition: 'border-color 0.2s',
        position: 'relative',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--hub-card-border-hover)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--hub-card-border)')}
    >
      <div style={{ width: 340, flexShrink: 0, position: 'relative', display: 'flex' }}>
        <PhotoCarousel images={images} alt={complex.name} promos={promos} />
      </div>

      <div style={{
        flex: 1, minWidth: 0,
        padding: '18px 24px 18px 24px',
        display: 'flex', flexDirection: 'column', gap: 12,
        position: 'relative', overflow: 'hidden',
      }}>


        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6, paddingRight: (onEdit || onDelete) ? 76 : 0 }}>
            <div style={{ fontSize: 28, fontWeight: 400, color: 'var(--theme-accent-heading)', lineHeight: 1.15, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {complex.name}
            </div>
            {complex.city && (
              <span style={{
                flexShrink: 0,
                fontSize: 13, letterSpacing: '0.08em',
                color: 'var(--cc-city-chip-text)',
                padding: '4px 10px', borderRadius: 3,
                background: 'var(--cc-city-chip-bg)',
              }}>
                {t(`complexCard.cities.${complex.city}`, complex.city)}
              </span>
            )}
            {onPromotionClick && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onPromotionClick() }}
                className="cc-action-btn cc-promo-cta"
                style={{
                  flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 15px',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.28)',
                  background: 'linear-gradient(135deg, #f2d98a 0%, #e6c364 48%, #d0a84c 100%)',
                  color: '#241d08',
                  fontSize: 15, fontWeight: 500, letterSpacing: '0.01em',
                  cursor: 'pointer',
                  fontFamily: "'Montserrat', sans-serif",
                  whiteSpace: 'nowrap',
                  boxShadow: '0 0 14px rgba(230,195,100,0.4), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 0 0 1px rgba(255,255,255,0.12)',
                  transition: 'box-shadow 0.2s, transform 0.15s, filter 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 0 22px rgba(230,195,100,0.65), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 0 0 1px rgba(255,255,255,0.18)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.filter = 'brightness(1.04)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '0 0 14px rgba(230,195,100,0.4), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 0 0 1px rgba(255,255,255,0.12)'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.filter = 'none'
                }}
              >
                <Rocket size={15} className="cc-icon cc-icon-promo" />
                {t('complexCard.promote')}
              </button>
            )}
          </div>
          <div style={{ fontSize: 17, color: 'var(--workspace-text-dim)' }}>
            {complex.developer}
          </div>
        </div>

        {(() => {
          const ex = deriveExtras(complex)
          const flag = cityFlag(complex.city)
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, color: 'var(--cc-geo-text)' }}>
              {flag && <span style={{ fontSize: 20, lineHeight: 1 }}>{flag}</span>}
              <span>
                {[
                  ex.country && t(`complexCard.countries.${ex.country}`, ex.country),
                  complex.city && t(`complexCard.cities.${complex.city}`, complex.city),
                ].filter(Boolean).join(', ')}
                {ex.address && <span style={{ color: 'var(--workspace-text-dim)' }}>{`  ·  ${ex.address}`}</span>}
              </span>
            </div>
          )
        })()}

        <div style={{ display: 'flex', gap: 36, alignItems: 'flex-end' }}>
          {deliveryLabel && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 6 }}>{t('complexCard.delivery')}</div>
              <div style={{ fontSize: 19, color: 'var(--workspace-text)' }}>{deliveryLabel}</div>
            </div>
          )}
          {(complex.priceFrom || complex.priceTo) && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.1em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 6 }}>{t('complexCard.prices')}</div>
              <div style={{ fontSize: 19, color: 'var(--workspace-text)' }}>
                {[complex.priceFrom, complex.priceTo].filter(Boolean).join(' — ')}
              </div>
            </div>
          )}
        </div>

        {(() => {
          const ex = deriveExtras(complex)
          return (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <InfoChip icon={<Building2 size={15} />} value={ex.floorsFrom === ex.floorsTo ? `${ex.floorsTo} ${t('complexCard.floorsUnit')}` : `${ex.floorsFrom}–${ex.floorsTo} ${t('complexCard.floorsUnit')}`} />
              {ex.apartments > 0 && <InfoChip icon={<Building2 size={15} />} value={`${ex.apartments} ${t('complexCard.apartmentsUnit')}`} />}
              <InfoChip icon={<Layers size={15} />} value={`${ex.areaFrom}–${ex.areaTo} ${t('complexCard.areaUnit')}`} />
            </div>
          )
        })()}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <UnitsBar total={total} free={free} sold={sold} soldPercent={soldPercent} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            {onAboutClick && (
              <ComplexActionButton icon={<Info size={16} className="cc-icon cc-icon-about" />} label={t('complexCard.about')} onClick={(e) => { e.stopPropagation(); onAboutClick() }} />
            )}
            {onChessboardClick && (
              <ComplexActionButton icon={<Grid3X3 size={16} className="cc-icon cc-icon-chess" />} label={t('complexCard.chessboard')} onClick={(e) => { e.stopPropagation(); onChessboardClick() }} />
            )}
            {onLayoutsClick && (
              <ComplexActionButton icon={<LayoutPanelTop size={16} className="cc-icon cc-icon-layouts" />} label={t('complexCard.layouts')} onClick={(e) => { e.stopPropagation(); onLayoutsClick() }} />
            )}
            {onManagementClick && (
              <ComplexActionButton icon={<Settings2 size={16} className="cc-icon cc-icon-mgmt" />} label={t('complexCard.management')} onClick={(e) => { e.stopPropagation(); onManagementClick() }} />
            )}
          </div>
        </div>
      </div>

      {complex.promoText && (
        <div
          style={{
            position: 'absolute',
            top: '50%', right: 28,
            transform: `translateY(-50%) rotate(${PROMO_TEXT_ANGLE}deg)`,
            maxWidth: 260,
            textAlign: 'right',
            color: PROMO_TEXT_COLOR,
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 30, fontWeight: 500, lineHeight: 1.05,
            letterSpacing: '0.01em',
            textTransform: 'uppercase',
            textShadow: '0 2px 10px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {complex.promoText}
        </div>
      )}

      {(onEdit || onDelete) && (
        <div style={{
          position: 'absolute',
          top: 12, right: 12,
          display: 'flex', gap: 6,
          zIndex: 3,
        }}>
          {onEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              title={t('complexCard.edit')}
              className="cc-action-btn"
              style={{
                width: 30, height: 30, borderRadius: 4,
                border: '1px solid color-mix(in srgb, var(--gold) 55%, transparent)',
                background: 'color-mix(in srgb, var(--gold) 10%, transparent)',
                color: 'var(--theme-accent-heading)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--gold) 20%, transparent)'
                e.currentTarget.style.borderColor = 'var(--gold)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--gold) 10%, transparent)'
                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--gold) 55%, transparent)'
              }}
            >
              <Pencil size={14} className="cc-icon cc-icon-edit" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              title={t('complexCard.deleteAction')}
              className="cc-action-btn"
              style={{
                width: 30, height: 30, borderRadius: 4,
                border: '1px solid color-mix(in srgb, var(--gold) 55%, transparent)',
                background: 'color-mix(in srgb, var(--gold) 10%, transparent)',
                color: 'var(--theme-accent-heading)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--gold) 20%, transparent)'
                e.currentTarget.style.borderColor = 'var(--gold)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'color-mix(in srgb, var(--gold) 10%, transparent)'
                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--gold) 55%, transparent)'
              }}
            >
              <Trash2 size={14} className="cc-icon cc-icon-trash" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeoMetadata } from '../hooks/useSeoMetadata'
import { useI18n } from '../i18n'

export interface RealtorItem {
  id: string
  name: string
  agency: string
  city: string
  rating: number
  reviewsCount: number
  dealsCount: number
  experienceYears: number
  specialization: string[]
  phone: string
  badges: string[]
  activeListingsCount: number
  avatarInitials: string
}

export const MOCK_REALTORS: RealtorItem[] = [
  {
    id: 'realtor-1',
    name: 'Георгий Беридзе',
    agency: 'BAZA Premium Real Estate',
    city: 'Батуми',
    rating: 5.0,
    reviewsCount: 38,
    dealsCount: 84,
    experienceYears: 8,
    specialization: ['Новостройки', 'Инвестиции', 'ВНЖ'],
    phone: '+995 599 12 34 56',
    badges: ['ТОП-1 Батуми', 'Проверен BAZA', 'Супер-агент'],
    activeListingsCount: 16,
    avatarInitials: 'ГБ',
  },
  {
    id: 'realtor-2',
    name: 'Нино Цинцадзе',
    agency: 'Batumi Seafront Living',
    city: 'Батуми',
    rating: 4.9,
    reviewsCount: 29,
    dealsCount: 57,
    experienceYears: 6,
    specialization: ['Вторичка', 'Апартаменты у моря'],
    phone: '+995 599 22 33 44',
    badges: ['Эксперт побережья', 'Проверен BAZA'],
    activeListingsCount: 12,
    avatarInitials: 'НЦ',
  },
  {
    id: 'realtor-3',
    name: 'Давид Кварацхелия',
    agency: 'Tbilisi Prime Capital',
    city: 'Тбилиси',
    rating: 4.9,
    reviewsCount: 44,
    dealsCount: 92,
    experienceYears: 10,
    specialization: ['Коммерция', 'Виллы', 'Земля'],
    phone: '+995 599 33 44 55',
    badges: ['ТОП-1 Тбилиси', 'Премиум брокер'],
    activeListingsCount: 22,
    avatarInitials: 'ДК',
  },
  {
    id: 'realtor-4',
    name: 'Анна Макарова',
    agency: 'Alliance Property Group',
    city: 'Батуми',
    rating: 4.8,
    reviewsCount: 21,
    dealsCount: 41,
    experienceYears: 5,
    specialization: ['Долгосрочная аренда', 'Новостройки'],
    phone: '+995 599 55 66 77',
    badges: ['Быстрый отклик'],
    activeListingsCount: 9,
    avatarInitials: 'АМ',
  },
]

/**
 * RealtorsPage Component (Figma: Рейтинг риелторов v2 Node ID 3576:53108)
 */
export function RealtorsPage() {
  const { t } = useI18n()
  const [cityFilter, setCityFilter] = useState<'all' | 'Батуми' | 'Тбилиси'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useSeoMetadata({
    title: t('realtors.seoTitle'),
    description: t('realtors.seoDescription'),
  })

  const filteredRealtors = MOCK_REALTORS.filter((r) => {
    if (cityFilter !== 'all' && r.city !== cityFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        r.name.toLowerCase().includes(q) ||
        r.agency.toLowerCase().includes(q) ||
        r.specialization.some((s) => s.toLowerCase().includes(q))
      )
    }
    return true
  })

  return (
    <div className="figma-realtors-page">
      <div className="demo-notice-banner" role="note">
        <span className="demo-notice-banner__icon" aria-hidden="true">ℹ️</span>
        <div className="demo-notice-banner__text">
          <strong>{t('realtors.demoTitle')}</strong> {t('realtors.demoText')}
        </div>
      </div>

      <div className="figma-realtors-header">
        <div className="figma-realtors-header__eyebrow">{t('realtors.eyebrow')}</div>
        <h1 className="figma-realtors-header__title">{t('realtors.title')}</h1>
        <p className="figma-realtors-header__subtitle">{t('realtors.subtitle')}</p>
      </div>

      {/* Toolbar */}
      <div className="figma-realtors-toolbar">
        <div className="figma-realtors-toolbar__search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder={t('realtors.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('realtors.searchAria')}
          />
        </div>

        <div className="figma-realtors-toolbar__tabs" role="tablist" aria-label={t('realtors.cityFilterAria')}>
          <button
            type="button"
            className={`figma-realtor-tab-btn${cityFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setCityFilter('all')}
            role="tab"
            aria-selected={cityFilter === 'all'}
          >
            {t('filters.allCities')}
          </button>
          <button
            type="button"
            className={`figma-realtor-tab-btn${cityFilter === 'Батуми' ? ' is-active' : ''}`}
            onClick={() => setCityFilter('Батуми')}
            role="tab"
            aria-selected={cityFilter === 'Батуми'}
          >
            {t('header.cityBatumi')}
          </button>
          <button
            type="button"
            className={`figma-realtor-tab-btn${cityFilter === 'Тбилиси' ? ' is-active' : ''}`}
            onClick={() => setCityFilter('Тбилиси')}
            role="tab"
            aria-selected={cityFilter === 'Тбилиси'}
          >
            {t('header.cityTbilisi')}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="figma-realtors-grid" aria-label={t('realtors.gridAria')}>
        {filteredRealtors.map((realtor) => (
          <article key={realtor.id} className="figma-realtor-card">
            <div className="figma-realtor-card__top">
              <div className="figma-realtor-avatar" aria-hidden="true">
                {realtor.avatarInitials}
              </div>
              <div className="figma-realtor-card__info">
                <h2 className="figma-realtor-name">{realtor.name}</h2>
                <span className="figma-realtor-agency">{realtor.agency} · {realtor.city}</span>
                <div className="figma-realtor-rating-row">
                  <span className="figma-realtor-stars" aria-hidden="true">★ {realtor.rating.toFixed(1)}</span>
                  <span className="figma-realtor-reviews-count">{t('realtors.reviewsCount', { count: realtor.reviewsCount })}</span>
                </div>
              </div>
            </div>

            <div className="figma-realtor-badges">
              <span className="figma-realtor-badge figma-realtor-badge--demo">{t('realtors.demoProfile')}</span>
              {realtor.badges.map((b, i) => (
                <span key={i} className={`figma-realtor-badge${b.includes('ТОП') ? ' figma-realtor-badge--top' : ''}`}>
                  {b}
                </span>
              ))}
            </div>

            <div className="figma-realtor-metrics-row">
              <div>
                <div className="figma-realtor-metric-value">{realtor.dealsCount}</div>
                <div className="figma-realtor-metric-label">{t('realtors.dealsClosed')}</div>
              </div>
              <div>
                <div className="figma-realtor-metric-value">{t('realtors.experienceYears', { count: realtor.experienceYears })}</div>
                <div className="figma-realtor-metric-label">{t('realtors.experience')}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
              <Link
                to={`/realtors/${realtor.id}`}
                className="figma-realtor-card__btn"
                aria-label={t('realtors.profileAria', { name: realtor.name })}
              >
                {t('realtors.profileLink')}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

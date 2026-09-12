import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import type { ListingDealType, ListingPropertyType } from '../types/marketplace'

export interface FacetFiltersProps {
  tabParam?: string
  cityParam?: string
  dealTypeParam?: string
  propertyTypeParam?: string
  commercialSubtypeParam?: string
  sortParam?: string
  isMapView?: boolean
  onFilterChange: (filters: {
    city?: string
    dealType?: string
    propertyType?: string
    commercialSubtype?: string
    sort?: string
  }) => void
  onClearFilters: () => void
  viewUrl: (view: 'list' | 'map') => string
}

/**
 * FacetFilters Component (Figma: ComponentSet filter 4747:75832 / drawer 4747:75824)
 * Implements 8 Figma filter variants across categories:
 * - Поиск по ЖК ПЕРВИЧКА (4747:75827)
 * - Поиск по ВТОРИЧКЕ: Квартиры (4747:75828), Дома (4747:75829), Участки (4747:75824)
 * - Аренда долгосрочная (4747:75826) / посуточная (4747:75831)
 * - Поиск по Коммерции (4747:75830)
 */
export function FacetFilters({
  tabParam,
  cityParam = '',
  dealTypeParam,
  propertyTypeParam,
  commercialSubtypeParam,
  sortParam = 'newest',
  isMapView = false,
  onFilterChange,
  onClearFilters,
  viewUrl,
}: FacetFiltersProps) {
  const [localCity, setLocalCity] = useState(cityParam)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const { t } = useI18n()

  React.useEffect(() => {
    setLocalCity(cityParam)
  }, [cityParam])

  const isDev = tabParam !== 'listings'
  const hasActiveFilters = Boolean(cityParam || dealTypeParam || propertyTypeParam || commercialSubtypeParam)

  const handleCitySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onFilterChange({ city: localCity.trim() || undefined })
  }

  const dealTypes: Array<[ListingDealType | undefined, string]> = [
    [undefined, t('filters.dealType.all')],
    ['sale', t('filters.dealType.sale')],
    ['rent_long', t('filters.dealType.rentLong')],
    ['rent_short', t('filters.dealType.rentShort')],
  ]

  const propertyTypes: Array<[ListingPropertyType | undefined, string]> = [
    [undefined, t('filters.propertyType.all')],
    ['apartment', t('filters.propertyType.apartment')],
    ['house', t('filters.propertyType.house')],
    ['commercial', t('filters.propertyType.commercial')],
    ['land', t('filters.propertyType.land')],
  ]

  const commercialSubtypes: Array<[string | undefined, string]> = [
    [undefined, t('filters.commercial.all')],
    ['office', t('filters.commercial.office')],
    ['retail', t('filters.commercial.retail')],
    ['warehouse', t('filters.commercial.warehouse')],
    ['business', t('filters.commercial.business')],
    ['free_purpose', t('filters.commercial.freePurpose')],
  ]

  return (
    <section className="figma-filters" aria-label={t('filters.ariaLabel')}>
      <div className="figma-filters__container">
        {/* Top Controls Bar */}
        <div className="figma-filters__bar">
          {/* City search form with semantic search role (rendered on listings/secondary tab) */}
          {!isDev && (
            <form className="city-form figma-filters__search-form" role="search" onSubmit={handleCitySubmit} aria-label={t('filters.searchAria')}>
              <label htmlFor="city" className="visually-hidden">{t('filters.cityLabel')}</label>
              <svg
                className="figma-filters__search-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="city"
                name="city"
                type="search"
                autoComplete="address-level2"
                className="figma-filters__search-input"
                value={localCity}
                onChange={(e) => setLocalCity(e.target.value)}
                placeholder={t('filters.cityPlaceholder')}
                aria-label={t('filters.cityLabel')}
              />
              <button type="submit" className="figma-filters__search-submit" aria-label={t('filters.findAria')}>
                {t('filters.findLabel')}
              </button>
            </form>
          )}

          {/* Right Controls: Sort, View Toggle, Clear */}
          <div className="figma-filters__controls-group">
            <label className="sort-control figma-filters__sort" aria-label={t('filters.sortAria')}>
              <span className="visually-hidden">{t('filters.sortAria')}</span>
              <select
                className="figma-filters__sort-select"
                value={isDev ? 'newest' : sortParam}
                onChange={(e) => onFilterChange({ sort: e.target.value })}
              >
                <option value="newest">{t('filters.sort.newest')}</option>
                {!isDev && <option value="price_asc">{t('filters.sort.priceAsc')}</option>}
                {!isDev && <option value="price_desc">{t('filters.sort.priceDesc')}</option>}
                {!isDev && <option value="area_asc">{t('filters.sort.areaAsc')}</option>}
                {!isDev && <option value="area_desc">{t('filters.sort.areaDesc')}</option>}
              </select>
            </label>

            <div className="view-toggle figma-filters__view-toggle" role="group" aria-label={t('filters.viewToggleAria')}>
              <Link
                className={`view-toggle__link figma-filters__view-btn${!isMapView ? ' is-active' : ''}`}
                to={viewUrl('list')}
              >
                {t('filters.list')}
              </Link>
              <Link
                className={`view-toggle__link figma-filters__view-btn${isMapView ? ' is-active' : ''}`}
                to={viewUrl('map')}
              >
                {t('filters.map')}
              </Link>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="clear-filter clear-filter--compact figma-filters__clear-btn"
                onClick={onClearFilters}
              >
                {t('filters.reset')}
              </button>
            )}
          </div>
        </div>

        {/* Facet Chips for Listings (Deal Type & Property Type) */}
        {!isDev && (
          <details id="catalogue-filters" className="filters-drawer" open>
            <summary>{t('filters.drawerSummary')}</summary>
            <div className="catalogue-filters-panel" aria-label={t('filters.panelAria')}>
              <div className="catalogue-subfilters figma-filters__chips-row" role="group" aria-label={t('filters.dealTypeAria')}>
                {dealTypes.map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    className={`filter-chip figma-filter-chip${dealTypeParam === value ? ' is-active' : ''}`}
                    onClick={() => onFilterChange({ dealType: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="catalogue-subfilters figma-filters__chips-row" role="group" aria-label={t('filters.propertyTypeAria')}>
                {propertyTypes.map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    className={`filter-chip figma-filter-chip${propertyTypeParam === value ? ' is-active' : ''}`}
                    onClick={() => onFilterChange({ propertyType: value, commercialSubtype: undefined })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {propertyTypeParam === 'commercial' && (
                <div className="catalogue-subfilters figma-filters__chips-row" role="group" aria-label={t('filters.commercialAria')}>
                  {commercialSubtypes.map(([value, label]) => (
                    <button
                      key={label}
                      type="button"
                      className={`filter-chip figma-filter-chip${commercialSubtypeParam === value ? ' is-active' : ''}`}
                      onClick={() => onFilterChange({ commercialSubtype: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </details>
        )}

        {/*
          Facet Chips for Primary Developments (Figma 4747:75827).
          Значение фильтра — «Тбилиси»/«Батуми» как хранится в данных, а не
          перевод текущего языка интерфейса: иначе переключение языка ломало
          бы поиск по городу. Переводится только видимая подпись.
        */}
        {isDev && (
          <div className="figma-filters__chips-row" role="group" aria-label={t('filters.devAria')}>
            <span className="figma-filter-chip is-active">{t('filters.devAll')}</span>
            <button
              type="button"
              className="figma-filter-chip"
              onClick={() => onFilterChange({ city: 'Тбилиси' })}
            >
              {t('filters.cityTbilisi')}
            </button>
            <button
              type="button"
              className="figma-filter-chip"
              onClick={() => onFilterChange({ city: 'Батуми' })}
            >
              {t('filters.cityBatumi')}
            </button>
          </div>
        )}
      </div>

      {/* Mobile Drawer (Figma 4747:75824) */}
      {mobileDrawerOpen && (
        <div className="figma-drawer-overlay" role="dialog" aria-modal="true" aria-label={t('filters.mobileDrawerAria')}>
          <div className="figma-drawer">
            <div className="figma-drawer__header">
              <h2 className="figma-drawer__title">{t('filters.drawerTitle')}</h2>
              <button
                type="button"
                className="figma-drawer__close"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label={t('filters.drawerClose')}
              >
                ×
              </button>
            </div>
            <div className="figma-drawer__content">
              <div className="figma-drawer__section">
                <h3 className="figma-drawer__section-title">{t('filters.drawerCityTitle')}</h3>
                <input
                  type="text"
                  className="figma-filters__search-input"
                  value={localCity}
                  onChange={(e) => setLocalCity(e.target.value)}
                  placeholder={t('filters.drawerCityPlaceholder')}
                />
              </div>
            </div>
            <div className="figma-drawer__footer">
              <button
                type="button"
                className="figma-drawer__btn-reset"
                onClick={() => {
                  onClearFilters()
                  setLocalCity('')
                  setMobileDrawerOpen(false)
                }}
              >
                {t('filters.reset')}
              </button>
              <button
                type="button"
                className="figma-drawer__btn-apply"
                onClick={() => {
                  onFilterChange({ city: localCity.trim() || undefined })
                  setMobileDrawerOpen(false)
                }}
              >
                {t('filters.apply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
